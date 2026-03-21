/**
 * Package memoization implements a simple memoization cache. It's designed to
 * improve performance in textarea.
 *
 * Port of charm.land/bubbles/v2/internal/memoization
 */
import { createHash } from 'crypto';

/**
 * Hasher is an interface that requires a hash method. The hash method is
 * expected to return a string representation of the hash of the object.
 */
export interface Hasher {
  hash(): string;
}

/**
 * Entry is a struct that holds a key-value pair. It is used as an element
 * in the evictionList of the MemoCache.
 */
interface Entry<T> {
  key: string;
  value: T;
}

/**
 * Node represents a doubly-linked list node for LRU tracking.
 */
interface Node<T> {
  entry: Entry<T>;
  prev: Node<T> | null;
  next: Node<T> | null;
}

/**
 * DoublyLinkedList implements a simple doubly-linked list for LRU eviction.
 */
class DoublyLinkedList<T> {
  private head: Node<T> | null = null;
  private tail: Node<T> | null = null;
  private _length = 0;

  /** Returns the number of elements in the list. */
  len(): number {
    return this._length;
  }

  /** Pushes a new entry to the front of the list and returns the node. */
  pushFront(entry: Entry<T>): Node<T> {
    const node: Node<T> = { entry, prev: null, next: this.head };
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
    this._length++;
    return node;
  }

  /** Moves an existing node to the front of the list. */
  moveToFront(node: Node<T>): void {
    if (node === this.head) {
      return; // Already at front
    }

    // Remove from current position
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
    if (node === this.tail) {
      this.tail = node.prev;
    }

    // Move to front
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
  }

  /** Returns the last node in the list. */
  back(): Node<T> | null {
    return this.tail;
  }

  /** Removes a node from the list and returns its entry. */
  remove(node: Node<T>): Entry<T> {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    this._length--;
    return node.entry;
  }
}

/**
 * MemoCache is a class that represents a cache with a set capacity. It
 * uses an LRU (Least Recently Used) eviction policy. It is safe for
 * concurrent use (in single-threaded JS, this is trivially true).
 */
export class MemoCache<H extends Hasher, T> {
  private _capacity: number;
  private cache: Map<string, Node<T>>;
  private evictionList: DoublyLinkedList<T>;
  private hashableItems: Map<string, T>;

  constructor(capacity: number) {
    this._capacity = capacity;
    this.cache = new Map();
    this.evictionList = new DoublyLinkedList();
    this.hashableItems = new Map();
  }

  /** Returns the capacity of the MemoCache. */
  capacity(): number {
    return this._capacity;
  }

  /** Returns the current size of the MemoCache. */
  size(): number {
    return this.evictionList.len();
  }

  /**
   * Returns the value associated with the given hashable item in the MemoCache.
   * If there is no corresponding value, returns [undefined, false].
   */
  get(h: H): [T | undefined, boolean] {
    const hashedKey = h.hash();
    const element = this.cache.get(hashedKey);
    if (element) {
      this.evictionList.moveToFront(element);
      return [element.entry.value, true];
    }
    return [undefined, false];
  }

  /**
   * Sets the value for the given hashable item in the MemoCache.
   * If the cache is at capacity, it evicts the least recently used item
   * before adding the new item.
   */
  set(h: H, value: T): void {
    const hashedKey = h.hash();
    const existingElement = this.cache.get(hashedKey);

    if (existingElement) {
      this.evictionList.moveToFront(existingElement);
      existingElement.entry.value = value;
      return;
    }

    // Check if the cache is at capacity
    if (this.evictionList.len() >= this._capacity) {
      // Evict the least recently used item from the cache
      const toEvict = this.evictionList.back();
      if (toEvict) {
        const evictedEntry = this.evictionList.remove(toEvict);
        this.cache.delete(evictedEntry.key);
        this.hashableItems.delete(evictedEntry.key);
      }
    }

    // Add the value to the cache and the evictionList
    const newEntry: Entry<T> = {
      key: hashedKey,
      value: value,
    };
    const element = this.evictionList.pushFront(newEntry);
    this.cache.set(hashedKey, element);
    this.hashableItems.set(hashedKey, value);
  }
}

/**
 * Creates a new MemoCache with a given capacity.
 */
export function newMemoCache<H extends Hasher, T>(capacity: number): MemoCache<H, T> {
  return new MemoCache<H, T>(capacity);
}

/**
 * HString is a type that implements the Hasher interface for strings.
 */
export class HString implements Hasher {
  constructor(private value: string) {}

  hash(): string {
    return createHash('sha256').update(this.value).digest('hex');
  }

  toString(): string {
    return this.value;
  }
}

/**
 * HInt is a type that implements the Hasher interface for integers.
 */
export class HInt implements Hasher {
  constructor(private value: number) {}

  hash(): string {
    return createHash('sha256').update(String(this.value)).digest('hex');
  }

  valueOf(): number {
    return this.value;
  }
}
