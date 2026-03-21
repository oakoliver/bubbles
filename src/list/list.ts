/**
 * List — feature-rich list browser component.
 *
 * Zero-dependency port of charmbracelet/bubbles/list (Go).
 * Features:
 * - Fuzzy filtering with match highlighting
 * - Pagination (dots / arabic)
 * - Status messages with auto-timeout
 * - Spinner for async activity
 * - Help integration
 * - Customizable item delegates
 * - Infinite scrolling option
 *
 * @module
 */

import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { Batch, Quit } from '@oakoliver/bubbletea';
import { newStyle, stringWidth, truncate, normalBorder } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';

import { Binding, newBinding, withKeys, withHelp, matches } from '../key/key.js';
import type { Help as HelpKeyMap } from '../key/key.js';
import {
  Model as SpinnerModel,
  newSpinner,
  withSpinner as withSpinnerType,
  Line as SpinnerLine,
} from '../spinner/spinner.js';
import type { TickMsg as SpinnerTickMsg } from '../spinner/spinner.js';
import {
  Model as PaginatorModel,
  newPaginator,
  Type as PaginatorType,
} from '../paginator/paginator.js';
import {
  Model as TextInputModel,
  newTextInput,
  textInputBlink,
  defaultStyles as textInputDefaultStyles,
} from '../textinput/textinput.js';
import type { Styles as TextInputStyles } from '../textinput/textinput.js';
import {
  Model as HelpModel,
  newHelp,
} from '../help/help.js';

// ── Constants ───────────────────────────────────────────────────────────────

const bullet = '•';
const ellipsis = '…';

// ── Interfaces & Types ──────────────────────────────────────────────────────

/**
 * Item is an item that appears in the list.
 * FilterValue is the value used when filtering.
 */
export interface Item {
  filterValue(): string;
}

/**
 * DefaultItem extends Item with title and description.
 */
export interface DefaultItem extends Item {
  title(): string;
  description(): string;
}

/**
 * ItemDelegate encapsulates the general functionality for all list items.
 * Separating delegate logic from the item itself allows changing
 * functionality without changing the actual items.
 */
export interface ItemDelegate {
  /** Render the item's view, returning a string. */
  render(m: Model, index: number, item: Item): string;
  /** Height of the list item in lines. */
  height(): number;
  /** Spacing between list items in lines. */
  spacing(): number;
  /** Update loop for items. Called for all messages except when filtering. */
  update(msg: Msg, m: Model): Cmd | null;
  /** Optional: short help bindings (for help.KeyMap compatibility). */
  shortHelp?(): Binding[];
  /** Optional: full help bindings (for help.KeyMap compatibility). */
  fullHelp?(): Binding[][];
}

/** Rank defines a rank for a given item from filtering. */
export interface Rank {
  /** Index of the item in the original input. */
  index: number;
  /** Indices of the actual characters that were matched. */
  matchedIndexes: number[];
}

/** FilterFunc takes a term and target strings, returns sorted ranks. */
export type FilterFunc = (term: string, targets: string[]) => Rank[];

/** FilterState describes the current filtering state. */
export enum FilterState {
  Unfiltered = 0,
  Filtering = 1,
  FilterApplied = 2,
}

/** FilterMatchesMsg contains data about items matched during filtering. */
export interface FilterMatchesMsg {
  readonly type: 'list.filterMatches';
  readonly items: FilteredItem[];
}

interface StatusMessageTimeoutMsg {
  readonly type: 'list.statusMessageTimeout';
}

/** Internal filtered item representation. */
export interface FilteredItem {
  index: number;
  item: Item;
  matches: number[];
}

// ── KeyMap ───────────────────────────────────────────────────────────────────

export interface KeyMap {
  cursorUp: Binding;
  cursorDown: Binding;
  nextPage: Binding;
  prevPage: Binding;
  goToStart: Binding;
  goToEnd: Binding;
  filter: Binding;
  clearFilter: Binding;
  cancelWhileFiltering: Binding;
  acceptWhileFiltering: Binding;
  showFullHelp: Binding;
  closeFullHelp: Binding;
  quit: Binding;
  forceQuit: Binding;
}

export function defaultKeyMap(): KeyMap {
  return {
    cursorUp: newBinding(
      withKeys('up', 'k'),
      withHelp('↑/k', 'up'),
    ),
    cursorDown: newBinding(
      withKeys('down', 'j'),
      withHelp('↓/j', 'down'),
    ),
    prevPage: newBinding(
      withKeys('left', 'h', 'pageup', 'b', 'u'),
      withHelp('←/h/pgup', 'prev page'),
    ),
    nextPage: newBinding(
      withKeys('right', 'l', 'pagedown', 'f', 'd'),
      withHelp('→/l/pgdn', 'next page'),
    ),
    goToStart: newBinding(
      withKeys('home', 'g'),
      withHelp('g/home', 'go to start'),
    ),
    goToEnd: newBinding(
      withKeys('end', 'G'),
      withHelp('G/end', 'go to end'),
    ),
    filter: newBinding(
      withKeys('/'),
      withHelp('/', 'filter'),
    ),
    clearFilter: newBinding(
      withKeys('escape'),
      withHelp('esc', 'clear filter'),
    ),
    cancelWhileFiltering: newBinding(
      withKeys('escape'),
      withHelp('esc', 'cancel'),
    ),
    acceptWhileFiltering: newBinding(
      withKeys('enter', 'tab', 'shift+tab', 'ctrl+k', 'up', 'ctrl+j', 'down'),
      withHelp('enter', 'apply filter'),
    ),
    showFullHelp: newBinding(
      withKeys('?'),
      withHelp('?', 'more'),
    ),
    closeFullHelp: newBinding(
      withKeys('?'),
      withHelp('?', 'close help'),
    ),
    quit: newBinding(
      withKeys('q', 'escape'),
      withHelp('q', 'quit'),
    ),
    forceQuit: newBinding(withKeys('ctrl+c')),
  };
}

