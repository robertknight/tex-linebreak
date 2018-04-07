import ErrorSubclass from 'error-subclass';

/**
 * An object (eg. a word) to be typeset.
 */
export interface Box {
  type: 'box';

  /** Amount of space required by this content. Must be >= 0. */
  width: number;
}

/**
 * A space between `Box` items with a preferred width and some
 * capacity to stretch or shrink.
 *
 * `Glue` items are also candidates for breakpoints if they immediately follow a
 * `Box`.
 */
export interface Glue {
  type: 'glue';
  /**
   * Preferred width of this space. Must be >= 0.
   */
  width: number;
  /** Maximum amount by which this space can grow. */
  stretch: number;
  /** Maximum amount by which this space can shrink. */
  shrink: number;
}

/**
 * An explicit candidate position for breaking a line.
 */
export interface Penalty {
  type: 'penalty';

  /**
   * Amount of space required for typeset content to be added (eg. a hyphen) if
   * a line is broken here. Must be >= 0.
   */
  width: number;
  /**
   * The undesirability of breaking the line at this point.
   *
   * Values <= `MIN_COST` and >= `MAX_COST` mandate or prevent breakpoints
   * respectively.
   */
  cost: number;
  /**
   * A hint used to prevent successive lines being broken with hyphens. The
   * layout algorithm will try to avoid successive lines being broken at flagged
   * `Penalty` items.
   */
  flagged: boolean;
}

export type InputItem = Box | Penalty | Glue;

/**
 * Parameters for the layout process.
 */
export interface Options {
  /**
   * A factor indicating the maximum amount by which items in a line can be
   * spaced out by expanding `Glue` items.
   *
   * The maximum size which a `Glue` on a line can expand to is `glue.width +
   * (maxAdjustmentRatio * glue.stretch)`.
   *
   * If the paragraph cannot be laid out without exceeding this threshold then a
   * `MaxAdjustmentExceededError` error is thrown. The caller can use this to
   * apply hyphenation and try again. If `null`, lines are stretched as far as
   * necessary.
   */
  maxAdjustmentRatio: number | null;

  /**
   * The maximum adjustment ratio used for the initial line breaking attempt.
   */
  initialMaxAdjustmentRatio: number;

  /**
   * Penalty for consecutive hyphenated lines.
   */
  doubleHyphenPenalty: number;

  /**
   * Penalty for significant differences in the tightness of adjacent lines.
   */
  adjacentLooseTightPenalty: number;
}

/**
 * Minimum cost for a breakpoint.
 *
 * Values <= `MIN_COST` force a break.
 */
export const MIN_COST = -1000;

/**
 * Maximum cost for a breakpoint.
 *
 * Values >= `MAX_COST` prevent a break.
 */
export const MAX_COST = 1000;

const MIN_ADJUSTMENT_RATIO = -1;

function isForcedBreak(item: InputItem) {
  return item.type === 'penalty' && item.cost <= MIN_COST;
}

const defaultOptions: Options = {
  maxAdjustmentRatio: null,
  initialMaxAdjustmentRatio: 1,
  doubleHyphenPenalty: 0,
  adjacentLooseTightPenalty: 0,
};

/**
 * Error thrown by `breakLines` when `maxAdjustmentRatio` is exceeded.
 */
export class MaxAdjustmentExceededError extends ErrorSubclass {}

/**
 * Break a paragraph of text into justified lines.
 *
 * Returns the indexes from `items` which have been chosen as breakpoints.
 * `positionBoxes` can be used to generate the X offsets and line numbers of
 * each box using the resulting breakpoints.
 *
 * May throw an `Error` if valid breakpoints cannot be found given the specified
 * adjustment ratio thresholds.
 *
 * The implementation uses the "TeX algorithm" from [1].
 *
 * [1] D. E. Knuth and M. F. Plass, “Breaking paragraphs into lines,” Softw.
 *     Pract. Exp., vol. 11, no. 11, pp. 1119–1184, Nov. 1981.
 *
 * @param items - Sequence of box, glue and penalty items to layout.
 * @param lineLengths - Length or lengths of each line.
 */
