/**
 * The "layout" demo illustrates simple usage of the TeX line-breaking algorithm
 * to lay out a paragraph of justified text and render it into an HTML canvas.
 */

import { layoutParagraph, InputItem, Box, Glue, MAX_COST, MIN_COST } from '../layout';

interface WordBox extends Box {
  /** Index of word associated with this box. */
  word: number;
}

function renderText(c: HTMLCanvasElement, t: string) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const leftMargin = 20;
  const rightMargin = 20;
  const lineWidth = c.width / window.devicePixelRatio - leftMargin - rightMargin;

  // Generate boxes, glues and penalties from input string.
  let items: InputItem[] = [];
  const words = t.split(/\s+/).filter(w => w.length > 0);
  const spaceWidth = ctx.measureText(' ').width;
  const shrink = Math.max(0, spaceWidth - 2);
  words.forEach((w, i) => {
    const b: WordBox = { type: 'box', width: ctx.measureText(w).width, word: i };
    const g: Glue = { type: 'glue', width: spaceWidth, shrink, stretch: 20 };
    items.push(b, g);
  });
  // Add "finishing glue" to space out final line.
  items.push({ type: 'glue', width: 0, stretch: MAX_COST, shrink: 0 });
  // Add forced break at end of paragraph.
  items.push({ type: 'penalty', cost: MIN_COST, width: 0, flagged: false });

  // Layout paragraph.
  const boxPositions = layoutParagraph(items, lineWidth, {
    maxAdjustmentRatio: 1,
    looseness: 0,
    chlPenalty: 0,
  });

  // Render each line.
  const lineSpacing = 30;
  boxPositions.forEach(bp => {
    const yOffset = (bp.line + 1) * lineSpacing;
    const box = items[bp.box] as WordBox;
    let xOffset = leftMargin + bp.xOffset;
    ctx.fillText(words[box.word], xOffset, yOffset);
  });
}

const textarea = document.querySelector('textarea')!;
const canvas = document.querySelector('canvas')!;

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
});
renderText(canvas, textarea.value);
