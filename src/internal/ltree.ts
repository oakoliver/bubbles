/**
 * Internal port of charmbracelet/lipgloss/v2/tree (v2.0.5).
 *
 * `@oakoliver/lipgloss` does not ship a tree module, and Bubbles' tree
 * component uses lipgloss' tree as its rendering layer, so the renderer is
 * ported here verbatim (zero dependencies beyond `@oakoliver/lipgloss`).
 *
 * @module
 */

import {
  newStyle,
  joinHorizontal,
  joinVertical,
  width as lipglossWidth,
  height as lipglossHeight,
  Left,
  Top,
} from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';

// ── Node / Children ─────────────────────────────────────────────────────────

/** Node defines a node in a tree. */
export interface Node {
  toString(): string;
  value(): string;
  children(): Children;
  hidden(): boolean;
  setHidden(hidden: boolean): void;
  setValue(value: unknown): void;
}

/** Children is the interface that wraps the basic methods of a tree model. */
export interface Children {
  /** Returns the content item of the given index. */
  at(index: number): Node | null;
  /** Returns the number of children in the tree. */
  length(): number;
}

/** Implementation of the Children interface with tree Nodes. */
export class NodeChildren implements Children {
  readonly nodes: readonly Node[];

  constructor(nodes: readonly Node[] = []) {
    this.nodes = nodes;
  }

  /** Appends a child to the list of children. */
  append(child: Node): NodeChildren {
    return new NodeChildren([...this.nodes, child]);
  }

  /** Removes a child from the list at the given index. */
  remove(index: number): NodeChildren {
    if (index < 0 || this.nodes.length < index + 1) return this;
    return new NodeChildren([
      ...this.nodes.slice(0, index),
      ...this.nodes.slice(index + 1),
    ]);
  }

  length(): number {
    return this.nodes.length;
  }

  at(i: number): Node | null {
    if (i >= 0 && i < this.nodes.length) return this.nodes[i];
    return null;
  }
}

/** Returns a Children of string leaves. */
export function newStringData(...data: string[]): Children {
  return new NodeChildren(data.map((d) => new Leaf(d, false)));
}

/**
 * Filter applies a filter on some data. You could use this to create a new
 * tree whose values all satisfy the condition provided in the filter function.
 */
export class Filter implements Children {
  private _data: Children;
  private _filter: (index: number) => boolean = () => true;

  constructor(data: Children) {
    this._data = data;
  }

  /** Returns the item at the given index, relative to the filtered results. */
  at(index: number): Node | null {
    let j = 0;
    for (let i = 0; i < this._data.length(); i++) {
      if (this._filter(i)) {
        if (j === index) return this._data.at(i);
        j++;
      }
    }
    return null;
  }

  /** Sets the condition all data must satisfy to be in the tree. */
  filter(f: (index: number) => boolean): Filter {
    this._filter = f;
    return this;
  }

  length(): number {
    let j = 0;
    for (let i = 0; i < this._data.length(); i++) {
      if (this._filter(i)) j++;
    }
    return j;
  }
}

/** Initializes a new Filter. */
export function newFilter(data: Children): Filter {
  return new Filter(data);
}

// ── Value helpers ───────────────────────────────────────────────────────────

function isNode(v: unknown): v is Node {
  return typeof v === 'object' && v !== null
    && typeof (v as Node).value === 'function'
    && typeof (v as Node).children === 'function'
    && typeof (v as Node).hidden === 'function';
}

function isChildren(v: unknown): v is Children {
  return typeof v === 'object' && v !== null
    && typeof (v as Children).at === 'function'
    && typeof (v as Children).length === 'function'
    && !isNode(v);
}

/** True when the value carries its own string representation (fmt.Stringer). */
function isStringer(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  return typeof (v as { toString?: unknown }).toString === 'function'
    && (v as { toString: unknown }).toString !== Object.prototype.toString;
}

/** Mirrors Go's value → string conversion used by Leaf/Tree roots. */
export function valueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

