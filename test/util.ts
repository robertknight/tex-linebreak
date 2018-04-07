import { Box, Glue, Penalty } from '../src/layout';
import { TextInputItem } from '../src/helpers';

export function box(w: number): Box {
  return { type: 'box', width: w };
}

export function glue(w: number, shrink: number, stretch: number): Glue {
  return { type: 'glue', width: w, shrink, stretch };
}

export function penalty(w: number, cost: number, flagged: boolean): Penalty {
  return { type: 'penalty', width: w, cost, flagged };
}

export function itemString(item: TextInputItem) {
  switch (item.type) {
    case 'box':
      return item.text;
    case 'glue':
      return ' ';
    case 'penalty':
      return item.flagged ? '-' : '';
  }
}

export function lineStrings(items: TextInputItem[], breakpoints: number[]): string[] {
  const pieces = items.map(itemString);
  const start = (pos: number) => (pos === 0 ? 0 : pos + 1);
  return chunk(breakpoints, 2).map(([a, b]) =>
    pieces
      .slice(start(a), b + 1)
      .filter((w, i, ary) => w !== '-' || i === ary.length - 1)
      .join('')
      .trim(),
  );
}

export function chunk<T>(arr: T[], width: number) {
  let chunks: T[][] = [];
  for (let i = 0; i <= arr.length - width; i++) {
    chunks.push(arr.slice(i, i + width));
  }
  return chunks;
}
