/**
 * FilePicker — file system browser component.
 *
 * Zero-dependency port of charmbracelet/bubbles/filepicker (Go).
 * Features:
 * - Navigate directories with keyboard
 * - File/directory selection
 * - Permission and file size display
 * - Hidden file toggle
 * - Allowed file type filtering
 * - Symlink resolution
 * - Auto-height from window size
 *
 * Uses Node.js fs module for directory reading.
 *
 * @module
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { newStyle } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';

import { newBinding, withKeys, withHelp, matches } from '../key/key.js';
import type { Binding } from '../key/key.js';

// ── Constants ───────────────────────────────────────────────────────────────

const marginBottom = 5;
const fileSizeWidth = 7;
const paddingLeft = 2;

// ── ID management ───────────────────────────────────────────────────────────

let lastID = 0;
function nextID(): number { return ++lastID; }

// ── Types ───────────────────────────────────────────────────────────────────

/** Represents a directory entry (file or directory). */
export interface DirEntry {
  name: string;
  isDir: boolean;
  isSymlink: boolean;
  mode: string;      // e.g. 'drwxr-xr-x'
  size: number;       // bytes
}

interface ReadDirMsg {
  readonly type: 'filepicker.readDir';
  readonly id: number;
  readonly entries: DirEntry[];
}

interface ErrorMsg {
  readonly type: 'filepicker.error';
  readonly error: string;
}

// ── KeyMap ───────────────────────────────────────────────────────────────────

export interface KeyMap {
  goToTop: Binding;
  goToLast: Binding;
  down: Binding;
  up: Binding;
  pageUp: Binding;
  pageDown: Binding;
  back: Binding;
  open: Binding;
  select: Binding;
}

export function defaultKeyMap(): KeyMap {
  return {
    goToTop: newBinding(withKeys('g'), withHelp('g', 'first')),
    goToLast: newBinding(withKeys('G'), withHelp('G', 'last')),
    down: newBinding(withKeys('j', 'down', 'ctrl+n'), withHelp('j', 'down')),
    up: newBinding(withKeys('k', 'up', 'ctrl+p'), withHelp('k', 'up')),
    pageUp: newBinding(withKeys('K', 'pageup'), withHelp('pgup', 'page up')),
    pageDown: newBinding(withKeys('J', 'pagedown'), withHelp('pgdown', 'page down')),
    back: newBinding(withKeys('h', 'backspace', 'left', 'escape'), withHelp('h', 'back')),
    open: newBinding(withKeys('l', 'right', 'enter'), withHelp('l', 'open')),
    select: newBinding(withKeys('enter'), withHelp('enter', 'select')),
  };
}

// ── Styles ──────────────────────────────────────────────────────────────────

export interface Styles {
  disabledCursor: Style;
  cursor: Style;
  symlink: Style;
  directory: Style;
  file: Style;
  disabledFile: Style;
  permission: Style;
  selected: Style;
  disabledSelected: Style;
  fileSize: Style;
  emptyDirectory: Style;
}

