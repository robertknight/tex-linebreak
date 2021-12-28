import { assert } from 'chai';

import { textNodesInRange } from '../../src/util/range';

function acceptAllNodes() {
  return true;
}

describe('range', () => {
  let para: HTMLParagraphElement;
  beforeEach(() => {
    para = document.createElement('p');
    document.body.appendChild(para);
  });

  afterEach(() => {
    para.remove();
  });

  describe('textNodesInRange', () => {
    it('returns all text nodes in range', () => {
      const texts = [new Text('first'), new Text('second')];

      texts.forEach((t) => para.appendChild(t));
      const range = document.createRange();
      range.selectNode(para);

      assert.deepEqual(textNodesInRange(range, acceptAllNodes), texts);
    });

    it('does not return non-Text nodes', () => {
      para.innerHTML = 'foo <b>bar</b> baz <!-- meep !-->';

      const range = document.createRange();
      range.selectNode(para);
      const texts = textNodesInRange(range, acceptAllNodes);

      texts.forEach((t) => assert.instanceOf(t, Text));
    });

    it('returns text nodes in a range with only one node', () => {
      para.innerHTML = 'test';

      const range = document.createRange();
      range.setStart(para.childNodes[0], 1);
      range.setEnd(para.childNodes[0], 3);

      assert.deepEqual(textNodesInRange(range, acceptAllNodes), [para.childNodes[0]]);
    });

    it('does not return text nodes outside of range', () => {
      const texts = [new Text('one'), new Text('two'), new Text('three')];
      texts.forEach((t) => para.appendChild(t));

      const range = document.createRange();
      range.setStart(para, 1);
      range.setEnd(para, 2);

      assert.deepEqual(textNodesInRange(range, acceptAllNodes), [texts[1]]);
    });

    it('skips subtrees which are filtered out', () => {
      const texts = [new Text('first'), new Text('second'), new Text('third')];

      const child = document.createElement('span');
      child.appendChild(texts[1]);

      para.appendChild(texts[0]);
      para.appendChild(child);
      para.appendChild(texts[2]);
      const range = document.createRange();
      range.selectNode(para);

      const rejectSpans = (node: Node) => {
        if (!(node instanceof Element)) {
          return true;
        }
        return node.tagName !== 'SPAN';
      };

      assert.deepEqual(textNodesInRange(range, rejectSpans), [texts[0], texts[2]]);
    });
  });
});
