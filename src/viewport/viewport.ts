/**
 * Viewport — scrollable content viewer component.
 *
 * Zero-dependency port of charmbracelet/bubbles/viewport (Go).
 * Features:
 * - Vertical and horizontal scrolling
 * - Soft wrapping
 * - Mouse wheel support
 * - Fill height option
 * - Gutter functions (e.g. line numbers)
 * - Vim-style and pager-style keybindings
 *
 * Note: Highlight/search features are not yet ported (require uniseg).
 *
 * @module
 */

import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { newStyle, stringWidth } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { Binding, newBinding, withKeys, withHelp, matches } from '../key/key.js';
import { cut, stringWidth as ansiStringWidth } from '../internal/ansi.js';

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_HORIZONTAL_STEP = 6;

// ── Types ───────────────────────────────────────────────────────────────────

/** Option configures a viewport Model during construction. */
export type Option = (m: Model) => void;

/**
 * GutterFunc renders a left gutter column (e.g. line numbers).
 * Must return strings of consistent visible width.
 */
export type GutterFunc = (ctx: GutterContext) => string;

/** Context provided to a GutterFunc. */
export interface GutterContext {
  /** Line index (0-based). */
  index: number;
  /** Total number of lines. */
  totalLines: number;
  /** Whether this is a soft-wrapped continuation line. */
  soft: boolean;
}

/** KeyMap defines the keybindings for the viewport. */
export interface KeyMap {
  pageDown: Binding;
  pageUp: Binding;
  halfPageUp: Binding;
  halfPageDown: Binding;
  down: Binding;
  up: Binding;
  left: Binding;
  right: Binding;
}

// ── Options ─────────────────────────────────────────────────────────────────

/** Sets the viewport width. */
export function withWidth(w: number): Option {
  return (m: Model) => { m._width = w; };
}

/** Sets the viewport height. */
export function withHeight(h: number): Option {
  return (m: Model) => { m._height = h; };
}

// ── Default KeyMap ──────────────────────────────────────────────────────────

/** Returns default pager-like keybindings. */
export function defaultKeyMap(): KeyMap {
  return {
    pageDown: newBinding(
      withKeys('pgdown', 'space', 'f'),
      withHelp('f/pgdn', 'page down'),
    ),
    pageUp: newBinding(
      withKeys('pgup', 'b'),
      withHelp('b/pgup', 'page up'),
    ),
    halfPageUp: newBinding(
      withKeys('u', 'ctrl+u'),
      withHelp('u', '\u00BD page up'),
    ),
    halfPageDown: newBinding(
      withKeys('d', 'ctrl+d'),
      withHelp('d', '\u00BD page down'),
    ),
    up: newBinding(
      withKeys('up', 'k'),
      withHelp('\u2191/k', 'up'),
    ),
    down: newBinding(
      withKeys('down', 'j'),
      withHelp('\u2193/j', 'down'),
    ),
    left: newBinding(
      withKeys('left', 'h'),
      withHelp('\u2190/h', 'move left'),
    ),
    right: newBinding(
      withKeys('right', 'l'),
      withHelp('\u2192/l', 'move right'),
    ),
  };
}

// ── Model ───────────────────────────────────────────────────────────────────

/**
 * Viewport model — a scrollable content viewer.
 * Use `newViewport()` to create.
 */
export class Model {
  /** @internal */ _width: number;
  /** @internal */ _height: number;
  keyMap: KeyMap;

  /** Whether to wrap text instead of horizontal scrolling. */
  softWrap: boolean;
  /** Whether to fill remaining height with empty lines. */
  fillHeight: boolean;

  /** Whether to respond to mouse wheel events. */
  mouseWheelEnabled: boolean;
  /** Number of lines the mouse wheel scrolls. Default: 3. */
  mouseWheelDelta: number;

  /** Vertical scroll offset. */
  private _yOffset: number;
  /** Horizontal scroll offset. */
  private _xOffset: number;
  /** Number of columns per horizontal scroll step. */
  private _horizontalStep: number;

  /** Position of the viewport in the terminal (for high-perf rendering). */
  yPosition: number;

  /** Style applied to the viewport (borders, margins, padding). */
  style: Style;

