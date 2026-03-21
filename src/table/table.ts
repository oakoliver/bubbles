/**
 * Table — tabular data display component.
 *
 * Zero-dependency port of charmbracelet/bubbles/table (Go).
 * Features:
 * - Column-based table layout with headers
 * - Row selection with keyboard navigation
 * - Page up/down, half-page, goto top/bottom
 * - Focus/blur support
 * - Help view integration
 * - FromValues string parsing
 *
 * @module
 */

import type { Cmd, Msg } from '@oakoliver/bubbletea';
import {
  newStyle,
  joinHorizontal,
  joinVertical,
  Top,
  Left,
  truncate,
  stringWidth,
} from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { Binding, newBinding, withKeys, withHelp, matches } from '../key/key.js';
import {
  Model as ViewportModel,
  newViewport,
  withHeight as vpWithHeight,
} from '../viewport/viewport.js';
import { Model as HelpModel, newHelp } from '../help/help.js';

// ── Types ───────────────────────────────────────────────────────────────────

/** A single row of string values. */
export type Row = string[];

/** Column defines a table column's title and width. */
export interface Column {
  title: string;
  width: number;
}

/** Option configures a table Model during construction. */
export type Option = (m: Model) => void;

/** KeyMap defines keybindings for table navigation. */
export interface KeyMap {
  lineUp: Binding;
  lineDown: Binding;
  pageUp: Binding;
  pageDown: Binding;
  halfPageUp: Binding;
  halfPageDown: Binding;
  gotoTop: Binding;
  gotoBottom: Binding;
}

/** Styles contains style definitions for the table. */
export interface Styles {
  header: Style;
  cell: Style;
  selected: Style;
}

// ── KeyMap helpers (implements help.KeyMap interface) ────────────────────────

/** Returns the short help bindings for the table keymap. */
function shortHelpBindings(km: KeyMap): Binding[] {
  return [km.lineUp, km.lineDown];
}

/** Returns the full help bindings for the table keymap. */
function fullHelpBindings(km: KeyMap): Binding[][] {
  return [
    [km.lineUp, km.lineDown, km.gotoTop, km.gotoBottom],
    [km.pageUp, km.pageDown, km.halfPageUp, km.halfPageDown],
  ];
}

// ── Defaults ────────────────────────────────────────────────────────────────

/** Returns the default keybindings for the table. */
export function defaultKeyMap(): KeyMap {
  return {
    lineUp: newBinding(
      withKeys('up', 'k'),
      withHelp('↑/k', 'up'),
    ),
    lineDown: newBinding(
      withKeys('down', 'j'),
      withHelp('↓/j', 'down'),
    ),
    pageUp: newBinding(
      withKeys('b', 'pgup'),
      withHelp('b/pgup', 'page up'),
    ),
    pageDown: newBinding(
      withKeys('f', 'pgdown', ' '),
      withHelp('f/pgdn', 'page down'),
    ),
    halfPageUp: newBinding(
      withKeys('u', 'ctrl+u'),
      withHelp('u', '½ page up'),
    ),
    halfPageDown: newBinding(
      withKeys('d', 'ctrl+d'),
      withHelp('d', '½ page down'),
    ),
    gotoTop: newBinding(
      withKeys('home', 'g'),
      withHelp('g/home', 'go to start'),
    ),
    gotoBottom: newBinding(
      withKeys('end', 'G'),
      withHelp('G/end', 'go to end'),
    ),
  };
}

