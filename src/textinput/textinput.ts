/**
 * TextInput — single-line text input component.
 *
 * Zero-dependency port of charmbracelet/bubbles/textinput (Go).
 * Features:
 * - Virtual blinking cursor
 * - Echo modes: Normal, Password, None
 * - Validation
 * - Auto-complete suggestions
 * - Word-wise navigation and deletion
 * - Horizontal scrolling viewport
 * - Focused / Blurred styling
 *
 * Note: Clipboard paste and real cursor are not yet ported.
 *
 * @module
 */

import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { Batch } from '@oakoliver/bubbletea';
import { newStyle, stringWidth } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { newBinding, withKeys, matches } from '../key/key.js';
import type { Binding } from '../key/key.js';
import {
  Model as CursorModel,
  newCursor,
  Mode as CursorMode,
  blink as cursorBlink,
} from '../cursor/cursor.js';
import { newSanitizer, replaceTabs, replaceNewlines } from '../internal/runeutil.js';
import type { Sanitizer } from '../internal/runeutil.js';

// ── Types ───────────────────────────────────────────────────────────────────

/** EchoMode sets the input behavior of the text input field. */
export enum EchoMode {
  /** Displays text as-is (default). */
  EchoNormal = 0,
  /** Displays the echo character mask instead of actual characters. */
  EchoPassword = 1,
  /** Displays nothing as characters are entered. */
  EchoNone = 2,
}

/**
 * ValidateFunc returns an error message if the input is invalid,
 * or null if valid.
 */
export type ValidateFunc = (value: string) => string | null;

/** KeyMap defines keybindings for the textinput. */
export interface KeyMap {
  characterForward: Binding;
  characterBackward: Binding;
  wordForward: Binding;
  wordBackward: Binding;
  deleteWordBackward: Binding;
  deleteWordForward: Binding;
  deleteAfterCursor: Binding;
  deleteBeforeCursor: Binding;
  deleteCharacterBackward: Binding;
  deleteCharacterForward: Binding;
  lineStart: Binding;
  lineEnd: Binding;
  paste: Binding;
  acceptSuggestion: Binding;
  nextSuggestion: Binding;
  prevSuggestion: Binding;
}

/** StyleState that will be applied depending on focus state. */
export interface StyleState {
  text: Style;
  placeholder: Style;
  suggestion: Style;
  prompt: Style;
}

/** CursorStyle is the style for virtual cursors. */
export interface CursorStyle {
  color: string | null;
  blink: boolean;
  blinkSpeed: number; // ms
}

/** Styles for the textinput in focused and blurred states. */
export interface Styles {
  focused: StyleState;
  blurred: StyleState;
  cursor: CursorStyle;
}

// ── Internal paste messages ─────────────────────────────────────────────────

interface PasteMsg {
  type: 'textinput.paste';
  content: string;
}

interface PasteErrMsg {
  type: 'textinput.pasteErr';
  error: string;
}

// ── Defaults ────────────────────────────────────────────────────────────────

/** Returns the default keybindings. */
export function defaultKeyMap(): KeyMap {
  return {
    characterForward: newBinding(withKeys('right', 'ctrl+f')),
    characterBackward: newBinding(withKeys('left', 'ctrl+b')),
    wordForward: newBinding(withKeys('alt+right', 'ctrl+right', 'alt+f')),
    wordBackward: newBinding(withKeys('alt+left', 'ctrl+left', 'alt+b')),
    deleteWordBackward: newBinding(withKeys('alt+backspace', 'ctrl+w')),
    deleteWordForward: newBinding(withKeys('alt+delete', 'alt+d')),
    deleteAfterCursor: newBinding(withKeys('ctrl+k')),
    deleteBeforeCursor: newBinding(withKeys('ctrl+u')),
    deleteCharacterBackward: newBinding(withKeys('backspace', 'ctrl+h')),
    deleteCharacterForward: newBinding(withKeys('delete', 'ctrl+d')),
    lineStart: newBinding(withKeys('home', 'ctrl+a')),
    lineEnd: newBinding(withKeys('end', 'ctrl+e')),
    paste: newBinding(withKeys('ctrl+v')),
    acceptSuggestion: newBinding(withKeys('tab')),
    nextSuggestion: newBinding(withKeys('down', 'ctrl+n')),
    prevSuggestion: newBinding(withKeys('up', 'ctrl+p')),
  };
}

