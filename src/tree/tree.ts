/**
 * Tree — a navigable, collapsible tree component.
 *
 * Zero-dependency port of charmbracelet/bubbles/tree (Go, v2.2.1).
 * Features:
 * - Keyboard navigation (line, page, half-page, top/bottom)
 * - Open / close / toggle sub-trees
 * - Scroll-off margin around the selected node
 * - Multi-line nodes
 * - Customisable enumerators, indenters, styles and characters
 * - Integrated short / full help
 *
 * @module
 */

import type { Cmd, Msg } from '@oakoliver/bubbletea';
import {
  joinHorizontal,
  joinVertical,
  width as lipglossWidth,
  height as lipglossHeight,
  newStyle,
  stripAnsi,
  Left,
} from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { newBinding, withKeys, withHelp, matches } from '../key/key.js';
import type { Binding } from '../key/key.js';
import { Model as HelpModel, newHelp } from '../help/help.js';
import { Model as ViewportModel, newViewport } from '../viewport/viewport.js';
import type { KeyMap as ViewportKeyMap } from '../viewport/viewport.js';
import type { Enumerator, Indenter } from '../internal/ltree.js';
import { Node, Nodes, newNode } from './node.js';
import type { ItemOptions } from './node.js';
import { defaultDarkStyles, resolveStyles } from './styles.js';
import type { ResolvedStyles, Styles } from './styles.js';

const SPACEBAR = ' ';

// ── KeyMap ──────────────────────────────────────────────────────────────────

/** Key bindings for different actions within the tree. */
export interface KeyMap {
  down: Binding;
  up: Binding;
  pageDown: Binding;
  pageUp: Binding;
  halfPageUp: Binding;
  halfPageDown: Binding;
  goToTop: Binding;
  goToBottom: Binding;

  toggle: Binding;
  open: Binding;
  close: Binding;

  // Help toggle keybindings.
  showFullHelp: Binding;
  closeFullHelp: Binding;
}

/** Returns the default set of key bindings for navigating the tree. */
export function defaultKeyMap(): KeyMap {
  return {
    down: newBinding(withKeys('down', 'j', 'ctrl+n'), withHelp('↓/j', 'down')),
    up: newBinding(withKeys('up', 'k', 'ctrl+p'), withHelp('↑/k', 'up')),
    pageDown: newBinding(withKeys('pgdown', SPACEBAR, 'f'), withHelp('f/pgdn', 'page down')),
    pageUp: newBinding(withKeys('pgup', 'b'), withHelp('b/pgup', 'page up')),
    halfPageDown: newBinding(withKeys('d', 'ctrl+d'), withHelp('d', '½ page down')),
    halfPageUp: newBinding(withKeys('u', 'ctrl+u'), withHelp('u', '½ page up')),
    goToTop: newBinding(withKeys('g', 'home'), withHelp('g', 'top')),
    goToBottom: newBinding(withKeys('G', 'shift+g', 'end'), withHelp('G', 'bottom')),

    toggle: newBinding(withKeys('enter'), withHelp('⏎', 'toggle')),
    open: newBinding(withKeys('l', 'right'), withHelp('→/l', 'open')),
    close: newBinding(withKeys('h', 'left'), withHelp('←/h', 'close')),

    showFullHelp: newBinding(withKeys('?'), withHelp('?', 'more')),
    closeFullHelp: newBinding(withKeys('?'), withHelp('?', 'close help')),
  };
}

// ── Model ───────────────────────────────────────────────────────────────────

/** Model is the Bubble Tea model for the tree element. */
export class Model {
  /** Keybindings recognized by the widget. */
  keyMap: KeyMap;
  /** Help model. */
  help: HelpModel;

  private _showHelp: boolean = true;
  /** Minimal number of lines to keep visible above and below the selection. */
  private _scrollOff: number = 5;
  private _openCharacter: string = '▼';
  private _closedCharacter: string = '▶';
  private _cursorCharacter: string = '→';
  private _styles: ResolvedStyles;

