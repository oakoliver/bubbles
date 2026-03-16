/**
 * Paginator provides pagination calculation and rendering.
 *
 * Port of charm.land/bubbles/v2/paginator
 */
import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { Binding, newBinding, withKeys, matches } from '../key/key.js';

/** Type specifies the way we render pagination. */
export enum Type {
  Arabic = 0,
  Dots = 1,
}

/** KeyMap is the key bindings for actions within the paginator. */
export interface KeyMap {
  prevPage: Binding;
  nextPage: Binding;
}

/** Returns the default set of key bindings. */
export function defaultKeyMap(): KeyMap {
  return {
    prevPage: newBinding(withKeys('pageup', 'left', 'h')),
    nextPage: newBinding(withKeys('pagedown', 'right', 'l')),
  };
}

/** Option for configuring the paginator. */
export type Option = (m: Model) => void;

/** Sets the total pages. */
export function withTotalPages(totalPages: number): Option {
  return (m: Model) => {
    m.totalPages = totalPages;
  };
}

/** Sets the items per page. */
export function withPerPage(perPage: number): Option {
  return (m: Model) => {
    m.perPage = perPage;
  };
}

/** Model is the Bubble Tea model for the paginator. */
export class Model {
  /** Type configures how the pagination is rendered (Arabic, Dots). */
  type: Type;
  /** Current page number. */
  page: number;
  /** Number of items per page. */
  perPage: number;
  /** Total number of pages. */
  totalPages: number;
  /** Mark for current page under Dots display type. */
  activeDot: string;
  /** Mark for inactive pages under Dots display type. */
  inactiveDot: string;
  /** Printf-style format for Arabic display type. */
  arabicFormat: string;
  /** Key bindings. */
  keyMap: KeyMap;

  constructor(...opts: Option[]) {
    this.type = Type.Arabic;
    this.page = 0;
    this.perPage = 1;
    this.totalPages = 1;
    this.keyMap = defaultKeyMap();
    this.activeDot = '•';
    this.inactiveDot = '○';
    this.arabicFormat = '%d/%d';

    for (const opt of opts) {
      opt(this);
    }
  }

  /**
   * Helper function for calculating the total number of pages from a given
   * number of items. It both returns and sets the total pages.
   */
  setTotalPages(items: number): number {
    if (items < 1) {
      return this.totalPages;
    }
    let n = Math.floor(items / this.perPage);
    if (items % this.perPage > 0) {
      n++;
    }
    this.totalPages = n;
    return n;
  }

  /**
   * Returns the number of items on the current page given the total number
   * of items.
   */
  itemsOnPage(totalItems: number): number {
    if (totalItems < 1) {
      return 0;
    }
    const [start, end] = this.getSliceBounds(totalItems);
    return end - start;
  }

  /**
   * Returns [start, end] bounds corresponding to the current page for slicing.
   */
  getSliceBounds(length: number): [number, number] {
    const start = this.page * this.perPage;
    const end = Math.min(this.page * this.perPage + this.perPage, length);
    return [start, end];
  }

  /** Navigate one page backward. Will not go below page 0. */
  prevPage(): void {
    if (this.page > 0) {
      this.page--;
    }
  }

  /** Navigate one page forward. Will not go beyond the last page. */
  nextPage(): void {
    if (!this.onLastPage()) {
      this.page++;
    }
  }

  /** Returns whether or not we're on the last page. */
  onLastPage(): boolean {
    return this.page === this.totalPages - 1;
  }

  /** Returns whether or not we're on the first page. */
  onFirstPage(): boolean {
    return this.page === 0;
  }

  /** Update binds keystrokes to pagination. */
  update(msg: Msg): [Model, Cmd | null] {
    if (typeof msg === 'object' && msg !== null && 'type' in msg) {
      const m = msg as { type: string; toString(): string };
      if (m.type === 'keyPress') {
        if (matches(m, this.keyMap.nextPage)) {
          this.nextPage();
        } else if (matches(m, this.keyMap.prevPage)) {
          this.prevPage();
        }
      }
    }
    return [this, null];
  }

  /** View renders the pagination to a string. */
  view(): string {
    switch (this.type) {
      case Type.Dots:
        return this._dotsView();
      default:
        return this._arabicView();
    }
  }

  private _dotsView(): string {
    let s = '';
    for (let i = 0; i < this.totalPages; i++) {
      if (i === this.page) {
        s += this.activeDot;
      } else {
        s += this.inactiveDot;
      }
    }
    return s;
  }

  private _arabicView(): string {
    // Simple sprintf replacement for "%d/%d"
    return this.arabicFormat
      .replace('%d', String(this.page + 1))
      .replace('%d', String(this.totalPages));
  }
}

/** Creates a new paginator model with defaults. */
export function newPaginator(...opts: Option[]): Model {
  return new Model(...opts);
}