// ── Leaf ────────────────────────────────────────────────────────────────────

/** Leaf is a node without children. */
export class Leaf implements Node {
  private _value: string = '';
  private _hidden: boolean = false;

  constructor(value: unknown = '', hidden: boolean = false) {
    this.setValue(value);
    this.setHidden(hidden);
  }

  /** Children of a Leaf node are always empty. */
  children(): Children {
    return new NodeChildren();
  }

  value(): string {
    return this._value;
  }

  setValue(value: unknown): void {
    this._value = valueToString(value);
  }

  hidden(): boolean {
    return this._hidden;
  }

  setHidden(hidden: boolean): void {
    this._hidden = hidden;
  }

  toString(): string {
    return this.value();
  }
}

/** Returns a new Leaf. */
export function newLeaf(value: unknown, hidden: boolean): Leaf {
  return new Leaf(value, hidden);
}

// ── Enumerators / Indenters ─────────────────────────────────────────────────

/** StyleFunc allows the tree to be styled per item. */
export type StyleFunc = (children: Children, i: number) => Style;

/**
 * Enumerator enumerates a tree. Typically, this is used to draw the branches
 * for the tree nodes and is different for the last child.
 */
export type Enumerator = (children: Children, index: number) => string;

/** Indenter indents the children of a tree. */
export type Indenter = (children: Children, index: number) => string;

/**
 * Enumerates a tree.
 *
 * ├── Foo
 * └── Qux
 */
export function defaultEnumerator(children: Children, index: number): string {
  if (children.length() - 1 === index) return '└──';
  return '├──';
}

/**
 * Enumerates a tree with rounded edges.
 *
 * ├── Foo
 * ╰── Qux
 */
export function roundedEnumerator(children: Children, index: number): string {
  if (children.length() - 1 === index) return '╰──';
  return '├──';
}

/** Indents a tree for nested trees and multiline content. */
export function defaultIndenter(children: Children, index: number): string {
  if (children.length() - 1 === index) return '   ';
  return '│  ';
}

// ── Renderer ────────────────────────────────────────────────────────────────

interface RendererStyle {
  enumeratorFunc: StyleFunc;
  indenterFunc: StyleFunc;
  itemFunc: StyleFunc;
  root: Style;
}

class Renderer {
  style: RendererStyle = {
    enumeratorFunc: () => newStyle().paddingRight(1),
    indenterFunc: () => newStyle().paddingRight(1),
    itemFunc: () => newStyle(),
    root: newStyle(),
  };
  enumerator: Enumerator = defaultEnumerator;
  indenter: Indenter = defaultIndenter;
  width: number = 0;