// ── Styles ──────────────────────────────────────────────────────────────────

export interface DefaultItemStyles {
  normalTitle: Style;
  normalDesc: Style;
  selectedTitle: Style;
  selectedDesc: Style;
  dimmedTitle: Style;
  dimmedDesc: Style;
  filterMatch: Style;
}

export interface Styles {
  titleBar: Style;
  title: Style;
  spinner: Style;
  filter: TextInputStyles;
  defaultFilterCharacterMatch: Style;
  statusBar: Style;
  statusEmpty: Style;
  statusBarActiveFilter: Style;
  statusBarFilterCount: Style;
  noItems: Style;
  paginationStyle: Style;
  helpStyle: Style;
  activePaginationDot: Style;
  inactivePaginationDot: Style;
  arabicPagination: Style;
  dividerDot: Style;
}

// ── Style constructors ──────────────────────────────────────────────────────

export function defaultStyles(isDark: boolean): Styles {
  const ld = (light: string, dark: string) => isDark ? dark : light;

  const verySubduedColor = ld('#DDDADA', '#3C3C3C');
  const subduedColor = ld('#9B9B9B', '#5C5C5C');

  const titleBar = newStyle().padding(0, 0, 1, 2);
  const title = newStyle().background('62').foreground('230').padding(0, 1);
  const spinner = newStyle().foreground(ld('#8E8E8E', '#747373'));

  const prompt = newStyle().foreground(ld('#04B575', '#ECFD65'));
  const filter = textInputDefaultStyles(isDark);
  // Override filter cursor color and prompt styles
  filter.cursor.color = ld('#EE6FF8', '#EE6FF8');
  filter.blurred.prompt = prompt;
  filter.focused.prompt = prompt;

  return {
    titleBar,
    title,
    spinner,
    filter,
    defaultFilterCharacterMatch: newStyle().underline(true),
    statusBar: newStyle().foreground(ld('#A49FA5', '#777777')).padding(0, 0, 1, 2),
    statusEmpty: newStyle().foreground(subduedColor),
    statusBarActiveFilter: newStyle().foreground(ld('#1a1a1a', '#dddddd')),
    statusBarFilterCount: newStyle().foreground(verySubduedColor),
    noItems: newStyle().foreground(ld('#909090', '#626262')),
    arabicPagination: newStyle().foreground(subduedColor),
    paginationStyle: newStyle().paddingLeft(2),
    helpStyle: newStyle().padding(1, 0, 0, 2),
    activePaginationDot: newStyle()
      .foreground(ld('#847A85', '#979797'))
      .setString(bullet),
    inactivePaginationDot: newStyle()
      .foreground(verySubduedColor)
      .setString(bullet),
    dividerDot: newStyle()
      .foreground(verySubduedColor)
      .setString(' ' + bullet + ' '),
  };
}

export function newDefaultItemStyles(isDark: boolean): DefaultItemStyles {
  const ld = (light: string, dark: string) => isDark ? dark : light;

  const normalTitle = newStyle()
    .foreground(ld('#1a1a1a', '#dddddd'))
    .padding(0, 0, 0, 2);

  const normalDesc = newStyle()
    .foreground(ld('#A49FA5', '#777777'))
    .padding(0, 0, 0, 2);

  const selectedTitle = newStyle()
    .border(normalBorder(), false, false, false, true)
    .borderForeground(ld('#F793FF', '#AD58B4'))
    .foreground(ld('#EE6FF8', '#EE6FF8'))
    .padding(0, 0, 0, 1);

  const selectedDesc = newStyle()
    .border(normalBorder(), false, false, false, true)
    .borderForeground(ld('#F793FF', '#AD58B4'))
    .foreground(ld('#F793FF', '#AD58B4'))
    .padding(0, 0, 0, 1);

  const dimmedTitle = newStyle()
    .foreground(ld('#A49FA5', '#777777'))
    .padding(0, 0, 0, 2);

  const dimmedDesc = newStyle()
    .foreground(ld('#C2B8C2', '#4D4D4D'))
    .padding(0, 0, 0, 2);

  return {
    normalTitle,
    normalDesc,
    selectedTitle,
    selectedDesc,
    dimmedTitle,
    dimmedDesc,
    filterMatch: newStyle().underline(true),
  };
}

// ── Fuzzy filter (zero-dependency) ──────────────────────────────────────────

/**
 * Simple fuzzy matching algorithm. Returns ranks sorted by quality.
 * This replaces sahilm/fuzzy used in the Go original.
 */
export function defaultFilter(term: string, targets: string[]): Rank[] {
  const results: Array<{ index: number; matchedIndexes: number[]; score: number }> = [];
  const lowerTerm = term.toLowerCase();

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const lowerTarget = target.toLowerCase();
    const matched = fuzzyMatch(lowerTerm, lowerTarget);
    if (matched) {
      // Score: prefer earlier matches, consecutive matches, shorter targets
      let score = 0;
      for (let j = 0; j < matched.length; j++) {
        score -= matched[j]; // earlier = better (lower index)
        if (j > 0 && matched[j] === matched[j - 1] + 1) {
          score += 10; // consecutive bonus
        }
      }
      score -= target.length; // shorter = better
      results.push({ index: i, matchedIndexes: matched, score });
    }
  }

  // Sort by score descending (higher is better)
  results.sort((a, b) => b.score - a.score);

  return results.map(r => ({
    index: r.index,
    matchedIndexes: r.matchedIndexes,
  }));
}

