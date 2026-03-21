/**
 * Tests for the memoization module.
 * Port of charm.land/bubbles/v2/internal/memoization tests.
 */
import { describe, test, expect } from 'bun:test';
import { MemoCache, newMemoCache, HString, HInt } from '../src/internal/memoization';

// Action types for test cases
const enum ActionType {
  Set = 0,
  Get = 1,
}

interface CacheAction {
  actionType: ActionType;
  key?: HString;
  value?: unknown;
  expectedValue?: unknown;
}

interface TestCase {
  name: string;
  capacity: number;
  actions: CacheAction[];
}

describe('MemoCache', () => {
  // Port of TestCache from memoization_test.go
  const tests: TestCase[] = [
    {
      name: 'TestNewMemoCache',
      capacity: 5,
      actions: [{ actionType: ActionType.Get, expectedValue: undefined }],
    },
    {
      name: 'TestSetAndGet',
      capacity: 10,
      actions: [
        { actionType: ActionType.Set, key: new HString('key1'), value: 'value1' },
        { actionType: ActionType.Get, key: new HString('key1'), expectedValue: 'value1' },
        { actionType: ActionType.Set, key: new HString('key1'), value: 'newValue1' },
        { actionType: ActionType.Get, key: new HString('key1'), expectedValue: 'newValue1' },
        { actionType: ActionType.Get, key: new HString('nonExistentKey'), expectedValue: undefined },
        { actionType: ActionType.Set, key: new HString('nilKey'), value: '' },
        { actionType: ActionType.Get, key: new HString('nilKey'), expectedValue: '' },
        { actionType: ActionType.Set, key: new HString('keyA'), value: 'valueA' },
        { actionType: ActionType.Set, key: new HString('keyB'), value: 'valueB' },
        { actionType: ActionType.Get, key: new HString('keyA'), expectedValue: 'valueA' },
        { actionType: ActionType.Get, key: new HString('keyB'), expectedValue: 'valueB' },
      ],
    },
    {
      name: 'TestSetNilValue',
      capacity: 10,
      actions: [
        { actionType: ActionType.Set, key: new HString('nilKey'), value: null },
        { actionType: ActionType.Get, key: new HString('nilKey'), expectedValue: null },
      ],
    },
    {
      name: 'TestGetAfterEviction',
      capacity: 2,
      actions: [
        { actionType: ActionType.Set, key: new HString('1'), value: 1 },
        { actionType: ActionType.Set, key: new HString('2'), value: 2 },
        { actionType: ActionType.Set, key: new HString('3'), value: 3 },
        { actionType: ActionType.Get, key: new HString('1'), expectedValue: undefined },
        { actionType: ActionType.Get, key: new HString('2'), expectedValue: 2 },
      ],
    },
    {
      name: 'TestGetAfterLRU',
      capacity: 2,
      actions: [
        { actionType: ActionType.Set, key: new HString('1'), value: 1 },
        { actionType: ActionType.Set, key: new HString('2'), value: 2 },
        { actionType: ActionType.Get, key: new HString('1'), expectedValue: 1 },
        { actionType: ActionType.Set, key: new HString('3'), value: 3 },
        { actionType: ActionType.Get, key: new HString('1'), expectedValue: 1 },
        { actionType: ActionType.Get, key: new HString('3'), expectedValue: 3 },
        { actionType: ActionType.Get, key: new HString('2'), expectedValue: undefined },
      ],
    },
    {
      name: 'TestLRU_Capacity3',
      capacity: 3,
      actions: [
        { actionType: ActionType.Set, key: new HString('1'), value: 1 },
        { actionType: ActionType.Set, key: new HString('2'), value: 2 },
        { actionType: ActionType.Set, key: new HString('3'), value: 3 },
        { actionType: ActionType.Get, key: new HString('1'), expectedValue: 1 }, // Accessing key "1"
        { actionType: ActionType.Set, key: new HString('4'), value: 4 }, // Should evict key "2" since "1" was recently accessed
        { actionType: ActionType.Get, key: new HString('2'), expectedValue: undefined },
        { actionType: ActionType.Get, key: new HString('1'), expectedValue: 1 },
        { actionType: ActionType.Get, key: new HString('3'), expectedValue: 3 },
        { actionType: ActionType.Get, key: new HString('4'), expectedValue: 4 },
      ],
    },
    {
      // Test LRU behavior with varying accesses
      name: 'TestLRU_VaryingAccesses',
      capacity: 3,
      actions: [
        { actionType: ActionType.Set, key: new HString('1'), value: 1 },
        { actionType: ActionType.Set, key: new HString('2'), value: 2 },
        { actionType: ActionType.Set, key: new HString('3'), value: 3 },
        { actionType: ActionType.Get, key: new HString('1'), expectedValue: 1 }, // Accessing key "1"
        { actionType: ActionType.Get, key: new HString('2'), expectedValue: 2 }, // Accessing key "2"
        { actionType: ActionType.Set, key: new HString('4'), value: 4 }, // Should evict key "3"
        { actionType: ActionType.Get, key: new HString('3'), expectedValue: undefined },
        { actionType: ActionType.Get, key: new HString('1'), expectedValue: 1 },
        { actionType: ActionType.Get, key: new HString('2'), expectedValue: 2 },
        { actionType: ActionType.Get, key: new HString('4'), expectedValue: 4 },
      ],
    },
  ];

  for (const tt of tests) {
    test(tt.name, () => {
      const cache = newMemoCache<HString, unknown>(tt.capacity);
      for (const action of tt.actions) {
        switch (action.actionType) {
          case ActionType.Set:
            cache.set(action.key!, action.value);
            break;
          case ActionType.Get: {
            const [got] = cache.get(action.key ?? new HString(''));
            expect(got).toBe(action.expectedValue);
            break;
          }
        }
      }
    });
  }

  // Additional tests for capacity and size methods
  test('capacity returns the correct capacity', () => {
    const cache = newMemoCache<HString, string>(10);
    expect(cache.capacity()).toBe(10);
  });

  test('size returns the current number of items', () => {
    const cache = newMemoCache<HString, string>(10);
    expect(cache.size()).toBe(0);

    cache.set(new HString('a'), 'value-a');
    expect(cache.size()).toBe(1);

    cache.set(new HString('b'), 'value-b');
    expect(cache.size()).toBe(2);

    // Setting same key doesn't increase size
    cache.set(new HString('a'), 'new-value-a');
    expect(cache.size()).toBe(2);
  });

  test('get returns [value, true] for existing keys', () => {
    const cache = newMemoCache<HString, string>(10);
    cache.set(new HString('key'), 'value');
    const [value, found] = cache.get(new HString('key'));
    expect(value).toBe('value');
    expect(found).toBe(true);
  });

  test('get returns [undefined, false] for missing keys', () => {
    const cache = newMemoCache<HString, string>(10);
    const [value, found] = cache.get(new HString('missing'));
    expect(value).toBe(undefined);
    expect(found).toBe(false);
  });
});

describe('HString', () => {
  test('hash returns consistent SHA256 hash', () => {
    const h1 = new HString('test');
    const h2 = new HString('test');
    const h3 = new HString('different');

    expect(h1.hash()).toBe(h2.hash());
    expect(h1.hash()).not.toBe(h3.hash());
    // SHA256 produces 64-char hex string
    expect(h1.hash()).toHaveLength(64);
  });

  test('toString returns original value', () => {
    const h = new HString('hello');
    expect(h.toString()).toBe('hello');
  });
});

describe('HInt', () => {
  test('hash returns consistent SHA256 hash', () => {
    const h1 = new HInt(42);
    const h2 = new HInt(42);
    const h3 = new HInt(100);

    expect(h1.hash()).toBe(h2.hash());
    expect(h1.hash()).not.toBe(h3.hash());
    // SHA256 produces 64-char hex string
    expect(h1.hash()).toHaveLength(64);
  });

  test('valueOf returns original value', () => {
    const h = new HInt(42);
    expect(h.valueOf()).toBe(42);
  });
});

// Note: FuzzCache is not ported as JavaScript/TypeScript doesn't have built-in
// fuzzing support like Go. The test cases above cover the core LRU functionality.