  render(node: Node, root: boolean, prefix: string): string {
    if (node.hidden()) return '';

    let maxLen = 0;
    let children = node.children();
    const enumerator = this.enumerator;
    const indenter = this.indenter;

    const strs: string[] = [];

    // Print the root node name if it's not empty.
    const name = node.value();
    if (name !== '' && root) {
      let line = this.style.root.render(name);
      // If the line is shorter than the desired width, pad it with spaces.
      const pad = this.width - lipglossWidth(line);
      if (pad > 0) {
        line = name + this.style.root.render(' '.repeat(pad));
      }
      strs.push(this.style.root.render(line));
    }

    const initialLength = children.length();
    for (let i = 0; i < initialLength; i++) {
      if (i < children.length() - 1) {
        const next = children.at(i + 1);
        if (next !== null && next.hidden()) {
          // Don't count the last child if it's hidden. This renders the last
          // visible element with the right prefix.
          children = asNodeChildren(children).remove(i + 1);
        }
      }
      let p = enumerator(children, i);
      p = this.style.enumeratorFunc(children, i).render(p);
      maxLen = Math.max(lipglossWidth(p), maxLen);
    }

    const count = children.length();
    for (let i = 0; i < count; i++) {
      const child = children.at(i);
      if (child === null || child.hidden()) continue;

      const indentStyle = this.style.indenterFunc(children, i);
      const enumStyle = this.style.enumeratorFunc(children, i);
      const itemStyle = this.style.itemFunc(children, i);

      const indent = indentStyle.render(indenter(children, i));
      let nodePrefix = enumStyle.render(enumerator(children, i));

      // Preserve the background color of the enumerator when adding padding.
      const enumBgStyle = newStyle().background(enumStyle.getBackground());

      // Pad the node to align it with the longest prefix of its siblings.
      const l = maxLen - lipglossWidth(nodePrefix);
      if (l > 0) {
        nodePrefix = enumBgStyle.render(' '.repeat(l)) + nodePrefix;
      }

      const item = itemStyle.render(child.value());
      let multilinePrefix = enumBgStyle.render(prefix);

      // Account for multiline prefixes: both the parent prefix and the
      // current node's prefix must have the same height.
      while (lipglossHeight(item) > lipglossHeight(nodePrefix)) {
        nodePrefix = joinVertical(Left, nodePrefix, indent);
      }
      while (lipglossHeight(nodePrefix) > lipglossHeight(multilinePrefix)) {
        multilinePrefix = joinVertical(Left, multilinePrefix, prefix);
      }

      let line = joinHorizontal(Top, multilinePrefix, nodePrefix, item);

      // If the line is shorter than the desired width, pad it with spaces.
      const pad = this.width - lipglossWidth(line);
      if (pad > 0) {
        line = line + itemStyle.render(' '.repeat(pad));
      }
      strs.push(line);

      if (children.length() > 0) {
        // A child Tree with its own renderer renders itself; otherwise keep
        // using the current renderer. Styles are not inherited.
        let renderer: Renderer = this;
        if (child instanceof Tree && child._renderer !== null) {
          renderer = child._renderer;
        }
        const s = renderer.render(child, false, prefix + indent);
        if (s !== '') strs.push(s);
      }
    }
    return strs.join('\n');
  }
}

function asNodeChildren(children: Children): NodeChildren {
  if (children instanceof NodeChildren) return children;
  const nodes: Node[] = [];
  for (let i = 0; i < children.length(); i++) {
    const n = children.at(i);
    if (n !== null) nodes.push(n);
  }
  return new NodeChildren(nodes);
}

// ── Tree ────────────────────────────────────────────────────────────────────

/** Tree implements a Node. */
export class Tree implements Node {
  private _value: string = '';
  private _hidden: boolean = false;
  private _offset: [number, number] = [0, 0];
  private _children: NodeChildren = new NodeChildren();
  /** @internal */ _renderer: Renderer | null = null;

  hidden(): boolean {
    return this._hidden;
  }

  /** Sets whether to hide the Tree node. */
  hide(hide: boolean): Tree {
    this._hidden = hide;
    return this;
  }

  setHidden(hidden: boolean): void {
    this.hide(hidden);
  }

  /** Sets the Tree children offsets. */
  offset(start: number, end: number): Tree {
    if (start > end) [start, end] = [end, start];
    if (start < 0) start = 0;
    if (end < 0 || end > this._children.length()) end = this._children.length();
    this._offset = [start, end];
    return this;
  }

  /** Returns the root name of this node. */
  value(): string {
    return this._value;
  }

  setValue(value: unknown): void {
    this.root(value);
  }

  toString(): string {
    return this._ensureRenderer().render(this, true, '');
  }

