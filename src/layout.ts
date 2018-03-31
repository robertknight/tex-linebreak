/**
 * An object (eg. a word) to be typeset.
 */
export type Box = {
  type: 'box';
  width: number;
};

/**
 * A space between `Box` items with a preferred width and some
 * capacity to stretch or shrink.
 *
 * `Glue` items are also candidates for breakpoints if they immediately follow a
 * `Box`.
 */
export type Glue = {
  type: 'glue';
  width: number;
  /** Maximum amount by which this space can grow. */
  stretch: number;
  /** Maximum amount by which this space can shrink. */
  shrink: number;
};

/**
 * An explicit candidate position for breaking a line.
 */
export type Penalty = {
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
};

export type InputItem = Box | Penalty | Glue;

/**
 * Parameters for the layout process.
 */
export type Options = {
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
   * TODO - Hyphenation is not yet implemented.
   */
  chlPenalty: number;
};

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

function isForcedBreak(item: InputItem) {
  return item.type === 'penalty' && item.cost <= MIN_COST;
}

/**
 * Break a paragraph of text into justified lines.
 *
 * Returns the indexes from `items` which have been chosen as breakpoints.
 * `positionBoxes` can be used to generate the X offsets and line numbers of
 * each box using the resulting breakpoints.
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
  opts: Options,
): number[] {
  if (items.length === 0) {
    return [];
  }

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
    next: null | Node; // TBD - Do we need this field?
  };

  // TBD - p.1159 describes `active` as a linked-list sorted by line number.
  const active = new Set<Node>();

  // Add initial active node for beginning of paragraph.
  active.add({
    index: 0,
    line: 0,
    fitness: 1,
    totalWidth: 0,
    totalStretch: 0,
    totalShrink: 0,
    totalDemerits: 0,
    prev: null,
    next: null,
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

    // TODO - Provide some way to ensure that layout succeeds if it is not
    // possible to lay the paragraph out with the specified adjustment options.
    if (active.size === 0) {
      throw new Error(`Empty active node set after item ${b}`);
    }

    // Update the set of active nodes.
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

      // FIXME - If there is a forced break we'll never add an item to the
      // feasible set.
      if (adjustmentRatio < -1 || isForcedBreak(item)) {
        // Items from `a` to `b` cannot fit on one line.
        active.delete(a);
      }
      if (adjustmentRatio >= -1 && adjustmentRatio < opts.maxAdjustmentRatio) {
        // We found a feasible breakpoint. Compute a `demerits` score for it as
        // per formula on p. 1128.
        let demerits;
        const badness = 100 * Math.abs(adjustmentRatio) ** 3;
        // TBD - Penalty for consecutive hyphenated lines.
        const chlPenalty = 0;
        const penalty = item.type === 'penalty' ? item.cost : 0;

        if (penalty >= 0) {
          demerits = (1 + badness + penalty) ** 2 + chlPenalty;
        } else if (penalty > MIN_COST) {
          demerits = (1 + badness) ** 2 - penalty ** 2 + chlPenalty;
        } else {
          demerits = (1 + badness) ** 2 + chlPenalty;
        }

        const node = {
          index: b,
          line: a.line + 1,
          // TBD - Implement fitness classes.
          fitness: 1,
          totalWidth: sumWidth,
          totalShrink: sumShrink,
          totalStretch: sumStretch,
          totalDemerits: a.totalDemerits + demerits,
          next: null,
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

    if (item.type === 'glue') {
      sumWidth += item.width;
      sumStretch += item.stretch;
      sumShrink += item.shrink;
    }
  }

  // Choose active node with fewest total demerits as the last breakpoint.
  let bestNode: Node | null = null;
  active.forEach(a => {
    if (!bestNode || a.totalDemerits < bestNode.totalDemerits) {
      bestNode = a;
    }
  });

  if (opts.looseness !== 0) {
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
  const lineLen = (i: number) => (Array.isArray(lineLengths) ? lineLengths[i] : lineLengths);
  const result: PositionedBox[] = [];
  for (let b = 0; b < breakpoints.length - 1; b++) {
    // Compute adjustment ratio for line.
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

    // Position boxes along each line.
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
  opts: Options,
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
  // Add forced break at end of paragraph.
  items.push({ type: 'penalty', cost: MIN_COST, width: 0, flagged: false });

  return items;
}