export function breakLines(
  items: InputItem[],
  lineLengths: number | number[],
  opts: Partial<Options> = {},
): number[] {
  if (items.length === 0) {
    return [];
  }

  const opts_ = { ...defaultOptions, ...opts };
  const lineLen = (i: number) => (Array.isArray(lineLengths) ? lineLengths[i] : lineLengths);
  const currentMaxAdjustmentRatio = Math.min(
    opts_.initialMaxAdjustmentRatio,
    opts_.maxAdjustmentRatio !== null ? opts_.maxAdjustmentRatio : Infinity,
  );

  type Node = {
    index: number; // Index in `items`.
    line: number; // Line number.
    fitness: number;
    // Sum of `width` up to first box or forced break after this break.
    totalWidth: number;
    // Sum of `stretch` up to first box or forced break after this break.
    totalStretch: number;
    // Sum of `shrink` up to first box or forced break after this break.
    totalShrink: number;
    // Minimum sum of demerits up this break.
    totalDemerits: number;
    prev: null | Node;
  };

  const active = new Set<Node>();

  // Add initial active node for beginning of paragraph.
  active.add({
    index: 0,
    line: 0,
    // Fitness is ignored for this node.
    fitness: 0,
    totalWidth: 0,
    totalStretch: 0,
    totalShrink: 0,
    totalDemerits: 0,
    prev: null,
  });

  // Sum of `width` of items up to current item.
  let sumWidth = 0;
  // Sum of `stretch` of glue items up to current item.
  let sumStretch = 0;
  // Sum of `shrink` of glue items up to current item.
  let sumShrink = 0;

  let minAdjustmentRatioAboveThreshold = Infinity;

  for (let b = 0; b < items.length; b++) {
    const item = items[b];

    // TeX allows items with negative widths or stretch factors but imposes two
    // restrictions for efficiency. These restrictions are not yet implemented
    // here and we avoid the problem by just disallowing negative
    // width/shrink/stretch amounts.
    if (item.width < 0) {
      throw new Error(`Item ${b} has disallowed negative width`);
    }

    // Determine if this is a feasible breakpoint and update `sumWidth`,
    // `sumStretch` and `sumShrink`.
    let canBreak = false;
    if (item.type === 'box') {
      sumWidth += item.width;
    } else if (item.type === 'glue') {
      if (item.shrink < 0 || item.stretch < 0) {
        throw new Error(`Item ${b} has disallowed negative stretch or shrink`);
      }

      canBreak = b > 0 && items[b - 1].type === 'box';
      if (!canBreak) {
        sumWidth += item.width;
        sumShrink += item.shrink;
        sumStretch += item.stretch;
      }
    } else if (item.type === 'penalty') {
      canBreak = item.cost < MAX_COST;
    }
    if (!canBreak) {
      continue;
    }

    // Update the set of active nodes.
    let lastActive: Node | null = null;

    const feasible: Node[] = [];
    active.forEach(a => {
      // Compute adjustment ratio from `a` to `b`.
      let adjustmentRatio = 0;
      const lineShrink = sumShrink - a.totalShrink;
      const lineStretch = sumStretch - a.totalStretch;
      const idealLen = lineLen(a.line);
      let actualLen = sumWidth - a.totalWidth;

      // Include width of penalty in line length if chosen as a breakpoint.
      if (item.type === 'penalty') {
        actualLen += item.width;
      }

      // nb. Division by zero produces `Infinity` here, which is what we want.
      if (actualLen < idealLen) {
        adjustmentRatio = (idealLen - actualLen) / lineStretch;
      } else {
        adjustmentRatio = (idealLen - actualLen) / lineShrink;
      }
      if (adjustmentRatio > currentMaxAdjustmentRatio) {
        // In case we need to try again later with a higher
        // `maxAdjustmentRatio`, track the minimum value needed to produce
        // different output.
        minAdjustmentRatioAboveThreshold = Math.min(
          adjustmentRatio,
          minAdjustmentRatioAboveThreshold,
        );
      }

      if (adjustmentRatio < MIN_ADJUSTMENT_RATIO || isForcedBreak(item)) {
        // Items from `a` to `b` cannot fit on one line.
        active.delete(a);
        lastActive = a;
      }
      if (adjustmentRatio >= MIN_ADJUSTMENT_RATIO && adjustmentRatio <= currentMaxAdjustmentRatio) {
        // We found a feasible breakpoint. Compute a `demerits` score for it as
        // per formula on p. 1128.
        let demerits;
        const badness = 100 * Math.abs(adjustmentRatio) ** 3;
        const penalty = item.type === 'penalty' ? item.cost : 0;

        if (penalty >= 0) {
          demerits = (1 + badness + penalty) ** 2;
        } else if (penalty > MIN_COST) {
          demerits = (1 + badness) ** 2 - penalty ** 2;
        } else {
          demerits = (1 + badness) ** 2;
        }

        let doubleHyphenPenalty = 0;
        const prevItem = items[a.index];
        if (item.type === 'penalty' && prevItem.type === 'penalty') {
          if (item.flagged && prevItem.flagged) {
            doubleHyphenPenalty = opts_.doubleHyphenPenalty;
          }
        }
        demerits += doubleHyphenPenalty;

        // Fitness classes are defined on p. 1155
        let fitness;
        if (adjustmentRatio < -0.5) {
          fitness = 0;
        } else if (adjustmentRatio < 0.5) {
          fitness = 1;
        } else if (adjustmentRatio < 1) {
          fitness = 2;
        } else {
          fitness = 3;
        }
        if (a.index > 0 && Math.abs(fitness - a.fitness) > 1) {
          demerits += opts_.adjacentLooseTightPenalty;
        }

        // If this breakpoint is followed by glue or non-breakable penalty items
        // then we don't want to include the width of those when calculating the
        // width of lines starting after this breakpoint. This is because when
        // rendering we ignore glue/penalty items at the start of lines.
        let widthToNextBox = 0;
        let shrinkToNextBox = 0;
        let stretchToNextBox = 0;
        for (let bp = b; bp < items.length; bp++) {
          const item = items[bp];
          if (item.type === 'box') {
            break;
          }
          if (item.type === 'penalty' && item.cost >= MAX_COST) {
            break;
          }
          widthToNextBox += item.width;
          if (item.type === 'glue') {
            shrinkToNextBox += item.shrink;
            stretchToNextBox += item.stretch;
          }
        }

        const node = {
          index: b,
          line: a.line + 1,
          fitness,
          totalWidth: sumWidth + widthToNextBox,
          totalShrink: sumShrink + shrinkToNextBox,
          totalStretch: sumStretch + stretchToNextBox,
          totalDemerits: a.totalDemerits + demerits,
          prev: a,
        };
        feasible.push(node);
      }
    });

    // Add feasible breakpoint with lowest score to active set.
    if (feasible.length > 0) {
      let bestNode = feasible[0];
      for (let f of feasible) {
        if (f.totalDemerits < bestNode.totalDemerits) {
          bestNode = f;
        }
      }
      active.add(bestNode);
    }

    // Handle situation where there is no way to break the paragraph without
    // shrinking or stretching a line beyond [-1, currentMaxAdjustmentRatio].
    if (active.size === 0) {
      if (isFinite(minAdjustmentRatioAboveThreshold)) {
        if (opts_.maxAdjustmentRatio === currentMaxAdjustmentRatio) {
          throw new MaxAdjustmentExceededError();
        }
        // Too much stretching was required for an earlier ignored breakpoint.
        // Try again with a higher threshold.
        return breakLines(items, lineLengths, {
          ...opts,
          initialMaxAdjustmentRatio: minAdjustmentRatioAboveThreshold,
        });
      } else {
        // We cannot create a breakpoint sequence by increasing the max
        // adjustment ratio. This could happen if a box is too wide or there are
        // glue items with zero stretch/shrink.
        //
        // Give up and create a breakpoint at the current position.
        active.add({
          index: b,
          line: lastActive!.line + 1,
          fitness: 1,
          totalWidth: sumWidth,
          totalShrink: sumShrink,
          totalStretch: sumStretch,
          totalDemerits: lastActive!.totalDemerits + 1000,
          prev: lastActive!,
        });
      }
    }

    if (item.type === 'glue') {
      sumWidth += item.width;
      sumStretch += item.stretch;
      sumShrink += item.shrink;
    }
  }

  // Choose active node with fewest total demerits as the last breakpoint.
  //
  // There should always be an active node at this point since:
  //
  //  1. We add a node to the active set before entering the loop.
  //  2. Each iteration of the loop either returns from the function, leaves the
  //     active set unchanged and breaks early or finishes with a non-empty active
  //     set.
  let bestNode: Node | null = null;
  active.forEach(a => {
    if (!bestNode || a.totalDemerits < bestNode.totalDemerits) {
      bestNode = a;
    }
  });

  // Follow the chain backwards from the chosen node to get the sequence of
  // chosen breakpoints.
  const output = [];
  let next: Node | null = bestNode!;
  while (next) {
    output.push(next.index);
    next = next.prev;
  }
  output.reverse();

  return output;
}

