import { assert } from 'chai';
import { readFileSync, writeFileSync } from 'fs';

import {
  adjustmentRatios,
  breakLines,
  forcedBreak,
  layoutItemsFromString,
  layoutParagraph,
  Box,
  Glue,
  InputItem,
  TextInputItem,
} from '../src/layout';

interface LayoutFixture {
  /** Input text of paragraph. */
  input: string;

  outputs: {
    /** Line-breaking options. */
    layoutOptions: {
      maxAdjustmentRatio: number;
      looseness: number;
      chlPenalty: number;
      charWidth: number;
      lineWidths: number | number[];
    };

    /** Expected broken lines. */
    lines: string[];
  }[];
}

/**
 * Read paragraph layout fixture from a file.
 *
 * The format of the fixture files is:
 *
 * ```
 * {input text}
 *
 * {output 0 settings}
 *
 * {output 0 lines}
 *
 * {output 1 settings }
 *
 * {output 1 lines}
 * ...
 * ```
 */
function readLayoutFixture(path: string): LayoutFixture {
  const defaultSettings = {
    charWidth: 5,
    maxAdjustmentRatio: 1,
    chlPenalty: 10,
  };

  const content = readFileSync(path, { encoding: 'utf8' }).trim();
  const sections = content.split('\n\n');
  const input = sections[0];
  const outputs = [];
  for (let i = 1; i < sections.length; i += 2) {
    const outputSettings = JSON.parse(sections[i]);
    const outputLines = sections[i + 1].split('\n').filter(l => l.length > 0);

    outputs.push({
      layoutOptions: {
        ...defaultSettings,
        ...outputSettings,
      },
      lines: outputLines,
    });
  }

  return {
    input,
    outputs,
  };
}

/**
 * Write a layout fixture in the same format used by `readLayoutFixture`.
 */
function writeLayoutFixture(path: string, f: LayoutFixture) {
  const content = [f.input].concat(
    ...f.outputs.map(o => [JSON.stringify(o.layoutOptions), o.lines.join('\n')]),
  );
  writeFileSync(path, content);
}

function chunk<T>(arr: T[], width: number) {
  let chunks: T[][] = [];
  for (let i = 0; i <= arr.length - width; i++) {
    chunks.push(arr.slice(i, i + width));
  }
  return chunks;
}

function box(w: number): Box {
  return { type: 'box', width: w };
}

function glue(w: number, shrink: number, stretch: number): Glue {
  return { type: 'glue', width: w, shrink, stretch };
}

describe('layout', () => {
  describe('breakLines', () => {
    it('generates expected layout', () => {
      const f = readLayoutFixture(`${__dirname}/fixtures/layout.txt`);
      f.outputs.forEach(({ lines, layoutOptions }) => {
        const measure = (text: string) => text.length * 5;
        const items = layoutItemsFromString(f.input, measure);
        const breakpoints = breakLines(items, layoutOptions.lineWidths, layoutOptions);
        const itemText = (item: TextInputItem) => (item.type == 'box' ? item.text : ' ');

        // Check that breakpoints occur at expected positions.
        const actualLines = chunk(breakpoints, 2)
          .map(([start, end]) =>
            items
              .slice(start, end)
              .map(itemText)
              .join('')
              .trim(),
          )
          .filter(l => l.length > 0);

        assert.deepEqual(actualLines, lines);

        // Check that adjustment ratios for each line are in range.
        const adjRatios = adjustmentRatios(items, layoutOptions.lineWidths, breakpoints);
        adjRatios.forEach(ar => {
          assert.isAtLeast(ar, -1);
          assert.isAtMost(ar, layoutOptions.maxAdjustmentRatio);
        });
      });
    });

    it('fails when min adjustment ratio is exceeded', () => {
      // Lay out input into a line with a width of less than the box width.
      let items: InputItem[] = [box(10), box(10), forcedBreak()];
      assert.throws(() =>
        breakLines(items, 5, {
          maxAdjustmentRatio: 1,
          chlPenalty: 0,
          looseness: 0,
        }),
      );
    });

    it('fails when max adjustment ratio is exceeded', () => {
      // Lay out input into a line which would need to stretch more than
      // `glue.width + maxAdjustmentRatio * glue.stretch` in order to fit.
      let items: InputItem[] = [box(10), glue(10, 10, 10), box(10), forcedBreak()];
      assert.throws(() =>
        breakLines(items, 1000, {
          maxAdjustmentRatio: 1,
          chlPenalty: 0,
          looseness: 0,
        }),
      );
    });
  });

  describe('layoutItemsFromString', () => {
    it('generates box and glue items', () => {
      const measure = () => 5;
      const str = 'One fine day';
      const items = layoutItemsFromString(str, measure);
      assert.deepEqual(items.map(it => it.type), [
        'box',
        'glue',
        'box',
        'glue',
        'box',
        'glue',
        'glue',
        'penalty',
      ]);
    });

    it('adds a glue that stretches to fill the last line', () => {
      const measure = () => 5;
      const str = 'Test line';
      const items = layoutItemsFromString(str, measure);
      assert.deepEqual(items[items.length - 2], {
        type: 'glue',
        width: 0,
        stretch: 1000,
        shrink: 0,
      });
    });

    it('adds a forced break at the end of the last line', () => {
      const measure = () => 5;
      const str = 'Test line';
      const items = layoutItemsFromString(str, measure);
      assert.deepEqual(items[items.length - 1], {
        type: 'penalty',
        cost: -1000,
        flagged: false,
        width: 0,
      });
    });
  });
});
