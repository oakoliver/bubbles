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
 * @module
 */

import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { KeyMod, MouseButton } from '@oakoliver/bubbletea';
import { newRange, newStyle, styleRanges } from '@oakoliver/lipgloss';
import type { Range, Style } from '@oakoliver/lipgloss';
import { Binding, newBinding, withKeys, withHelp, matches } from '../key/key.js';
import { cut, stringWidth as ansiStringWidth, tokenizeAnsi } from '../internal/ansi.js';

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

/** Default gutter implementation. */
export const noGutter: GutterFunc = () => '';

/** Context provided to a GutterFunc. */
export interface GutterContext {
  /** Line index (0-based). */
  index: number;
  /** Total number of lines. */
  totalLines: number;
  /** Whether this is a soft-wrapped continuation line. */
  soft: boolean;
}

interface HighlightInfo {
  lineStart: number;
  lineEnd: number;
  lines: Map<number, readonly [number, number]>;
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

  /** Style applied to all configured highlight ranges. */
  highlightStyle: Style;

  /** Style applied to the currently selected highlight range. */
  selectedHighlightStyle: Style;

  /** Style applied to each line via index. */
  styleLineFunc: ((index: number) => Style) | null;

  /** @internal */ private _initialized: boolean;
  /** @internal */ private _lines: string[];
  /** @internal */ private _longestLineWidth: number;
  /** @internal */ private _highlights: HighlightInfo[];
  /** @internal */ private _highlightIndex: number;

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
    this.leftGutterFunc = noGutter;
    this.highlightStyle = newStyle();
    this.selectedHighlightStyle = newStyle();
    this.styleLineFunc = null;
    this._initialized = false;
    this._lines = [];
    this._longestLineWidth = 0;
    this._highlights = [];
    this._highlightIndex = -1;
  }

  /** @internal Initialize defaults. */
  private _setInitialValues(): void {
    this.keyMap = defaultKeyMap();
    this.mouseWheelEnabled = true;
    this.mouseWheelDelta = 3;
    this._horizontalStep = DEFAULT_HORIZONTAL_STEP;
    this.leftGutterFunc = noGutter;
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
    this.clearHighlights();

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
    this._highlightIndex = this._findNearestHighlight();
  }

  scrollUp(n: number): void {
    if (this.atTop() || n === 0 || this._lines.length === 0) return;
    this.setYOffset(this.yOffset() - n);
    this._highlightIndex = this._findNearestHighlight();
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
    this._highlightIndex = this._findNearestHighlight();
    return this._visibleLines();
  }

  gotoBottom(): string[] {
    this.setYOffset(this._maxYOffset());
    this._highlightIndex = this._findNearestHighlight();
    return this._visibleLines();
  }

  /** Sets ordered, non-overlapping UTF-8 byte ranges to highlight. */
  setHighlights(matches: ReadonlyArray<ReadonlyArray<number>>): void {
    if (matches.length === 0 || this._lines.length === 0) return;
    this._highlights = parseHighlights(this.getContent(), matches);
    this._highlightIndex = this._findNearestHighlight();
    this._showHighlight();
  }

  /** Removes all configured highlight ranges. */
  clearHighlights(): void {
    this._highlights = [];
    this._highlightIndex = -1;
  }

  /** Selects and reveals the next highlight, wrapping at the end. */
  highlightNext(): void {
    if (this._highlights.length === 0) return;
    this._highlightIndex = (this._highlightIndex + 1) % this._highlights.length;
    this._showHighlight();
  }

  /** Selects and reveals the previous highlight, wrapping at the start. */
  highlightPrevious(): void {
    if (this._highlights.length === 0) return;
    this._highlightIndex = (
      this._highlightIndex - 1 + this._highlights.length
    ) % this._highlights.length;
    this._showHighlight();
  }

  private _showHighlight(): void {
    if (this._highlightIndex < 0) return;
    const highlight = this._highlights[this._highlightIndex];
    for (let line = highlight.lineStart; line <= highlight.lineEnd; line++) {
      const range = highlight.lines.get(line);
      if (range) {
        this.ensureVisible(line, range[0], range[1]);
        return;
      }
    }
  }

  private _findNearestHighlight(): number {
    return this._highlights.findIndex(highlight => highlight.lineStart >= this.yOffset());
  }

  /**
   * Handles key press and mouse wheel messages for scrolling.
   */
  update(msg: Msg): [Model, Cmd | null] {
    if (!this._initialized) {
      this._setInitialValues();
    }

    if (isKeyPressMsg(msg)) {
      const key = keyStringer(msg);
      if (matches(key, this.keyMap.pageDown)) this.pageDown();
      else if (matches(key, this.keyMap.pageUp)) this.pageUp();
      else if (matches(key, this.keyMap.halfPageDown)) this.halfPageDown();
      else if (matches(key, this.keyMap.halfPageUp)) this.halfPageUp();
      else if (matches(key, this.keyMap.down)) this.scrollDown(1);
      else if (matches(key, this.keyMap.up)) this.scrollUp(1);
      else if (matches(key, this.keyMap.left)) this.scrollLeft(this._horizontalStep);
      else if (matches(key, this.keyMap.right)) this.scrollRight(this._horizontalStep);
    } else if (isMouseWheelMsg(msg) && this.mouseWheelEnabled) {
      const shifted = (msg.mod & KeyMod.Shift) !== 0;
      switch (msg.button) {
        case MouseButton.WheelDown:
          shifted ? this.scrollRight(this._horizontalStep) : this.scrollDown(this.mouseWheelDelta);
          break;
        case MouseButton.WheelUp:
          shifted ? this.scrollLeft(this._horizontalStep) : this.scrollUp(this.mouseWheelDelta);
          break;
        case MouseButton.WheelLeft:
          this.scrollLeft(this._horizontalStep);
          break;
        case MouseButton.WheelRight:
          this.scrollRight(this._horizontalStep);
          break;
      }
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
    const contents = renderBlock(visLines, contentWidth, contentHeight);

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
      lines = this._highlightLines(lines, ridx);
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

  private _highlightLines(lines: string[], offset: number): string[] {
    if (this._highlights.length === 0) return lines;

    return lines.map((line, index) => {
      const absoluteLine = index + offset;
      const ranges: Array<readonly [number, number]> = [];
      for (const highlight of this._highlights) {
        const range = highlight.lines.get(absoluteLine);
        if (range) ranges.push(range);
      }

      let rendered = renderStyleRanges(line, ranges, this.highlightStyle);
      if (this._highlightIndex >= 0) {
        const selected = this._highlights[this._highlightIndex].lines.get(absoluteLine);
        if (selected) {
          rendered = renderStyleRanges(rendered, [selected], this.selectedHighlightStyle);
        }
      }
      return rendered;
    });
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

/**
 * Equivalent of `lipgloss.NewStyle().Width(w).Height(h).Render(lines)`.
 *
 * Upstream relies on lipgloss' wrapper preserving leading whitespace on each
 * line. `@oakoliver/lipgloss` 1.1.0 drops leading whitespace when a width is
 * set, which would eat indentation (e.g. the tree component's cursor column),
 * so lines that already fit are padded here directly; anything wider falls
 * back to lipgloss' wrapping.
 */
function renderBlock(lines: string[], width: number, height: number): string {
  if (width <= 0 || lines.some((line) => line.includes('\n') || ansiStringWidth(line) > width)) {
    return newStyle().width(width).height(height).render(lines.join('\n'));
  }
  const out = lines.map((line) => line + ' '.repeat(width - ansiStringWidth(line)));
  while (out.length < height) out.push(' '.repeat(width));
  return out.join('\n');
}

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

interface KeyPressLike {
  type?: unknown;
  _tag?: unknown;
  key?: unknown;
  toString(): string;
}

interface MouseWheelLike {
  button: MouseButton;
  mod: number;
}

function isKeyPressMsg(msg: unknown): msg is KeyPressLike {
  if (msg === null || typeof msg !== 'object') return false;
  const candidate = msg as Record<string, unknown>;
  return candidate.type === 'keyPress' || candidate._tag === 'KeyPressMsg';
}

function keyStringer(msg: KeyPressLike): { toString(): string } {
  if (msg.toString !== Object.prototype.toString) return msg;
  const key = typeof msg.key === 'string'
    ? msg.key
    : typeof msg.type === 'string' ? msg.type : '';
  return { toString: () => key };
}

function isMouseWheelMsg(msg: unknown): msg is MouseWheelLike {
  if (msg === null || typeof msg !== 'object') return false;
  const candidate = msg as Record<string, unknown>;
  return (
    (candidate.type === 'mouseWheel' || candidate._tag === 'MouseWheelMsg')
    && typeof candidate.button === 'number'
    && typeof candidate.mod === 'number'
  );
}

function parseHighlights(
  content: string,
  matches: ReadonlyArray<ReadonlyArray<number>>,
): HighlightInfo[] {
  if (matches.length === 0) return [];

  const encoder = new TextEncoder();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const segments: Array<{ text: string; bytes: number; width: number }> = [];
  for (const token of tokenizeAnsi(content)) {
    if (token.ansi) {
      segments.push({ text: token.text, bytes: encoder.encode(token.text).length, width: 0 });
      continue;
    }
    for (const value of segmenter.segment(token.text)) {
      segments.push({
        text: value.segment,
        bytes: encoder.encode(value.segment).length,
        width: Math.max(1, ansiStringWidth(value.segment)),
      });
    }
  }

  let segmentIndex = 0;
  let line = 0;
  let graphemePosition = 0;
  let previousLinesOffset = 0;
  let bytePosition = 0;
  const highlights: HighlightInfo[] = [];

  for (const match of matches) {
    const byteStart = match[0];
    const byteEnd = match[1];
    if (!Number.isInteger(byteStart) || !Number.isInteger(byteEnd)) continue;

    while (byteStart > bytePosition && segmentIndex < segments.length) {
      const segment = segments[segmentIndex++];
      if (segment.text === '\n') {
        previousLinesOffset = graphemePosition + 1;
        line++;
      }
      graphemePosition += segment.width;
      bytePosition += segment.bytes;
    }

    const highlight: HighlightInfo = {
      lineStart: line,
      lineEnd: line,
      lines: new Map(),
    };
    const graphemeStart = graphemePosition;

    while (byteEnd > bytePosition && segmentIndex < segments.length) {
      const segment = segments[segmentIndex++];
      if (segment.text === '\n') {
        const columnStart = Math.max(0, graphemeStart - previousLinesOffset);
        const columnEnd = Math.max(
          graphemePosition - previousLinesOffset + 1,
          columnStart,
        );
        if (columnEnd > columnStart) {
          highlight.lines.set(line, [columnStart, columnEnd]);
          highlight.lineEnd = line;
        }
        previousLinesOffset = graphemePosition + 1;
        line++;
      }
      graphemePosition += segment.width;
      bytePosition += segment.bytes;
    }

    if (bytePosition === byteEnd) {
      const columnStart = Math.max(0, graphemeStart - previousLinesOffset);
      const columnEnd = Math.max(graphemePosition - previousLinesOffset, columnStart);
      if (columnEnd > columnStart) {
        highlight.lines.set(line, [columnStart, columnEnd]);
        highlight.lineEnd = line;
      }
    }
    highlights.push(highlight);
  }
  return highlights;
}

function renderStyleRanges(
  line: string,
  ranges: ReadonlyArray<readonly [number, number]>,
  style: Style,
): string {
  if (ranges.length === 0) return line;

  const width = ansiStringWidth(line);
  const styledRanges: Range[] = [];
  let column = 0;
  for (const range of ranges) {
    const start = clamp(range[0], column, width);
    const end = clamp(range[1], start, width);
    if (end > start) styledRanges.push(newRange(start, end, style));
    column = end;
  }
  return styleRanges(line, ...styledRanges);
}
