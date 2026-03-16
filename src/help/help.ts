/**
 * Help — auto-generated help view from keybindings.
 *
 * Zero-dependency port of charmbracelet/bubbles/help (Go).
 * Renders short (single line) or full (multi-column) help text
 * from keybinding definitions, with graceful width truncation.
 *
 * @module
 */

import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { newStyle, stringWidth, joinHorizontal, Top } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import type { Binding } from '../key/key.js';

// ── Interfaces ──────────────────────────────────────────────────────────────

/**
 * KeyMap provides keybinding information to the help view.
 * Implement this interface on your component's keymap.
 */
export interface KeyMap {
  /** Returns bindings for the short (single-line) help view. */
  shortHelp(): Binding[];
  /** Returns groups of bindings for the full (multi-column) help view. */
  fullHelp(): Binding[][];
}

/**
 * Style definitions for the help view.
 */
export interface Styles {
  ellipsis: Style;

  // Short help styles
  shortKey: Style;
  shortDesc: Style;
  shortSeparator: Style;

  // Full help styles
  fullKey: Style;
  fullDesc: Style;
  fullSeparator: Style;
}

// ── Default Styles ──────────────────────────────────────────────────────────

/**
 * Returns default styles. Pass isDark=true for dark backgrounds.
 */
export function defaultStyles(isDark: boolean): Styles {
  const pick = (light: string, dark: string): string => isDark ? dark : light;

  const keyStyle = newStyle().foreground(pick('#909090', '#626262'));
  const descStyle = newStyle().foreground(pick('#B2B2B2', '#4A4A4A'));
  const sepStyle = newStyle().foreground(pick('#DADADA', '#3C3C3C'));

  return {
    shortKey: keyStyle,
    shortDesc: descStyle,
    shortSeparator: sepStyle,
    ellipsis: sepStyle,
    fullKey: keyStyle,
    fullDesc: descStyle,
    fullSeparator: sepStyle,
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

// ── Model ───────────────────────────────────────────────────────────────────

/**
 * Help view model. Use `newHelp()` to create.
 */
export class Model {
  /** Whether to show the full help (multi-column). */
  showAll: boolean;

  /** Separator between items in short help view. */
  shortSeparator: string;
  /** Separator between columns in full help view. */
  fullSeparator: string;
  /** Ellipsis shown when items are truncated. */
  ellipsis: string;

  /** Style definitions. */
  styles: Styles;

  /** Maximum width. */
  private _width: number;

  constructor() {
    this.showAll = false;
    this.shortSeparator = ' \u2022 '; // " • "
    this.fullSeparator = '    ';
    this.ellipsis = '\u2026'; // "…"
    this.styles = defaultDarkStyles();
    this._width = 0;
  }

  /** No-op to satisfy the tea.Model interface. */
  update(_msg: Msg): [Model, Cmd | null] {
    return [this, null];
  }

  /**
   * Renders the help view using the given KeyMap.
   * Shows short or full help depending on showAll.
   */
  view(k: KeyMap): string {
    if (this.showAll) {
      return this.fullHelpView(k.fullHelp());
    }
    return this.shortHelpView(k.shortHelp());
  }

  /** Sets the maximum width for the help view. */
  setWidth(w: number): void {
    this._width = w;
  }

  /** Returns the maximum width. */
  width(): number {
    return this._width;
  }

  /**
   * Renders a single-line help view from a list of keybindings.
   * Gracefully truncates with ellipsis when items exceed width.
   */
  shortHelpView(bindings: Binding[]): string {
    if (bindings.length === 0) return '';

    let result = '';
    let totalWidth = 0;
    const separator = this.styles.shortSeparator.inline(true).render(this.shortSeparator);

    for (let i = 0; i < bindings.length; i++) {
      const kb = bindings[i];
      if (!kb.enabled()) continue;

      // Separator
      let sep = '';
      if (totalWidth > 0 && i < bindings.length) {
        sep = separator;
      }

      // Item
      const h = kb.help();
      const str =
        sep +
        this.styles.shortKey.inline(true).render(h.key) +
        ' ' +
        this.styles.shortDesc.inline(true).render(h.desc);
      const w = stringWidth(str);

      // Check if it fits
      const [tail, ok] = this._shouldAddItem(totalWidth, w);
      if (!ok) {
        if (tail) result += tail;
        break;
      }

      totalWidth += w;
      result += str;
    }

    return result;
  }

  /**
   * Renders multi-column help from groups of keybindings.
   * Each group becomes a column.
   */
  fullHelpView(groups: Binding[][]): string {
    if (groups.length === 0) return '';

    const out: string[] = [];
    let totalWidth = 0;
    const separator = this.styles.fullSeparator.inline(true).render(this.fullSeparator);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (!group || !shouldRenderColumn(group)) continue;

      // Separator
      let sep = '';
      if (totalWidth > 0 && i < groups.length) {
        sep = separator;
      }

      // Separate keys and descriptions
      const keys: string[] = [];
      const descriptions: string[] = [];
      for (const kb of group) {
        if (!kb.enabled()) continue;
        const h = kb.help();
        keys.push(h.key);
        descriptions.push(h.desc);
      }

      // Build column
      const col = joinHorizontal(
        Top,
        sep,
        this.styles.fullKey.render(keys.join('\n')),
        ' ',
        this.styles.fullDesc.render(descriptions.join('\n')),
      );
      const w = stringWidth(col);

      // Check if it fits
      const [tail, ok] = this._shouldAddItem(totalWidth, w);
      if (!ok) {
        if (tail) out.push(tail);
        break;
      }

      totalWidth += w;
      out.push(col);
    }

    return joinHorizontal(Top, ...out);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _shouldAddItem(totalWidth: number, width: number): [string, boolean] {
    if (this._width > 0 && totalWidth + width > this._width) {
      const tail =
        ' ' + this.styles.ellipsis.inline(true).render(this.ellipsis);

      if (totalWidth + stringWidth(tail) < this._width) {
        return [tail, false];
      }
    }
    return ['', true];
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a new help model with sensible defaults.
 */
export function newHelp(): Model {
  return new Model();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function shouldRenderColumn(bindings: Binding[]): boolean {
  for (const b of bindings) {
    if (b.enabled()) return true;
  }
  return false;
}
