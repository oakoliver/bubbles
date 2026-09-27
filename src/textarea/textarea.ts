/**
 * Textarea — multi-line text input component.
 *
 * Zero-dependency port of charmbracelet/bubbles/textarea (Go).
 * Features:
 * - Multi-line editing with soft word wrapping
 * - Line numbers with configurable styles
 * - Dynamic prompt function support
 * - Virtual blinking cursor
 * - Word-wise navigation and deletion
 * - Vertical scrolling via viewport
 * - Placeholder text
 * - Character limit
 * - Focused / Blurred styling
 * - Keyboard and pointer-driven text selection with clipboard copy
 *
 * @module
 */

import type { Cmd, Cursor, Msg } from '@oakoliver/bubbletea';
import { Batch, CursorShape, NewCursor } from '@oakoliver/bubbletea';
import { newStyle, stringWidth, thickBorder } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { newBinding, withKeys, withHelp, matches } from '../key/key.js';
import type { Binding } from '../key/key.js';
import {
  Model as CursorModel,
  newCursor,
  Mode as CursorMode,
  blink as cursorBlink,
} from '../cursor/cursor.js';
import { newViewport, Model as ViewportModel } from '../viewport/viewport.js';
import { newSanitizer } from '../internal/runeutil.js';
import type { Sanitizer } from '../internal/runeutil.js';
import { readClipboard, writeClipboard } from '../internal/clipboard.js';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_HEIGHT = 1;
const DEFAULT_HEIGHT = 6;
const DEFAULT_WIDTH = 40;
const DEFAULT_CHAR_LIMIT = 0; // no limit
const DEFAULT_MAX_HEIGHT = 99;
const DEFAULT_MAX_WIDTH = 500;
const MAX_LINES = 10000;

// ── Rune width helper ───────────────────────────────────────────────────────

/** Returns display width of a single character (CJK = 2, most others = 1). */
function runeWidth(ch: string): number {
  if (ch.length === 0) return 0;
  const code = ch.codePointAt(0)!;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33bf) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7ff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f000 && code <= 0x1fbff) ||
    (code >= 0x20000 && code <= 0x2ffff) ||
    (code >= 0x30000 && code <= 0x3ffff)
  ) {
    return 2;
  }
  return 1;
}

// ── Simple word/hard wrap for placeholder ───────────────────────────────────

/** Word-wrap text to the given width. Breaks on spaces. */
function wordWrap(s: string, width: number): string {
  if (width <= 0) return s;
  const words = s.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length === 0) {
      line = word;
    } else if (stringWidth(line + ' ' + word) <= width) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join('\n');
}