export function defaultStyles(): Styles {
  return {
    disabledCursor: newStyle().foreground('247'),
    cursor: newStyle().foreground('212'),
    symlink: newStyle().foreground('36'),
    directory: newStyle().foreground('99'),
    file: newStyle(),
    disabledFile: newStyle().foreground('243'),
    disabledSelected: newStyle().foreground('247'),
    permission: newStyle().foreground('244'),
    selected: newStyle().foreground('212').bold(true),
    fileSize: newStyle().foreground('240').width(fileSizeWidth),
    emptyDirectory: newStyle()
      .foreground('240')
      .paddingLeft(paddingLeft)
      .setString('Bummer. No Files Found.'),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Simple stack (push/pop). */
class Stack {
  private _data: number[] = [];
  push(v: number): void { this._data.push(v); }
  pop(): number { return this._data.pop() ?? 0; }
  length(): number { return this._data.length; }
}

/** Check if a file is hidden (starts with '.') — Unix convention. */
function isHidden(name: string): boolean {
  return name.startsWith('.');
}

/** Human-readable file size (e.g. "1.2kB", "3.4MB"). */
function humanizeBytes(bytes: number): string {
  if (bytes < 1000) return bytes + 'B';
  if (bytes < 1000000) return (bytes / 1000).toFixed(1).replace(/\.0$/, '') + 'kB';
  if (bytes < 1000000000) return (bytes / 1000000).toFixed(1).replace(/\.0$/, '') + 'MB';
  return (bytes / 1000000000).toFixed(1).replace(/\.0$/, '') + 'GB';
}

/** Convert Node.js mode number to Unix-style permission string. */
function modeToString(mode: number, isDir: boolean, isSymlink: boolean): string {
  const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  const owner = (mode >> 6) & 7;
  const group = (mode >> 3) & 7;
  const other = mode & 7;
  const prefix = isSymlink ? 'l' : isDir ? 'd' : '-';
  return prefix + perms[owner] + perms[group] + perms[other];
}

/** Read directory entries, sorted: directories first, then alphabetical. */
function readDirEntries(dirPath: string, showHidden: boolean): DirEntry[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const result: DirEntry[] = [];
  for (const entry of entries) {
    if (!showHidden && isHidden(entry.name)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(path.join(dirPath, entry.name));
    } catch {
      continue;
    }

    const isLink = stat.isSymbolicLink();
    let isDir = entry.isDirectory();

    // Resolve symlinks to determine if they point to directories
    if (isLink) {
      try {
        const realPath = fs.realpathSync(path.join(dirPath, entry.name));
        const realStat = fs.statSync(realPath);
        if (realStat.isDirectory()) isDir = true;
      } catch {
        // broken symlink — treat as file
      }
    }

    result.push({
      name: entry.name,
      isDir,
      isSymlink: isLink,
      mode: modeToString(stat.mode & 0o777, isDir, isLink),
      size: stat.size,
    });
  }

  // Sort: directories first, then alphabetical
  result.sort((a, b) => {
    if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
    return a.isDir ? -1 : 1;
  });

  return result;
}

// ── Model ───────────────────────────────────────────────────────────────────

export class Model {
  private _id: number;

  /** Path the user has selected (empty string if no selection). */
  path: string;
  /** Current directory being browsed. */
  currentDirectory: string;
  /** Allowed file extensions (empty = allow all). */
  allowedTypes: string[];
  keyMap: KeyMap;
  styles: Styles;
  showPermissions: boolean;
  showSize: boolean;
  showHidden: boolean;
  dirAllowed: boolean;
  fileAllowed: boolean;
  fileSelected: string;
  cursor: string;
  autoHeight: boolean;

  private _files: DirEntry[];
  private _selected: number;
  private _selectedStack: Stack;
  private _minIdx: number;
  private _maxIdx: number;
  private _minStack: Stack;
  private _maxStack: Stack;
  private _height: number;

  constructor() {
    this._id = nextID();
    this.path = '';
    this.currentDirectory = '.';
    this.cursor = '>';
    this.allowedTypes = [];
    this.showPermissions = true;
    this.showSize = true;
    this.showHidden = false;
    this.dirAllowed = false;
    this.fileAllowed = true;
    this.fileSelected = '';
    this.autoHeight = true;
    this.keyMap = defaultKeyMap();
    this.styles = defaultStyles();
    this._files = [];
    this._selected = 0;
    this._selectedStack = new Stack();
    this._minIdx = 0;
    this._maxIdx = 0;
    this._minStack = new Stack();
    this._maxStack = new Stack();
    this._height = 0;
  }

  setHeight(h: number): void {
    this._height = h;
    if (this._maxIdx > this._height - 1) {
      this._maxIdx = this._minIdx + this._height - 1;
    }
  }

  height(): number { return this._height; }

  /** Init returns the command to read the initial directory. */
  init(): Cmd {
    return this._readDirCmd(this.currentDirectory, this.showHidden);
  }

  private _readDirCmd(dirPath: string, showHidden: boolean): Cmd {
    const id = this._id;
    return () => Promise.resolve({
      type: 'filepicker.readDir',
      id,
      entries: readDirEntries(dirPath, showHidden),
    } as ReadDirMsg);
  }

  private _pushView(selected: number, minimum: number, maximum: number): void {
    this._selectedStack.push(selected);
    this._minStack.push(minimum);
    this._maxStack.push(maximum);
  }

  private _popView(): [number, number, number] {
    return [this._selectedStack.pop(), this._minStack.pop(), this._maxStack.pop()];
  }

  private _canSelect(file: string): boolean {
    if (this.allowedTypes.length === 0) return true;
    for (const ext of this.allowedTypes) {
      if (file.endsWith(ext)) return true;
    }
    return false;
  }

  // ── Update ────────────────────────────────────────────────────────────

  update(msg: Msg): [Model, Cmd | null] {
    const m = msg as Record<string, unknown>;
    if (!m || typeof m !== 'object' || !('type' in m)) return [this, null];

    // ReadDir result
    if (m.type === 'filepicker.readDir') {
      const rdm = msg as ReadDirMsg;
      if (rdm.id !== this._id) return [this, null];
      this._files = rdm.entries;
      this._maxIdx = Math.max(this._maxIdx, this._height - 1);
      return [this, null];
    }

    // Window size
    if (m.type === 'windowSize') {
      const wsm = msg as { type: string; height: number };
      if (this.autoHeight) this.setHeight(wsm.height - marginBottom);
      this._maxIdx = this._height - 1;
      return [this, null];
    }

    // Key press
    if (m.type === 'keyPress') {
      if (matches(msg, this.keyMap.goToTop)) {
        this._selected = 0;
        this._minIdx = 0;
        this._maxIdx = this._height - 1;
      } else if (matches(msg, this.keyMap.goToLast)) {
        this._selected = this._files.length - 1;
        this._minIdx = this._files.length - this._height;
        this._maxIdx = this._files.length - 1;
      } else if (matches(msg, this.keyMap.down)) {
        this._selected++;
        if (this._selected >= this._files.length) {
          this._selected = this._files.length - 1;
        }
        if (this._selected > this._maxIdx) {
          this._minIdx++;
          this._maxIdx++;
        }
      } else if (matches(msg, this.keyMap.up)) {
        this._selected--;
        if (this._selected < 0) this._selected = 0;
        if (this._selected < this._minIdx) {
          this._minIdx--;
          this._maxIdx--;
        }
      } else if (matches(msg, this.keyMap.pageDown)) {
        this._selected += this._height;
        if (this._selected >= this._files.length) {
          this._selected = this._files.length - 1;
        }
        this._minIdx += this._height;
        this._maxIdx += this._height;
        if (this._maxIdx >= this._files.length) {
          this._maxIdx = this._files.length - 1;
          this._minIdx = this._maxIdx - this._height;
        }
      } else if (matches(msg, this.keyMap.pageUp)) {
        this._selected -= this._height;
        if (this._selected < 0) this._selected = 0;
        this._minIdx -= this._height;
        this._maxIdx -= this._height;
        if (this._minIdx < 0) {
          this._minIdx = 0;
          this._maxIdx = this._minIdx + this._height;
        }
      } else if (matches(msg, this.keyMap.back)) {
        this.currentDirectory = path.dirname(this.currentDirectory);
        if (this._selectedStack.length() > 0) {
          [this._selected, this._minIdx, this._maxIdx] = this._popView();
        } else {
          this._selected = 0;
          this._minIdx = 0;
          this._maxIdx = this._height - 1;
        }
        return [this, this._readDirCmd(this.currentDirectory, this.showHidden)];
      } else if (matches(msg, this.keyMap.open)) {
        if (this._files.length === 0) return [this, null];

        const f = this._files[this._selected];
        let isDir = f.isDir;

        // Resolve symlinks
        if (f.isSymlink) {
          try {
            const realPath = fs.realpathSync(path.join(this.currentDirectory, f.name));
            const stat = fs.statSync(realPath);
            if (stat.isDirectory()) isDir = true;
          } catch {
            // broken symlink
          }
        }

        if ((!isDir && this.fileAllowed) || (isDir && this.dirAllowed)) {
          if (matches(msg, this.keyMap.select)) {
            this.path = path.join(this.currentDirectory, f.name);
          }
        }

        if (!isDir) return [this, null];

        this.currentDirectory = path.join(this.currentDirectory, f.name);
        this._pushView(this._selected, this._minIdx, this._maxIdx);
        this._selected = 0;
        this._minIdx = 0;
        this._maxIdx = this._height - 1;
        return [this, this._readDirCmd(this.currentDirectory, this.showHidden)];
      }
    }

    return [this, null];
  }

  // ── View ──────────────────────────────────────────────────────────────

  view(): string {
    if (this._files.length === 0) {
      return this.styles.emptyDirectory
        .height(this._height)
        .maxHeight(this._height)
        .toString();
    }

    const lines: string[] = [];

    for (let i = 0; i < this._files.length; i++) {
      if (i < this._minIdx || i > this._maxIdx) continue;

      const f = this._files[i];
      const size = humanizeBytes(f.size);
      const name = f.name;

      // Resolve symlink target path for display
      let symlinkPath = '';
      if (f.isSymlink) {
        try {
          symlinkPath = fs.realpathSync(path.join(this.currentDirectory, name));
        } catch {
          symlinkPath = '?';
        }
      }

      const disabled = !this._canSelect(name) && !f.isDir;
      const fileSizeW = this.styles.fileSize.getWidth() || fileSizeWidth;

      if (this._selected === i) {
        let selected = '';
        if (this.showPermissions) selected += ' ' + f.mode;
        if (this.showSize) selected += size.padStart(fileSizeW);
        selected += ' ' + name;
        if (f.isSymlink) selected += ' \u2192 ' + symlinkPath;

        if (disabled) {
          lines.push(
            this.styles.disabledCursor.render(this.cursor)
            + this.styles.disabledSelected.render(selected),
          );
        } else {
          lines.push(
            this.styles.cursor.render(this.cursor)
            + this.styles.selected.render(selected),
          );
        }
        continue;
      }

      // Non-selected items
      let style = this.styles.file;
      if (f.isDir) style = this.styles.directory;
      else if (f.isSymlink) style = this.styles.symlink;
      else if (disabled) style = this.styles.disabledFile;

      let fileName = style.render(name);
      if (f.isSymlink) fileName += ' \u2192 ' + symlinkPath;

      let line = this.styles.cursor.render(' ');
      if (this.showPermissions) line += ' ' + this.styles.permission.render(f.mode);
      if (this.showSize) line += this.styles.fileSize.render(size);
      line += ' ' + fileName;
      lines.push(line);
    }

    // Pad to fill height
    const rendered = lines.join('\n');
    const renderedHeight = rendered.split('\n').length;
    const pad = this._height - renderedHeight;
    if (pad > 0) {
      return rendered + '\n'.repeat(pad + 1);
    }
    return rendered + '\n';
  }

  // ── Selection helpers ─────────────────────────────────────────────────

  /**
   * Returns [true, path] if the user selected a valid file on this msg,
   * otherwise [false, ''].
   */
  didSelectFile(msg: Msg): [boolean, string] {
    const [didSelect, filePath] = this._didSelectFile(msg);
    if (didSelect && this._canSelect(filePath)) return [true, filePath];
    return [false, ''];
  }

  /**
   * Returns [true, path] if the user tried to select a disabled file
   * (one not matching allowedTypes).
   */
  didSelectDisabledFile(msg: Msg): [boolean, string] {
    const [didSelect, filePath] = this._didSelectFile(msg);
    if (didSelect && !this._canSelect(filePath)) return [true, filePath];
    return [false, ''];
  }

  private _didSelectFile(msg: Msg): [boolean, string] {
    if (this._files.length === 0) return [false, ''];
    const m = msg as Record<string, unknown>;
    if (!m || typeof m !== 'object' || m.type !== 'keyPress') return [false, ''];

    if (!matches(msg, this.keyMap.select)) return [false, ''];

    const f = this._files[this._selected];
    let isDir = f.isDir;

    if (f.isSymlink) {
      try {
        const realPath = fs.realpathSync(path.join(this.currentDirectory, f.name));
        const stat = fs.statSync(realPath);
        if (stat.isDirectory()) isDir = true;
      } catch {
        // broken symlink
      }
    }

    if ((!isDir && this.fileAllowed) || (isDir && this.dirAllowed)) {
      if (this.path !== '') return [true, this.path];
    }

    return [false, ''];
  }

  /** Returns the full path of the currently highlighted file/directory. */
  highlightedPath(): string {
    if (this._files.length === 0 || this._selected < 0 || this._selected >= this._files.length) {
      return '';
    }
    return path.join(this.currentDirectory, this._files[this._selected].name);
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/** Creates a new filepicker Model with default settings. */
export function newFilePicker(): Model {
  return new Model();
}
