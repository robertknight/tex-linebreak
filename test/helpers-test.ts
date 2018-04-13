import { assert } from 'chai';
import Hypher from 'hypher';
import enUsPatterns from 'hyphenation.en-us';

import { forcedBreak } from '../src/layout';
import { layoutItemsFromString, layoutText, TextBox } from '../src/helpers';

import { box, glue, lineStrings, penalty } from './util';

const hyphenator = new Hypher(enUsPatterns);

describe('helpers', () => {
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
        text: '',
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

    it('generates flagged penalty items at hyphenation points', () => {
      const hyphenate = (w: string) => w.split('-');
      const measure = (w: string) => (w === '-' ? 1 : w.length * 5);

      const items = layoutItemsFromString('hel-lo wo-rld', measure, hyphenate).map(
        // Strip `text` property if this is a `TextBox` or `TextGlue`
        it => (delete (it as any).text, it)
      );

      assert.deepEqual(items, [
        box(15),
        penalty(1, 10, true),
        box(10),
        glue(5, 3, 7.5),
        box(10),
        penalty(1, 10, true),
        box(15),
        glue(0, 0, 1000),
        forcedBreak(),
      ]);
    });
  });

  describe('layoutText', () => {
    it('lays out lines applying hyphenation', () => {
      const text = `When the first paper volume of Donald Knuth's The Art of Computer Programming was published in 1968,[4] it was typeset using hot metal typesetting set by a Monotype Corporation typecaster. This method, dating back to the 19th century, produced a "good classic style" appreciated by Knuth.`;
      const measure = (w: string) => w.length * 5;
      const hyphenate = (w: string) => hyphenator.hyphenate(w);

      const { items, breakpoints } = layoutText(text, 150, measure, hyphenate);
      const lines = lineStrings(items, breakpoints);

      const expectedLines = [
        'When the first paper volume',
        "of Donald Knuth's The Art of",
        'Computer Programming was pub-',
        'lished in 1968,[4] it was type-',
        'set using hot metal typesetting',
        'set by a Monotype Corporation',
        'typecaster. This method, dat-',
        'ing back to the 19th century,',
        'produced a "good classic style"',
        'appreciated by Knuth.',
      ];
      assert.deepEqual(lines, expectedLines);
    });
  });
});