/** Hard-wrap text: break any line exceeding `width`. */
function hardWrap(s: string, width: number): string {
  if (width <= 0) return s;
  const inputLines = s.split('\n');
  const result: string[] = [];
  for (const line of inputLines) {
    if (stringWidth(line) <= width) {
      result.push(line);
      continue;
    }
    let remaining = line;
    while (stringWidth(remaining) > width) {
      let cut = 0;
      let w = 0;
      for (let i = 0; i < remaining.length; i++) {
        const cw = runeWidth(remaining[i]);
        if (w + cw > width) break;
        w += cw;
        cut = i + 1;
      }
      if (cut === 0) cut = 1; // at least one char
      result.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    if (remaining.length > 0) result.push(remaining);
  }
  return result.join('\n');
}

// ── LineInfo ────────────────────────────────────────────────────────────────

/** Information about the cursor's position within a soft-wrapped line. */
export interface LineInfo {
  /** Number of columns in the soft-wrapped line. */
  width: number;
  /** Character width of the line (accounts for double-width chars). */
  charWidth: number;
  /** Number of soft-wrapped rows for this line. */
  height: number;
  /** Index of the first column of this soft-wrapped segment. */
  startColumn: number;
  /** Column offset of cursor from start of soft-wrapped segment. */
  columnOffset: number;
  /** Row offset within the soft-wrapped line. */
  rowOffset: number;
  /** Character offset (may differ from columnOffset for double-width). */
  charOffset: number;
}

/** Info passed to a dynamic prompt function. */
export interface PromptInfo {
  lineNumber: number;
  focused: boolean;
}

// ── KeyMap ──────────────────────────────────────────────────────────────────

/** Keybindings for the textarea. */
export interface KeyMap {
  characterBackward: Binding;
  characterForward: Binding;
  deleteAfterCursor: Binding;
  deleteBeforeCursor: Binding;
  deleteCharacterBackward: Binding;
  deleteCharacterForward: Binding;
  deleteWordBackward: Binding;
  deleteWordForward: Binding;
  insertNewline: Binding;
  lineEnd: Binding;
  lineNext: Binding;
  linePrevious: Binding;
  lineStart: Binding;
  pageUp: Binding;
  pageDown: Binding;
  paste: Binding;
  wordBackward: Binding;
  wordForward: Binding;
  inputBegin: Binding;
  inputEnd: Binding;
  uppercaseWordForward: Binding;
  lowercaseWordForward: Binding;
  capitalizeWordForward: Binding;
  transposeCharacterBackward: Binding;

  selectCharacterForward: Binding;
  selectCharacterBackward: Binding;
  selectWordForward: Binding;
  selectWordBackward: Binding;
  selectLineUp: Binding;
  selectLineDown: Binding;
  selectAll: Binding;
  copySelection: Binding;
}

/** Returns the default keybindings for the textarea. */
export function defaultKeyMap(): KeyMap {
  return {
    characterForward: newBinding(withKeys('right', 'ctrl+f'), withHelp('right', 'character forward')),
    characterBackward: newBinding(withKeys('left', 'ctrl+b'), withHelp('left', 'character backward')),
    wordForward: newBinding(withKeys('alt+right', 'ctrl+right', 'alt+f'), withHelp('alt+right', 'word forward')),
    wordBackward: newBinding(withKeys('alt+left', 'ctrl+left', 'alt+b'), withHelp('alt+left', 'word backward')),
    lineNext: newBinding(withKeys('down', 'ctrl+n'), withHelp('down', 'next line')),
    linePrevious: newBinding(withKeys('up', 'ctrl+p'), withHelp('up', 'previous line')),
    deleteWordBackward: newBinding(withKeys('alt+backspace', 'ctrl+w', 'ctrl+backspace'), withHelp('alt+backspace', 'delete word backward')),
    deleteWordForward: newBinding(withKeys('alt+delete', 'alt+d', 'ctrl+delete'), withHelp('alt+delete', 'delete word forward')),
    deleteAfterCursor: newBinding(withKeys('ctrl+k'), withHelp('ctrl+k', 'delete after cursor')),
    deleteBeforeCursor: newBinding(withKeys('ctrl+u'), withHelp('ctrl+u', 'delete before cursor')),
    insertNewline: newBinding(withKeys('enter', 'ctrl+m'), withHelp('enter', 'insert newline')),
    deleteCharacterBackward: newBinding(withKeys('backspace', 'ctrl+h'), withHelp('backspace', 'delete character backward')),
    deleteCharacterForward: newBinding(withKeys('delete', 'ctrl+d'), withHelp('delete', 'delete character forward')),
    lineStart: newBinding(withKeys('home', 'ctrl+a'), withHelp('home', 'line start')),
    lineEnd: newBinding(withKeys('end', 'ctrl+e'), withHelp('end', 'line end')),
    pageUp: newBinding(withKeys('pgup'), withHelp('pgup', 'page up')),
    pageDown: newBinding(withKeys('pgdown'), withHelp('pgdown', 'page down')),
    paste: newBinding(withKeys('ctrl+v'), withHelp('ctrl+v', 'paste')),
    inputBegin: newBinding(withKeys('alt+<', 'ctrl+home'), withHelp('alt+<', 'input begin')),
    inputEnd: newBinding(withKeys('alt+>', 'ctrl+end'), withHelp('alt+>', 'input end')),
    capitalizeWordForward: newBinding(withKeys('alt+c'), withHelp('alt+c', 'capitalize word forward')),
    lowercaseWordForward: newBinding(withKeys('alt+l'), withHelp('alt+l', 'lowercase word forward')),
    uppercaseWordForward: newBinding(withKeys('alt+u'), withHelp('alt+u', 'uppercase word forward')),
    transposeCharacterBackward: newBinding(withKeys('ctrl+t'), withHelp('ctrl+t', 'transpose character backward')),

    selectCharacterForward: newBinding(withKeys('shift+right'), withHelp('shift+right', 'select character forward')),
    selectCharacterBackward: newBinding(withKeys('shift+left'), withHelp('shift+left', 'select character backward')),
    selectWordForward: newBinding(withKeys('ctrl+shift+right', 'alt+shift+right', 'alt+shift+f'), withHelp('alt+shift+right', 'select word forward')),
    selectWordBackward: newBinding(withKeys('ctrl+shift+left', 'alt+shift+left', 'alt+shift+b'), withHelp('alt+shift+left', 'select word backward')),
    selectLineUp: newBinding(withKeys('shift+up'), withHelp('shift+up', 'select line up')),
    selectLineDown: newBinding(withKeys('shift+down'), withHelp('shift+down', 'select line down')),
    selectAll: newBinding(withKeys('ctrl+g'), withHelp('ctrl+g', 'select all')),
    copySelection: newBinding(withKeys('ctrl+shift+c'), withHelp('ctrl+shift+c', 'copy selection')),
  };
}

// ── CursorStyle ─────────────────────────────────────────────────────────────

/** Cursor style configuration. */
export interface CursorStyle {
  /**
   * Color for the cursor. ANSI color string (e.g. "7"). `null` (or unset)
   * means no colour.
   */
  color: string | null;
  /** Real terminal cursor shape. */
  shape?: CursorShape;
  /** Whether the cursor should blink. */
  blink: boolean;
  /** Blink speed in milliseconds (0 = use default). Only for virtual cursor. */
  blinkSpeed: number;
}

// ── StyleState ──────────────────────────────────────────────────────────────

/** Style state for focused or blurred textarea. */
export interface StyleState {
  base: Style;
  text: Style;
  lineNumber: Style;
  cursorLineNumber: Style;
  cursorLine: Style;
  endOfBuffer: Style;
  placeholder: Style;
  prompt: Style;
  /**
   * Styles text covered by an active selection. See
   * {@link Model.beginSelection}. Optional for backwards compatibility with
   * hand-built style states; an unset value renders with the text style.
   */
  selection?: Style;
}

function computedCursorLine(s: StyleState): Style {
  return s.cursorLine.inherit(s.base).inline(true);
}
function computedCursorLineNumber(s: StyleState): Style {
  return s.cursorLineNumber.inherit(s.cursorLine).inherit(s.base).inline(true);
}
function computedEndOfBuffer(s: StyleState): Style {
  return s.endOfBuffer.inherit(s.base).inline(true);
}
function computedLineNumber(s: StyleState): Style {
  return s.lineNumber.inherit(s.base).inline(true);
}
function computedPlaceholder(s: StyleState): Style {
  return s.placeholder.inherit(s.base).inline(true);
}
function computedPrompt(s: StyleState): Style {
  return s.prompt.inherit(s.base).inline(true);
}
function computedText(s: StyleState): Style {
  return s.text.inherit(s.base).inline(true);
}
function computedSelection(s: StyleState): Style {
  return (s.selection ?? newStyle()).inherit(s.text).inherit(s.base).inline(true);
}

// ── Styles ──────────────────────────────────────────────────────────────────

/** Combined styles for the textarea (focused + blurred + cursor). */
export interface Styles {
  focused: StyleState;
  blurred: StyleState;
  cursor: CursorStyle;
}

/** Returns default styles. Pass `isDark=true` for dark backgrounds (default). */
export function defaultStyles(isDark: boolean): Styles {
  const ld = (light: string, dark: string) => isDark ? dark : light;

  const focused: StyleState = {
    base: newStyle(),
    cursorLine: newStyle().background(ld('255', '0')),
    cursorLineNumber: newStyle().foreground(ld('240', '240')),
    endOfBuffer: newStyle().foreground(ld('254', '0')),
    lineNumber: newStyle().foreground(ld('249', '7')),
    placeholder: newStyle().foreground('240'),
    prompt: newStyle().foreground('7'),
    selection: newStyle().background(ld('253', '8')),
    text: newStyle(),
  };

  const blurred: StyleState = {
    base: newStyle(),
    cursorLine: newStyle().foreground(ld('245', '7')),
    cursorLineNumber: newStyle().foreground(ld('249', '7')),
    endOfBuffer: newStyle().foreground(ld('254', '0')),
    lineNumber: newStyle().foreground(ld('249', '7')),
    placeholder: newStyle().foreground('240'),
    prompt: newStyle().foreground('7'),
    selection: newStyle().background(ld('253', '8')),
    text: newStyle().foreground(ld('245', '7')),
  };

  return {
    focused,
    blurred,
    cursor: { color: '7', shape: CursorShape.Block, blink: true, blinkSpeed: 0 },
  };
}

/** Default styles for dark backgrounds. */
export function defaultDarkStyles(): Styles {
  return defaultStyles(true);
}

/** Default styles for light backgrounds. */
export function defaultLightStyles(): Styles {
  return defaultStyles(false);
}

// ── Memoization cache (simple Map) ──────────────────────────────────────────

class WrapCache {
  private _map = new Map<string, string[][]>();
  private _capacity: number;

  constructor(capacity: number) {
    this._capacity = capacity;
  }

  capacity(): number { return this._capacity; }

  get(runes: string[], width: number): string[][] | undefined {
    return this._map.get(this._key(runes, width));
  }

  set(runes: string[], width: number, value: string[][]): void {
    if (this._map.size >= this._capacity) {
      // Evict oldest entry
      const first = this._map.keys().next().value;
      if (first !== undefined) this._map.delete(first);
    }
    this._map.set(this._key(runes, width), value);
  }

  private _key(runes: string[], width: number): string {
    return runes.join('') + ':' + width;
  }
}

// ── Clipboard paste ─────────────────────────────────────────────────────────

/** Reads text from the system clipboard for insertion by the update loop. */
export async function paste(): Promise<Msg> {
  try {
    return { type: 'textarea.paste', content: await readClipboard() };
  } catch (error) {
    return {
      type: 'textarea.pasteErr',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

// ── Clipboard copy ──────────────────────────────────────────────────────────

/** Message emitted after the selection was copied to the system clipboard. */
export interface CopyMsg {
  type: 'textarea.copy';
  content: string;
}

/** Message emitted when copying the selection to the clipboard failed. */
export interface CopyErrMsg {
  type: 'textarea.copyErr';
  error: Error;
}

// ── Position ────────────────────────────────────────────────────────────────

/**
 * A location in the textarea's logical buffer: `row` indexes a logical
 * (unwrapped) line, `col` indexes a rune within that line. `col` may equal the
 * line length, meaning "just past the last rune".
 */
export interface Position {
  row: number;
  col: number;
}

/** Reports whether p sorts before q in the buffer. */
function positionBefore(p: Position, q: Position): boolean {
  if (p.row !== q.row) return p.row < q.row;
  return p.col < q.col;
}

function positionEqual(p: Position, q: Position): boolean {
  return p.row === q.row && p.col === q.col;
}

/**
 * Returns the index of the rune occupying the given display column within
 * runes, accounting for double-width runes. A column past the end of the line
 * yields runes.length.
 */
function runeIndexForColumn(runes: string[], col: number): number {
  if (col <= 0) return 0;
  let w = 0;
  for (let i = 0; i < runes.length; i++) {
    const rWidth = stringWidth(runes[i]);
    if (w + rWidth > col) return i;
    w += rWidth;
  }
  return runes.length;
}

// ── Model ───────────────────────────────────────────────────────────────────

/** Model is the Bubble Tea model for the textarea. */
export class Model {
  /** Error state. */
  err: Error | null = null;

  /** Prompt printed at the beginning of each line. */
  prompt: string;

  /** Placeholder text displayed when empty. */
  placeholder: string = '';

  /** Whether to show line numbers. */
  showLineNumbers: boolean = true;

  /** Character displayed at end of buffer. */
  endOfBufferCharacter: string = ' ';

  /** Keybindings. */
  keyMap: KeyMap;

  /** Character limit (0 = no limit). */
  charLimit: number = DEFAULT_CHAR_LIMIT;

  /** Maximum height in rows (0 = no limit). */
  maxHeight: number = DEFAULT_MAX_HEIGHT;

  /** Maximum width in columns (0 = no limit). */
  maxWidth: number = DEFAULT_MAX_WIDTH;

  /** Automatically grows and shrinks the visible height to fit content. */
  dynamicHeight: boolean = false;

  /** Minimum visible height while dynamicHeight is enabled. */
  minHeight: number = 0;

  /** Maximum number of visual content rows (0 = legacy maxHeight guard). */
  maxContentHeight: number = 0;

  // ── Private fields ──────────────────────────────────────────────────────

  private _styles: Styles;
  private _useVirtualCursor: boolean = true;
  private _virtualCursor: CursorModel;
  private _promptFunc: ((info: PromptInfo) => string) | null = null;
  private _promptWidth: number = 0;
  private _width: number = 0;
  private _height: number = 0;
  private _cache: WrapCache;

  /** Underlying text: array of lines, each line is array of characters. */
  private _value: string[][];

  /** Whether focused. */
  private _focus: boolean = false;

  /** Cursor column. */
  private _col: number = 0;

  /** Cursor row. */
  private _row: number = 0;

  /** Last character offset for vertical navigation. */
  private _lastCharOffset: number = 0;

  /** Viewport for scrolling. */
  private _viewport: ViewportModel;

  /** Rune sanitizer. */
  private _rsan: Sanitizer | null = null;

  /**
   * Selection anchor and head. The anchor is where the selection began; the
   * head follows the pointer. Either may sort before the other — use
   * {@link Model.selection} for a normalized range.
   */
  private _selAnchor: Position = { row: 0, col: 0 };
  private _selHead: Position = { row: 0, col: 0 };

  /**
   * Whether a selection has been set at all. {@link Model.hasSelection}
   * additionally requires it to be non-empty.
   */
  private _hasSelection: boolean = false;

  /** Whether a drag is currently in progress. */
  private _selecting: boolean = false;

  constructor() {
    this._viewport = newViewport();
    this._viewport.keyMap = {} as any;
    this._virtualCursor = newCursor();
    this._styles = defaultDarkStyles();
    this._cache = new WrapCache(MAX_LINES);
    this.prompt = thickBorder().left + ' ';
    this.keyMap = defaultKeyMap();
    this._value = [[]];

    this.setHeight(DEFAULT_HEIGHT);
    this.setWidth(DEFAULT_WIDTH);
  }

  // ── Style getters/setters ───────────────────────────────────────────────

  /** Returns the current styles. */
  styles(): Styles { return this._styles; }

  /** Returns the current styles. */
  getStyles(): Styles { return this._styles; }

  /** Updates styling for the textarea. */
  setStyles(s: Styles): void {
    this._styles = s;
    this._updateVirtualCursorStyle();
  }

  /** Returns whether the virtual cursor is enabled. */
  virtualCursor(): boolean { return this._useVirtualCursor; }

  /** Sets whether to use the virtual cursor. */
  setVirtualCursor(v: boolean): void {
    this._useVirtualCursor = v;
    this._updateVirtualCursorStyle();
  }

  private _updateVirtualCursorStyle(): void {
    if (!this._useVirtualCursor) {
      this._virtualCursor.setMode(CursorMode.CursorHide);
      return;
    }
    this._virtualCursor.style = newStyle().foreground(this._styles.cursor.color);
    if (this._styles.cursor.blink) {
      if (this._styles.cursor.blinkSpeed > 0) {
        this._virtualCursor.blinkSpeed = this._styles.cursor.blinkSpeed;
      }
      this._virtualCursor.setMode(CursorMode.CursorBlink);
      return;
    }
    this._virtualCursor.setMode(CursorMode.CursorStatic);
  }

  // ── Sanitizer ───────────────────────────────────────────────────────────

  private _san(): Sanitizer {
    if (this._rsan === null) {
      this._rsan = newSanitizer();
    }
    return this._rsan;
  }

  // ── Value manipulation ──────────────────────────────────────────────────

  /** Sets the value of the textarea. */
  setValue(s: string): void {
    this.reset();
    this.insertString(s);
  }

  /** Inserts a string at the cursor position. */
  insertString(s: string): void {
    this._insertRunesFromUserInput([...s]);
    this._recalculateHeight();
  }

  /** Inserts a single character at the cursor position. */
  insertRune(r: string): void {
    this._insertRunesFromUserInput([r]);
    this._recalculateHeight();
  }

  private _insertRunesFromUserInput(runes: string[]): void {
    // Sanitize input
    const sanitized = this._san().sanitize(runes.join(''));
    runes = [...sanitized];

    if (this.charLimit > 0) {
      const availSpace = this.charLimit - this.length();
      if (availSpace <= 0) return;
      if (availSpace < runes.length) {
        runes = runes.slice(0, availSpace);
      }
    }

    // Split the input into lines
    const lines: string[][] = [];
    let lstart = 0;
    for (let i = 0; i < runes.length; i++) {
      if (runes[i] === '\n') {
        lines.push(runes.slice(lstart, i));
        lstart = i + 1;
      }
    }
    if (lstart <= runes.length) {
      lines.push(runes.slice(lstart));
    }

    // Obey the maximum line limit
    if (MAX_LINES > 0 && this._value.length + lines.length - 1 > MAX_LINES) {
      const allowedHeight = Math.max(0, MAX_LINES - this._value.length + 1);
      lines.splice(allowedHeight);
    }

    if (this.maxContentHeight > 0) {
      const budget = this.maxContentHeight - this._totalVisualLines();
      while (lines.length > 1 && this._visualLinesForInsert(lines) > budget) {
        lines.pop();
      }
      if (this._visualLinesForInsert(lines) > budget) return;
    }

    if (lines.length === 0) return;

    // Save the remainder of the original line at the cursor
    const tail = this._value[this._row].slice(this._col);

    // Paste the first line at current cursor position
    this._value[this._row] = [
      ...this._value[this._row].slice(0, this._col),
      ...lines[0],
    ];
    this._col += lines[0].length;

    const numExtraLines = lines.length - 1;
    if (numExtraLines > 0) {
      // Insert new lines
      const newGrid: string[][] = new Array(this._value.length + numExtraLines);
      // Copy rows up to and including current
      for (let i = 0; i <= this._row; i++) {
        newGrid[i] = this._value[i];
      }
      // Copy rows that were after cursor to end of new grid
      for (let i = this._row + 1; i < this._value.length; i++) {
        newGrid[i + numExtraLines] = this._value[i];
      }
      this._value = newGrid;
      // Insert all new lines in the middle
      for (let li = 1; li < lines.length; li++) {
        this._row++;
        this._value[this._row] = lines[li];
        this._col = lines[li].length;
      }
    }

    // Add the tail at the end of the last line inserted
    this._value[this._row] = [...this._value[this._row], ...tail];
    this.setCursorColumn(this._col);
  }

  // ── Value retrieval ─────────────────────────────────────────────────────

  /** Returns the value of the textarea as a string. */
  value(): string {
    if (this._value.length === 0) return '';
    return this._value.map(l => l.join('')).join('\n');
  }

  /** Returns the number of characters in the textarea. */
  length(): number {
    let l = 0;
    for (const row of this._value) {
      l += stringWidth(row.join(''));
    }
    // Add newline characters between rows
    return l + this._value.length - 1;
  }

  /** Returns the number of lines in the textarea. */
  lineCount(): number { return this._value.length; }

  /** Returns the 0-indexed row position of the cursor. */
  line(): number { return this._row; }

  /** Returns the 0-indexed column position of the cursor. */
  column(): number { return this._col; }

  /** Returns the Y offset (top row index) of the current view. */
  scrollYOffset(): number { return this._viewport.yOffset(); }

  /** Returns scroll progress clamped between 0 and 1. */
  scrollPercent(): number { return this._viewport.scrollPercent(); }

  // ── Focus ───────────────────────────────────────────────────────────────

  /** Returns whether the textarea is focused. */
  focused(): boolean { return this._focus; }

  /** Returns the active style state (focused or blurred). */
  private _activeStyle(): StyleState {
    return this._focus ? this._styles.focused : this._styles.blurred;
  }

  /** Focuses the textarea. */
  focus(): Cmd | null {
    this._focus = true;
    return this._virtualCursor.focus();
  }

  /** Blurs the textarea. */
  blur(): void {
    this._focus = false;
    this._virtualCursor.blur();
  }

  /** Resets the textarea to its default state. */
  reset(): void {
    this._value = [[]];
    this._col = 0;
    this._row = 0;
    this._viewport.gotoTop();
    this.setCursorColumn(0);
    this._recalculateHeight();
    this.clearSelection();
  }

  // ── Word ────────────────────────────────────────────────────────────────

  /** Returns the word at the cursor position. */
  word(): string {
    const line = this._value[this._row];
    const col = this._col - 1;
    if (col < 0 || col >= line.length) return '';
    if (isSpace(line[col])) return '';

    let start = col;
    while (start > 0 && !isSpace(line[start - 1])) start--;
    let end = col;
    while (end < line.length && !isSpace(line[end])) end++;

    return line.slice(start, end).join('');
  }

  // ── Cursor column ───────────────────────────────────────────────────────

  /** Moves the cursor to the given column, clamped to valid range. */
  setCursorColumn(col: number): void {
    this._col = clamp(col, 0, this._value[this._row].length);
    this._lastCharOffset = 0;
  }

  /** Moves the cursor to the start of the line. */
  cursorStart(): void { this.setCursorColumn(0); }

  /** Moves the cursor to the end of the line. */
  cursorEnd(): void { this.setCursorColumn(this._value[this._row].length); }

  // ── Cursor line relative ────────────────────────────────────────────────

  private _setCursorLineRelative(delta: number): void {
    if (delta === 0) return;

    let li = this.lineInfo();
    const charOffset = Math.max(this._lastCharOffset, li.charOffset);
    this._lastCharOffset = charOffset;

    const trailingSpace = 2;

    if (delta > 0) {
      for (let d = 0; d < delta; d++) {
        if (li.rowOffset + 1 >= li.height && this._row < this._value.length - 1) {
          this._row++;
          this._col = 0;
        } else {
          this._col = Math.min(
            li.startColumn + li.width + trailingSpace,
            this._value[this._row].length - 1,
          );
        }
        li = this.lineInfo();
      }
    } else {
      for (let d = 0; d < -delta; d++) {
        if (li.rowOffset <= 0 && this._row > 0) {
          this._row--;
          this._col = this._value[this._row].length;
        } else {
          this._col = li.startColumn - trailingSpace;
        }
        li = this.lineInfo();
      }
    }

    const nli = this.lineInfo();
    this._col = nli.startColumn;

    if (nli.width <= 0) {
      this._repositionView();
      return;
    }

    let offset = 0;
    while (offset < charOffset) {
      if (this._row >= this._value.length ||
          this._col >= this._value[this._row].length ||
          offset >= nli.charWidth - 1) {
        break;
      }
      offset += runeWidth(this._value[this._row][this._col]);
      this._col++;
    }
    this._repositionView();
  }

  /** Moves the cursor down by one line. */
  cursorDown(): void { this._setCursorLineRelative(1); }

  /** Moves the cursor up by one line. */
  cursorUp(): void { this._setCursorLineRelative(-1); }

  // ── Delete methods ──────────────────────────────────────────────────────

  /** Deletes all text before cursor on current line. */
  private _deleteBeforeCursor(): void {
    this._value[this._row] = this._value[this._row].slice(this._col);
    this.setCursorColumn(0);
  }

  /** Deletes all text after cursor on current line. */
  private _deleteAfterCursor(): void {
    this._value[this._row] = this._value[this._row].slice(0, this._col);
    this.setCursorColumn(this._value[this._row].length);
  }

  /** Transposes the character at cursor with the one before it. */
  private _transposeLeft(): void {
    if (this._col === 0 || this._value[this._row].length < 2) return;
    if (this._col >= this._value[this._row].length) {
      this.setCursorColumn(this._col - 1);
    }
    const row = this._value[this._row];
    [row[this._col - 1], row[this._col]] = [row[this._col], row[this._col - 1]];
    if (this._col < this._value[this._row].length) {
      this.setCursorColumn(this._col + 1);
    }
  }

  /** Deletes the word to the left of the cursor. */
  private _deleteWordLeft(): void {
    if (this._col === 0 || this._value[this._row].length === 0) return;

    const oldCol = this._col;

    this.setCursorColumn(this._col - 1);
    while (isSpace(this._value[this._row][this._col])) {
      if (this._col <= 0) break;
      this.setCursorColumn(this._col - 1);
    }

    while (this._col > 0) {
      if (!isSpace(this._value[this._row][this._col])) {
        this.setCursorColumn(this._col - 1);
      } else {
        if (this._col > 0) {
          this.setCursorColumn(this._col + 1);
        }
        break;
      }
    }

    if (oldCol > this._value[this._row].length) {
      this._value[this._row] = this._value[this._row].slice(0, this._col);
    } else {
      this._value[this._row] = [
        ...this._value[this._row].slice(0, this._col),
        ...this._value[this._row].slice(oldCol),
      ];
    }
  }

  /** Deletes the word to the right of the cursor. */
  private _deleteWordRight(): void {
    if (this._col >= this._value[this._row].length || this._value[this._row].length === 0) return;

    const oldCol = this._col;

    while (this._col < this._value[this._row].length && isSpace(this._value[this._row][this._col])) {
      this.setCursorColumn(this._col + 1);
    }

    while (this._col < this._value[this._row].length) {
      if (!isSpace(this._value[this._row][this._col])) {
        this.setCursorColumn(this._col + 1);
      } else {
        break;
      }
    }

    if (this._col > this._value[this._row].length) {
      this._value[this._row] = this._value[this._row].slice(0, oldCol);
    } else {
      this._value[this._row] = [
        ...this._value[this._row].slice(0, oldCol),
        ...this._value[this._row].slice(this._col),
      ];
    }

    this.setCursorColumn(oldCol);
  }

  // ── Character/Word movement ─────────────────────────────────────────────

  /** Moves cursor one character to the right. */
  private _characterRight(): void {
    if (this._col < this._value[this._row].length) {
      this.setCursorColumn(this._col + 1);
    } else if (this._row < this._value.length - 1) {
      this._row++;
      this.cursorStart();
    }
  }

  /** Moves cursor one character to the left. */
  private _characterLeft(insideLine: boolean): void {
    if (this._col === 0 && this._row !== 0) {
      this._row--;
      this.cursorEnd();
      if (!insideLine) return;
    }
    if (this._col > 0) {
      this.setCursorColumn(this._col - 1);
    }
  }

  /** Moves cursor one word to the left. */
  private _wordLeft(): void {
    for (;;) {
      const oldRow = this._row;
      const oldCol = this._col;
      this._characterLeft(true);
      if (this._row === oldRow && this._col === oldCol) return;
      if (this._col < this._value[this._row].length && !isSpace(this._value[this._row][this._col])) {
        break;
      }
    }
    while (this._col > 0) {
      if (isSpace(this._value[this._row][this._col - 1])) break;
      this.setCursorColumn(this._col - 1);
    }
  }

  /** Moves cursor one word to the right. */
  private _wordRight(): void {
    this._doWordRight(() => {});
  }

  private _doWordRight(fn: (charIdx: number, pos: number) => void): void {
    // Skip spaces forward
    while (
      this._col >= this._value[this._row].length ||
      isSpace(this._value[this._row][this._col])
    ) {
      if (this._row === this._value.length - 1 && this._col === this._value[this._row].length) break;
      this._characterRight();
    }
    let charIdx = 0;
    while (this._col < this._value[this._row].length) {
      if (isSpace(this._value[this._row][this._col])) break;
      fn(charIdx, this._col);
      this.setCursorColumn(this._col + 1);
      charIdx++;
    }
  }

  /** Changes the word to the right to uppercase. */
  private _uppercaseRight(): void {
    this._doWordRight((_ci, i) => {
      this._value[this._row][i] = this._value[this._row][i].toUpperCase();
    });
  }

  /** Changes the word to the right to lowercase. */
  private _lowercaseRight(): void {
    this._doWordRight((_ci, i) => {
      this._value[this._row][i] = this._value[this._row][i].toLowerCase();
    });
  }

  /** Capitalizes the word to the right (title case first char). */
  private _capitalizeRight(): void {
    this._doWordRight((charIdx, i) => {
      if (charIdx === 0) {
        this._value[this._row][i] = this._value[this._row][i].toUpperCase();
      }
    });
  }

  // ── LineInfo ─────────────────────────────────────────────────────────────

  /** Returns information about the cursor's position within soft-wrapped lines. */
  lineInfo(): LineInfo {
    const grid = this._memoizedWrap(this._value[this._row], this._width);

    let counter = 0;
    for (let i = 0; i < grid.length; i++) {
      const line = grid[i];

      if (counter + line.length === this._col && i + 1 < grid.length) {
        return {
          charOffset: 0,
          columnOffset: 0,
          height: grid.length,
          rowOffset: i + 1,
          startColumn: this._col,
          width: grid[i + 1].length,
          charWidth: stringWidth(line.join('')),
        };
      }

      if (counter + line.length >= this._col) {
        return {
          charOffset: stringWidth(line.slice(0, Math.max(0, this._col - counter)).join('')),
          columnOffset: this._col - counter,
          height: grid.length,
          rowOffset: i,
          startColumn: counter,
          width: line.length,
          charWidth: stringWidth(line.join('')),
        };
      }

      counter += line.length;
    }
    return { width: 0, charWidth: 0, height: 0, startColumn: 0, columnOffset: 0, rowOffset: 0, charOffset: 0 };
  }

  // ── Reposition view ─────────────────────────────────────────────────────

  private _repositionView(): void {
    const minimum = this._viewport.yOffset();
    const maximum = minimum + this._viewport.height() - 1;
    const row = this._cursorLineNumber();
    if (row < minimum) {
      this._viewport.scrollUp(minimum - row);
    } else if (row > maximum) {
      this._viewport.scrollDown(row - maximum);
    }
  }

  // ── Width / Height ──────────────────────────────────────────────────────

  /** Upstream-compatible width accessor. */
  width(): number { return this._width; }

  /** Returns the width of the textarea. */
  getWidth(): number { return this._width; }

  /** Moves cursor to the beginning of the input. */
  moveToBegin(): void {
    this._row = 0;
    this.setCursorColumn(0);
    this._repositionView();
  }

  /** Moves cursor to the end of the input. */
  moveToEnd(): void {
    this._row = this._value.length - 1;
    this.setCursorColumn(this._value[this._row].length);
    this._repositionView();
  }

  /** Page up: snap to first visible line, then move up a full page. */
  pageUp(): void {
    const offset = this._viewport.yOffset() - this._cursorLineNumber();
    if (offset < 0) {
      this._setCursorLineRelative(offset);
      return;
    }
    this._setCursorLineRelative(-this._height);
  }

  /** Page down: snap to last visible line, then move down a full page. */
  pageDown(): void {
    const offset = this._cursorLineNumber() - this._viewport.yOffset();
    if (offset < this._height - 1) {
      this._setCursorLineRelative(this._height - 1 - offset);
      return;
    }
    this._setCursorLineRelative(this._height);
  }

  /** Sets the width of the textarea, accounting for prompt and line numbers. */
  setWidth(w: number): void {
    if (this._promptFunc === null) {
      this._promptWidth = stringWidth(this.prompt);
    }

    const reservedOuter = this._activeStyle().base.getHorizontalFrameSize();
    let reservedInner = this._promptWidth;

    if (this.showLineNumbers) {
      const gap = 2;
      reservedInner += numDigits(this.maxHeight) + gap;
    }

    const minWidth = reservedInner + reservedOuter + 1;
    let inputWidth = Math.max(w, minWidth);

    if (this.maxWidth > 0) {
      inputWidth = Math.min(inputWidth, this.maxWidth);
    }

    this._viewport.setWidth(inputWidth - reservedOuter);
    this._width = inputWidth - reservedOuter - reservedInner;
    this._recalculateHeight();
  }

  /** Sets a dynamic prompt function. */
  setPromptFunc(promptWidth: number, fn: (info: PromptInfo) => string): void {
    this._promptFunc = fn;
    this._promptWidth = promptWidth;
  }

  /** Upstream-compatible height accessor. */
  height(): number { return this._height; }

  /** Returns the current height of the textarea. */
  getHeight(): number { return this._height; }

  /** Sets the height of the textarea. */
  setHeight(h: number): void {
    if (this.maxHeight > 0) {
      this._height = clamp(h, MIN_HEIGHT, this.maxHeight);
      this._viewport.setHeight(clamp(h, MIN_HEIGHT, this.maxHeight));
    } else {
      this._height = Math.max(h, MIN_HEIGHT);
      this._viewport.setHeight(Math.max(h, MIN_HEIGHT));
    }
    this._repositionView();
  }

  // ── Update ──────────────────────────────────────────────────────────────

  /** Bubble Tea update loop. */
  update(msg: Msg): [Model, Cmd | null] {
    if (!this._focus) {
      this._virtualCursor.blur();
      return [this, null];
    }

    const oldRow = this._cursorLineNumber();
    const oldCol = this._col;
    const cmds: Cmd[] = [];

    if (this._value[this._row] === undefined) {
      this._value[this._row] = [];
    }

    if (this.maxHeight > 0 && this.maxHeight !== this._cache.capacity()) {
      this._cache = new WrapCache(this.maxHeight);
    }

    if (typeof msg === 'object' && msg !== null && ('type' in msg || '_tag' in msg)) {
      const m = msg as Record<string, unknown>;

      if (
        (m.type === 'textarea.paste' || m.type === 'paste' || m._tag === 'PasteMsg')
        && typeof m.content === 'string'
      ) {
        this.deleteSelection();
        this._insertRunesFromUserInput([...m.content]);
      } else if (m.type === 'textarea.pasteErr' && m.error instanceof Error) {
        this.err = m.error;
      } else if (m.type === 'textarea.copyErr' && m.error instanceof Error) {
        this.err = m.error;
      } else if (m.type === 'keyPress' || m._tag === 'KeyPressMsg') {
        const km = this.keyMap;

        if (matches(m, km.deleteAfterCursor)) {
          if (this.hasSelection()) {
            this.deleteSelection();
          } else {
            this._col = clamp(this._col, 0, this._value[this._row].length);
            if (this._col >= this._value[this._row].length) {
              this._mergeLineBelow(this._row);
            } else {
              this._deleteAfterCursor();
            }
          }
        } else if (matches(m, km.deleteBeforeCursor)) {
          if (this.hasSelection()) {
            this.deleteSelection();
          } else {
            this._col = clamp(this._col, 0, this._value[this._row].length);
            if (this._col <= 0) {
              this._mergeLineAbove(this._row);
            } else {
              this._deleteBeforeCursor();
            }
          }
        } else if (matches(m, km.deleteCharacterBackward)) {
          if (this.hasSelection()) {
            this.deleteSelection();
          } else {
            this._col = clamp(this._col, 0, this._value[this._row].length);
            if (this._col <= 0) {
              this._mergeLineAbove(this._row);
            } else if (this._value[this._row].length > 0) {
              this._value[this._row] = [
                ...this._value[this._row].slice(0, Math.max(0, this._col - 1)),
                ...this._value[this._row].slice(this._col),
              ];
              if (this._col > 0) this.setCursorColumn(this._col - 1);
            }
          }
        } else if (matches(m, km.deleteCharacterForward)) {
          if (this.hasSelection()) {
            this.deleteSelection();
          } else {
            if (this._value[this._row].length > 0 && this._col < this._value[this._row].length) {
              this._value[this._row] = [
                ...this._value[this._row].slice(0, this._col),
                ...this._value[this._row].slice(this._col + 1),
              ];
            }
            if (this._col >= this._value[this._row].length) {
              this._mergeLineBelow(this._row);
            }
          }
        } else if (matches(m, km.deleteWordBackward)) {
          if (this.hasSelection()) {
            this.deleteSelection();
          } else if (this._col <= 0) {
            this._mergeLineAbove(this._row);
          } else {
            this._deleteWordLeft();
          }
        } else if (matches(m, km.deleteWordForward)) {
          if (this.hasSelection()) {
            this.deleteSelection();
          } else {
            this._col = clamp(this._col, 0, this._value[this._row].length);
            if (this._col >= this._value[this._row].length) {
              this._mergeLineBelow(this._row);
            } else {
              this._deleteWordRight();
            }
          }
        } else if (matches(m, km.insertNewline)) {
          this.deleteSelection();
          if (this._atContentLimit()) return [this, null];
          this._col = clamp(this._col, 0, this._value[this._row].length);
          this._splitLine(this._row, this._col);
        } else if (matches(m, km.lineEnd)) {
          this.clearSelection();
          this.cursorEnd();
        } else if (matches(m, km.lineStart)) {
          this.clearSelection();
          this.cursorStart();
        } else if (matches(m, km.characterForward)) {
          this.clearSelection();
          this._characterRight();
        } else if (matches(m, km.lineNext)) {
          this.clearSelection();
          this.cursorDown();
        } else if (matches(m, km.wordForward)) {
          this.clearSelection();
          this._wordRight();
        } else if (matches(m, km.paste)) {
          this.deleteSelection();
          cmds.push(paste);
        } else if (matches(m, km.characterBackward)) {
          this.clearSelection();
          this._characterLeft(false);
        } else if (matches(m, km.linePrevious)) {
          this.clearSelection();
          this.cursorUp();
        } else if (matches(m, km.wordBackward)) {
          this.clearSelection();
          this._wordLeft();
        } else if (matches(m, km.inputBegin)) {
          this.clearSelection();
          this.moveToBegin();
        } else if (matches(m, km.inputEnd)) {
          this.clearSelection();
          this.moveToEnd();
        } else if (matches(m, km.pageUp)) {
          this.clearSelection();
          this.pageUp();
        } else if (matches(m, km.pageDown)) {
          this.clearSelection();
          this.pageDown();
        } else if (matches(m, km.lowercaseWordForward)) {
          this._lowercaseRight();
        } else if (matches(m, km.uppercaseWordForward)) {
          this._uppercaseRight();
        } else if (matches(m, km.capitalizeWordForward)) {
          this._capitalizeRight();
        } else if (matches(m, km.transposeCharacterBackward)) {
          this._transposeLeft();
        } else if (matches(m, km.selectCharacterForward)) {
          this._startKeyboardSelection();
          this._characterRight();
          this._updateKeyboardSelection();
        } else if (matches(m, km.selectCharacterBackward)) {
          this._startKeyboardSelection();
          this._characterLeft(false);
          this._updateKeyboardSelection();
        } else if (matches(m, km.selectWordForward)) {
          this._startKeyboardSelection();
          this._wordRight();
          this._updateKeyboardSelection();
        } else if (matches(m, km.selectWordBackward)) {
          this._startKeyboardSelection();
          this._wordLeft();
          this._updateKeyboardSelection();
        } else if (matches(m, km.selectLineUp)) {
          this._startKeyboardSelection();
          this.cursorUp();
          this._updateKeyboardSelection();
        } else if (matches(m, km.selectLineDown)) {
          this._startKeyboardSelection();
          this.cursorDown();
          this._updateKeyboardSelection();
        } else if (matches(m, km.selectAll)) {
          this.selectAll();
        } else if (matches(m, km.copySelection)) {
          const cmd = this.copySelection();
          if (cmd) cmds.push(cmd);
        } else {
          // Default: insert typed text
          if (typeof m.text === 'string' && m.text.length > 0) {
            this.deleteSelection();
            this._insertRunesFromUserInput([...m.text]);
          }
        }
      }
    }
    this._recalculateHeight();


    // Update viewport content
    const viewContent = this._renderView();
    this._viewport.setContent(viewContent);
    const [vp, vpCmd] = this._viewport.update(msg);
    // viewport.update returns new model reference
    if (vpCmd) cmds.push(vpCmd);

    if (this._useVirtualCursor) {
      const [_cur, curCmd] = this._virtualCursor.update(msg);

      // Reset blink on cursor movement
      const newRow = this._cursorLineNumber();
      const newCol = this._col;
      if ((newRow !== oldRow || newCol !== oldCol) && this._virtualCursor.mode() === CursorMode.CursorBlink) {
        this._virtualCursor.isBlinked = false;
        const blinkCmd = this._virtualCursor.blinkCmd();
        if (blinkCmd) cmds.push(blinkCmd);
      } else if (curCmd) {
        cmds.push(curCmd);
      }
    }

    this._repositionView();

    return [this, cmds.length > 0 ? Batch(...cmds) : null];
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  /** Internal render (content for viewport). */
  private _renderView(): string {
    if (this.value().length === 0 && this._row === 0 && this._col === 0 && this.placeholder !== '') {
      return this._placeholderView();
    }
    this._virtualCursor.textStyle = computedCursorLine(this._activeStyle());

    const parts: string[] = [];
    const lineInfoVal = this.lineInfo();
    const styles = this._activeStyle();

    let displayLine = 0;
    let widestLineNumber = 0;

    for (let l = 0; l < this._value.length; l++) {
      const line = this._value[l];
      const wrappedLines = this._memoizedWrap(line, this._width);

      const style = this._row === l
        ? computedCursorLine(styles)
        : computedText(styles);

      // wrappedBase is the index, within the logical line, of the first rune
      // of the current wrapped segment. It is what maps a segment back onto
      // selection coordinates.
      let wrappedBase = 0;

      for (let wl = 0; wl < wrappedLines.length; wl++) {
        const wrappedLine = wrappedLines[wl];

        // Prompt
        const prompt = this._promptView(displayLine);
        parts.push(style.render(prompt));
        displayLine++;

        // Line number
        let ln = '';
        if (this.showLineNumbers) {
          if (wl === 0) {
            parts.push(this._lineNumberView(l + 1, this._row === l));
          } else {
            parts.push(this._lineNumberView(-1, this._row === l));
          }
        }

        const lnw = stringWidth(ln);
        if (lnw > widestLineNumber) widestLineNumber = lnw;

        const strwidth = stringWidth(wrappedLine.join(''));
        let padding = this._width - strwidth;
        let displayChars = wrappedLine;

        if (strwidth > this._width) {
          displayChars = [...wrappedLine.join('').trimEnd()];
          padding -= this._width - strwidth;
        }

        // A selection covering this segment takes precedence over the inline
        // cursor: during a drag the highlight is the meaningful affordance,
        // and mixing the two would double-style the same cell.
        const span = this._selectionSpanFor(l, wrappedBase, displayChars.length);
        if (span !== null) {
          const [selFrom, selTo] = span;
          parts.push(style.render(displayChars.slice(0, selFrom).join('')));
          parts.push(computedSelection(styles).render(displayChars.slice(selFrom, selTo).join('')));
          parts.push(style.render(displayChars.slice(selTo).join('')));
        } else if (this._row === l && lineInfoVal.rowOffset === wl) {
          parts.push(style.render(displayChars.slice(0, lineInfoVal.columnOffset).join('')));
          if (this._col >= line.length && lineInfoVal.charOffset >= this._width) {
            this._virtualCursor.setChar(' ');
            parts.push(this._virtualCursor.view());
          } else {
            this._virtualCursor.setChar(displayChars[lineInfoVal.columnOffset] ?? ' ');
            parts.push(style.render(this._virtualCursor.view()));
            parts.push(style.render(displayChars.slice(lineInfoVal.columnOffset + 1).join('')));
          }
        } else {
          parts.push(style.render(displayChars.join('')));
        }
        wrappedBase += displayChars.length;
        parts.push(style.render(' '.repeat(Math.max(0, padding))));
        parts.push('\n');
      }
    }

    // Pad remaining height with end-of-buffer lines
    for (let i = 0; i < this._height; i++) {
      parts.push(this._promptView(displayLine));
      displayLine++;

      const leftGutter = this.endOfBufferCharacter;
      const rightGapWidth = this._width - stringWidth(leftGutter) + widestLineNumber;
      const rightGap = ' '.repeat(Math.max(0, rightGapWidth));
      parts.push(computedEndOfBuffer(styles).render(leftGutter + rightGap));
      parts.push('\n');
    }

    return parts.join('');
  }

  /** Public view — renders the textarea in its current state. */
  view(): string {
    this._viewport.setContent(this._renderView());
    const viewStr = this._viewport.view();
    return this._activeStyle().base.render(viewStr);
  }

  /**
   * Returns real-terminal cursor metadata when virtual cursor rendering is
   * disabled and the textarea is focused.
   */
  cursor(): Cursor | null {
    if (this._useVirtualCursor || !this.focused()) return null;

    const info = this.lineInfo();
    const base = this._activeStyle().base;
    const xOffset = info.charOffset
      + stringWidth(this._promptView(0))
      + stringWidth(this._lineNumberView(0, false))
      + base.getMarginLeft()
      + base.getPaddingLeft()
      + base.getBorderLeftSize();
    const yOffset = this._cursorLineNumber()
      - this._viewport.yOffset()
      + base.getMarginTop()
      + base.getPaddingTop()
      + base.getBorderTopSize();

    const cursor = NewCursor(xOffset, yOffset);
    cursor.blink = this._styles.cursor.blink;
    cursor.color = this._styles.cursor.color ?? null;
    cursor.shape = this._styles.cursor.shape ?? CursorShape.Block;
    return cursor;
  }

  /** Renders a single line of the prompt. */
  private _promptView(displayLine: number): string {
    let prompt = this.prompt;
    if (this._promptFunc !== null) {
      prompt = this._promptFunc({
        lineNumber: displayLine,
        focused: this._focus,
      });
      const width = stringWidth(prompt);
      if (width < this._promptWidth) {
        prompt = ' '.repeat(this._promptWidth - width) + prompt;
      }
    }
    return computedPrompt(this._activeStyle()).render(prompt);
  }

  /** Renders a line number. If n <= 0, renders a space (soft-wrapped). */
  private _lineNumberView(n: number, isCursorLine: boolean): string {
    if (!this.showLineNumbers) return '';

    let str: string;
    if (n <= 0) {
      str = ' ';
    } else {
      str = String(n);
    }

    const textStyle = isCursorLine
      ? computedCursorLine(this._activeStyle())
      : computedText(this._activeStyle());
    const lineNumberStyle = isCursorLine
      ? computedCursorLineNumber(this._activeStyle())
      : computedLineNumber(this._activeStyle());

    const digits = String(this.maxHeight).length;
    str = ` ${str.padStart(digits)} `;

    return textStyle.render(lineNumberStyle.render(str));
  }

  /** Renders the placeholder view. */
  private _placeholderView(): string {
    const parts: string[] = [];
    const p = this.placeholder;
    const styles = this._activeStyle();

    const pwordwrap = wordWrap(p, this._width);
    const pwrap = hardWrap(pwordwrap, this._width);
    const plines = pwrap.trim().split('\n');

    for (let i = 0; i < this._height; i++) {
      const isLineNumber = plines.length > i;
      const lineStyle = plines.length > i
        ? computedCursorLine(styles)
        : computedPlaceholder(styles);

      // Prompt
      const prompt = this._promptView(i);
      parts.push(lineStyle.render(prompt));

      // Line numbers
      if (this.showLineNumbers) {
        if (i === 0) {
          parts.push(this._lineNumberView(1, isLineNumber));
        } else if (plines.length > i) {
          parts.push(this._lineNumberView(0, isLineNumber));
        }
      }

      if (i === 0) {
        // First line: cursor on first char
        this._virtualCursor.textStyle = computedPlaceholder(styles);
        const firstChar = plines[0]?.[0] ?? ' ';
        const rest = plines[0]?.slice(1) ?? '';
        this._virtualCursor.setChar(firstChar);
        parts.push(lineStyle.render(this._virtualCursor.view()));
        parts.push(lineStyle.render(computedPlaceholder(styles).render(rest)));
        const gap = ' '.repeat(Math.max(0, this._width - stringWidth(plines[0] ?? '')));
        parts.push(lineStyle.render(gap));
      } else if (plines.length > i) {
        const placeholderLine = plines[i];
        const gap = ' '.repeat(Math.max(0, this._width - stringWidth(plines[i])));
        parts.push(lineStyle.render(placeholderLine + gap));
      } else {
        const eob = computedEndOfBuffer(styles).render(this.endOfBufferCharacter);
        parts.push(eob);
      }

      parts.push('\n');
    }

    this._viewport.setContent(parts.join(''));
    return this._activeStyle().base.render(this._viewport.view());
  }

  // ── Selection ───────────────────────────────────────────────────────────

  /**
   * Number of columns rendered to the left of the text content: the prompt,
   * plus the line-number column when enabled. Pointer coordinates are offset
   * by this much before being mapped to a column.
   */
  private _gutterWidth(): number {
    let w = this._promptWidth;
    if (this.showLineNumbers) {
      w += String(this.maxHeight).length + 2;
    }
    return w;
  }

  /**
   * Maps coordinates within the textarea's rendered area to a buffer
   * position. Coordinates are relative to the textarea itself: (0, 0) is its
   * top-left cell, including the prompt/line-number gutter. Callers that
   * render the textarea at an offset must subtract that offset first.
   *
   * Coordinates outside the content resolve to the nearest position: above
   * the first line yields the start of the buffer, below the last yields its
   * end, and a column past a line's text yields the end of that line.
   */
  positionAt(x: number, y: number): Position {
    if (this._value.length === 0) return { row: 0, col: 0 };

    const targetLine = y + this._viewport.yOffset();
    if (targetLine < 0) return { row: 0, col: 0 };

    const contentX = Math.max(0, x - this._gutterWidth());

    let display = 0;
    for (let row = 0; row < this._value.length; row++) {
      const line = this._value[row];
      let wrapped = this._memoizedWrap(line, this._width);
      if (wrapped.length === 0) wrapped = [[]];
      let base = 0;
      for (const wrappedLine of wrapped) {
        if (display === targetLine) {
          const col = base + runeIndexForColumn(wrappedLine, contentX);
          return { row, col: clamp(col, 0, line.length) };
        }
        base += wrappedLine.length;
        display++;
      }
    }

    const lastRow = this._value.length - 1;
    return { row: lastRow, col: this._value[lastRow].length };
  }

  /**
   * Starts a selection at the given textarea-relative coordinates, discarding
   * any previous selection, and moves the cursor there. Pair it with
   * {@link Model.extendSelection} as the pointer moves and
   * {@link Model.endSelection} when the drag finishes.
   *
   * See {@link Model.positionAt} for the coordinate convention.
   */
  beginSelection(x: number, y: number): void {
    const pos = this.positionAt(x, y);
    this._selectFrom(pos, { ...pos });
    this._selecting = true;
    this._moveCursorTo(pos);
  }

  /**
   * Extends an in-progress selection to the given textarea-relative
   * coordinates and moves the cursor there. It is a no-op unless
   * {@link Model.beginSelection} started a drag.
   */
  extendSelection(x: number, y: number): void {
    if (!this._selecting) return;
    const pos = this.positionAt(x, y);
    this._selHead = pos;
    this._hasSelection = true;
    this._moveCursorTo(pos);
  }

  /**
   * Completes an in-progress drag. The selection itself is retained so it can
   * be read with {@link Model.selectedText}; a zero-width selection (a plain
   * click) is discarded.
   */
  endSelection(): void {
    this._selecting = false;
    if (positionEqual(this._selAnchor, this._selHead)) {
      this.clearSelection();
    }
  }

  /** Selects the entire buffer. */
  selectAll(): void {
    if (this._value.length === 0) return;
    const lastRow = this._value.length - 1;
    this._selectFrom(
      { row: 0, col: 0 },
      { row: lastRow, col: this._value[lastRow].length },
    );
    this._selecting = false;
  }

  /** Removes the current selection, if any. */
  clearSelection(): void {
    this._hasSelection = false;
    this._selecting = false;
    this._selAnchor = { row: 0, col: 0 };
    this._selHead = { row: 0, col: 0 };
  }

  /** Reports whether a non-empty selection is active. */
  hasSelection(): boolean {
    return this._hasSelection && !positionEqual(this._selAnchor, this._selHead);
  }

  /**
   * Returns the selected range, normalized so start sorts before end, and
   * whether a non-empty selection is active: `[start, end, ok]`.
   */
  selection(): [Position, Position, boolean] {
    if (!this.hasSelection()) {
      return [{ row: 0, col: 0 }, { row: 0, col: 0 }, false];
    }
    let start = { ...this._selAnchor };
    let end = { ...this._selHead };
    if (positionBefore(end, start)) [start, end] = [end, start];
    return [start, end, true];
  }

  /**
   * Returns the selected text, with logical lines joined by "\n". It returns
   * the empty string when nothing is selected.
   */
  selectedText(): string {
    const [start, end, ok] = this.selection();
    if (!ok) return '';

    if (start.row === end.row) {
      const line = this._value[start.row];
      return line.slice(clamp(start.col, 0, line.length), clamp(end.col, 0, line.length)).join('');
    }

    const parts: string[] = [];
    for (let row = start.row; row <= end.row; row++) {
      const line = this._value[row];
      if (row === start.row) {
        parts.push(line.slice(clamp(start.col, 0, line.length)).join(''));
      } else if (row === end.row) {
        parts.push(line.slice(0, clamp(end.col, 0, line.length)).join(''));
      } else {
        parts.push(line.join(''));
      }
    }
    return parts.join('\n');
  }

  /**
   * Deletes the currently selected text, positions the cursor at the start of
   * the former selection, and clears the selection state. It is a no-op when
   * there is no active selection.
   */
  deleteSelection(): void {
    if (!this.hasSelection()) return;

    const [start, end] = this.selection();

    if (start.row === end.row) {
      const line = this._value[start.row];
      const endCol = Math.min(end.col, line.length);
      const startCol = Math.min(start.col, endCol);
      this._value[start.row] = [...line.slice(0, startCol), ...line.slice(endCol)];
      this._row = start.row;
      this.setCursorColumn(startCol);
    } else {
      const headLine = this._value[start.row];
      const tailLine = this._value[end.row];
      const endCol = Math.min(end.col, tailLine.length);
      const startCol = Math.min(start.col, headLine.length);

      const merged = [...headLine.slice(0, startCol), ...tailLine.slice(endCol)];
      this._value = [
        ...this._value.slice(0, start.row),
        merged,
        ...this._value.slice(end.row + 1),
      ];

      this._row = start.row;
      this.setCursorColumn(startCol);
    }

    this.clearSelection();
  }

  /**
   * Copies the selected text to the clipboard and returns a command that
   * performs the copy. Returns null if there is no selection.
   */
  copySelection(): Cmd | null {
    if (!this.hasSelection()) return null;
    const text = this.selectedText();
    return async (): Promise<Msg> => {
      try {
        await writeClipboard(text);
        return { type: 'textarea.copy', content: text } satisfies CopyMsg;
      } catch (error) {
        return {
          type: 'textarea.copyErr',
          error: error instanceof Error ? error : new Error(String(error)),
        } satisfies CopyErrMsg;
      }
    };
  }

  /** Begins a keyboard-driven selection at the cursor if none is active. */
  private _startKeyboardSelection(): void {
    if (!this._hasSelection) {
      this._selAnchor = { row: this._row, col: this._col };
    }
    this._hasSelection = true;
    this._selHead = { row: this._row, col: this._col };
  }

  /** Moves the selection head to the cursor after a keyboard movement. */
  private _updateKeyboardSelection(): void {
    this._selHead = { row: this._row, col: this._col };
  }

  /** Sets the selection anchor and head. */
  private _selectFrom(anchor: Position, head: Position): void {
    this._selAnchor = anchor;
    this._selHead = head;
    this._hasSelection = true;
  }

  /** Places the cursor at the given position, clamped to the buffer. */
  private _moveCursorTo(pos: Position): void {
    if (this._value.length === 0) return;
    const row = clamp(pos.row, 0, this._value.length - 1);
    this._row = row;
    this._col = clamp(pos.col, 0, this._value[row].length);
  }

  /**
   * Returns the half-open rune range [from, to) of the given logical row that
   * is selected, restricted to the wrapped segment covering
   * [base, base+length), relative to base. Returns null when the segment holds
   * no selected runes.
   */
  private _selectionSpanFor(row: number, base: number, length: number): [number, number] | null {
    const [start, end, active] = this.selection();
    if (!active || row < start.row || row > end.row) return null;

    const lineLen = this._value[row].length;
    let rowFrom = 0;
    let rowTo = lineLen;
    if (row === start.row) rowFrom = clamp(start.col, 0, lineLen);
    if (row === end.row) rowTo = clamp(end.col, 0, lineLen);

    const from = Math.max(rowFrom, base);
    const to = Math.min(rowTo, base + length);
    if (from >= to) return null;
    return [from - base, to - base];
  }

  // ── Memoized wrap ───────────────────────────────────────────────────────

  private _memoizedWrap(runes: string[], width: number): string[][] {
    const cached = this._cache.get(runes, width);
    if (cached !== undefined) return cached;
    const v = wrap(runes, width);
    this._cache.set(runes, width, v);
    return v;
  }

  /** Returns the visual line number the cursor is on (accounting for soft wrap). */
  private _cursorLineNumber(): number {
    let line = 0;
    for (let i = 0; i < this._row; i++) {
      line += this._memoizedWrap(this._value[i], this._width).length;
    }
    line += this.lineInfo().rowOffset;
    return line;
  }

  /** Total display rows across all logical lines, including soft wraps. */
  private _totalVisualLines(): number {
    let total = 0;
    for (const line of this._value) {
      total += this._memoizedWrap(line, this._width).length;
    }
    return total;
  }

  /** Applies dynamic-height constraints after content or width changes. */
  private _recalculateHeight(): void {
    if (!this.dynamicHeight) return;

    const minimum = Math.max(this.minHeight, MIN_HEIGHT);
    const total = this._totalVisualLines();
    let height = Math.max(total, minimum);
    if (this.maxHeight > 0) height = Math.min(height, this.maxHeight);

    const maxOffset = total - height;
    if (this._viewport.yOffset() > maxOffset) {
      this._viewport.setYOffset(Math.max(0, maxOffset));
    }
    this.setHeight(height);
  }

  private _atContentLimit(): boolean {
    if (this.maxContentHeight > 0) {
      return this._totalVisualLines() >= this.maxContentHeight;
    }
    return this.maxHeight > 0 && this._value.length >= this.maxHeight;
  }

  /** Estimates the visual-row delta from an insertion at the cursor. */
  private _visualLinesForInsert(lines: string[][]): number {
    if (lines.length === 0) return 0;

    const currentRowVisual = this._memoizedWrap(this._value[this._row], this._width).length;
    let merged = [
      ...this._value[this._row].slice(0, this._col),
      ...lines[0],
    ];
    if (lines.length === 1) {
      merged = [...merged, ...this._value[this._row].slice(this._col)];
    }
    let delta = this._memoizedWrap(merged, this._width).length - currentRowVisual;

    for (let i = 0; i < lines.length; i++) {
      const content = i === lines.length - 1
        ? [...lines[i], ...this._value[this._row].slice(this._col)]
        : lines[i];
      delta += this._memoizedWrap(content, this._width).length;
    }
    return delta;
  }

  // ── Line merge/split ────────────────────────────────────────────────────

  /** Merges the given row with the row below. */
  private _mergeLineBelow(row: number): void {
    if (row >= this._value.length - 1) return;
    this._value[row] = [...this._value[row], ...this._value[row + 1]];
    for (let i = row + 1; i < this._value.length - 1; i++) {
      this._value[i] = this._value[i + 1];
    }
    if (this._value.length > 0) {
      this._value = this._value.slice(0, this._value.length - 1);
    }
  }

  /** Merges the given row with the row above. */
  private _mergeLineAbove(row: number): void {
    if (row <= 0) return;
    this._col = this._value[row - 1].length;
    this._row = this._row - 1;
    this._value[row - 1] = [...this._value[row - 1], ...this._value[row]];
    for (let i = row; i < this._value.length - 1; i++) {
      this._value[i] = this._value[i + 1];
    }
    if (this._value.length > 0) {
      this._value = this._value.slice(0, this._value.length - 1);
    }
  }

  /** Splits the line at the given row and column. */
  private _splitLine(row: number, col: number): void {
    const head = this._value[row].slice(0, col);
    const tail = [...this._value[row].slice(col)];

    this._value = [
      ...this._value.slice(0, row + 1),
      ...this._value.slice(row),
    ];

    this._value[row] = head;
    this._value[row + 1] = tail;

    this._col = 0;
    this._row++;
  }

  /** Returns the blink command for the virtual cursor. */
  static blink(): Msg {
    return cursorBlink();
  }
}

// ── Module-level factory ────────────────────────────────────────────────────

/** Creates a new textarea model with default settings. */
export function newTextarea(): Model {
  return new Model();
}

/** Returns the initial blink message for the textarea's virtual cursor. */
export function textareaBlink(): Msg {
  return cursorBlink();
}

// ── Helper functions (module-level) ─────────────────────────────────────────

/** Returns true if the character is whitespace. */
function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f';
}

/** Clamp value between low and high (inclusive). */
function clamp(v: number, low: number, high: number): number {
  if (high < low) { [low, high] = [high, low]; }
  return Math.min(high, Math.max(low, v));
}

/** Returns the number of digits in an integer. */
function numDigits(n: number): number {
  if (n === 0) return 1;
  let count = 0;
  let num = Math.abs(n);
  while (num > 0) {
    count++;
    num = Math.floor(num / 10);
  }
  return count;
}

/** Word-wrap runes (character array) to the given width. */
function wrap(runes: string[], width: number): string[][] {
  const lines: string[][] = [[]];
  let word: string[] = [];
  let row = 0;
  let spaces = 0;

  for (const r of runes) {
    if (isSpace(r)) {
      spaces++;
    } else {
      word.push(r);
    }

    if (spaces > 0) {
      if (stringWidth(lines[row].join('')) + stringWidth(word.join('')) + spaces > width) {
        row++;
        lines.push([]);
        lines[row].push(...word);
        lines[row].push(...repeatSpaces(spaces));
        spaces = 0;
        word = [];
      } else {
        lines[row].push(...word);
        lines[row].push(...repeatSpaces(spaces));
        spaces = 0;
        word = [];
      }
    } else if (word.length > 0) {
      // Check if double-width char causes overflow
      const lastCharLen = runeWidth(word[word.length - 1]);
      if (stringWidth(word.join('')) + lastCharLen > width) {
        if (lines[row].length > 0) {
          row++;
          lines.push([]);
        }
        lines[row].push(...word);
        word = [];
      }
    }
  }

  // Handle remaining word
  if (stringWidth(lines[row].join('')) + stringWidth(word.join('')) + spaces >= width) {
    lines.push([]);
    lines[row + 1] = [...word];
    spaces++;
    lines[row + 1].push(...repeatSpaces(spaces));
  } else {
    lines[row].push(...word);
    spaces++;
    lines[row].push(...repeatSpaces(spaces));
  }

  return lines;
}

/** Returns an array of space characters. */
function repeatSpaces(n: number): string[] {
  return Array.from({ length: n }, () => ' ');
}