  /** Left gutter function (e.g. line numbers). */
  leftGutterFunc: GutterFunc | null;

  /** Style applied to each line via index. */
  styleLineFunc: ((index: number) => Style) | null;

  /** @internal */ private _initialized: boolean;
  /** @internal */ private _lines: string[];
  /** @internal */ private _longestLineWidth: number;

  constructor() {
    this._width = 0;
    this._height = 0;
    this.keyMap = defaultKeyMap();
    this.softWrap = false;
    this.fillHeight = false;
    this.mouseWheelEnabled = true;
    this.mouseWheelDelta = 3;
    this._yOffset = 0;
    this._xOffset = 0;
    this._horizontalStep = DEFAULT_HORIZONTAL_STEP;
    this.yPosition = 0;
    this.style = newStyle();
    this.leftGutterFunc = null;
    this.styleLineFunc = null;
    this._initialized = false;
    this._lines = [];
    this._longestLineWidth = 0;
  }

  /** @internal Initialize defaults. */
  private _setInitialValues(): void {
    this.keyMap = defaultKeyMap();
    this.mouseWheelEnabled = true;
    this.mouseWheelDelta = 3;
    this._horizontalStep = DEFAULT_HORIZONTAL_STEP;
    this.leftGutterFunc = null;
    this._initialized = true;
  }

  init(): Cmd | null {
    return null;
  }

  height(): number { return this._height; }
  setHeight(h: number): void { this._height = h; }
  width(): number { return this._width; }
  setWidth(w: number): void { this._width = w; }

  atTop(): boolean { return this.yOffset() <= 0; }
  atBottom(): boolean { return this.yOffset() >= this._maxYOffset(); }
  pastBottom(): boolean { return this.yOffset() > this._maxYOffset(); }

  scrollPercent(): number {
    const [total] = this._calculateLine(0);
    if (this._height >= total) return 1.0;
    const y = this.yOffset();
    const h = this._height;
    const t = total;
    return clamp(y / (t - h), 0, 1);
  }

  horizontalScrollPercent(): number {
    if (this._xOffset >= this._longestLineWidth - this._width) return 1.0;
    const y = this._xOffset;
    const h = this._width;
    const t = this._longestLineWidth;
    return clamp(y / (t - h), 0, 1);
  }

  /** Sets the viewport content from a string. */
  setContent(s: string): void {
    this.setContentLines(s.split('\n'));
  }

  /** Sets the viewport content from an array of lines. */
  setContentLines(lines: string[]): void {
    this._lines = [...lines];

    // Handle single empty line
    if (this._lines.length === 1 && ansiStringWidth(this._lines[0]) === 0) {
      this._lines = [];
    } else {
      // Split any lines that contain embedded newlines
      for (let i = this._lines.length - 1; i >= 0; i--) {
        if (!/[\r\n]/.test(this._lines[i])) continue;
        this._lines[i] = this._lines[i].replace(/\r\n/g, '\n');
        const subLines = this._lines[i].split('\n');
        if (subLines.length > 1) {
          this._lines.splice(i, 1, ...subLines);
        }
      }
    }

    this._longestLineWidth = maxLineWidth(this._lines);

    if (this.yOffset() > this._maxYOffset()) {
      this.gotoBottom();
    }
  }

  /** Returns the content as a single string. */
  getContent(): string {
    return this._lines.join('\n');
  }

  /** Returns the total line count (accounting for soft wrap). */
  totalLineCount(): number {
    const [total] = this._calculateLine(0);
    return total;
  }

  /** Returns the number of currently visible lines. */
  visibleLineCount(): number {
    return this._visibleLines().length;
  }

  yOffset(): number { return this._yOffset; }

  setYOffset(n: number): void {
    this._yOffset = clamp(n, 0, this._maxYOffset());
  }

  xOffset(): number { return this._xOffset; }

  setXOffset(n: number): void {
    if (this.softWrap) return;
    this._xOffset = clamp(n, 0, this._maxXOffset());
  }

  setHorizontalStep(n: number): void {
    this._horizontalStep = Math.max(0, n);
  }

