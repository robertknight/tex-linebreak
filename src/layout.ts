/**
 * An object (eg. a word) to be typeset.
 */
export interface Box {
  type: 'box';
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
   */
  maxAdjustmentRatio: number;

  looseness: number;

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
  maxAdjustmentRatio: 1,
  looseness: 1,
  doubleHyphenPenalty: 0,
  adjacentLooseTightPenalty: 0,
};

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

  // TBD - Enforce "Restriction 1" and "Restriction 2" from p.1156.

  type Node = {
    index: number; // Index in `items`.
    line: number; // Line number.
    fitness: number;
    totalWidth: number; // Sum of `width` up to this node.
    totalStretch: number; // Sum of `stretch` up to this node.
    totalShrink: number; // Sum of `shrink` up to this node.
    totalDemerits: number; // Sum of line scores up to this node.
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

  for (let b = 0; b < items.length; b++) {
    const item = items[b];

    // Determine if this is a feasible breakpoint and update `sumWidth`,
    // `sumStretch` and `sumShrink`.
    let canBreak = false;
    if (item.type === 'box') {
      sumWidth += item.width;
    } else if (item.type === 'glue') {
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
    let maxAdjustmentRatio = -Infinity;
    let minAdjustmentRatio = Infinity;
    let lastActive: Node | null = null;

    const feasible: Node[] = [];
    active.forEach(a => {
      // Compute adjustment ratio from `a` to `b`.
      let adjustmentRatio = 0;
      const lineShrink = sumShrink - a.totalShrink;
      const lineStretch = sumStretch - a.totalStretch;
      const idealLen = lineLen(a.line);
      const actualLen = sumWidth - a.totalWidth;

      if (actualLen < idealLen) {
        adjustmentRatio = (idealLen - actualLen) / lineStretch;
      } else {
        adjustmentRatio = (idealLen - actualLen) / lineShrink;
      }
      maxAdjustmentRatio = Math.max(adjustmentRatio, maxAdjustmentRatio);
      minAdjustmentRatio = Math.min(adjustmentRatio, minAdjustmentRatio);

      if (adjustmentRatio < MIN_ADJUSTMENT_RATIO || isForcedBreak(item)) {
        // Items from `a` to `b` cannot fit on one line.
        active.delete(a);
        lastActive = a;
      }
      if (adjustmentRatio >= MIN_ADJUSTMENT_RATIO && adjustmentRatio < opts_.maxAdjustmentRatio) {
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

        const node = {
          index: b,
          line: a.line + 1,
          fitness,
          totalWidth: sumWidth,
          totalShrink: sumShrink,
          totalStretch: sumStretch,
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
    // shrinking or stretching a line beyond [-1, opts.maxAdjustmentRatio].
    if (active.size === 0) {
      if (maxAdjustmentRatio < MIN_ADJUSTMENT_RATIO) {
        // Too much shrinking required. Here we give up and create a breakpoint
        // at the current position.
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
      } else {
        // Too much stretching required.
        return breakLines(items, lineLengths, {
          ...opts,
          maxAdjustmentRatio: minAdjustmentRatio + 0.5,
        });
      }
    }

    if (item.type === 'glue') {
      sumWidth += item.width;
      sumStretch += item.stretch;
      sumShrink += item.shrink;
    }
  }

  if (active.size === 0) {
    throw new Error(
      `Unable to find feasible breakpoints with adjustment ratio in [${MIN_ADJUSTMENT_RATIO}, ${
        opts_.maxAdjustmentRatio
      }]`,
    );
  }

  // Choose active node with fewest total demerits as the last breakpoint.
  let bestNode: Node | null = null;
  active.forEach(a => {
    if (!bestNode || a.totalDemerits < bestNode.totalDemerits) {
      bestNode = a;
    }
  });

  if (opts_.looseness !== 0) {
    // TBD - Choose appropriate active node. See notes about `q` parameter in
    // the paper.
  }

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

export interface PositionedBox {
  /** Index of the box. */
  box: number;
  /** Index of the line on which the resulting box should appear. */
  line: number;
  /** X offset of the box. */
  xOffset: number;
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

    for (let p = breakpoints[b]; p < breakpoints[b + 1]; p++) {
      const item = items[p];
      if (item.type === 'box') {
        actualWidth += item.width;
      } else if (item.type === 'glue' && p !== breakpoints[b]) {
        actualWidth += item.width;
        lineShrink += item.shrink;
        lineStretch += item.stretch;
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

/**
 * Compute the positions at which to draw boxes forming a paragraph given a set
 * of breakpoints.
 *
 * @param items - The sequence of items that form the paragraph.
 * @param lineLengths - Length or lengths of each line.
 * @param breakpoints - Indexes within `items` of the start of each line.
 */
export function positionBoxes(
  items: InputItem[],
  lineLengths: number | number[],
  breakpoints: number[],
): PositionedBox[] {
  const adjRatios = adjustmentRatios(items, lineLengths, breakpoints);
  const result: PositionedBox[] = [];

  for (let b = 0; b < breakpoints.length - 1; b++) {
    // Limit the amount of shrinking of lines to 1x `glue.shrink` for each glue
    // item in a line.
    const adjustmentRatio = Math.max(adjRatios[b], MIN_ADJUSTMENT_RATIO);
    let xOffset = 0;

    for (let p = breakpoints[b]; p < breakpoints[b + 1]; p++) {
      const item = items[p];
      if (item.type === 'box') {
        result.push({
          box: p,
          line: b,
          xOffset,
        });
        xOffset += item.width;
      } else if (item.type === 'glue' && p !== breakpoints[b]) {
        let gap;
        if (adjustmentRatio < 0) {
          gap = item.width + adjustmentRatio * item.shrink;
        } else {
          gap = item.width + adjustmentRatio * item.stretch;
        }
        xOffset += gap;
      }
    }
  }

  return result;
}

/**
 * Lay out a paragraph of text into justified lines.
 *
 * Returns the X positions and line numbers of each "box" (word) from the input.
 *
 * This is a high-level helper which combines `breakLines` and `positionBoxes`
 * for convenience.
 */
export function layoutParagraph(
  items: InputItem[],
  lineLengths: number | number[],
  opts?: Partial<Options>,
): PositionedBox[] {
  const breakpoints = breakLines(items, lineLengths, opts);
  return positionBoxes(items, lineLengths, breakpoints);
}

/**
 * A box which also carries around with it some associated text.
 */
export interface TextBox extends Box {
  text: string;
}

export type TextInputItem = TextBox | Glue | Penalty;

/**
 * Return a `Penalty` item which forces a line-break.
 */
export function forcedBreak(): Penalty {
  return { type: 'penalty', cost: MIN_COST, width: 0, flagged: false };
}

/**
 * A convenience function that generates a set of input items for
 * `layoutParagraph` or `breakLines` from a string.
 *
 * @param s - Text to process
 * @param measureFn - Callback that calculates the width of a given string
 */
export function layoutItemsFromString(
  s: string,
  measureFn: (word: string) => number,
): TextInputItem[] {
  const items: TextInputItem[] = [];
  const words = s.split(/\s+/).filter(w => w.length > 0);

  // Here we assume that every space has the same default size. Callers who want
  // more flexibility can use the lower-level functions.
  const spaceWidth = measureFn(' ');

  const shrink = Math.max(0, spaceWidth - 2);
  words.forEach(w => {
    const b: TextBox = { type: 'box', width: measureFn(w), text: w };
    const g: Glue = { type: 'glue', width: spaceWidth, shrink, stretch: spaceWidth * 1.5 };
    items.push(b, g);
  });
  // Add "finishing glue" to space out final line.
  items.push({ type: 'glue', width: 0, stretch: MAX_COST, shrink: 0 });
  items.push(forcedBreak());

  return items;
}
