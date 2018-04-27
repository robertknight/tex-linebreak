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
import { textNodesInRange } from './range';
import DOMTextMeasurer from './util/dom-text-measurer';

const NODE_TAG = 'insertedByTexLinebreak';

/**
 * Render a string as justified text using HTML elements for spacing.
 *
 * @param el - The container element. This is assumed to be using `box-sizing:
 * border`.
 */
export function renderToHTML(el: HTMLElement, text: string, hyphenate: (word: string) => string[]) {
  // Clear element and measure font.
  el.innerHTML = '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const { fontSize, fontFamily, width, paddingLeft, paddingRight } = window.getComputedStyle(el);
  const lineWidth = parseFloat(width!) - parseFloat(paddingLeft!) - parseFloat(paddingRight!);
  ctx.font = `${fontSize} ${fontFamily}`;

  const { items, positions } = layoutText(
    text,
    lineWidth,
    w => ctx.measureText(w).width,
    hyphenate,
  );

  // Generate `<div>` and `<span>` elements.
  const addLine = () => {
    const lineEl = document.createElement('div');
    lineEl.style.whiteSpace = 'nowrap';
    el.appendChild(lineEl);
    return lineEl;
  };

  let prevXOffset = 0;
  let lineEl = addLine();

  positions.forEach((p, i) => {
    const isNewLine = i > 0 && p.line !== positions[i - 1].line;
    if (isNewLine) {
      // In theory we could use `<br>` elements to insert line breaks, but in
      // testing this resulted in Firefox and Chrome inserting an extra break
      // near the end of the line. Adding lines this way produces consistent
      // output across browsers.
      lineEl = addLine();
      prevXOffset = 0;
    }
    const span = document.createElement('span');
    const item = items[p.item];
    if (item.type === 'box') {
      span.textContent = (item as TextBox).text;
    } else if (item.type === 'penalty') {
      span.textContent = '-';
    }
    span.style.marginLeft = `${p.xOffset - prevXOffset}px`;
    prevXOffset = p.xOffset + item.width;
    lineEl.appendChild(span);
  });
}

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
 * Create a list of input items for `breakLines` from a DOM node.
 */
function itemsFromNode(
  n: Node,
  measureFn: (context: Element, word: string) => number,
  hyphenateFn?: (word: string) => string[],
  addParagraphEnd = true,
): DOMItem[] {
  let items: DOMItem[] = [];
  const children = Array.from(n.childNodes);

  children.forEach(child => {
    if (child instanceof Text) {
      let textOffset = 0;
      const nodeItems = layoutItemsFromString(
        child.nodeValue!,
        w => measureFn(child.parentNode! as Element, w),
        hyphenateFn,
      )
        // Remove final glue and forced break.
        .slice(0, -2)
        // Annotate with DOM node metadata.
        .map(it => {
          const length = it.type === 'box' || it.type === 'glue' ? it.text.length : 0;
          const nodeOffset = { node: child, start: textOffset, end: textOffset + length };
          textOffset += length;
          return { ...it, ...nodeOffset };
        })
        // Remove consecutive glue items.
        .filter((it, i, ary) => {
          const prevWasGlue = i > 0 && it.type === 'glue' && ary[i - 1].type === 'glue';
          return !prevWasGlue;
        });

      items.push(...nodeItems);
    } else if (child instanceof Element) {
      const {
        display,
        width,
        paddingLeft,
        paddingRight,
        marginLeft,
        marginRight,
        borderLeftWidth,
        borderRightWidth,
      } = getComputedStyle(child);

      if (display === 'inline') {
        // Add box for margin/border/padding at start of box.
        const leftMargin =
          parseFloat(marginLeft!) + parseFloat(borderLeftWidth!) + parseFloat(paddingLeft!);
        if (leftMargin > 0) {
          items.push({ type: 'box', width: leftMargin, node: child, start: 0, end: 0 });
        }

        // Add items for child nodes.
        items.push(...itemsFromNode(child, measureFn, hyphenateFn, false));

        // Add box for margin/border/padding at end of box.
        const rightMargin =
          parseFloat(marginRight!) + parseFloat(borderRightWidth!) + parseFloat(paddingRight!);
        if (rightMargin > 0) {
          const length = child.childNodes.length;
          items.push({ type: 'box', width: rightMargin, node: child, start: length, end: length });
        }
      } else {
        // Treat this item as an opaque box.
        items.push({
          type: 'box',
          width: parseFloat(width!),
          node: child,
          start: 0,
          end: 1,
        });
      }
    }
  });

  if (addParagraphEnd) {
    const end = n.childNodes.length;

    // Add a synthetic glue that aborbs any left-over space at the end of the
    // last line.
    items.push({ type: 'glue', width: 0, shrink: 0, stretch: 1000, node: n, start: end, end });

    // Add a forced break to end the paragraph.
    items.push({ ...forcedBreak(), node: n, start: end, end });
  }

  return items;
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

/**
 * Wrap text nodes in a range and adjust the inter-word spacing.
 *
 * @param r - The range to wrap
 * @param wordSpacing - The additional spacing to add between words in pixels
 */
function addWordSpacing(r: Range, wordSpacing: number) {
  const texts = textNodesInRange(r);

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
    children.forEach(child => {
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
  elements.forEach(el => {
    unjustifyContent(el);
  });

  // Calculate line-break positions given current element width and content.
  const measurer = new DOMTextMeasurer();
  const measure = measurer.measure.bind(measurer);

  const elementBreaks: ElementBreakpoints[] = [];
  elements.forEach(el => {
    const lineWidth = elementLineWidth(el);
    let items = itemsFromNode(el, measure);
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
        items = itemsFromNode(el, measure, hyphenateFn);
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