  private _additionalShortHelpKeys: (() => Binding[]) | null = null;
  private _additionalFullHelpKeys: (() => Binding[]) | null = null;

  private _root: Node | null;

  private _enumerator: Enumerator | null = null;
  private _indenter: Indenter | null = null;

  private _viewport: ViewportModel;
  private _width: number = 0;
  private _height: number = 0;
  /** Vertical offset of the selected node. */
  private _yOffset: number = 0;

  constructor(t: Node | null, width: number, height: number) {
    const vp = newViewport();
    vp.keyMap = {} as ViewportKeyMap;
    this.keyMap = defaultKeyMap();
    this.help = newHelp();
    this._root = t;
    this._viewport = vp;
    this._styles = resolveStyles(defaultDarkStyles());

    if (this._root === null) {
      this._root = newNode();
    }

    this.setStyles(defaultDarkStyles());
    this.setSize(width, height);
    if (this._root !== null) {
      this._setYOffsets();
      this._updateStyles();
      this._updateViewport(0);
    }
  }

  // ── Update / View ───────────────────────────────────────────────────────

  /** Bubble Tea update loop. */
  update(msg: Msg): [Model, Cmd | null] {
    const m = msg as Record<string, unknown>;
    if (m && typeof m === 'object' && (m.type === 'keyPress' || m._tag === 'KeyPressMsg')) {
      const km = this.keyMap;
      if (matches(m, km.down)) {
        this.down();
      } else if (matches(m, km.up)) {
        this.up();
      } else if (matches(m, km.pageDown)) {
        this.pageDown();
      } else if (matches(m, km.pageUp)) {
        this.pageUp();
      } else if (matches(m, km.halfPageDown)) {
        this.halfPageDown();
      } else if (matches(m, km.halfPageUp)) {
        this.halfPageUp();
      } else if (matches(m, km.goToTop)) {
        this.goToTop();
      } else if (matches(m, km.goToBottom)) {
        this.goToBottom();
      } else if (matches(m, km.toggle)) {
        this.toggleCurrentNode();
      } else if (matches(m, km.open)) {
        this.openCurrentNode();
      } else if (matches(m, km.close)) {
        this.closeCurrentNode();
      } else if (matches(m, km.showFullHelp) || matches(m, km.closeFullHelp)) {
        this.help.showAll = !this.help.showAll;
      }
    }
    return [this, null];
  }

  /** Renders the component. */
  view(): string {
    const sections: string[] = [this._viewport.view()];
    if (this._showHelp) {
      sections.push(this._helpView());
    }
    return joinVertical(Left, ...sections);
  }

  // ── Configuration ───────────────────────────────────────────────────────

  /** Sets the minimal number of lines to keep visible around the selection. */
  setScrollOff(val: number): void {
    this._scrollOff = val;
  }

  /** Sets the character used to represent an open node. */
  setOpenCharacter(character: string): void {
    this._openCharacter = character;
  }

  /** Sets the character used to represent a closed node. */
  setClosedCharacter(character: string): void {
    this._closedCharacter = character;
  }

  /** Sets the character used to represent the cursor. */
  setCursorCharacter(character: string): void {
    this._cursorCharacter = character;
  }

  /** Sets the tree to the given root node. */
  setNodes(t: Node | null): void {
    this._root = t;
    if (this._root !== null) {
      this._root._value = this._root.givenValue();
      if (this._enumerator !== null) this._root.enumerator(this._enumerator);
      if (this._indenter !== null) this._root.indenter(this._indenter);
    }
    this._setYOffsets();
    this._updateStyles();
    this._setRootStyles();
    this._updateViewport(0);
  }

  /** Sets additional key mappings for the full help view. */
  setAdditionalFullHelpKeys(val: (() => Binding[]) | null): void {
    this._additionalFullHelpKeys = val;
  }

