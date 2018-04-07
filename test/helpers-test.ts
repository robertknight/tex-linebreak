import { assert } from 'chai';

import { forcedBreak } from '../src/layout';
import { layoutItemsFromString, TextBox } from '../src/helpers';

import { box, glue, penalty } from './util';

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

    it('generates flagged penalty items at hyphenation points', () => {
      const hyphenate = (w: string) => w.split('-');
      const measure = (w: string) => (w === '-' ? 1 : w.length * 5);

      const items = layoutItemsFromString('hel-lo wo-rld', measure, hyphenate).map(
        it =>
          // Replace `TextBox` items with `Box` items.
          it.type === 'box' ? { type: 'box', width: it.width } : it,
      );

      assert.deepEqual(items, [
        box(15),
        penalty(1, 10, true),
        box(10),
        glue(5, 3, 7.5),
        box(10),
        penalty(1, 10, true),
        box(15),
        glue(5, 3, 7.5),
        glue(0, 0, 1000),
        forcedBreak(),
      ]);
    });
  });
});
