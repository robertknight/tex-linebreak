import { Box, Glue, Penalty, MAX_COST, forcedBreak } from './layout';

/**
 * A box which also carries around with it some associated text.
 */
export interface TextBox extends Box {
  text: string;
}

export type TextInputItem = TextBox | Glue | Penalty;

/**
 * A convenience function that generates a set of input items for `breakLines`
 * from a string.
 *
 * @param s - Text to process
 * @param measureFn - Callback that calculates the width of a given string
 * @param hyphenateFn - Callback that calculates legal hyphenation points in
 *                      words and returns an array of pieces that can be joined
 *                      with hyphens.
 */
export function layoutItemsFromString(
  s: string,
  measureFn: (word: string) => number,
  hyphenateFn?: (word: string) => string[],
): TextInputItem[] {
  const items: TextInputItem[] = [];
  const words = s.split(/\s+/).filter(w => w.length > 0);

  // Here we assume that every space has the same default size. Callers who want
  // more flexibility can use the lower-level functions.
  const spaceWidth = measureFn(' ');
  const hyphenWidth = measureFn('-');

  const shrink = Math.max(0, spaceWidth - 2);
  words.forEach(w => {
    if (hyphenateFn) {
      const chunks = hyphenateFn(w);
      chunks.forEach((c, i) => {
        const b: TextBox = { type: 'box', width: measureFn(c), text: c };
        items.push(b);
        if (i < chunks.length - 1) {
          const hyphen: Penalty = { type: 'penalty', width: hyphenWidth, cost: 10, flagged: true };
          items.push(hyphen);
        }
      });
    } else {
      const b: TextBox = { type: 'box', width: measureFn(w), text: w };
      items.push(b);
    }
    const g: Glue = { type: 'glue', width: spaceWidth, shrink, stretch: spaceWidth * 1.5 };
    items.push(g);
  });
  // Add "finishing glue" to space out final line.
  items.push({ type: 'glue', width: 0, stretch: MAX_COST, shrink: 0 });
  items.push(forcedBreak());

  return items;
}