/** Returns the default styles. */
export function defaultStyles(isDark: boolean): Styles {
  const lightDark = (light: string, dark: string) => isDark ? dark : light;

  return {
    focused: {
      placeholder: newStyle().foreground('240'),
      suggestion: newStyle().foreground('240'),
      prompt: newStyle().foreground('7'),
      text: newStyle(),
    },
    blurred: {
      placeholder: newStyle().foreground('240'),
      suggestion: newStyle().foreground('240'),
      prompt: newStyle().foreground('7'),
      text: newStyle().foreground(lightDark('245', '7')),
    },
    cursor: {
      color: '7',
      blink: true,
      blinkSpeed: 0, // use default
    },
  };
}

/** Returns default styles for dark backgrounds. */
export function defaultDarkStyles(): Styles {
  return defaultStyles(true);
}

/** Returns default styles for light backgrounds. */
export function defaultLightStyles(): Styles {
  return defaultStyles(false);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, low: number, high: number): number {
  if (high < low) {
    [low, high] = [high, low];
  }
  return Math.min(high, Math.max(low, v));
}

/** Measure the visual width of a single character. */
function runeWidth(ch: string): number {
  if (ch.length === 0) return 0;
  const code = ch.codePointAt(0) ?? 0;
  // Common CJK ranges (approximate)
  if (
    (code >= 0x1100 && code <= 0x115F) ||
    (code >= 0x2E80 && code <= 0x303E) ||
    (code >= 0x3040 && code <= 0x33BF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0x4E00 && code <= 0xA4CF) ||
    (code >= 0xA960 && code <= 0xA97C) ||
    (code >= 0xAC00 && code <= 0xD7FB) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0xFE10 && code <= 0xFE6F) ||
    (code >= 0xFF01 && code <= 0xFF60) ||
    (code >= 0xFFE0 && code <= 0xFFE6) ||
    (code >= 0x20000 && code <= 0x2FFFD) ||
    (code >= 0x30000 && code <= 0x3FFFD)
  ) {
    return 2;
  }
  return 1;
}

/** Check if a character is whitespace. */
function isSpace(ch: string): boolean {
  return /\s/.test(ch);
}

// ── Model ───────────────────────────────────────────────────────────────────

export class Model {
  /** Error from validation. */
  err: string | null;

  /** The prompt string displayed before input. */
  prompt: string;

  /** Placeholder text shown when input is empty. */
  placeholder: string;

  /** Echo mode for the input. */
  echoMode: EchoMode;

  /** Character used when EchoMode is Password. */
  echoCharacter: string;

  /** Maximum number of characters. 0 = no limit. */
  charLimit: number;

  /** Whether to show suggestion completions. */
  showSuggestions: boolean;

  /** Keybindings. */
  keyMap: KeyMap;

  /** Validation function. */
  validate: ValidateFunc | null;

  // -- Internal state --

  /** Whether to use virtual cursor. */
  private _useVirtualCursor: boolean;

  /** Virtual cursor model. */
  private _virtualCursor: CursorModel;

  /** Styles. */
  private _styles: Styles;

  /** Display width (0 = unlimited). */
  private _width: number;

  /** Underlying value as array of characters. */
  private _value: string[];

  /** Focus state. */
  private _focus: boolean;

  /** Cursor position (character index). */
  private _pos: number;

  /** Horizontal scroll offset (left). */
  private _offset: number;

  /** Horizontal scroll offset (right). */
  private _offsetRight: number;

  /** Rune sanitizer. */
  private _rsan: Sanitizer | null;