  /** Sets additional key mappings for the short help view. */
  setAdditionalShortHelpKeys(val: (() => Binding[]) | null): void {
    this._additionalShortHelpKeys = val;
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  /** Moves the selection down by one item. */
  down(): void { this._updateViewport(1); }

  /** Moves the selection up by one item. */
  up(): void { this._updateViewport(-1); }

  /** Moves the selection down by one page. */
  pageDown(): void { this._updateViewport(this._viewport.height()); }

  /** Moves the selection up by one page. */
  pageUp(): void { this._updateViewport(-this._viewport.height()); }

  /** Moves the selection down by half a page. */
  halfPageDown(): void { this._updateViewport(Math.trunc(this._viewport.height() / 2)); }

  /** Moves the selection up by half a page. */
  halfPageUp(): void { this._updateViewport(Math.trunc(-this._viewport.height() / 2)); }

  /** Moves the selection to the top of the tree. */
  goToTop(): void { this._updateViewport(-this._yOffset); }

  /** Moves the selection to the bottom of the tree. */
  goToBottom(): void {
    if (this._root === null) return;
    this._updateViewport(this._root.size());
  }

  /** Toggles the current node open/close state. */
  toggleCurrentNode(): void {
    const node = this._currentNode();
    if (node === null) return;
    this._toggleNode(node, !node.isOpen());
  }

  /** Opens the currently selected node. */
  openCurrentNode(): void {
    const node = this._currentNode();
    if (node === null) return;
    this._toggleNode(node, true);
  }

  /** Closes the currently selected node. */
  closeCurrentNode(): void {
    const node = this._currentNode();
    if (node === null) return;
    this._toggleNode(node, false);
  }

  private _currentNode(): Node | null {
    if (this._root === null) return null;
    return findNode(this._root, this._yOffset);
  }

  private _toggleNode(node: Node, open: boolean): void {
    node._open = open;

    // Reset the offset to 0,0 first.
    node._tree.offset(0, 0);
    if (!open) {
      node._tree.offset(node._tree.children().length(), 0);
    }
    this._setYOffsets();
    this._updateViewport(0);
  }

  private _updateViewport(movement: number): void {
    if (this._root === null) return;

    this._yOffset = Math.max(Math.min(this._root.size() - 1, this._yOffset + movement), 0);
    this._updateStyles();

    const cursor = this._cursorView();
    this._viewport.setContent(
      joinHorizontal(
        Left,
        cursor,
        this._styles.treeStyle.width(this._width).maxWidth(this._width).render(this._root.toString()),
      ),
    );

    // If this is the initial render, make sure we show the root node.
    if (this._yOffset === 0 && movement === 0) return;

    // The scroll-off is computed against the selected node's position in
    // rendered lines, which accounts for nodes that span multiple lines.
    const selected = findNode(this._root, this._yOffset);
    if (selected === null) return;
    const lineOffset = selected._lineOffset;

    // Make sure there are enough lines above and below the selected node.
    const height = this._viewport.visibleLineCount();
    const scrolloff = Math.min(this._scrollOff, Math.trunc(height / 2));
    const minTop = Math.max(lineOffset - scrolloff, 0);
    const minBottom = Math.min(this._viewport.totalLineCount() - 1, lineOffset + scrolloff);

    if (this._viewport.yOffset() > minTop) {
      // Reveal more lines above.
      this._viewport.setYOffset(minTop);
    } else if (this._viewport.yOffset() + height < minBottom + 1) {
      // Reveal more lines below.
      this._viewport.setYOffset(minBottom - height + 1);
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────

  /** Sets the styles for this component. */
  setStyles(styles: Styles): void {
    this._styles = resolveStyles(styles);
    this._setRootStyles();

    // setSize takes into account the width/height of the style frame sizes.
    this.setSize(this._width, this._height);
    this._updateViewport(0);
  }

  private _setRootStyles(): void {
    if (this._root === null) return;
    // The renderer may query indices past the end of the children list once
    // hidden siblings are dropped (upstream panics there); fall back to an
    // unstyled style in that case.
    this._root.enumeratorStyleFunc((children: Nodes, i: number) =>
      children.at(i)?._getEnumeratorStyle() ?? newStyle());
    this._root.indenterStyleFunc((children: Nodes, i: number) =>
      children.at(i)?._getIndenterStyle() ?? newStyle());
    this._root.itemStyleFunc((children: Nodes, i: number) =>
      children.at(i)?._getStyle() ?? newStyle());
  }

  /** Shows or hides the help view. */
  setShowHelp(v: boolean): void {
    this._showHelp = v;
    this.setSize(this._width, this._height);
  }

  // ── Size ────────────────────────────────────────────────────────────────

  /** Returns the current width setting. */
  width(): number { return this._width; }

  /** Returns the current height setting. */
  height(): number { return this._height; }

  /** Sets the width of this component. */
  setWidth(width: number): void { this.setSize(width, this._height); }

  /** Sets the height of this component. */
  setHeight(height: number): void { this.setSize(this._width, height); }

  /** Sets the width and height of this component. */
  setSize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    if (this._root !== null) {
      this._root._tree.width(
        width - lipglossWidth(this._cursorView()) - this._styles.treeStyle.getHorizontalFrameSize(),
      );
    }

    this._viewport.setWidth(width);
    let hv = 0;
    if (this._showHelp) {
      hv = lipglossHeight(this._helpView());
    }
    this._viewport.setHeight(height - hv);
    this.help.setWidth(width);
  }

  // ── Help ────────────────────────────────────────────────────────────────

  /** Bindings to show in the abbreviated help view (help.KeyMap). */
  shortHelp(): Binding[] {
    const kb: Binding[] = [this.keyMap.down, this.keyMap.up, this.keyMap.toggle];
    if (this._additionalShortHelpKeys !== null) {
      kb.push(...this._additionalShortHelpKeys());
    }
    kb.push(this.keyMap.showFullHelp);
    return kb;
  }

  /** Bindings to show in the full help view (help.KeyMap). */
  fullHelp(): Binding[][] {
    const kb: Binding[][] = [
      [this.keyMap.down, this.keyMap.up, this.keyMap.open, this.keyMap.close, this.keyMap.toggle],
      [this.keyMap.pageDown, this.keyMap.pageUp, this.keyMap.halfPageDown, this.keyMap.halfPageUp],
      [this.keyMap.goToTop, this.keyMap.goToBottom],
    ];
    if (this._additionalFullHelpKeys !== null) {
      kb.push(this._additionalFullHelpKeys());
    }
    kb.push([this.keyMap.closeFullHelp]);
    return kb;
  }

  private _cursorView(): string {
    if (this._cursorCharacter === '' || this._root === null) return '';
    const cursor = Array.from({ length: this._root.height() }, () => ' ');
    const node = findNode(this._root, this._yOffset);
    if (node !== null && node._lineOffset >= 0 && node._lineOffset < cursor.length) {
      cursor[node._lineOffset] = this._cursorCharacter;
    }
    return this._styles.cursorStyle.render(joinVertical(Left, ...cursor));
  }

  private _helpView(): string {
    return this._styles.helpStyle.render(this.help.view(this));
  }

  // ── Nodes ───────────────────────────────────────────────────────────────

  /** Returns the root node of the tree. Equivalent to `node(0)`. */
  root(): Node | null {
    return this._root;
  }

  /** Returns all nodes in the tree as a flat list. */
  allNodes(): Node[] {
    if (this._root === null) return [];
    return this._root.allNodes();
  }

  private _setYOffsets(): void {
    if (this._root !== null) setYOffsets(this._root);
  }

  /** Returns the vertical offset of the tree's viewport. */
  viewportYOffset(): number {
    return this._viewport.yOffset();
  }

  /** Sets the vertical offset of the tree's viewport. */
  setViewportYOffset(yoffset: number): void {
    this._viewport.setYOffset(yoffset);
  }

  /**
   * Returns the vertical offset of the selected node. Useful for scrolling to
   * the selected node using a viewport.
   */
  yOffset(): number {
    return this._yOffset;
  }

  /** Selects the node at the given vertical offset and scrolls to it. */
  setYOffset(yoffset: number): void {
    this._updateViewport(yoffset - this._yOffset);
  }

  /** Returns the item at the given yOffset. */
  node(yoffset: number): Node | null {
    if (this._root === null) return null;
    return findNode(this._root, yoffset);
  }

  /** Returns the item at the current yOffset. */
  nodeAtCurrentOffset(): Node | null {
    return this._currentNode();
  }

  /** Sets the enumerator for the tree. */
  enumerator(enumerator: Enumerator): Model {
    this._enumerator = enumerator;
    if (this._root !== null) this._root.enumerator(enumerator);
    return this;
  }

  /** Sets the indenter for the tree. */
  indenter(indenter: Indenter): Model {
    this._indenter = indenter;
    if (this._root !== null) this._root.indenter(indenter);
    return this;
  }

  /**
   * Since the selected node changes, the style functions' captured yOffset
   * must be refreshed.
   */
  private _updateStyles(): void {
    const opts = this._getItemOpts();
    if (this._root !== null) {
      this._root._opts = opts;
      const rs = this._rootStyle();
      this._root.rootStyle(rs);

      const val = this._root._value;
      let rootStr: string;
      if (typeof val === 'string') {
        rootStr = rs.render(stripAnsi(val));
      } else {
        rootStr = rs.render(val === null || val === undefined ? '' : String(val));
      }
      rootStr = joinHorizontal(Left, this._root.indicator(), rootStr);
      this._root._tree.setValue(rootStr);
    }

    for (const item of this.allNodes()) {
      item._opts = opts;
    }
  }

  private _getItemOpts(): ItemOptions {
    return {
      openCharacter: this._openCharacter,
      closedCharacter: this._closedCharacter,
      treeYOffset: this._yOffset,
      styles: this._styles,
    };
  }

  private _rootStyle(): Style {
    const root = this._root!;
    const nodes = new Nodes([root]);
    if (root._yOffset === this._yOffset) {
      return this._styles._rootNodeFunc(nodes, 0).inherit(this._styles._selectedNodeFunc(nodes, 0));
    }
    return this._styles._rootNodeFunc(nodes, 0);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Updates each node's yOffset based on how many items are above it, and its
 * lineOffset based on how many rendered lines are above it (accounting for
 * nodes that span multiple lines).
 */
function setYOffsets(t: Node): void {
  const children = t._tree.children();
  let above = 0;
  let linesAbove = 0;
  for (let i = 0; i < children.length(); i++) {
    const child = children.at(i);
    if (child instanceof Node) {
      child._yOffset = t._yOffset + above + i + 1;
      child._lineOffset = t._lineOffset + linesAbove + i + 1;
      setYOffsets(child);
      above += child.size() - 1;
      linesAbove += child.height() - 1;
    }
  }
}

/** Depth-first search for the node with the given yOffset. */
function findNode(t: Node, yOffset: number): Node | null {
  if (t._yOffset === yOffset) return t;

  const children = t._tree.children();
  for (let i = 0; i < children.length(); i++) {
    const child = children.at(i);
    if (child instanceof Node) {
      const found = findNode(child, yOffset);
      if (found !== null) return found;
    }
  }
  return null;
}

// ── Factory ─────────────────────────────────────────────────────────────────

/** Creates a new tree model with default settings. */
export function newTree(t: Node | null, width: number, height: number): Model {
  return new Model(t, width, height);
}