  /**
   * Adds children to this Tree. A child Tree without a root is parented to
   * its preceding sibling (auto-nesting).
   */
  child(...children: unknown[]): Tree {
    for (const item of children) {
      if (item instanceof Tree) {
        const [newItem, rm] = ensureParent(this._children, item);
        if (rm >= 0) this._children = this._children.remove(rm);
        this._children = this._children.append(newItem);
      } else if (isChildren(item)) {
        for (let i = 0; i < item.length(); i++) {
          const n = item.at(i);
          if (n !== null) this._children = this._children.append(n);
        }
      } else if (isNode(item)) {
        this._children = this._children.append(item);
      } else if (typeof item === 'string') {
        this._children = this._children.append(new Leaf(item));
      } else if (Array.isArray(item)) {
        return this.child(...item);
      } else if (item === null || item === undefined) {
        continue;
      } else if (isStringer(item)) {
        this._children = this._children.append(new Leaf(String(item)));
      } else {
        return this.child(String(item));
      }
    }
    return this;
  }

  /** @internal */
  _ensureRenderer(): Renderer {
    if (this._renderer === null) this._renderer = new Renderer();
    return this._renderer;
  }

  /** Sets a static style for all enumerators. */
  enumeratorStyle(style: Style): Tree {
    this._ensureRenderer().style.enumeratorFunc = () => style;
    return this;
  }

  /** Sets the enumeration style function. */
  enumeratorStyleFunc(fn: StyleFunc | null): Tree {
    this._ensureRenderer().style.enumeratorFunc = fn ?? (() => newStyle());
    return this;
  }

  /** Sets a static style for all indenters. */
  indenterStyle(style: Style): Tree {
    this._ensureRenderer().style.indenterFunc = () => style;
    return this;
  }

  /** Sets the indentation style function. */
  indenterStyleFunc(fn: StyleFunc | null): Tree {
    this._ensureRenderer().style.indenterFunc = fn ?? (() => newStyle());
    return this;
  }

  /** Sets a style for the root element. */
  rootStyle(style: Style): Tree {
    this._ensureRenderer().style.root = style;
    return this;
  }

  /** Sets a static style for all items. */
  itemStyle(style: Style): Tree {
    this._ensureRenderer().style.itemFunc = () => style;
    return this;
  }

  /** Sets the item style function. */
  itemStyleFunc(fn: StyleFunc | null): Tree {
    this._ensureRenderer().style.itemFunc = fn ?? (() => newStyle());
    return this;
  }

  /** Sets the enumerator implementation. */
  enumerator(enumerator: Enumerator): Tree {
    this._ensureRenderer().enumerator = enumerator;
    return this;
  }

  /** Sets the indenter implementation. */
  indenter(indenter: Indenter): Tree {
    this._ensureRenderer().indenter = indenter;
    return this;
  }

  /** Sets the tree width. Items are padded to the entire width. */
  width(width: number): Tree {
    this._ensureRenderer().width = width;
    return this;
  }

  /** Returns the children of a node, honouring the configured offsets. */
  children(): Children {
    const data: Node[] = [];
    for (let i = this._offset[0]; i < this._children.length() - this._offset[1]; i++) {
      const n = this._children.at(i);
      if (n !== null) data.push(n);
    }
    return new NodeChildren(data);
  }

  /** Sets the root value of this tree. */
  root(root: unknown): Tree {
    if (root instanceof Tree) {
      this._value = root._value;
      return this.child(root._children);
    }
    if (isNode(root)) {
      this._value = root.toString();
    } else {
      this._value = valueToString(root);
    }
    return this;
  }
}

function ensureParent(nodes: NodeChildren, item: Tree): [Tree, number] {
  if (item.value() !== '' || nodes.length() === 0) return [item, -1];
  const j = nodes.length() - 1;
  const parent = nodes.at(j);
  if (parent instanceof Tree) {
    const itemChildren = item['_children'];
    for (let i = 0; i < itemChildren.length(); i++) {
      parent.child(itemChildren.at(i));
    }
    return [parent, j];
  }
  if (parent instanceof Leaf) {
    item['_value'] = parent.value();
    return [item, j];
  }
  return [item, -1];
}

/** Returns a new tree. */
export function newTree(): Tree {
  return new Tree();
}

/** Returns a new tree with the root set. */
export function treeRoot(root: unknown): Tree {
  return new Tree().root(root);
}
