import { Box, Glue, Penalty } from '../src/layout';

export function box(w: number): Box {
  return { type: 'box', width: w };
}

export function glue(w: number, shrink: number, stretch: number): Glue {
  return { type: 'glue', width: w, shrink, stretch };
}

export function penalty(w: number, cost: number, flagged: boolean): Penalty {
  return { type: 'penalty', width: w, cost, flagged };
}