export interface PositionedItem {
  /** Index of the item. */
  item: number;
  /** Index of the line on which the resulting item should appear. */
  line: number;
  /** X offset of the item. */
  xOffset: number;
  /**
   * Width which this item should be rendered with.
   *
   * For box and penalty items this will just be the item's width.
   * For glue items this will be the adjusted width.
   */
  width: number;
}

/**
 * Compute adjustment ratios for lines given a set of breakpoints.
 *
 * The adjustment ratio of a line is the proportion of each glue item's stretch
 * (if positive) or shrink (if negative) which needs to be used in order to make
 * the line the specified width. A value of zero indicates that every glue item
 * is exactly its preferred width.
 *
 * @param items - The box, glue and penalty items being laid out
 * @param lineLengths - Length or lengths of each line
 * @param breakpoints - Indexes in `items` where lines are being broken
 */
export function adjustmentRatios(
  items: InputItem[],
  lineLengths: number | number[],
  breakpoints: number[],
) {
  const lineLen = (i: number) => (Array.isArray(lineLengths) ? lineLengths[i] : lineLengths);
  const ratios = [];

  for (let b = 0; b < breakpoints.length - 1; b++) {
    let idealWidth = lineLen(b);
    let actualWidth = 0;
    let lineShrink = 0;
    let lineStretch = 0;

    const start = b === 0 ? breakpoints[b] : breakpoints[b] + 1;
    for (let p = start; p <= breakpoints[b + 1]; p++) {
      const item = items[p];
      if (item.type === 'box') {
        actualWidth += item.width;
      } else if (item.type === 'glue' && p !== start && p !== breakpoints[b + 1]) {
        actualWidth += item.width;
        lineShrink += item.shrink;
        lineStretch += item.stretch;
      } else if (item.type === 'penalty' && p === breakpoints[b + 1]) {
        actualWidth += item.width;
      }
    }

    let adjustmentRatio;
    if (actualWidth < idealWidth) {
      adjustmentRatio = (idealWidth - actualWidth) / lineStretch;
    } else {
      adjustmentRatio = (idealWidth - actualWidth) / lineShrink;
    }

    ratios.push(adjustmentRatio);
  }

  return ratios;
}