  /** Ensures a line and column range is visible. */
  ensureVisible(line: number, colstart: number, colend: number): void {
    const maxW = this._maxWidth();
    if (colend <= maxW) {
      this.setXOffset(0);
    } else {
      this.setXOffset(colstart - this._horizontalStep);
    }
    if (line < this.yOffset() || line >= this.yOffset() + this._maxHeight()) {
      this.setYOffset(line);
    }
  }

  pageDown(): void {
    if (this.atBottom()) return;
    this.scrollDown(this._height);
  }

  pageUp(): void {
    if (this.atTop()) return;
    this.scrollUp(this._height);
  }

  halfPageDown(): void {
    if (this.atBottom()) return;
    this.scrollDown(Math.floor(this._height / 2));
  }

  halfPageUp(): void {
    if (this.atTop()) return;
    this.scrollUp(Math.floor(this._height / 2));
  }

  scrollDown(n: number): void {
    if (this.atBottom() || n === 0 || this._lines.length === 0) return;
    this.setYOffset(this.yOffset() + n);
  }

  scrollUp(n: number): void {
    if (this.atTop() || n === 0 || this._lines.length === 0) return;
    this.setYOffset(this.yOffset() - n);
  }

  scrollLeft(n: number): void {
    this.setXOffset(this._xOffset - n);
  }

  scrollRight(n: number): void {
    this.setXOffset(this._xOffset + n);
  }

  gotoTop(): string[] {
    if (this.atTop()) return [];
    this.setYOffset(0);
    return this._visibleLines();
  }

  gotoBottom(): string[] {
    this.setYOffset(this._maxYOffset());
    return this._visibleLines();
  }

  /**
   * Handles key press and mouse wheel messages for scrolling.
   */
  update(msg: Msg): [Model, Cmd | null] {
    if (!this._initialized) {
      this._setInitialValues();
    }

    if (isKeyPressMsg(msg)) {
      const k = { toString: () => msg.key ?? msg.type ?? '' };
      if (matches(k, this.keyMap.pageDown)) this.pageDown();
      else if (matches(k, this.keyMap.pageUp)) this.pageUp();
      else if (matches(k, this.keyMap.halfPageDown)) this.halfPageDown();
      else if (matches(k, this.keyMap.halfPageUp)) this.halfPageUp();
      else if (matches(k, this.keyMap.down)) this.scrollDown(1);
      else if (matches(k, this.keyMap.up)) this.scrollUp(1);
      else if (matches(k, this.keyMap.left)) this.scrollLeft(this._horizontalStep);
      else if (matches(k, this.keyMap.right)) this.scrollRight(this._horizontalStep);
    }

    return [this, null];
  }

