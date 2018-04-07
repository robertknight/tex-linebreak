/**
 * The "layout" demo illustrates simple usage of the TeX line-breaking algorithm
 * to lay out a paragraph of justified text and render it into an HTML canvas.
 */

import Hypher from 'hypher';
import enUsPatterns from 'hyphenation.en-us';

import { layoutText, TextBox } from '../helpers';
import { renderToHTML, justifyContent } from '../html';

const hyphenator = new Hypher(enUsPatterns);
const hyphenate = (word: string) => hyphenator.hyphenate(word);

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

  // Render as HTML.
  const htmlPara = document.querySelector('.html-p')! as HTMLElement;
  htmlPara.innerHTML = textarea.value;
  const textContent = htmlPara.textContent!;
  justifyContent(htmlPara, hyphenate);

  // Render to canvas.
  setCanvasSize(canvas, lineWidth + padding.left + padding.right, 500);
  canvas.getContext('2d')!.font = '13pt sans serif';
  renderToCanvas(canvas, textContent, padding);

  // Render as text to HTML.
  renderToHTML(para, textContent, hyphenate);

  // Render using CSS `text-justify`
  cssPara.innerHTML = textarea.value;
}

// Render text and re-render on changes.
textarea.addEventListener('input', rerender);
lineWidthInput.addEventListener('input', rerender);
rerender();

const htmlParas = Array.from(document.querySelectorAll('.js-tex-linebreak'));
htmlParas.forEach(el => justifyContent(el as HTMLElement));