export interface PositionOptions {
  includeGlue?: boolean;
}

/**
 * Compute the positions at which to draw boxes forming a paragraph given a set
 * of breakpoints.
 *
 * @param items - The sequence of items that form the paragraph.
 * @param lineLengths - Length or lengths of each line.
 * @param breakpoints - Indexes within `items` of the start of each line.
 */
export function positionItems(
  items: InputItem[],
  lineLengths: number | number[],
  breakpoints: number[],
  options: PositionOptions = {},
): PositionedItem[] {
  const adjRatios = adjustmentRatios(items, lineLengths, breakpoints);
  const result: PositionedItem[] = [];

  for (let b = 0; b < breakpoints.length - 1; b++) {
    // Limit the amount of shrinking of lines to 1x `glue.shrink` for each glue
    // item in a line.
    const adjustmentRatio = Math.max(adjRatios[b], MIN_ADJUSTMENT_RATIO);
    let xOffset = 0;
    const start = b === 0 ? breakpoints[b] : breakpoints[b] + 1;

    for (let p = start; p <= breakpoints[b + 1]; p++) {
      const item = items[p];
      if (item.type === 'box') {
        result.push({
          item: p,
          line: b,
          xOffset,
          width: item.width,
        });
        xOffset += item.width;
      } else if (item.type === 'glue' && p !== start && p !== breakpoints[b + 1]) {
        let gap;
        if (adjustmentRatio < 0) {
          gap = item.width + adjustmentRatio * item.shrink;
        } else {
          gap = item.width + adjustmentRatio * item.stretch;
        }
        if (options.includeGlue) {
          result.push({
            item: p,
            line: b,
            xOffset,
            width: gap,
          });
        }
        xOffset += gap;
      } else if (item.type === 'penalty' && p === breakpoints[b + 1] && item.width > 0) {
        result.push({
          item: p,
          line: b,
          xOffset,
          width: item.width,
        });
      }
    }
  }

  return result;
}

/**
 * Return a `Penalty` item which forces a line-break.
 */
export function forcedBreak(): Penalty {
  return { type: 'penalty', cost: MIN_COST, width: 0, flagged: false };
}