/** Returns null if no match, or array of matched character indices. */
function fuzzyMatch(lowerTerm: string, lowerTarget: string): number[] | null {
  if (lowerTerm.length === 0) return [];
  const indices: number[] = [];
  let ti = 0;
  for (let si = 0; si < lowerTarget.length && ti < lowerTerm.length; si++) {
    if (lowerTarget[si] === lowerTerm[ti]) {
      indices.push(si);
      ti++;
    }
  }
  return ti === lowerTerm.length ? indices : null;
}

/** Unsorted filter variant — same matching, no sorting. */
export function unsortedFilter(term: string, targets: string[]): Rank[] {
  const results: Rank[] = [];
  const lowerTerm = term.toLowerCase();

  for (let i = 0; i < targets.length; i++) {
    const matched = fuzzyMatch(lowerTerm, targets[i].toLowerCase());
    if (matched) {
      results.push({ index: i, matchedIndexes: matched });
    }
  }
  return results;
}

// ── StyleRunes (inline — not available in our lipgloss port) ────────────────

/**
 * Apply a "matched" style to specific rune indices, and "unmatched" style
 * to the rest. This replaces lipgloss.StyleRunes from Go.
 */
function styleRunes(
  str: string,
  indices: number[],
  matched: Style,
  unmatched: Style,
): string {
  if (!indices || indices.length === 0) {
    return unmatched.render(str);
  }

  const set = new Set(indices);
  let result = '';
  let buf = '';
  let inMatch = false;

  for (let i = 0; i < str.length; i++) {
    const isMatch = set.has(i);
    if (isMatch !== inMatch && buf.length > 0) {
      result += inMatch ? matched.render(buf) : unmatched.render(buf);
      buf = '';
    }
    inMatch = isMatch;
    buf += str[i];
  }
  if (buf.length > 0) {
    result += inMatch ? matched.render(buf) : unmatched.render(buf);
  }

  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, low: number, high: number): number {
  if (low > high) { const t = low; low = high; high = t; }
  return Math.min(high, Math.max(low, v));
}

function filteredItemsToItems(fi: FilteredItem[]): Item[] {
  return fi.map(f => f.item);
}

function insertItemIntoSlice(items: Item[], item: Item, index: number): Item[] {
  if (items.length === 0) return [item];
  if (index >= items.length) return [...items, item];
  index = Math.max(0, index);
  const result = [...items];
  result.splice(index, 0, item);
  return result;
}

function removeItemFromSlice(items: Item[], index: number): Item[] {
  if (index >= items.length) return items;
  const result = [...items];
  result.splice(index, 1);
  return result;
}

function removeFilterMatchFromSlice(items: FilteredItem[], index: number): FilteredItem[] {
  if (index >= items.length) return items;
  const result = [...items];
  result.splice(index, 1);
  return result;
}

function countEnabledBindings(groups: Binding[][]): number {
  let agg = 0;
  for (const group of groups) {
    for (const kb of group) {
      if (kb.enabled()) agg++;
    }
  }
  return agg;
}

function lipglossWidth(s: string): number {
  return stringWidth(s);
}

function lipglossHeight(s: string): number {
  if (s.length === 0) return 0;
  return s.split('\n').length;
}

// ── DefaultDelegate ─────────────────────────────────────────────────────────

/**
 * DefaultDelegate is a standard delegate designed to work in lists.
 * It renders items with title + optional description, with proper
 * styling for selected, dimmed, and filter-matched states.
 */
export class DefaultDelegate implements ItemDelegate {
  showDescription: boolean;
  styles: DefaultItemStyles;
  updateFunc: ((msg: Msg, m: Model) => Cmd | null) | null;
  shortHelpFunc: (() => Binding[]) | null;
  fullHelpFunc: (() => Binding[][]) | null;
  private _height: number;
  private _spacing: number;

  constructor() {
    this.showDescription = true;
    this.styles = newDefaultItemStyles(true);
    this.updateFunc = null;
    this.shortHelpFunc = null;
    this.fullHelpFunc = null;
    this._height = 2;
    this._spacing = 1;
  }

  setHeight(h: number): void { this._height = h; }

  height(): number {
    return this.showDescription ? this._height : 1;
  }

  setSpacing(s: number): void { this._spacing = s; }

  spacing(): number { return this._spacing; }

  update(msg: Msg, m: Model): Cmd | null {
    if (this.updateFunc) return this.updateFunc(msg, m);
    return null;
  }

  render(m: Model, index: number, item: Item): string {
    let title = '';
    let desc = '';
    const s = this.styles;

    // Check if item implements DefaultItem
    const di = item as Partial<DefaultItem>;
    if (typeof di.title === 'function' && typeof di.description === 'function') {
      title = di.title();
      desc = di.description();
    } else {
      return '';
    }

    if (m.widthValue() <= 0) return '';

    // Prevent text from exceeding list width
    const textwidth = m.widthValue() - s.normalTitle.getPaddingLeft() - s.normalTitle.getPaddingRight();
    title = truncate(title, textwidth);

    if (this.showDescription) {
      const lines: string[] = [];
      const descLines = desc.split('\n');
      for (let i = 0; i < descLines.length && i < this._height - 1; i++) {
        lines.push(truncate(descLines[i], textwidth));
      }
      desc = lines.join('\n');
    }

    // Conditions
    const isSelected = index === m.index();
    const emptyFilter = m.filterState === FilterState.Filtering && m.filterValue() === '';
    const isFiltered = m.filterState === FilterState.Filtering || m.filterState === FilterState.FilterApplied;

    let matchedRunes: number[] | null = null;
    if (isFiltered) {
      matchedRunes = m.matchesForItem(index);
    }

    if (emptyFilter) {
      title = s.dimmedTitle.render(title);
      desc = s.dimmedDesc.render(desc);
    } else if (isSelected && m.filterState !== FilterState.Filtering) {
      if (isFiltered && matchedRunes) {
        const unmatched = s.selectedTitle.inline(true);
        const matched = unmatched.inherit(s.filterMatch);
        title = styleRunes(title, matchedRunes, matched, unmatched);
      }
      title = s.selectedTitle.render(title);
      desc = s.selectedDesc.render(desc);
    } else {
      if (isFiltered && matchedRunes) {
        const unmatched = s.normalTitle.inline(true);
        const matched = unmatched.inherit(s.filterMatch);
        title = styleRunes(title, matchedRunes, matched, unmatched);
      }
      title = s.normalTitle.render(title);
      desc = s.normalDesc.render(desc);
    }

    if (this.showDescription) {
      return title + '\n' + desc;
    }
    return title;
  }

