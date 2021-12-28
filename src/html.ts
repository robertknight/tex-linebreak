import { layoutItemsFromString, layoutText, TextBox } from './helpers';
import {
  breakLines,
  forcedBreak,
  InputItem,
  MaxAdjustmentExceededError,
  Box,
  Glue,
  Penalty,
} from './layout';
import { textNodesInRange } from './util/range';
import DOMTextMeasurer from './util/dom-text-measurer';

const NODE_TAG = 'insertedByTexLinebreak';

interface NodeOffset {
  node: Node;
  start: number;
  end: number;
}

type DOMBox = Box & NodeOffset;
type DOMGlue = Glue & NodeOffset;
type DOMPenalty = Penalty & NodeOffset;
type DOMItem = DOMBox | DOMGlue | DOMPenalty;

/**
 * Add layout items for `node` to `items`.
 */
function addItemsForTextNode(
  items: DOMItem[],
  node: Text,
  measureFn: (context: Element, word: string) => number,
  hyphenateFn?: (word: string) => string[],
) {
  const text = node.nodeValue!;
  const el = node.parentNode! as Element;

  const spaceWidth = measureFn(el, ' ');
  const shrink = Math.max(0, spaceWidth - 3);
  const hyphenWidth = measureFn(el, '-');
  const isSpace = (word: string) => /\s/.test(word.charAt(0));

  const chunks = text.split(/(\s+)/).filter((w) => w.length > 0);
  let textOffset = 0;

  chunks.forEach((w) => {
    if (isSpace(w)) {
      const glue: DOMGlue = {
        type: 'glue',
        width: spaceWidth,
        shrink,
        stretch: spaceWidth,
        node,
        start: textOffset,
        end: textOffset + w.length,
      };
      items.push(glue);
      textOffset += w.length;
      return;
    }

    if (hyphenateFn) {
      const chunks = hyphenateFn(w);
      chunks.forEach((c, i) => {
        const box: DOMBox = {
          type: 'box',
          width: measureFn(el, c),
          node,
          start: textOffset,
          end: textOffset + c.length,
        };
        textOffset += c.length;
        items.push(box);
        if (i < chunks.length - 1) {
          const hyphen: DOMPenalty = {
            type: 'penalty',
            width: hyphenWidth,
            cost: 10,
            flagged: true,
            node,
            start: textOffset,
            end: textOffset,
          };
          items.push(hyphen);
        }
      });
    } else {
      const box: DOMBox = {
        type: 'box',
        width: measureFn(el, w),
        node,
        start: textOffset,
        end: textOffset + w.length,
      };
      textOffset += w.length;
      items.push(box);
    }
  });
}

/**
 * Add layout items for `element` and its descendants to `items`.
 */
function addItemsForElement(
  items: DOMItem[],
  element: Element,
  measureFn: (context: Element, word: string) => number,
  hyphenateFn?: (word: string) => string[],
) {
  const {
    display,
    width,
    paddingLeft,
    paddingRight,
    marginLeft,
    marginRight,
    borderLeftWidth,
    borderRightWidth,
  } = getComputedStyle(element);

  if (display === 'inline') {
    // Add box for margin/border/padding at start of box.
    const leftMargin =
      parseFloat(marginLeft!) + parseFloat(borderLeftWidth!) + parseFloat(paddingLeft!);
    if (leftMargin > 0) {
      items.push({ type: 'box', width: leftMargin, node: element, start: 0, end: 0 });
    }

    // Add items for child nodes.
    addItemsForNode(items, element, measureFn, hyphenateFn, false);

    // Add box for margin/border/padding at end of box.
    const rightMargin =
      parseFloat(marginRight!) + parseFloat(borderRightWidth!) + parseFloat(paddingRight!);
    if (rightMargin > 0) {
      const length = element.childNodes.length;
      items.push({ type: 'box', width: rightMargin, node: element, start: length, end: length });
    }
  } else {
    // Treat this item as an opaque box.
    items.push({
      type: 'box',
      width: parseFloat(width!),
      node: element,
      start: 0,
      end: 1,
    });
  }
}

/**
 * Add layout items for input to `breakLines` for `node` to `items`.
 *
 * This function, `addItemsForTextNode` and `addItemsForElement` take an
 * existing array as a first argument to avoid allocating a large number of
 * small arrays.
 */
