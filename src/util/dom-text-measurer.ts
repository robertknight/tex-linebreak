class TextMetricsCache {
  private _fonts: Map<Element, string>;
  private _textWidths: Map<string, Map<string, number>>;

  constructor() {
    this._fonts = new Map();
    this._textWidths = new Map();
  }

  putFont(el: Element, cssFont: string) {
    this._fonts.set(el, cssFont);
  }

  cssFontForElement(el: Element) {
    return this._fonts.get(el);
  }

  putWidth(cssFont: string, word: string, width: number) {
    let widths = this._textWidths.get(cssFont);
    if (!widths) {
      widths = new Map();
      this._textWidths.set(cssFont, widths);
    }
    widths.set(word, width);
  }

  getWidth(cssFont: string, word: string) {
    const widths = this._textWidths.get(cssFont);
    if (!widths) {
      return null;
    }
    return widths.get(word);
  }
}

/**
 * Return the computed CSS `font` property value for an element.
 */
function cssFontForElement(el: Element) {
  const style = getComputedStyle(el);

  // Safari and Chrome can synthesize a value for `font` for us.
  let font = style.font!;
  if (font.length > 0) {
    return font;
  }

  // Fall back to generating CSS font property value if browser (eg. Firefox)
  // does not synthesize it automatically.
  const { fontStyle, fontVariant, fontWeight, fontSize, fontFamily } = style;
  font = `${fontStyle!} ${fontVariant!} ${fontWeight!} ${fontSize!} ${fontFamily}`;
  return font;
}

let measureCtx: CanvasRenderingContext2D;

/**
 * Measure the width of `text` as it would appear if rendered within an
 * `Element` with a given computed `font` style.
 */
function measureText(cssFont: string, text: string) {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d')!;
  }

  // Capture as much of the style as possible. Note that some properties such
  // as `font-stretch`, `font-size-adjust` and `font-kerning` are not settable
  // through the CSS `font` property.
  //
  // Apparently in some browsers the canvas context's text style inherits
  // style properties from the `<canvas>` element.
  // See https://stackoverflow.com/a/8955835/434243
  measureCtx.font = cssFont;
  return measureCtx.measureText(text).width;
}

/** Measure the width of pieces of text in the DOM, with caching. */
export default class DOMTextMeasurer {
  private _cache: TextMetricsCache;

  constructor() {
    this._cache = new TextMetricsCache();
  }

  /**
   * Return the width of `text` rendered by a `Text` node child of `context`.
   */
  measure(context: Element, text: string) {
    let cssFont = this._cache.cssFontForElement(context);
    if (!cssFont) {
      cssFont = cssFontForElement(context);
      this._cache.putFont(context, cssFont);
    }
    let width = this._cache.getWidth(cssFont, text);
    if (!width) {
      width = measureText(cssFont, text);
      this._cache.putWidth(cssFont, text, width);
    }
    return width;
  }
}
