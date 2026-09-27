/**
 * Tree node — port of charmbracelet/bubbles/tree/node.go (v2.2.1).
 *
 * A Node implements the (internally ported) lipgloss tree Node interface and
 * uses a lipgloss tree as its rendering layer.
 *
 * @module
 */

import { joinHorizontal, height as lipglossHeight, Top } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { Tree, treeRoot, newTree } from '../internal/ltree.js';
import type {
  Children,
  Enumerator,
  Indenter,
  Node as LNode,
} from '../internal/ltree.js';
import { defaultDarkStyles, resolveStyles } from './styles.js';
import type { ResolvedStyles, StyleFunc } from './styles.js';

/** @internal Options shared by every node of a tree model. */
export interface ItemOptions {
  openCharacter: string;
  closedCharacter: string;
  treeYOffset: number;
  styles: ResolvedStyles;
}

function defaultItemOptions(): ItemOptions {
  return {
    openCharacter: '',
    closedCharacter: '',
    treeYOffset: 0,
    styles: resolveStyles(defaultDarkStyles()),
  };
}

/** Nodes is a list of tree nodes. */
export class Nodes {
  readonly items: readonly Node[];

  constructor(items: readonly Node[]) {
    this.items = items;
  }

  /**
   * Returns the node at the index (`undefined` when out of range at runtime).
   */
  at(index: number): Node {
    return this.items[index];
  }

  /** Returns the number of nodes. */
  length(): number {
    return this.items.length;
  }
}

function toNodes(children: Children): Nodes {
  const items: Node[] = [];
  for (let i = 0; i < children.length(); i++) {
    items.push(children.at(i) as Node);
  }
  return new Nodes(items);
}

/** Node is a node in the tree. Node implements lipgloss's tree Node. */
export class Node implements LNode {
  /** @internal The lipgloss tree used as the rendering layer. */
  _tree: Tree;

  /** @internal Vertical offset of the node, in nodes. */
  _yOffset: number = 0;

  /**
   * @internal Vertical offset of the node in rendered lines. It differs from
   * `_yOffset` when nodes span multiple lines.
   */
  _lineOffset: number = 0;

  /** @internal True for every Node created with `root()` / `newNode()`. */
  _isRoot: boolean = false;
  /** @internal */ _initialClosed: boolean = false;
  /** @internal */ _open: boolean = false;

  /** @internal The value passed to the node. */
  _value: unknown = undefined;

  /** @internal */ _opts: ItemOptions = defaultItemOptions();

  constructor() {
    this._tree = newTree();
  }

  /** Returns the rendered open/closed symbol. */
  indicator(): string {
    let char = this._open ? this._opts.openCharacter : this._opts.closedCharacter;
    if (char !== '') char += ' ';
    return this._opts.styles.openIndicatorStyle.render(char);
  }

  /** Returns whether this item is selected. */
  isSelected(): boolean {
    return this._yOffset === this._opts.treeYOffset;
  }

  /** Returns the number of nodes in the tree. A closed child counts as 1. */
  size(): number {
    return this.allNodes().length;
  }

  /** Returns the number of rendered lines of the node. */
  height(): number {
    return lipglossHeight(this.toString());
  }

  /** Returns the vertical offset of the node in rendered lines. */
  lineOffset(): number {
    return this._lineOffset;
  }

  /** Returns the vertical offset of the node. */
  yOffset(): number {
    return this._yOffset;
  }

  /** Closes the node. */
  close(): Node {
    this._initialClosed = true;
    this._open = false;
    // Reset the offset to 0,0 first.
    this._tree.offset(0, 0);
    this._tree.offset(this._tree.children().length(), 0);
    return this;
  }

  /** Opens the node. */
  open(): Node {
    this._initialClosed = false;
    this._open = true;
    this._tree.offset(0, 0);
    return this;
  }

  /** Returns whether the node is open. */
  isOpen(): boolean {
    return this._open;
  }

  /** Renders the node's tree. */
  toString(): string {
    return this._tree.toString();
  }

  /** @internal */
  _getStyle(): Style {
    const s = this._opts.styles;
    if (this._yOffset === this._opts.treeYOffset) {
      return s._selectedNodeFunc(new Nodes([this]), 0);
    } else if (this._yOffset === 0) {
      return s._rootNodeFunc(new Nodes([this]), 0);
    } else if (this._isRoot) {
      return s._parentNodeFunc(new Nodes([this]), 0);
    }
    return s._nodeFunc(new Nodes([this]), 0);
  }