function addItemsForNode(
  items: DOMItem[],
  node: Node,
  measureFn: (context: Element, word: string) => number,
  hyphenateFn?: (word: string) => string[],
  addParagraphEnd = true,
) {
  const children = Array.from(node.childNodes);

  children.forEach((child) => {
    if (child instanceof Text) {
      addItemsForTextNode(items, child, measureFn, hyphenateFn);
    } else if (child instanceof Element) {
      addItemsForElement(items, child, measureFn, hyphenateFn);
    }
  });

  if (addParagraphEnd) {
    const end = node.childNodes.length;

    // Add a synthetic glue that aborbs any left-over space at the end of the
    // last line.
    items.push({ type: 'glue', width: 0, shrink: 0, stretch: 1000, node, start: end, end });

    // Add a forced break to end the paragraph.
    items.push({ ...forcedBreak(), node, start: end, end });
  }
}

function elementLineWidth(el: HTMLElement) {
  const { width, boxSizing, paddingLeft, paddingRight } = getComputedStyle(el);
  let w = parseFloat(width!);
  if (boxSizing === 'border-box') {
    w -= parseFloat(paddingLeft!);
    w -= parseFloat(paddingRight!);
  }
  return w;
}

/**
 * Calculate the actual width of each line and the number of spaces that can be
 * stretched or shrunk to adjust the width.
 */
function lineWidthsAndGlueCounts(items: InputItem[], breakpoints: number[]) {
  const widths: number[] = [];
  const glueCounts: number[] = [];

  for (let b = 0; b < breakpoints.length - 1; b++) {
    let actualWidth = 0;
    let glueCount = 0;

    const start = b === 0 ? breakpoints[b] : breakpoints[b] + 1;
    for (let p = start; p <= breakpoints[b + 1]; p++) {
      const item = items[p];
      if (item.type === 'box') {
        actualWidth += item.width;
      } else if (item.type === 'glue' && p !== start && p !== breakpoints[b + 1]) {
        actualWidth += item.width;
        ++glueCount;
      } else if (item.type === 'penalty' && p === breakpoints[b + 1]) {
        actualWidth += item.width;
      }
    }

    widths.push(actualWidth);
    glueCounts.push(glueCount);
  }

  return [widths, glueCounts];
}

/**
 * Mark a node as having been created by `justifyContent`.
 */
function tagNode(node: Node) {
  (node as any)[NODE_TAG] = true;
}

/**
 * Return `true` if `node` was created by `justifyContent`.
 */
function isTaggedNode(node: Node) {
  return node.hasOwnProperty(NODE_TAG);
}

/**
 * Return all descendants of `node` created by `justifyContent`.
 */
function taggedChildren(node: Node): Node[] {
  const children = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (isTaggedNode(child)) {
      children.push(child);
    }
    if (child.childNodes.length > 0) {
      children.push(...taggedChildren(child));
    }
  }
  return children;
}

function isTextOrInlineElement(node: Node) {
  if (node instanceof Text) {
    return true;
  } else if (node instanceof Element) {
    const style = getComputedStyle(node);
    return style.display === 'inline';
  } else {
    return false;
  }
}

/**
 * Wrap text nodes in a range and adjust the inter-word spacing.
 *
 * @param r - The range to wrap
 * @param wordSpacing - The additional spacing to add between words in pixels
 */
function addWordSpacing(r: Range, wordSpacing: number) {
  // Collect all text nodes in range, skipping any non-inline elements and
  // their children because those are treated as opaque blocks by the line-
  // breaking step.
  const texts = textNodesInRange(r, isTextOrInlineElement);

  for (let t of texts) {
    const wrapper = document.createElement('span');
    tagNode(wrapper);
    wrapper.style.wordSpacing = `${wordSpacing}px`;
    t.parentNode!.replaceChild(wrapper, t);
    wrapper.appendChild(t);
  }

  return texts;
}

/**
 * Reverse the changes made to an element by `justifyContent`.
 */
export function unjustifyContent(el: HTMLElement) {
  // Find and remove all elements inserted by `justifyContent`.
  const tagged = taggedChildren(el);
  for (let node of tagged) {
    const parent = node.parentNode!;
    const children = Array.from(node.childNodes);
    children.forEach((child) => {
      parent.insertBefore(child, node);
    });
    parent.removeChild(node);
  }

  // Re-join text nodes that were split by `justifyContent`.
  el.normalize();
}

