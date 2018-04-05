/**
 * The "layout" demo illustrates simple usage of the TeX line-breaking algorithm
 * to lay out a paragraph of justified text and render it into an HTML canvas.
 */

import {
  layoutItemsFromString,
  layoutParagraph,
  MaxAdjustmentExceededError,
  PositionedItem,
  TextBox,
  TextInputItem,
  MAX_COST,
  MIN_COST,
} from '../layout';

/**
 * Render a string as justified text into a `<canvas>`.
 */
function renderText(c: HTMLCanvasElement, t: string) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const leftMargin = 20;
  const rightMargin = 20;
  const lineWidth = c.width / window.devicePixelRatio - leftMargin - rightMargin;

  // Generate boxes, glues and penalties from input string.
  const items = layoutItemsFromString(t, w => ctx.measureText(w).width);

  // Layout paragraph.
  const boxPositions = layoutParagraph(items, lineWidth);

  // Render each line.
  const lineSpacing = 30;
  boxPositions.forEach(bp => {
    const yOffset = (bp.line + 1) * lineSpacing;
    const item = items[bp.item];
    const text = item.type === 'box' ? (item as TextBox).text : '-';
    let xOffset = leftMargin + bp.xOffset;
    ctx.fillText(text, xOffset, yOffset);
  });
}

/**
 * Render a string as justified text using `<span>` and `<br>` elements.
 */
function renderSpans(el: HTMLElement, t: string) {
  // Clear element and measure font.
  el.innerHTML = '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const { fontSize, fontFamily, width, paddingLeft, paddingRight } = window.getComputedStyle(el);
  const lineWidth = parseFloat(width!);
  ctx.font = `${fontSize} ${fontFamily}`;

  // Layout text.
  let items: TextInputItem[];
  let boxPositions: PositionedItem[];

  try {
    items = layoutItemsFromString(t, w => ctx.measureText(w).width);
    boxPositions = layoutParagraph(items, lineWidth, {
      maxAdjustmentRatio: 1,
    });
  } catch (e) {
    console.log('Retrying with hyphenation');
    if (e instanceof MaxAdjustmentExceededError) {
      const hyphenate = (word: string) => {
        const chunks = [];
        for (let i = 0; i < word.length; i += 3) {
          chunks.push(word.slice(i, i + 3));
        }
        return chunks;
      };
      items = layoutItemsFromString(t, w => ctx.measureText(w).width, hyphenate);
      boxPositions = layoutParagraph(items, lineWidth);
    } else {
      throw e;
    }
  }

  // Generate `<div>` and `<span>` elements.
  const addLine = () => {
    const lineEl = document.createElement('div');
    lineEl.style.whiteSpace = 'nowrap';
    el.appendChild(lineEl);
    return lineEl;
  };

  let prevXOffset = 0;
  let lineEl = addLine();

  boxPositions.forEach((bp, i) => {
    const isNewLine = i > 0 && bp.line !== boxPositions[i - 1].line;
    if (isNewLine) {
      // In theory we could use `<br>` elements to insert line breaks, but in
      // testing this resulted in Firefox and Chrome inserting an extra break
      // near the end of the line. Adding lines this way produces consistent
      // output across browsers.
      lineEl = addLine();
      prevXOffset = 0;
    }
    const span = document.createElement('span');
    const item = items[bp.item];
    if (item.type === 'box') {
      span.textContent = (item as TextBox).text;
    } else if (item.type === 'penalty') {
      span.textContent = '-';
    }
    span.style.marginLeft = `${bp.xOffset - prevXOffset}px`;
    prevXOffset = bp.xOffset + item.width;
    lineEl.appendChild(span);
  });
}

const textarea = document.querySelector('textarea')!;
const canvas = document.querySelector('canvas')!;
const para = document.querySelector('.output-p')! as HTMLElement;
const cssPara = document.querySelector('.css-output-p')! as HTMLElement;

// Setup canvas for high DPI displays.
const ctx = canvas.getContext('2d')!;
canvas.style.width = canvas.width + 'px';
canvas.style.height = canvas.height + 'px';
canvas.width *= window.devicePixelRatio;
canvas.height *= window.devicePixelRatio;
ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

// Render text and re-render on changes.
ctx.font = '13pt sans-serif';
textarea.addEventListener('input', () => {
  renderText(canvas, textarea.value);
  renderSpans(para, textarea.value);
  cssPara.textContent = textarea.value;
});
renderText(canvas, textarea.value);
renderSpans(para, textarea.value);
cssPara.textContent = textarea.value;