  shortHelp(): Binding[] {
    if (this.shortHelpFunc) return this.shortHelpFunc();
    return [];
  }

  fullHelp(): Binding[][] {
    if (this.fullHelpFunc) return this.fullHelpFunc();
    return [];
  }
}

/** Creates a new DefaultDelegate with default dark styles. */
export function newDefaultDelegate(): DefaultDelegate {
  return new DefaultDelegate();
}

// ── Model ───────────────────────────────────────────────────────────────────

export class Model {
  // ── Public fields ───────────────────────────────────────────────────────
  title: string;
  styles: Styles;
  infiniteScrolling: boolean;
  keyMap: KeyMap;
  filter: FilterFunc;
  filterState: FilterState;
  filterInput: TextInputModel;
  paginator: PaginatorModel;
  help: HelpModel;
  statusMessageLifetime: number; // ms
  additionalShortHelpKeys: (() => Binding[]) | null;
  additionalFullHelpKeys: (() => Binding[]) | null;

  // ── Private fields ──────────────────────────────────────────────────────
  private _showTitle: boolean;
  private _showFilter: boolean;
  private _showStatusBar: boolean;
  private _showPagination: boolean;
  private _showHelp: boolean;
  private _filteringEnabled: boolean;
  private _itemNameSingular: string;
  private _itemNamePlural: string;
  private _disableQuitKeybindings: boolean;
  private _spinner: SpinnerModel;
  private _showSpinner: boolean;
  private _width: number;
  private _height: number;
  private _cursor: number;
  private _statusMessage: string;
  private _statusMessageTimer: ReturnType<typeof setTimeout> | null;
  private _items: Item[];
  private _filteredItems: FilteredItem[];
  private _delegate: ItemDelegate;

  constructor(items: Item[], delegate: ItemDelegate, width: number, height: number) {
    const styles = defaultStyles(true);

    const sp = newSpinner();
    sp.spinner = SpinnerLine;
    sp.style = styles.spinner;

    const fi = newTextInput();
    fi.prompt = 'Filter: ';
    fi.charLimit = 64;
    fi.focus();

    const p = newPaginator();
    p.type = PaginatorType.Dots;
    p.activeDot = styles.activePaginationDot.toString();
    p.inactiveDot = styles.inactivePaginationDot.toString();

    this.title = 'List';
    this.styles = styles;
    this.infiniteScrolling = false;
    this.keyMap = defaultKeyMap();
    this.filter = defaultFilter;
    this.filterState = FilterState.Unfiltered;
    this.filterInput = fi;
    this.paginator = p;
    this.help = newHelp();
    this.statusMessageLifetime = 1000;
    this.additionalShortHelpKeys = null;
    this.additionalFullHelpKeys = null;

    this._showTitle = true;
    this._showFilter = true;
    this._showStatusBar = true;
    this._showPagination = true;
    this._showHelp = true;
    this._filteringEnabled = true;
    this._itemNameSingular = 'item';
    this._itemNamePlural = 'items';
    this._disableQuitKeybindings = false;
    this._spinner = sp;
    this._showSpinner = false;
    this._width = width;
    this._height = height;
    this._cursor = 0;
    this._statusMessage = '';
    this._statusMessageTimer = null;
    this._items = items;
    this._filteredItems = [];
    this._delegate = delegate;

    this._updatePagination();
    this._updateKeybindings();
  }

  // ── Getters / Setters ─────────────────────────────────────────────────

  setFilteringEnabled(v: boolean): void {
    this._filteringEnabled = v;
    if (!v) this._resetFiltering();
    this._updateKeybindings();
  }

  filteringEnabled(): boolean { return this._filteringEnabled; }

  setShowTitle(v: boolean): void { this._showTitle = v; this._updatePagination(); }
  showTitle(): boolean { return this._showTitle; }

  setShowFilter(v: boolean): void { this._showFilter = v; this._updatePagination(); }
  showFilter(): boolean { return this._showFilter; }

  setShowStatusBar(v: boolean): void { this._showStatusBar = v; this._updatePagination(); }
  showStatusBar(): boolean { return this._showStatusBar; }

  setStatusBarItemName(singular: string, plural: string): void {
    this._itemNameSingular = singular;
    this._itemNamePlural = plural;
  }

  statusBarItemName(): [string, string] {
    return [this._itemNameSingular, this._itemNamePlural];
  }

  setShowPagination(v: boolean): void { this._showPagination = v; this._updatePagination(); }
  showPagination(): boolean { return this._showPagination; }

  setShowHelp(v: boolean): void { this._showHelp = v; this._updatePagination(); }
  showHelp(): boolean { return this._showHelp; }

  items(): Item[] { return this._items; }

  setItems(items: Item[]): Cmd | null {
    let cmd: Cmd | null = null;
    this._items = items;
    if (this.filterState !== FilterState.Unfiltered) {
      this._filteredItems = [];
      cmd = this._filterItemsCmd();
    }
    this._updatePagination();
    this._updateKeybindings();
    return cmd;
  }

  select(index: number): void {
    this.paginator.page = Math.floor(index / this.paginator.perPage);
    this._cursor = index % this.paginator.perPage;
  }