  /** All available suggestions. */
  private _suggestions: string[][];

  /** Suggestions matching current input. */
  private _matchedSuggestions: string[][];

  /** Currently selected suggestion index. */
  private _currentSuggestionIndex: number;

  constructor() {
    this.err = null;
    this.prompt = '> ';
    this.placeholder = '';
    this.echoMode = EchoMode.EchoNormal;
    this.echoCharacter = '*';
    this.charLimit = 0;
    this.showSuggestions = false;
    this.keyMap = defaultKeyMap();
    this.validate = null;

    this._useVirtualCursor = true;
    this._virtualCursor = newCursor();
    this._styles = defaultDarkStyles();
    this._width = 0;
    this._value = [];
    this._focus = false;
    this._pos = 0;
    this._offset = 0;
    this._offsetRight = 0;
    this._rsan = null;
    this._suggestions = [];
    this._matchedSuggestions = [];
    this._currentSuggestionIndex = 0;

    this.updateVirtualCursorStyle();
  }

  // ── Accessors ───────────────────────────────────────────────────────────

  /** Returns whether the model uses a virtual cursor. */
  virtualCursor(): boolean {
    return this._useVirtualCursor;
  }

  /** Sets whether to use a virtual cursor. */
  setVirtualCursor(v: boolean): void {
    this._useVirtualCursor = v;
    this.updateVirtualCursorStyle();
  }

  /** Returns the current styles. */
  styles(): Styles {
    return this._styles;
  }

  /** Sets the styles. */
  setStyles(s: Styles): void {
    this._styles = s;
    this.updateVirtualCursorStyle();
  }

  /** Returns the width of the text input. */
  width(): number {
    return this._width;
  }

  /** Sets the width of the text input. */
  setWidth(w: number): void {
    this._width = w;
  }

  /** Returns the current value as a string. */
  value(): string {
    return this._value.join('');
  }

  /** Sets the value of the text input. */
  setValue(s: string): void {
    const chars = this.san().sanitize(s).split('');
    const err = this.validateValue(chars);
    this.setValueInternal(chars, err);
  }

  /** Returns the cursor position (character index). */
  position(): number {
    return this._pos;
  }

  /** Sets the cursor position, clamped to value bounds. */
  setCursor(pos: number): void {
    this._pos = clamp(pos, 0, this._value.length);
    this.handleOverflow();
  }

  /** Moves cursor to start of input. */
  cursorStart(): void {
    this.setCursor(0);
  }

  /** Moves cursor to end of input. */
  cursorEnd(): void {
    this.setCursor(this._value.length);
  }

  /** Returns the focus state. */
  focused(): boolean {
    return this._focus;
  }

  /** Focus sets the focus state and returns a cursor command. */
  focus(): Cmd | null {
    this._focus = true;
    return this._virtualCursor.focus();
  }

  /** Blur removes focus. */
  blur(): void {
    this._focus = false;
    this._virtualCursor.blur();
  }

  /** Reset clears the input. */
  reset(): void {
    this._value = [];
    this.setCursor(0);
  }

  /** Sets the suggestions list. */
  setSuggestions(suggestions: string[]): void {
    this._suggestions = suggestions.map((s) => [...s]);
    this.updateSuggestions();
  }

  /** Returns available suggestions. */
  availableSuggestions(): string[] {
    return this._suggestions.map((s) => s.join(''));
  }

  /** Returns matched suggestions. */
  matchedSuggestions(): string[] {
    return this._matchedSuggestions.map((s) => s.join(''));
  }

  /** Returns the currently selected suggestion index. */
  currentSuggestionIndex(): number {
    return this._currentSuggestionIndex;
  }

  /** Returns the currently selected suggestion text. */
  currentSuggestion(): string {
    if (this._currentSuggestionIndex >= this._matchedSuggestions.length) {
      return '';
    }
    return this._matchedSuggestions[this._currentSuggestionIndex].join('');
  }

  // ── Update ──────────────────────────────────────────────────────────────