  /** @internal */
  _getEnumeratorStyle(): Style {
    const s = this._opts.styles;
    if (this._yOffset === this._opts.treeYOffset) {
      return s._selectedEnumeratorFunc(new Nodes([this]), 0);
    }
    return s._enumeratorFunc(new Nodes([this]), 0);
  }

  /** @internal */
  _getIndenterStyle(): Style {
    return this._opts.styles._indenterFunc(new Nodes([this]), 0);
  }

  /** Returns the rendered root name of this node. */
  value(): string {
    const ns = this._getStyle();
    const v = ns.render(this._tree.value());
    if (this._isRoot) {
      return joinHorizontal(Top, this.indicator(), v);
    }
    // Leaf.
    return v;
  }

  /** Returns the value passed to the node. */
  givenValue(): unknown {
    return this._value;
  }

  /** Sets the value of the node. */
  setValue(value: unknown): void {
    this._value = value;
  }

  /** Returns the children of an item. */
  children(): Children {
    return this._tree.children();
  }

  /** Returns the children of an item as nodes. */
  childNodes(): Node[] {
    const res: Node[] = [];
    const children = this._tree.children();
    for (let i = 0; i < children.length(); i++) {
      res.push(children.at(i) as Node);
    }
    return res;
  }

  /** Returns all descendant nodes (including this one) as a flat list. */
  allNodes(): Node[] {
    const res: Node[] = [this];
    const children = this._tree.children();
    for (let i = 0; i < children.length(); i++) {
      res.push(...(children.at(i) as Node).allNodes());
    }
    return res;
  }

  /** Returns whether this item is hidden. */
  hidden(): boolean {
    return this._tree.hidden();
  }

  /** Hides/shows a tree node. */
  setHidden(hidden: boolean): void {
    this._tree.setHidden(hidden);
  }

  /** Sets a static style for all items. */
  itemStyle(s: Style): Node {
    this._tree.itemStyle(s);
    return this;
  }

  /** Sets the item style function. Use this for conditional styling. */
  itemStyleFunc(f: StyleFunc): Node {
    this._tree.itemStyleFunc((children, i) => f(toNodes(children), i));
    return this;
  }

  /** Sets the enumerator implementation (the branch indicators). */
  enumerator(enumerator: Enumerator): Node {
    this._tree.enumerator(enumerator);
    return this;
  }

  /** Sets the indenter implementation. */
  indenter(indenter: Indenter): Node {
    this._tree.indenter(indenter);
    return this;
  }

  /** Sets a static style for all enumerators. */
  enumeratorStyle(style: Style): Node {
    this._tree.enumeratorStyle(style);
    return this;
  }

  /** Sets the enumeration style function. Use this for conditional styling. */
  enumeratorStyleFunc(f: StyleFunc): Node {
    this._tree.enumeratorStyleFunc((children, i) => f(toNodes(children), i));
    return this;
  }

  /** Sets a static style for all indenters. */
  indenterStyle(style: Style): Node {
    this._tree.indenterStyle(style);
    return this;
  }

  /** Sets the indenter style function. Use this for conditional styling. */
  indenterStyleFunc(f: StyleFunc): Node {
    this._tree.indenterStyleFunc((children, i) => f(toNodes(children), i));
    return this;
  }

  /** Sets a style for the root element. */
  rootStyle(style: Style): Node {
    this._tree.rootStyle(style);
    return this;
  }

  /**
   * Adds children to this tree. Non-Node values become leaf nodes.
   *
   *     root('Foo').child(root('Bar').child('Baz'), 'Qux')
   */
  child(...children: unknown[]): Node {
    for (const child of children) {
      if (child instanceof Node) {
        this._tree.child(child);
      } else {
        const item = new Node();
        item._opts.styles = resolveStyles(defaultDarkStyles());
        item._tree = treeRoot(child);
        item._open = false;
        item._value = child;
        this._tree.child(item);
      }
      // Close the node again as the number of children has changed.
      if (this._initialClosed) this.close();
    }
    return this;
  }
}

/** Returns a new node. */
export function newNode(): Node {
  const t = new Node();
  t._opts.styles = resolveStyles(defaultDarkStyles());
  t._open = true;
  t._isRoot = true;
  t._tree = newTree();
  return t;
}

/** Returns a new tree with the root set. */
export function root(value: unknown): Node {
  const t = newNode();
  t._value = value;
  t._tree = treeRoot(value);
  return t;
}