  resetSelected(): void { this.select(0); }

  resetFilter(): void { this._resetFiltering(); }

  setItem(index: number, item: Item): Cmd | null {
    let cmd: Cmd | null = null;
    this._items[index] = item;
    if (this.filterState !== FilterState.Unfiltered) {
      cmd = this._filterItemsCmd();
    }
    this._updatePagination();
    return cmd;
  }

  insertItem(index: number, item: Item): Cmd | null {
    let cmd: Cmd | null = null;
    this._items = insertItemIntoSlice(this._items, item, index);
    if (this.filterState !== FilterState.Unfiltered) {
      cmd = this._filterItemsCmd();
    }
    this._updatePagination();
    this._updateKeybindings();
    return cmd;
  }

  removeItem(index: number): void {
    this._items = removeItemFromSlice(this._items, index);
    if (this.filterState !== FilterState.Unfiltered) {
      this._filteredItems = removeFilterMatchFromSlice(this._filteredItems, index);
      if (this._filteredItems.length === 0) this._resetFiltering();
    }
    this._updatePagination();
  }

  setDelegate(d: ItemDelegate): void {
    this._delegate = d;
    this._updatePagination();
  }

  visibleItems(): Item[] {
    if (this.filterState !== FilterState.Unfiltered) {
      return filteredItemsToItems(this._filteredItems);
    }
    return this._items;
  }

  selectedItem(): Item | null {
    const i = this.index();
    const items = this.visibleItems();
    if (i < 0 || items.length === 0 || i >= items.length) return null;
    return items[i];
  }

  matchesForItem(index: number): number[] | null {
    if (!this._filteredItems || index >= this._filteredItems.length) return null;
    return this._filteredItems[index].matches;
  }

  index(): number {
    return this.paginator.page * this.paginator.perPage + this._cursor;
  }

  globalIndex(): number {
    const idx = this.index();
    if (!this._filteredItems || idx >= this._filteredItems.length) return idx;
    return this._filteredItems[idx].index;
  }

  cursor(): number { return this._cursor; }

  widthValue(): number { return this._width; }
  heightValue(): number { return this._height; }

  // ── Navigation ────────────────────────────────────────────────────────

  cursorUp(): void {
    this._cursor--;
    if (this._cursor < 0 && this.paginator.onFirstPage()) {
      if (this.infiniteScrolling) { this.goToEnd(); return; }
      this._cursor = 0;
      return;
    }
    if (this._cursor >= 0) return;
    this.paginator.prevPage();
    this._cursor = this._maxCursorIndex();
  }

  cursorDown(): void {
    const maxIdx = this._maxCursorIndex();
    this._cursor++;
    if (this._cursor <= maxIdx) return;
    if (!this.paginator.onLastPage()) {
      this.paginator.nextPage();
      this._cursor = 0;
      return;
    }
    this._cursor = Math.max(0, maxIdx);
    if (this.infiniteScrolling) this.goToStart();
  }

  goToStart(): void { this.paginator.page = 0; this._cursor = 0; }

  goToEnd(): void {
    this.paginator.page = Math.max(0, this.paginator.totalPages - 1);
    this._cursor = this._maxCursorIndex();
  }

  prevPage(): void {
    this.paginator.prevPage();
    this._cursor = clamp(this._cursor, 0, this._maxCursorIndex());
  }

  nextPage(): void {
    this.paginator.nextPage();
    this._cursor = clamp(this._cursor, 0, this._maxCursorIndex());
  }

  private _maxCursorIndex(): number {
    return Math.max(0, this.paginator.itemsOnPage(this.visibleItems().length) - 1);
  }

  filterValue(): string { return this.filterInput.value(); }

  settingFilter(): boolean { return this.filterState === FilterState.Filtering; }
  isFiltered(): boolean { return this.filterState === FilterState.FilterApplied; }

  // ── Spinner ───────────────────────────────────────────────────────────

  setSpinner(spinner: { frames: string[]; fps: number }): void {
    this._spinner.spinner = spinner;
  }

  toggleSpinner(): Cmd | null {
    if (!this._showSpinner) return this.startSpinner();
    this.stopSpinner();
    return null;
  }

  startSpinner(): Cmd | null {
    this._showSpinner = true;
    return () => Promise.resolve(this._spinner.tickMsg());
  }

  stopSpinner(): void { this._showSpinner = false; }

  disableQuitKeybindings(): void {
    this._disableQuitKeybindings = true;
    this.keyMap.quit.setEnabled(false);
    this.keyMap.forceQuit.setEnabled(false);
  }

  // ── Status message ────────────────────────────────────────────────────

  newStatusMessage(s: string): Cmd | null {
    this._statusMessage = s;
    if (this._statusMessageTimer !== null) {
      clearTimeout(this._statusMessageTimer);
    }
    return () => new Promise<Msg>((resolve) => {
      this._statusMessageTimer = setTimeout(() => {
        resolve({ type: 'list.statusMessageTimeout' } as StatusMessageTimeoutMsg);
      }, this.statusMessageLifetime);
    });
  }

  // ── Size ──────────────────────────────────────────────────────────────

  setWidth(v: number): void { this.setSize(v, this._height); }
  setHeight(v: number): void { this.setSize(this._width, v); }

  setSize(width: number, height: number): void {
    const promptWidth = lipglossWidth(this.styles.title.render(this.filterInput.prompt));
    this._width = width;
    this._height = height;
    this.help.setWidth(width);
    this.filterInput.setWidth(width - promptWidth - lipglossWidth(this._spinnerView()));
    this._updatePagination();
    this._updateKeybindings();
  }