interface ElementBreakpoints {
  el: HTMLElement;
  items: DOMItem[];
  breakpoints: number[];
  lineWidth: number;
}

/**
 * Justify an existing paragraph.
 *
 * Justify the contents of `elements`, using `hyphenateFn` to apply hyphenation if
 * necessary.
 *
 * To justify multiple paragraphs, it is more efficient to call `justifyContent`
 * once with all the elements to be processed, than to call `justifyContent`
 * separately for each element. Passing a list allows `justifyContent` to
 * optimize DOM manipulations.
 */
export function justifyContent(
  elements: HTMLElement | HTMLElement[],
  hyphenateFn?: (word: string) => string[],
) {
  // To avoid layout thrashing, we batch DOM layout reads and writes in this
  // function. ie. we first measure the available width and compute linebreaks
  // for all elements and then afterwards modify all the elements.

  if (!Array.isArray(elements)) {
    elements = [elements];
  }

  // Undo the changes made by any previous justification of this content.
  elements.forEach((el) => {
    unjustifyContent(el);
  });

  // Calculate line-break positions given current element width and content.
  const measurer = new DOMTextMeasurer();
  const measure = measurer.measure.bind(measurer);

  const elementBreaks: ElementBreakpoints[] = [];
  elements.forEach((el) => {
    const lineWidth = elementLineWidth(el);
    let items: DOMItem[] = [];
    addItemsForNode(items, el, measure);
    let breakpoints;
    try {
      // First try without hyphenation but a maximum stretch-factor for each
      // space.
      breakpoints = breakLines(items, lineWidth, {
        maxAdjustmentRatio: 2.0,
      });
    } catch (e) {
      if (e instanceof MaxAdjustmentExceededError) {
        // Retry with hyphenation and unlimited stretching of each space.
        items = [];
        addItemsForNode(items, el, measure, hyphenateFn);
        breakpoints = breakLines(items, lineWidth);
      } else {
        throw e;
      }
    }
    elementBreaks.push({ el, items, breakpoints, lineWidth });
  });

  // Insert line-breaks and adjust inter-word spacing.
  elementBreaks.forEach(({ el, items, breakpoints, lineWidth }) => {
    const [actualWidths, glueCounts] = lineWidthsAndGlueCounts(items, breakpoints);

    // Create a `Range` for each line. We create the ranges before modifying the
    // contents so that node offsets in `items` are still valid at the point when
    // we create the Range.
    const endsWithHyphen: boolean[] = [];
    const lineRanges: Range[] = [];
    for (let b = 1; b < breakpoints.length; b++) {
      const prevBreakItem = items[breakpoints[b - 1]];
      const breakItem = items[breakpoints[b]];

      const r = document.createRange();
      if (b > 1) {
        r.setStart(prevBreakItem.node, prevBreakItem.end);
      } else {
        r.setStart(el, 0);
      }
      r.setEnd(breakItem.node, breakItem.start);
      lineRanges.push(r);
      endsWithHyphen.push(breakItem.type === 'penalty' && breakItem.flagged);
    }

    // Disable automatic line wrap.
    el.style.whiteSpace = 'nowrap';

    // Insert linebreaks.
    lineRanges.forEach((r, i) => {
      if (i === 0) {
        return;
      }
      const brEl = document.createElement('br');
      tagNode(brEl);

      // Insert linebreak. The browser will automatically adjust subsequent
      // ranges.
      r.insertNode(brEl);

      r.setStart(brEl.nextSibling!, 0);
    });

    // Adjust inter-word spacing on each line and add hyphenation if needed.
    lineRanges.forEach((r, i) => {
      const spaceDiff = lineWidth - actualWidths[i];
      const extraSpacePerGlue = spaceDiff / glueCounts[i];

      // If this is the final line and the natural spacing between words does
      // not need to be compressed, then don't try to expand the spacing to fill
      // the line.
      const isFinalLine = i === lineRanges.length - 1;
      if (isFinalLine && extraSpacePerGlue >= 0) {
        return;
      }

      const wrappedNodes = addWordSpacing(r, extraSpacePerGlue);
      if (endsWithHyphen[i] && wrappedNodes.length > 0) {
        const lastNode = wrappedNodes[wrappedNodes.length - 1];
        const hyphen = document.createTextNode('-');
        tagNode(hyphen);
        lastNode.parentNode!.appendChild(hyphen);
      }
    });
  });
}
