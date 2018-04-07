/**
 * The "layout" demo illustrates simple usage of the TeX line-breaking algorithm
 * to lay out a paragraph of justified text and render it into an HTML canvas.
 */

import Hypher from 'hypher';
import enUsPatterns from 'hyphenation.en-us';

import {
  breakLines,
  positionItems,
  MaxAdjustmentExceededError,
  PositionedItem,
  MAX_COST,
  MIN_COST,
} from '../layout';

import { layoutItemsFromString, TextBox, TextInputItem } from '../helpers';

const hyphenator = new Hypher(enUsPatterns);

/**
 * Lay out text and return the positons at which to draw each word.
 */
function layoutText(
  text: string,
  lineWidth: number | number[],
  measure: (word: string) => number,
  hyphenate: (word: string) => string[],
) {
  let items: TextInputItem[];
  let positions: PositionedItem[];

  try {
    items = layoutItemsFromString(text, measure);
    const breakpoints = breakLines(items, lineWidth, {
      maxAdjustmentRatio: 1,
    });
    positions = positionItems(items, lineWidth, breakpoints);
  } catch (e) {
    if (e instanceof MaxAdjustmentExceededError) {
      items = layoutItemsFromString(text, measure, hyphenate);
      const breakpoints = breakLines(items, lineWidth);
      positions = positionItems(items, lineWidth, breakpoints);
    } else {
      throw e;
    }
  }

  return { items, positions };
}

/**
 * Render a string as justified text into a `<canvas>`.
 */
function renderToCanvas(c: HTMLCanvasElement, t: string, margins: { left: number; right: number }) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const leftMargin = margins.left;
  const rightMargin = margins.right;
  const lineWidth = c.width / window.devicePixelRatio - leftMargin - rightMargin;

  // Generate boxes, glues and penalties from input string.
  const { items, positions } = layoutText(
    t,
    lineWidth,
    w => ctx.measureText(w).width,
    w => hyphenator.hyphenate(w),
  );

  // Render each line.
  const lineSpacing = 30;
  positions.forEach(p => {
    const yOffset = (p.line + 1) * lineSpacing;
    const item = items[p.item];
    const text = item.type === 'box' ? (item as TextBox).text : '-';
    let xOffset = leftMargin + p.xOffset;
    ctx.fillText(text, xOffset, yOffset);
  });
}

/**
 * Render a string as justified text using `<span>` and `<br>` elements.
 *
 * @param el - The container element. This is assumed to be using `box-sizing:
 * border`.
 */
function renderToHTML(el: HTMLElement, t: string) {
  // Clear element and measure font.
  el.innerHTML = '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const { fontSize, fontFamily, width, paddingLeft, paddingRight } = window.getComputedStyle(el);
  const lineWidth = parseFloat(width!) - parseFloat(paddingLeft!) - parseFloat(paddingRight!);
  ctx.font = `${fontSize} ${fontFamily}`;

  const { items, positions } = layoutText(
    t,
    lineWidth,
    w => ctx.measureText(w).width,
    w => hyphenator.hyphenate(w),
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

const textarea = document.querySelector('textarea')!;
const canvas = document.querySelector('canvas')!;
const lineWidthInput = document.querySelector('.js-line-width')! as HTMLInputElement;
const para = document.querySelector('.output-p')! as HTMLElement;
const cssPara = document.querySelector('.css-output-p')! as HTMLElement;

/**
 * Set the size of a canvas, adjusting for high-DPI displays.
 */
function setCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  const ctx = canvas.getContext('2d')!;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function rerender() {
  const lineWidth = parseInt(lineWidthInput.value);
  const paraStyle = window.getComputedStyle(para);
  const padding = {
    left: parseInt(paraStyle.paddingLeft!),
    right: parseInt(paraStyle.paddingRight!),
  };
  document.body.style.setProperty('--line-width', `${lineWidth}px`);
  setCanvasSize(canvas, lineWidth + padding.left + padding.right, 500);

  canvas.getContext('2d')!.font = '13pt sans serif';
  renderToCanvas(canvas, textarea.value, padding);

  renderToHTML(para, textarea.value);

  cssPara.textContent = textarea.value;
}

// Render text and re-render on changes.
textarea.addEventListener('input', rerender);
lineWidthInput.addEventListener('input', rerender);
rerender();