  setFilterText(filter: string): void {
    this.filterState = FilterState.Filtering;
    this.filterInput.setValue(filter);
    // Synchronously run filter
    const items = this._items;
    const targets = items.map(it => it.filterValue());
    const ranks = this.filter(this.filterInput.value(), targets);
    this._filteredItems = ranks.map(r => ({
      index: r.index,
      item: items[r.index],
      matches: r.matchedIndexes,
    }));
    this.filterState = FilterState.FilterApplied;
    this.goToStart();
    this.filterInput.cursorEnd();
    this._updatePagination();
    this._updateKeybindings();
  }

  setFilterState(state: FilterState): void {
    this.goToStart();
    this.filterState = state;
    this.filterInput.cursorEnd();
    this.filterInput.focus();
    this._updateKeybindings();
  }

  // ── Private internal methods ──────────────────────────────────────────

  private _resetFiltering(): void {
    if (this.filterState === FilterState.Unfiltered) return;
    this.filterState = FilterState.Unfiltered;
    this.filterInput.reset();
    this._filteredItems = [];
    this._updatePagination();
    this._updateKeybindings();
  }

  private _itemsAsFilterItems(): FilteredItem[] {
    return this._items.map((item, i) => ({
      index: i,
      item,
      matches: [],
    }));
  }

  private _updateKeybindings(): void {
    switch (this.filterState) {
      case FilterState.Filtering:
        this.keyMap.cursorUp.setEnabled(false);
        this.keyMap.cursorDown.setEnabled(false);
        this.keyMap.nextPage.setEnabled(false);
        this.keyMap.prevPage.setEnabled(false);
        this.keyMap.goToStart.setEnabled(false);
        this.keyMap.goToEnd.setEnabled(false);
        this.keyMap.filter.setEnabled(false);
        this.keyMap.clearFilter.setEnabled(false);
        this.keyMap.cancelWhileFiltering.setEnabled(true);
        this.keyMap.acceptWhileFiltering.setEnabled(this.filterInput.value() !== '');
        this.keyMap.quit.setEnabled(false);
        this.keyMap.showFullHelp.setEnabled(false);
        this.keyMap.closeFullHelp.setEnabled(false);
        break;

      default: {
        const hasItems = this._items.length !== 0;
        this.keyMap.cursorUp.setEnabled(hasItems);
        this.keyMap.cursorDown.setEnabled(hasItems);

        const hasPages = this.paginator.totalPages > 1;
        this.keyMap.nextPage.setEnabled(hasPages);
        this.keyMap.prevPage.setEnabled(hasPages);

        this.keyMap.goToStart.setEnabled(hasItems);
        this.keyMap.goToEnd.setEnabled(hasItems);

        this.keyMap.filter.setEnabled(this._filteringEnabled && hasItems);
        this.keyMap.clearFilter.setEnabled(this.filterState === FilterState.FilterApplied);
        this.keyMap.cancelWhileFiltering.setEnabled(false);
        this.keyMap.acceptWhileFiltering.setEnabled(false);
        this.keyMap.quit.setEnabled(!this._disableQuitKeybindings);

        if (this.help.showAll) {
          this.keyMap.showFullHelp.setEnabled(true);
          this.keyMap.closeFullHelp.setEnabled(true);
        } else {
          const minHelp = countEnabledBindings(this.fullHelp()) > 1;
          this.keyMap.showFullHelp.setEnabled(minHelp);
          this.keyMap.closeFullHelp.setEnabled(minHelp);
        }
        break;
      }
    }
  }

  private _updatePagination(): void {
    const index = this.index();
    let availHeight = this._height;

    if (this._showTitle || (this._showFilter && this._filteringEnabled)) {
      availHeight -= lipglossHeight(this._titleView());
    }
    if (this._showStatusBar) {
      availHeight -= lipglossHeight(this._statusView());
    }
    if (this._showPagination) {
      availHeight -= lipglossHeight(this._paginationView());
    }
    if (this._showHelp) {
      availHeight -= lipglossHeight(this._helpView());
    }

    this.paginator.perPage = Math.max(
      1,
      Math.floor(availHeight / (this._delegate.height() + this._delegate.spacing())),
    );

    const pages = this.visibleItems().length;
    if (pages < 1) {
      this.paginator.setTotalPages(1);
    } else {
      this.paginator.setTotalPages(pages);
    }

    // Restore index
    this.paginator.page = Math.floor(index / this.paginator.perPage);
    this._cursor = index % this.paginator.perPage;

    // Stay in bounds
    if (this.paginator.page >= this.paginator.totalPages - 1) {
      this.paginator.page = Math.max(0, this.paginator.totalPages - 1);
    }
  }

  private _hideStatusMessage(): void {
    this._statusMessage = '';
    if (this._statusMessageTimer !== null) {
      clearTimeout(this._statusMessageTimer);
      this._statusMessageTimer = null;
    }
  }

  private _filterItemsCmd(): Cmd {
    return () => {
      const filterVal = this.filterInput.value();
      if (filterVal === '' || this.filterState === FilterState.Unfiltered) {
        return Promise.resolve({
          type: 'list.filterMatches',
          items: this._itemsAsFilterItems(),
        } as FilterMatchesMsg);
      }

      const items = this._items;
      const targets = items.map(it => it.filterValue());
      const ranks = this.filter(filterVal, targets);
      const filtered: FilteredItem[] = ranks.map(r => ({
        index: r.index,
        item: items[r.index],
        matches: r.matchedIndexes,
      }));

      return Promise.resolve({
        type: 'list.filterMatches',
        items: filtered,
      } as FilterMatchesMsg);
    };
  }

  // ── Update ────────────────────────────────────────────────────────────