  update(msg: Msg): [Model, Cmd | null] {
    if (!this._focus) {
      return [this, null];
    }

    // Check for keypress
    const isKey = msg && typeof msg === 'object' && 'type' in msg && (msg as any).type === 'keyPress';

    // Check for suggestion acceptance first (before other key handling)
    if (isKey && matches(msg, this.keyMap.acceptSuggestion)) {
      if (this.canAcceptSuggestion()) {
        const suggestion = this._matchedSuggestions[this._currentSuggestionIndex];
        this._value.push(...suggestion.slice(this._value.length));
        this.cursorEnd();
      }
    }

    const oldPos = this._pos;

    if (isKey) {
      const km = this.keyMap;

      if (matches(msg, km.deleteWordBackward)) {
        this.deleteWordBackward();
      } else if (matches(msg, km.deleteCharacterBackward)) {
        this.err = null;
        if (this._value.length > 0) {
          const pos = Math.max(0, this._pos - 1);
          this._value.splice(pos, 1);
          this.err = this.validateValue(this._value);
          if (this._pos > 0) {
            this.setCursor(this._pos - 1);
          }
        }
      } else if (matches(msg, km.wordBackward)) {
        this.wordBackward();
      } else if (matches(msg, km.characterBackward)) {
        if (this._pos > 0) {
          this.setCursor(this._pos - 1);
        }
      } else if (matches(msg, km.wordForward)) {
        this.wordForward();
      } else if (matches(msg, km.characterForward)) {
        if (this._pos < this._value.length) {
          this.setCursor(this._pos + 1);
        }
      } else if (matches(msg, km.lineStart)) {
        this.cursorStart();
      } else if (matches(msg, km.deleteCharacterForward)) {
        if (this._value.length > 0 && this._pos < this._value.length) {
          this._value.splice(this._pos, 1);
          this.err = this.validateValue(this._value);
        }
      } else if (matches(msg, km.lineEnd)) {
        this.cursorEnd();
      } else if (matches(msg, km.deleteAfterCursor)) {
        this.deleteAfterCursor();
      } else if (matches(msg, km.deleteBeforeCursor)) {
        this.deleteBeforeCursor();
      } else if (matches(msg, km.paste)) {
        // Clipboard paste not ported — no-op
      } else if (matches(msg, km.deleteWordForward)) {
        this.deleteWordForward();
      } else if (matches(msg, km.nextSuggestion)) {
        this.nextSuggestion();
      } else if (matches(msg, km.prevSuggestion)) {
        this.previousSuggestion();
      } else {
        // Input regular characters
        const text = (msg as any).text;
        if (typeof text === 'string' && text.length > 0) {
          this.insertRunesFromUserInput([...text]);
        }
      }

      this.updateSuggestions();
    }

    // Handle paste messages
    if (msg && typeof msg === 'object' && 'type' in msg) {
      const m = msg as any;
      if (m.type === 'textinput.paste' && typeof m.content === 'string') {
        this.insertRunesFromUserInput([...m.content]);
      } else if (m.type === 'textinput.pasteErr') {
        this.err = m.error;
      }
    }

    const cmds: Cmd[] = [];

    if (this._useVirtualCursor) {
      const [_, cmd] = this._virtualCursor.update(msg);
      if (cmd) cmds.push(cmd);

      // Reset blink on cursor move
      if (oldPos !== this._pos && this._virtualCursor.mode() === CursorMode.CursorBlink) {
        this._virtualCursor.isBlinked = false;
        const blinkCmd = this._virtualCursor.focus();
        if (blinkCmd) cmds.push(blinkCmd);
      }
    }

    this.handleOverflow();
    return [this, cmds.length > 0 ? Batch(...cmds) : null];
  }

  // ── View ────────────────────────────────────────────────────────────────