  /** Renders the viewport. */
  view(): string {
    let w = this._width;
    let h = this._height;
    const sw = this.style.getWidth();
    const sh = this.style.getHeight();
    if (sw !== 0) w = Math.min(w, sw);
    if (sh !== 0) h = Math.min(h, sh);
    if (w === 0 || h === 0) return '';

    const contentWidth = w - this.style.getHorizontalFrameSize();
    const contentHeight = h - this.style.getVerticalFrameSize();

    const visLines = this._visibleLines();
    const contents = newStyle()
      .width(contentWidth)
      .height(contentHeight)
      .render(visLines.join('\n'));

    return this.style
      .unsetWidth()
      .unsetHeight()
      .render(contents);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Calculate total virtual lines and the real line index at a given y offset.
   * Returns [total, realIndex, virtualOffset].
   */
  private _calculateLine(yoffset: number): [number, number, number] {
    if (!this.softWrap) {
      const total = this._lines.length;
      const ridx = Math.min(yoffset, this._lines.length);
      return [total, ridx, 0];
    }

    const maxW = this._maxWidth();
    let total = 0;
    let ridx = 0;
    let voffset = 0;

    for (let i = 0; i < this._lines.length; i++) {
      const lineHeight = Math.max(1, Math.ceil(ansiStringWidth(this._lines[i]) / maxW));
      if (yoffset >= total && yoffset < total + lineHeight) {
        ridx = i;
        voffset = yoffset - total;
      }
      total += lineHeight;
    }

    if (yoffset >= total) {
      ridx = this._lines.length;
      voffset = 0;
    }

    return [total, ridx, voffset];
  }

  private _maxYOffset(): number {
    const [total] = this._calculateLine(0);
    return Math.max(0, total - this._height + this.style.getVerticalFrameSize());
  }

  private _maxXOffset(): number {
    return Math.max(0, this._longestLineWidth - this._width);
  }

  private _maxWidth(): number {
    let gutterSize = 0;
    if (this.leftGutterFunc) {
      gutterSize = ansiStringWidth(this.leftGutterFunc({ index: 0, totalLines: 0, soft: false }));
    }
    return Math.max(0, this._width - this.style.getHorizontalFrameSize() - gutterSize);
  }

  private _maxHeight(): number {
    return Math.max(0, this._height - this.style.getVerticalFrameSize());
  }

  private _visibleLines(): string[] {
    const maxH = this._maxHeight();
    const maxW = this._maxWidth();
    if (maxH === 0 || maxW === 0) return [];

    const [total, ridx, voffset] = this._calculateLine(this.yOffset());
    let lines: string[] = [];

    if (total > 0) {
      const bottom = clamp(ridx + maxH, ridx, this._lines.length);
      lines = this._styleLines(this._lines.slice(ridx, bottom), ridx);
    }

    // Fill remaining height if needed
    while (this.fillHeight && lines.length < maxH) {
      lines.push('');
    }

    // If no horizontal scroll needed and lines fit in width, return with gutter
    if ((this._xOffset === 0 && this._longestLineWidth <= maxW) || maxW === 0) {
      return this._setupGutter(lines, total, ridx);
    }

    // Soft wrapping
    if (this.softWrap) {
      return this._softWrap(lines, maxW, maxH, total, ridx, voffset);
    }

    // Horizontal scrolling via cut
    for (let i = 0; i < lines.length; i++) {
      lines[i] = cut(lines[i], this._xOffset, this._xOffset + maxW);
    }

    return this._setupGutter(lines, total, ridx);
  }

  private _styleLines(lines: string[], offset: number): string[] {
    if (!this.styleLineFunc) return lines;
    return lines.map((line, i) => this.styleLineFunc!(i + offset).render(line));
  }

  private _softWrap(
    lines: string[],
    maxWidth: number,
    maxHeight: number,
    total: number,
    ridx: number,
    voffset: number,
  ): string[] {
    const wrappedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineWidth = ansiStringWidth(line);
      if (lineWidth <= maxWidth) {
        let prefix = '';
        if (this.leftGutterFunc) {
          prefix = this.leftGutterFunc({
            index: i + ridx,
            totalLines: total,
            soft: false,
          });
        }
        wrappedLines.push(prefix + line);
        continue;
      }

      let idx = 0;
      while (lineWidth > idx) {
        const truncatedLine = cut(line, idx, maxWidth + idx);
        let prefix = '';
        if (this.leftGutterFunc) {
          prefix = this.leftGutterFunc({
            index: i + ridx,
            totalLines: total,
            soft: idx > 0,
          });
        }
        wrappedLines.push(prefix + truncatedLine);
        idx += maxWidth;
      }
    }

    return wrappedLines.slice(voffset, Math.min(voffset + maxHeight, wrappedLines.length));
  }

  private _setupGutter(lines: string[], total: number, ridx: number): string[] {
    if (!this.leftGutterFunc) return lines;
    return lines.map((line, i) =>
      this.leftGutterFunc!({
        index: i + ridx,
        totalLines: total,
        soft: false,
      }) + line,
    );
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a new viewport model.
 *
 * @example
 * ```ts
 * const vp = newViewport(withWidth(80), withHeight(24));
 * vp.setContent('Hello\nWorld');
 * console.log(vp.view());
 * ```
 */
export function newViewport(...opts: Option[]): Model {
  const m = new Model();
  for (const opt of opts) {
    opt(m);
  }
  m['_setInitialValues']();
  return m;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, low: number, high: number): number {
  if (high < low) { [low, high] = [high, low]; }
  return Math.min(high, Math.max(low, v));
}

function maxLineWidth(lines: string[]): number {
  let result = 0;
  for (const line of lines) {
    result = Math.max(result, ansiStringWidth(line));
  }
  return result;
}

function isKeyPressMsg(msg: unknown): msg is { type: 'keyPress'; key: string } {
  return (
    msg != null &&
    typeof msg === 'object' &&
    (msg as any).type === 'keyPress'
  );
}