  update(msg: Msg): [Model, Cmd | null] {
    const cmds: (Cmd | null)[] = [];
    const m = msg as Record<string, unknown>;

    if (m && typeof m === 'object' && ('type' in m || '_tag' in m)) {
      // ForceQuit
      if ((m.type === 'keyPress' || m._tag === 'KeyPressMsg') && matches(msg, this.keyMap.forceQuit)) {
        return [this, Quit];
      }

      // Filter matches
      if (m.type === 'list.filterMatches') {
        this._filteredItems = (msg as FilterMatchesMsg).items;
        return [this, null];
      }

      // Spinner tick
      if (m.type === 'spinner.tick') {
        const [newSpinner, cmd] = this._spinner.update(msg);
        this._spinner = newSpinner;
        if (this._showSpinner) cmds.push(cmd);
      }

      // Status message timeout
      if (m.type === 'list.statusMessageTimeout') {
        this._hideStatusMessage();
      }
    }

    if (this.filterState === FilterState.Filtering) {
      cmds.push(this._handleFiltering(msg));
    } else {
      cmds.push(this._handleBrowsing(msg));
    }

    return [this, Batch(...cmds.filter((c): c is Cmd => c !== null))];
  }

  private _handleBrowsing(msg: Msg): Cmd | null {
    const m = msg as Record<string, unknown>;
    if (m && typeof m === 'object' && (m.type === 'keyPress' || m._tag === 'KeyPressMsg')) {
      // Note: clear filter before quit (both map to escape by default)
      if (matches(msg, this.keyMap.clearFilter)) {
        this._resetFiltering();
      } else if (matches(msg, this.keyMap.quit)) {
        return Quit;
      } else if (matches(msg, this.keyMap.cursorUp)) {
        this.cursorUp();
      } else if (matches(msg, this.keyMap.cursorDown)) {
        this.cursorDown();
      } else if (matches(msg, this.keyMap.prevPage)) {
        this.paginator.prevPage();
      } else if (matches(msg, this.keyMap.nextPage)) {
        this.paginator.nextPage();
      } else if (matches(msg, this.keyMap.goToStart)) {
        this.goToStart();
      } else if (matches(msg, this.keyMap.goToEnd)) {
        this.goToEnd();
      } else if (matches(msg, this.keyMap.filter)) {
        this._hideStatusMessage();
        if (this.filterInput.value() === '') {
          this._filteredItems = this._itemsAsFilterItems();
        }
        this.goToStart();
        this.filterState = FilterState.Filtering;
        this.filterInput.cursorEnd();
        this.filterInput.focus();
        this._updateKeybindings();
        return () => Promise.resolve(textInputBlink());
      } else if (matches(msg, this.keyMap.showFullHelp) || matches(msg, this.keyMap.closeFullHelp)) {
        this.help.showAll = !this.help.showAll;
        this._updatePagination();
      }
    }

    const cmd = this._delegate.update(msg, this);
    this._cursor = clamp(this._cursor, 0, this._maxCursorIndex());
    return cmd;
  }

  private _handleFiltering(msg: Msg): Cmd | null {
    const cmds: (Cmd | null)[] = [];
    const m = msg as Record<string, unknown>;

    if (m && typeof m === 'object' && (m.type === 'keyPress' || m._tag === 'KeyPressMsg')) {
      if (matches(msg, this.keyMap.cancelWhileFiltering)) {
        this._resetFiltering();
        this.keyMap.filter.setEnabled(true);
        this.keyMap.clearFilter.setEnabled(false);
      } else if (matches(msg, this.keyMap.acceptWhileFiltering)) {
        this._hideStatusMessage();
        if (this._items.length > 0) {
          const h = this.visibleItems();
          if (h.length === 0) {
            this._resetFiltering();
          } else {
            this.filterInput.blur();
            this.filterState = FilterState.FilterApplied;
            this._updateKeybindings();
            if (this.filterInput.value() === '') {
              this._resetFiltering();
            }
          }
        }
      }
    }

    // Update the filter text input
    const oldValue = this.filterInput.value();
    const [newInput, inputCmd] = this.filterInput.update(msg);
    const filterChanged = oldValue !== newInput.value();
    this.filterInput = newInput;
    cmds.push(inputCmd);

    // If filtering input changed, request updated filtering
    if (filterChanged) {
      cmds.push(this._filterItemsCmd());
      this.keyMap.acceptWhileFiltering.setEnabled(this.filterInput.value() !== '');
    }

    this._updatePagination();
    return Batch(...cmds.filter((c): c is Cmd => c !== null));
  }

  // ── Help interface ────────────────────────────────────────────────────

  shortHelp(): Binding[] {
    const kb: Binding[] = [this.keyMap.cursorUp, this.keyMap.cursorDown];
    const filtering = this.filterState === FilterState.Filtering;

    if (!filtering && this._delegate.shortHelp) {
      kb.push(...this._delegate.shortHelp());
    }

    kb.push(
      this.keyMap.filter,
      this.keyMap.clearFilter,
      this.keyMap.acceptWhileFiltering,
      this.keyMap.cancelWhileFiltering,
    );

    if (!filtering && this.additionalShortHelpKeys) {
      kb.push(...this.additionalShortHelpKeys());
    }

    kb.push(this.keyMap.quit, this.keyMap.showFullHelp);
    return kb;
  }

  fullHelp(): Binding[][] {
    const kb: Binding[][] = [[
      this.keyMap.cursorUp,
      this.keyMap.cursorDown,
      this.keyMap.nextPage,
      this.keyMap.prevPage,
      this.keyMap.goToStart,
      this.keyMap.goToEnd,
    ]];

    const filtering = this.filterState === FilterState.Filtering;

    if (!filtering && this._delegate.fullHelp) {
      kb.push(...this._delegate.fullHelp());
    }

    const listBindings: Binding[] = [
      this.keyMap.filter,
      this.keyMap.clearFilter,
      this.keyMap.acceptWhileFiltering,
      this.keyMap.cancelWhileFiltering,
    ];

    if (!filtering && this.additionalFullHelpKeys) {
      listBindings.push(...this.additionalFullHelpKeys());
    }

    kb.push(listBindings);
    kb.push([this.keyMap.quit, this.keyMap.closeFullHelp]);
    return kb;
  }

