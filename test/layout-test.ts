import { assert } from 'chai';
import { readFileSync, writeFileSync } from 'fs';

import {
  adjustmentRatios,
  breakLines,
  forcedBreak,
  layoutItemsFromString,
  layoutParagraph,
  positionBoxes,
  Box,
  Glue,
  InputItem,
  Penalty,
  TextBox,
  TextInputItem,
} from '../src/layout';

interface LayoutFixture {
  /** Input text of paragraph. */
  input: string;

  outputs: {
    /** Line-breaking options. */
    layoutOptions: {
      maxAdjustmentRatio: number;
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

function repeat<T>(arr: T[], count: number) {
  let result = [];
  while (count) {
    --count;
    result.push(...arr);
  }
  return result;
}

function itemsFromString(s: string, charWidth: number, glueStretch: number): TextInputItem[] {
  const items = s.split(/(\s+|-)/).map(substr => {
    const width = substr.length * charWidth;
    if (substr.match(/^\s+$/)) {
      return { type: 'glue', width, shrink: 2, stretch: glueStretch } as Glue;
    } else if (substr === '-') {
      return { type: 'penalty', width, flagged: true, cost: 5 } as Penalty;
    } else {
      return { type: 'box', width, text: substr } as TextBox;
    }
  });
  items.push({ type: 'glue', width: 0, shrink: 0, stretch: 1000 });
  items.push(forcedBreak());
  return items;
}

function itemString(item: TextInputItem) {
  switch (item.type) {
    case 'box':
      return item.text;
    case 'glue':
      return ' ';
    case 'penalty':
      return item.flagged ? '-' : '';
  }
}

function lineStrings(items: TextInputItem[], breakpoints: number[]): string[] {
  const pieces = items.map(itemString);
  return chunk(breakpoints, 2).map(([a, b]) =>
    pieces
      .slice(a, b)
      .join('')
      .trim(),
  );
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

    it('uses defaults if options are omitted', () => {
      const measure = (text: string) => text.length * 5;
      const items = layoutItemsFromString('one fine day in the middle of the night', measure);
      const breakpoints = breakLines(items, 100);
      assert.deepEqual(breakpoints, [0, 9, 17, 19]);
    });

    it('succeeds when min adjustment ratio is exceeded', () => {
      // Lay out input into a line with a width (5) of less than the box width
      // (10).
      // We'll give up and make lines which exceed the specified length.
      const lines = repeat([box(10), glue(5, 1, 1)], 5);
      const items: InputItem[] = [...lines, forcedBreak()];
      const breakpoints = breakLines(items, 5, {
        maxAdjustmentRatio: 1,
      });
      assert.deepEqual(breakpoints, [0, 1, 3, 5, 7, 9, 10]);
    });

    it('handles glue with zero stretch', () => {
      const items = [box(10), glue(5, 0, 0), box(10), forcedBreak()];
      const breakpoints = breakLines(items, 50);
      assert.deepEqual(breakpoints, [0, 3]);
    });

    it('handles glue with zero shrink', () => {
      const items = [box(10), glue(5, 0, 0), box(10), forcedBreak()];
      const breakpoints = breakLines(items, 21);
      assert.deepEqual(breakpoints, [0, 3]);
    });

    it('handles boxes that are wider than the line width', () => {
      const items = [box(5), glue(5, 10, 10), box(100), glue(5, 10, 10), forcedBreak()];
      const breakpoints = breakLines(items, 50);
      assert.deepEqual(breakpoints, [0, 3, 4]);
    });

    [
      {
        items: [box(10), glue(10, 10, 10), box(10), forcedBreak()],
        lineWidth: 1000,
        expectedBreakpoints: [0, 3],
      },
      {
        items: [box(10), glue(10, 5, 5), box(100), forcedBreak()],
        lineWidth: 50,
        expectedBreakpoints: [0, 3],
      },
    ].forEach(({ items, lineWidth, expectedBreakpoints }, i) => {
      it(`succeeds when max adjustment ratio is exceeded (${i + 1})`, () => {
        // Lay out input into a line which would need to stretch more than
        // `glue.width + maxAdjustmentRatio * glue.stretch` in order to fit.
        //
        // Currently the algorithm will simply retry with a higher threshold. If
        // we followed TeX's solution (see Knuth-Plass p.1162) then we would first
        // retry with the same threshold after applying hyphenation to break
        // existing boxes and then only after that retry with a higher threshold.
        const breakpoints = breakLines(items, lineWidth, {
          maxAdjustmentRatio: 1,
        });
        assert.deepEqual(breakpoints, expectedBreakpoints);
      });
    });

    it('applies a penalty for consecutive lines ending with a hyphen', () => {
      const text = 'one two long-word one long-word';
      const charWidth = 5;
      const glueStretch = 60;
      const items = itemsFromString(text, charWidth, glueStretch);
      const lineWidth = 13 * charWidth;

      // Break lines without a double-hyphen penalty.
      let breakpoints = breakLines(items, lineWidth);
      let lines = lineStrings(items, breakpoints);
      assert.deepEqual(
        lines,
        [
          // FIXME - The hyphen should appear at the end of the line, not the
          // start.
          'one two long',
          '-word one long',
          '-word',
        ],
        'did not break as expected without penalty',
      );

      // Break lines with a double-hyphen penalty.
      breakpoints = breakLines(items, lineWidth, {
        doubleHyphenPenalty: 50,
      });
      lines = lineStrings(items, breakpoints);
      assert.deepEqual(
        lines,
        [
          // FIXME - The hyphen should appear at the end of the line, not the
          // start.
          'one two long',
          '-word one',
          'long-word',
        ],
        'did not break as expected with penalty',
      );
    });

    it('applies a penalty when adjacent lines have different tightness', () => {
      // Getting this test case to produce different output with and without the
      // penalty applied required a great deal of hand-tweaking. It would be
      // preferable to use a simpler test case.

      const text =
        'Accurate 3D hand pose estimation plays an important role in Human Machine Interaction (HMI). In the reality of HMI, joints in fingers stretching out, especially corresponding fingertips, are much more important than other joints. We propose a novel method to refine stretching_out finger joint locations after obtaining rough hand pose estimation. It first detects which fingers are stretching out, then neighbor pixels of certain joint vote for its new location based on random forests. The algorithm is tested on two public datasets: MSRA15 and ICVL. After the refinement stage of stretching_out fingers, errors of predicted HMI finger joint locations are significantly reduced. Mean error of all fingertips reduces around 5mm (relatively more than 20%). Stretching_out fingertip locations are even more precise, which in MSRA15 reduces 10.51mm (relatively 41.4%).';
      const charWidth = 5;
      const glueStretch = 10;
      const items = itemsFromString(text, charWidth, glueStretch);
      const lineWidth = 30 * charWidth;

      // Break lines without contrasting tightess penalty.
      let breakpointsA = breakLines(items, lineWidth, {
        adjacentLooseTightPenalty: 0,
      });
      let linesA = lineStrings(items, breakpointsA);

      // Break lines with constrasting tightness penalty.
      let breakpointsB = breakLines(items, lineWidth, {
        adjacentLooseTightPenalty: 10000,
      });
      let linesB = lineStrings(items, breakpointsB);

      assert.notDeepEqual(linesA, linesB);
    });
  });

  describe('positionBoxes', () => {
    it('lays out boxes with justified margins', () => {
      const items = [
        box(10),
        glue(10, 5, 5),
        box(10),
        glue(10, 5, 5),
        box(10),
        glue(10, 5, 5),
        forcedBreak(),
      ];
      const lineWidth = 35;
      const breakpoints = [0, 3, 6];

      const boxes = positionBoxes(items, lineWidth, breakpoints);

      assert.deepEqual(boxes, [
        {
          box: 0,
          line: 0,
          xOffset: 0,
        },
        {
          box: 2,
          line: 0,
          xOffset: 25,
        },
        {
          box: 4,
          line: 1,
          xOffset: 0,
        },
      ]);
    });

    it('does not let gap between boxes shrink below `glue.width - glue.shrink`', () => {
      const items = [box(10), glue(10, 5, 5), box(100), forcedBreak()];
      const lineWidth = 50;
      const breakpoints = [0, 3];

      const boxes = positionBoxes(items, lineWidth, breakpoints);

      assert.deepEqual(boxes, [
        {
          box: 0,
          line: 0,
          xOffset: 0,
        },
        {
          box: 2,
          line: 0,
          xOffset: 15,
        },
      ]);
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