  view(): string {
    // Placeholder text
    if (this._value.length === 0 && this.placeholder !== '') {
      return this.placeholderView();
    }

    const styles = this.activeStyle();
    const styleText = (s: string) => styles.text.inline(true).render(s);

    const value = this._value.slice(this._offset, this._offsetRight);
    const pos = Math.max(0, this._pos - this._offset);
    let v = styleText(this.echoTransform(value.slice(0, pos).join('')));

    if (pos < value.length) {
      const char = this.echoTransform(value[pos]);
      this._virtualCursor.setChar(char);
      v += this._virtualCursor.view();
      v += styleText(this.echoTransform(value.slice(pos + 1).join('')));
      v += this.completionView(0);
    } else {
      if (this._focus && this.canAcceptSuggestion()) {
        const suggestion = this._matchedSuggestions[this._currentSuggestionIndex];
        if (value.length < suggestion.length) {
          this._virtualCursor.textStyle = styles.suggestion;
          this._virtualCursor.setChar(this.echoTransform(suggestion[pos]));
          v += this._virtualCursor.view();
          v += this.completionView(1);
        } else {
          this._virtualCursor.setChar(' ');
          v += this._virtualCursor.view();
        }
      } else {
        this._virtualCursor.setChar(' ');
        v += this._virtualCursor.view();
      }
    }

    // Fill remaining width with background
    const valWidth = stringWidth(value.join(''));
    if (this._width > 0 && valWidth <= this._width) {
      let padding = Math.max(0, this._width - valWidth);
      if (valWidth + padding <= this._width && pos < value.length) {
        padding++;
      }
      v += styleText(' '.repeat(padding));
    }

    return this.promptView() + v;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private san(): Sanitizer {
    if (!this._rsan) {
      this._rsan = newSanitizer(replaceTabs(' '), replaceNewlines(' '));
    }
    return this._rsan;
  }

  private validateValue(v: string[]): string | null {
    if (this.validate) {
      return this.validate(v.join(''));
    }
    return null;
  }

  private setValueInternal(chars: string[], err: string | null): void {
    this.err = err;
    const empty = this._value.length === 0;

    if (this.charLimit > 0 && chars.length > this.charLimit) {
      this._value = chars.slice(0, this.charLimit);
    } else {
      this._value = chars;
    }
    if ((this._pos === 0 && empty) || this._pos > this._value.length) {
      this.setCursor(this._value.length);
    }
    this.handleOverflow();
  }

  private insertRunesFromUserInput(v: string[]): void {
    const paste = [...this.san().sanitize(v.join(''))];
    let toInsert = paste;
    let availSpace = 0;

    if (this.charLimit > 0) {
      availSpace = this.charLimit - this._value.length;
      if (availSpace <= 0) return;
      if (availSpace < toInsert.length) {
        toInsert = toInsert.slice(0, availSpace);
      }
    }

    // Build new value: head + pasted + tail
    const head = this._value.slice(0, this._pos);
    const tail = this._value.slice(this._pos);
    const newPos = this._pos + toInsert.length;
    const newValue = [...head, ...toInsert, ...tail];

    const inputErr = this.validateValue(newValue);
    this._pos = newPos; // set pos before setValueInternal since it handles overflow
    this.setValueInternal(newValue, inputErr);
  }

  private handleOverflow(): void {
    if (this._width <= 0 || stringWidth(this._value.join('')) <= this._width) {
      this._offset = 0;
      this._offsetRight = this._value.length;
      return;
    }

    // Correct right offset if we've deleted characters
    this._offsetRight = Math.min(this._offsetRight, this._value.length);

    if (this._pos < this._offset) {
      this._offset = this._pos;

      let w = 0;
      let i = 0;
      const runes = this._value.slice(this._offset);

      while (i < runes.length && w <= this._width) {
        w += runeWidth(runes[i]);
        if (w <= this._width + 1) {
          i++;
        }
      }

      this._offsetRight = this._offset + i;
    } else if (this._pos >= this._offsetRight) {
      this._offsetRight = this._pos;

      let w = 0;
      const runes = this._value.slice(0, this._offsetRight);
      let i = runes.length - 1;

      while (i > 0 && w < this._width) {
        w += runeWidth(runes[i]);
        if (w <= this._width) {
          i--;
        }
      }

      this._offsetRight = Math.max(this._offsetRight, this._pos);
      this._offset = this._offsetRight - (runes.length - 1 - i);
    }
  }

  private deleteBeforeCursor(): void {
    this._value = this._value.slice(this._pos);
    this.err = this.validateValue(this._value);
    this._offset = 0;
    this.setCursor(0);
  }

  private deleteAfterCursor(): void {
    this._value = this._value.slice(0, this._pos);
    this.err = this.validateValue(this._value);
    this.setCursor(this._value.length);
  }

  private deleteWordBackward(): void {
    if (this._pos === 0 || this._value.length === 0) return;

    if (this.echoMode !== EchoMode.EchoNormal) {
      this.deleteBeforeCursor();
      return;
    }

    const oldPos = this._pos;

    this.setCursor(this._pos - 1);
    while (this._pos > 0 && isSpace(this._value[this._pos])) {
      this.setCursor(this._pos - 1);
    }

    while (this._pos > 0) {
      if (!isSpace(this._value[this._pos])) {
        this.setCursor(this._pos - 1);
      } else {
        if (this._pos > 0) {
          this.setCursor(this._pos + 1);
        }
        break;
      }
    }

    if (oldPos > this._value.length) {
      this._value = this._value.slice(0, this._pos);
    } else {
      this._value = [...this._value.slice(0, this._pos), ...this._value.slice(oldPos)];
    }
    this.err = this.validateValue(this._value);
  }

  private deleteWordForward(): void {
    if (this._pos >= this._value.length || this._value.length === 0) return;

    if (this.echoMode !== EchoMode.EchoNormal) {
      this.deleteAfterCursor();
      return;
    }

    const oldPos = this._pos;

    this.setCursor(this._pos + 1);
    while (this._pos < this._value.length && isSpace(this._value[this._pos])) {
      this.setCursor(this._pos + 1);
    }

    while (this._pos < this._value.length) {
      if (!isSpace(this._value[this._pos])) {
        this.setCursor(this._pos + 1);
      } else {
        break;
      }
    }

    if (this._pos > this._value.length) {
      this._value = this._value.slice(0, oldPos);
    } else {
      this._value = [...this._value.slice(0, oldPos), ...this._value.slice(this._pos)];
    }
    this.err = this.validateValue(this._value);
    this.setCursor(oldPos);
  }

  private wordBackward(): void {
    if (this._pos === 0 || this._value.length === 0) return;

    if (this.echoMode !== EchoMode.EchoNormal) {
      this.cursorStart();
      return;
    }

    let i = this._pos - 1;
    while (i >= 0 && isSpace(this._value[i])) {
      this.setCursor(this._pos - 1);
      i--;
    }
    while (i >= 0 && !isSpace(this._value[i])) {
      this.setCursor(this._pos - 1);
      i--;
    }
  }

  private wordForward(): void {
    if (this._pos >= this._value.length || this._value.length === 0) return;

    if (this.echoMode !== EchoMode.EchoNormal) {
      this.cursorEnd();
      return;
    }

    let i = this._pos;
    while (i < this._value.length && isSpace(this._value[i])) {
      this.setCursor(this._pos + 1);
      i++;
    }
    while (i < this._value.length && !isSpace(this._value[i])) {
      this.setCursor(this._pos + 1);
      i++;
    }
  }

  private echoTransform(v: string): string {
    switch (this.echoMode) {
      case EchoMode.EchoPassword:
        return this.echoCharacter.repeat(stringWidth(v));
      case EchoMode.EchoNone:
        return '';
      case EchoMode.EchoNormal:
      default:
        return v;
    }
  }

  private promptView(): string {
    return this.activeStyle().prompt.render(this.prompt);
  }

  private placeholderView(): string {
    const styles = this.activeStyle();
    const render = (s: string) => styles.placeholder.render(s);

    const p = [...this.placeholder];
    // Pad to width if needed
    if (this._width > 0) {
      while (p.length < this._width + 1) {
        p.push(' ');
      }
    }

    this._virtualCursor.textStyle = styles.placeholder;
    this._virtualCursor.setChar(p[0] ?? ' ');
    let v = this._virtualCursor.view();

    if (this._width < 1 && p.length <= 1) {
      return styles.prompt.render(this.prompt) + v;
    }

    if (this._width > 0) {
      const minWidth = stringWidth(this.placeholder);
      let availWidth = this._width - minWidth + 1;

      if (availWidth < 0) {
        const truncWidth = minWidth + availWidth;
        v += render(p.slice(1, truncWidth).join(''));
      } else {
        v += render(p.slice(1, minWidth).join(''));
        v += render(' '.repeat(availWidth));
      }
    } else {
      v += render(p.slice(1).join(''));
    }

    return styles.prompt.render(this.prompt) + v;
  }

  private completionView(offset: number): string {
    if (!this.canAcceptSuggestion()) return '';

    const value = this._value;
    const suggestion = this._matchedSuggestions[this._currentSuggestionIndex];
    if (value.length < suggestion.length) {
      return this.activeStyle().suggestion.inline(true)
        .render(suggestion.slice(value.length + offset).join(''));
    }
    return '';
  }

  private canAcceptSuggestion(): boolean {
    return this._matchedSuggestions.length > 0;
  }

  private updateSuggestions(): void {
    if (!this.showSuggestions) return;

    if (this._value.length <= 0 || this._suggestions.length <= 0) {
      this._matchedSuggestions = [];
      return;
    }

    const currentValue = this._value.join('').toLowerCase();
    const newMatches: string[][] = [];

    for (const s of this._suggestions) {
      const suggestion = s.join('').toLowerCase();
      if (suggestion.startsWith(currentValue)) {
        newMatches.push([...s.join('')]);  // preserve original case
      }
    }

    // Reset selection index if matches changed
    const matchesChanged = !this.arraysEqual(
      newMatches.map((m) => m.join('')),
      this._matchedSuggestions.map((m) => m.join('')),
    );
    if (matchesChanged) {
      this._currentSuggestionIndex = 0;
    }

    this._matchedSuggestions = newMatches;
  }

  private nextSuggestion(): void {
    this._currentSuggestionIndex = (this._currentSuggestionIndex + 1);
    if (this._currentSuggestionIndex >= this._matchedSuggestions.length) {
      this._currentSuggestionIndex = 0;
    }
  }

  private previousSuggestion(): void {
    this._currentSuggestionIndex = (this._currentSuggestionIndex - 1);
    if (this._currentSuggestionIndex < 0) {
      this._currentSuggestionIndex = Math.max(0, this._matchedSuggestions.length - 1);
    }
  }

  private activeStyle(): StyleState {
    if (this._focus) {
      return this._styles.focused;
    }
    return this._styles.blurred;
  }

  private updateVirtualCursorStyle(): void {
    if (!this._useVirtualCursor) {
      this._virtualCursor.setMode(CursorMode.CursorHide);
      return;
    }

    if (this._styles.cursor.color) {
      this._virtualCursor.style = newStyle().foreground(this._styles.cursor.color);
    }

    if (this._styles.cursor.blink) {
      if (this._styles.cursor.blinkSpeed > 0) {
        this._virtualCursor.blinkSpeed = this._styles.cursor.blinkSpeed;
      }
      this._virtualCursor.setMode(CursorMode.CursorBlink);
      return;
    }
    this._virtualCursor.setMode(CursorMode.CursorStatic);
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

// ── Blink ───────────────────────────────────────────────────────────────────

/** Blink is a command used to initialize cursor blinking. */
export function textInputBlink(): Msg {
  return cursorBlink();
}

// ── Constructor ─────────────────────────────────────────────────────────────

/** Creates a new textinput Model with default settings. */
export function newTextInput(): Model {
  return new Model();
}