  // ── View methods ──────────────────────────────────────────────────────

  view(): string {
    const sections: string[] = [];
    let availHeight = this._height;

    if (this._showTitle || (this._showFilter && this._filteringEnabled)) {
      const v = this._titleView();
      sections.push(v);
      availHeight -= lipglossHeight(v);
    }

    if (this._showStatusBar) {
      const v = this._statusView();
      sections.push(v);
      availHeight -= lipglossHeight(v);
    }

    let pagination = '';
    if (this._showPagination) {
      pagination = this._paginationView();
      availHeight -= lipglossHeight(pagination);
    }

    let helpStr = '';
    if (this._showHelp) {
      helpStr = this._helpView();
      availHeight -= lipglossHeight(helpStr);
    }

    const content = newStyle().height(availHeight).render(this._populatedView());
    sections.push(content);

    if (this._showPagination) sections.push(pagination);
    if (this._showHelp) sections.push(helpStr);

    return sections.join('\n');
  }

  private _titleView(): string {
    let view = '';
    let titleBarStyle = this.styles.titleBar;

    const spinnerView = this._spinnerView();
    const spinnerWidth = lipglossWidth(spinnerView);
    const spinnerLeftGap = ' ';
    const spinnerOnLeft = titleBarStyle.getPaddingLeft() >= spinnerWidth + lipglossWidth(spinnerLeftGap)
      && this._showSpinner;

    if (this._showFilter && this.filterState === FilterState.Filtering) {
      view += this.filterInput.view();
    } else if (this._showTitle) {
      if (this._showSpinner && spinnerOnLeft) {
        view += spinnerView + spinnerLeftGap;
        const titleBarGap = titleBarStyle.getPaddingLeft();
        titleBarStyle = titleBarStyle.paddingLeft(
          titleBarGap - spinnerWidth - lipglossWidth(spinnerLeftGap),
        );
      }

      view += this.styles.title.render(this.title);

      // Status message
      if (this.filterState !== FilterState.Filtering) {
        view += '  ' + this._statusMessage;
        view = truncate(view, this._width - spinnerWidth);
      }
    }

    // Spinner on the right
    if (this._showSpinner && !spinnerOnLeft) {
      const availSpace = this._width - lipglossWidth(this.styles.titleBar.render(view));
      if (availSpace > spinnerWidth) {
        view += ' '.repeat(availSpace - spinnerWidth);
        view += spinnerView;
      }
    }

    if (view.length > 0) {
      return titleBarStyle.render(view);
    }
    return view;
  }

  private _statusView(): string {
    let status = '';
    const totalItems = this._items.length;
    const visibleItems = this.visibleItems().length;

    const itemName = visibleItems !== 1
      ? this._itemNamePlural
      : this._itemNameSingular;

    const itemsDisplay = `${visibleItems} ${itemName}`;

    if (this.filterState === FilterState.Filtering) {
      if (visibleItems === 0) {
        status = this.styles.statusEmpty.render('Nothing matched');
      } else {
        status = itemsDisplay;
      }
    } else if (this._items.length === 0) {
      status = this.styles.statusEmpty.render('No ' + this._itemNamePlural);
    } else {
      const filtered = this.filterState === FilterState.FilterApplied;
      if (filtered) {
        let f = this.filterInput.value().trim();
        if (stringWidth(f) > 10) f = truncate(f, 10);
        status += `\u201C${f}\u201D `;
      }
      status += itemsDisplay;
    }

    const numFiltered = totalItems - visibleItems;
    if (numFiltered > 0) {
      status += this.styles.dividerDot.toString();
      status += this.styles.statusBarFilterCount.render(`${numFiltered} filtered`);
    }

    return this.styles.statusBar.render(status);
  }

  private _paginationView(): string {
    if (this.paginator.totalPages < 2) return '';

    let s = this.paginator.view();

    // If dot pagination is wider than window, use arabic
    if (stringWidth(s) > this._width) {
      this.paginator.type = PaginatorType.Arabic;
      s = this.styles.arabicPagination.render(this.paginator.view());
    }

    let style = this.styles.paginationStyle;
    if (this._delegate.spacing() === 0 && style.getMarginTop() === 0) {
      style = style.marginTop(1);
    }

    return style.render(s);
  }

  private _populatedView(): string {
    const items = this.visibleItems();

    if (items.length === 0) {
      if (this.filterState === FilterState.Filtering) return '';
      return this.styles.noItems.render('No ' + this._itemNamePlural + '.');
    }

    const parts: string[] = [];
    const [start, end] = this.paginator.getSliceBounds(items.length);
    const docs = items.slice(start, end);

    for (let i = 0; i < docs.length; i++) {
      parts.push(this._delegate.render(this, i + start, docs[i]));
      if (i !== docs.length - 1) {
        parts.push('\n'.repeat(this._delegate.spacing() + 1));
      }
    }

    // Fill remaining space on last page
    const itemsOnPage = this.paginator.itemsOnPage(items.length);
    if (itemsOnPage < this.paginator.perPage) {
      let n = (this.paginator.perPage - itemsOnPage)
        * (this._delegate.height() + this._delegate.spacing());
      if (items.length === 0) n -= this._delegate.height() - 1;
      parts.push('\n'.repeat(n));
    }

    return parts.join('');
  }

  private _helpView(): string {
    return this.styles.helpStyle.render(this.help.view(this));
  }

  private _spinnerView(): string {
    return this._spinner.view();
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/** Creates a new list Model with sensible defaults. */
export function newList(
  items: Item[],
  delegate: ItemDelegate,
  width: number,
  height: number,
): Model {
  return new Model(items, delegate, width, height);
}