/** Returns the default styles for the table. */
export function defaultStyles(): Styles {
  return {
    selected: newStyle().bold(true).foreground('212'),
    header: newStyle().bold(true).padding(0, 1),
    cell: newStyle().padding(0, 1),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, low: number, high: number): number {
  return Math.min(Math.max(v, low), high);
}

/**
 * Truncate a string to a max visual width, appending a tail string if truncated.
 * Equivalent to Go's `ansi.Truncate(s, width, "…")`.
 */
function truncateWithTail(s: string, maxWidth: number, tail: string): string {
  if (stringWidth(s) <= maxWidth) return s;
  const tailWidth = stringWidth(tail);
  if (maxWidth <= tailWidth) return tail.slice(0, maxWidth);
  return truncate(s, maxWidth - tailWidth) + tail;
}

/**
 * Count newlines in a string (equivalent to lipgloss.Height).
 */
function lipglossHeight(s: string): number {
  if (s.length === 0) return 0;
  return s.split('\n').length;
}

// ── Model ───────────────────────────────────────────────────────────────────

export class Model {
  keyMap: KeyMap;
  help: HelpModel;

  private _cols: Column[];
  private _rows: Row[];
  private _cursor: number;
  private _focus: boolean;
  private _styles: Styles;
  private _viewport: ViewportModel;
  private _start: number;
  private _end: number;

  constructor() {
    this.keyMap = defaultKeyMap();
    this.help = newHelp();
    this._cols = [];
    this._rows = [];
    this._cursor = 0;
    this._focus = false;
    this._styles = defaultStyles();
    this._viewport = newViewport(vpWithHeight(20));
    this._start = 0;
    this._end = 0;
  }

  // ── Update ──────────────────────────────────────────────────────────────

  update(msg: Msg): [Model, Cmd | null] {
    if (!this._focus) {
      return [this, null];
    }

    if (msg && typeof msg === 'object' && ('type' in msg && (msg as any).type === 'keyPress' || (msg as any)._tag === 'KeyPressMsg')) {
      const km = this.keyMap;

      if (matches(msg, km.lineUp)) {
        this.moveUp(1);
      } else if (matches(msg, km.lineDown)) {
        this.moveDown(1);
      } else if (matches(msg, km.pageUp)) {
        this.moveUp(this._viewport.height());
      } else if (matches(msg, km.pageDown)) {
        this.moveDown(this._viewport.height());
      } else if (matches(msg, km.halfPageUp)) {
        this.moveUp(Math.floor(this._viewport.height() / 2));
      } else if (matches(msg, km.halfPageDown)) {
        this.moveDown(Math.floor(this._viewport.height() / 2));
      } else if (matches(msg, km.gotoTop)) {
        this.gotoTop();
      } else if (matches(msg, km.gotoBottom)) {
        this.gotoBottom();
      }
    }

    return [this, null];
  }

  // ── View ────────────────────────────────────────────────────────────────

  view(): string {
    return this.headersView() + '\n' + this._viewport.view();
  }

  /** Renders the help menu from the keymap. */
  helpView(): string {
    // Create an adapter that satisfies the help.KeyMap interface
    const km = this.keyMap;
    const adapter = {
      shortHelp: () => shortHelpBindings(km),
      fullHelp: () => fullHelpBindings(km),
    };
    return this.help.view(adapter);
  }

  // ── Focus ───────────────────────────────────────────────────────────────

  focused(): boolean {
    return this._focus;
  }

  focus(): void {
    this._focus = true;
    this.updateViewport();
  }

  blur(): void {
    this._focus = false;
    this.updateViewport();
  }

  // ── Viewport management ─────────────────────────────────────────────────

  updateViewport(): void {
    const renderedRows: string[] = [];

    // Render only rows from: m.cursor-m.viewport.Height to: m.cursor+m.viewport.Height
    // Constant runtime, independent of number of rows in a table.
    if (this._cursor >= 0) {
      this._start = clamp(this._cursor - this._viewport.height(), 0, this._cursor);
    } else {
      this._start = 0;
    }
    this._end = clamp(
      this._cursor + this._viewport.height(),
      this._cursor,
      this._rows.length,
    );

    for (let i = this._start; i < this._end; i++) {
      renderedRows.push(this.renderRow(i));
    }

    this._viewport.setContent(
      joinVertical(Left, ...renderedRows),
    );
  }

  // ── Row/Column accessors ────────────────────────────────────────────────

  selectedRow(): Row | null {
    if (this._cursor < 0 || this._cursor >= this._rows.length) {
      return null;
    }
    return this._rows[this._cursor];
  }

  rows(): Row[] {
    return this._rows;
  }

  columns(): Column[] {
    return this._cols;
  }

  setRows(r: Row[]): void {
    this._rows = r;
    if (this._cursor > this._rows.length - 1) {
      this._cursor = this._rows.length - 1;
    }
    this.updateViewport();
  }

  setColumns(c: Column[]): void {
    this._cols = c;
    this.updateViewport();
  }

  setWidth(w: number): void {
    this._viewport.setWidth(w);
    this.updateViewport();
  }

  setHeight(h: number): void {
    this._viewport.setHeight(h - lipglossHeight(this.headersView()));
    this.updateViewport();
  }

  height(): number {
    return this._viewport.height();
  }

  width(): number {
    return this._viewport.width();
  }

  cursor(): number {
    return this._cursor;
  }

  setCursor(n: number): void {
    this._cursor = clamp(n, 0, this._rows.length - 1);
    this.updateViewport();
  }

  // ── Styles ──────────────────────────────────────────────────────────────

  setStyles(s: Styles): void {
    this._styles = s;
    this.updateViewport();
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  moveUp(n: number): void {
    this._cursor = clamp(this._cursor - n, 0, this._rows.length - 1);

    let offset = this._viewport.yOffset();
    if (this._start === 0) {
      offset = clamp(offset, 0, this._cursor);
    } else if (this._start < this._viewport.height()) {
      offset = clamp(clamp(offset + n, 0, this._cursor), 0, this._viewport.height());
    } else if (offset >= 1) {
      offset = clamp(offset + n, 1, this._viewport.height());
    }
    this._viewport.setYOffset(offset);
    this.updateViewport();
  }

  moveDown(n: number): void {
    this._cursor = clamp(this._cursor + n, 0, this._rows.length - 1);
    this.updateViewport();

    let offset = this._viewport.yOffset();
    if (this._end === this._rows.length && offset > 0) {
      offset = clamp(offset - n, 1, this._viewport.height());
    } else if (this._cursor > (this._end - this._start) / 2 && offset > 0) {
      offset = clamp(offset - n, 1, this._cursor);
    } else if (offset > 1) {
      // no-op
    } else if (this._cursor > offset + this._viewport.height() - 1) {
      offset = clamp(offset + 1, 0, 1);
    }
    this._viewport.setYOffset(offset);
  }

  gotoTop(): void {
    this.moveUp(this._cursor);
  }

  gotoBottom(): void {
    this.moveDown(this._rows.length);
  }

  // ── FromValues ──────────────────────────────────────────────────────────

  /**
   * Create table rows from a delimited string.
   * Uses `\n` for row separation and the given separator for fields.
   */
  fromValues(value: string, separator: string): void {
    const rows: Row[] = [];
    for (const line of value.split('\n')) {
      const r: Row = [];
      for (const field of line.split(separator)) {
        r.push(field);
      }
      rows.push(r);
    }
    this.setRows(rows);
  }

  // ── Private rendering ─────────────────────────────────────────────────

  private headersView(): string {
    const s: string[] = [];
    for (const col of this._cols) {
      if (col.width <= 0) continue;
      const style = newStyle().width(col.width).maxWidth(col.width).inline(true);
      const renderedCell = style.render(truncateWithTail(col.title, col.width, '…'));
      s.push(this._styles.header.render(renderedCell));
    }
    return joinHorizontal(Top, ...s);
  }

  private renderRow(r: number): string {
    const s: string[] = [];
    for (let i = 0; i < this._rows[r].length; i++) {
      if (this._cols[i].width <= 0) continue;
      const style = newStyle().width(this._cols[i].width).maxWidth(this._cols[i].width).inline(true);
      const renderedCell = this._styles.cell.render(
        style.render(truncateWithTail(this._rows[r][i], this._cols[i].width, '…')),
      );
      s.push(renderedCell);
    }

    const row = joinHorizontal(Top, ...s);

    if (r === this._cursor) {
      return this._styles.selected.render(row);
    }

    return row;
  }
}

// ── Options ─────────────────────────────────────────────────────────────────

/** Sets the table columns (headers). */
export function withColumns(cols: Column[]): Option {
  return (m: Model) => {
    (m as any)._cols = cols;
  };
}

/** Sets the table rows (data). */
export function withRows(rows: Row[]): Option {
  return (m: Model) => {
    (m as any)._rows = rows;
  };
}

/** Sets the height of the table. */
export function withHeight(h: number): Option {
  return (m: Model) => {
    (m as any)._viewport.setHeight(h - lipglossHeight((m as any).headersView()));
  };
}

/** Sets the width of the table. */
export function withWidth(w: number): Option {
  return (m: Model) => {
    (m as any)._viewport.setWidth(w);
  };
}

/** Sets the focus state of the table. */
export function withFocused(f: boolean): Option {
  return (m: Model) => {
    (m as any)._focus = f;
  };
}

/** Sets the table styles. */
export function withStyles(s: Styles): Option {
  return (m: Model) => {
    (m as any)._styles = s;
  };
}

/** Sets the key map. */
export function withKeyMap(km: KeyMap): Option {
  return (m: Model) => {
    m.keyMap = km;
  };
}

// ── Constructor ─────────────────────────────────────────────────────────────

/** Creates a new table Model. */
export function newTable(...opts: Option[]): Model {
  const m = new Model();
  for (const opt of opts) {
    opt(m);
  }
  m.updateViewport();
  return m;
}
