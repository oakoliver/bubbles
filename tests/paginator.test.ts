/**
 * Tests for paginator module — ported from charm.land/bubbles/v2/paginator/paginator_test.go
 */
import { describe, expect, test } from 'bun:test';
import {
  Model,
  newPaginator,
  withPerPage,
  withTotalPages,
  Type,
} from '../src/paginator/paginator.js';

/** Helper: create a keyPress message that the paginator update() expects. */
function keyMsg(key: string): { type: string; toString(): string } {
  return { type: 'keyPress', toString: () => key };
}

describe('New', () => {
  test('default values', () => {
    const model = newPaginator();
    expect(model.perPage).toBe(1);
    expect(model.totalPages).toBe(1);
  });

  test('with options', () => {
    const perPage = 42;
    const totalPages = 42;
    const model = newPaginator(withPerPage(perPage), withTotalPages(totalPages));
    expect(model.perPage).toBe(perPage);
    expect(model.totalPages).toBe(totalPages);
  });
});

describe('SetTotalPages', () => {
  const tests = [
    { name: 'Less than one page', items: 5, initialTotal: 1, expected: 5 },
    { name: 'Exactly one page', items: 10, initialTotal: 1, expected: 10 },
    { name: 'More than one page', items: 15, initialTotal: 1, expected: 15 },
    { name: 'negative value for page', items: -10, initialTotal: 1, expected: 1 },
  ];

  for (const tt of tests) {
    test(tt.name, () => {
      const model = newPaginator();
      if (model.totalPages !== tt.initialTotal) {
        model.setTotalPages(tt.initialTotal);
      }
      model.setTotalPages(tt.items);
      expect(model.totalPages).toBe(tt.expected);
    });
  }
});

describe('PrevPage', () => {
  const tests = [
    { name: 'Go to previous page', totalPages: 10, page: 1, expected: 0 },
    { name: 'Stay on first page', totalPages: 5, page: 0, expected: 0 },
  ];

  for (const tt of tests) {
    test(tt.name, () => {
      const model = newPaginator();
      model.setTotalPages(tt.totalPages);
      model.page = tt.page;

      // Go paginator uses tea.KeyPressMsg{Code: tea.KeyLeft}
      // Our paginator's default prevPage keys are: 'pageup', 'left', 'h'
      model.update(keyMsg('left'));
      expect(model.page).toBe(tt.expected);
    });
  }
});

describe('NextPage', () => {
  const tests = [
    { name: 'Go to next page', totalPages: 2, page: 0, expected: 1 },
    { name: 'Stay on last page', totalPages: 2, page: 1, expected: 1 },
  ];

  for (const tt of tests) {
    test(tt.name, () => {
      const model = newPaginator();
      model.setTotalPages(tt.totalPages);
      model.page = tt.page;

      model.update(keyMsg('right'));
      expect(model.page).toBe(tt.expected);
    });
  }
});

describe('OnLastPage', () => {
  const tests = [
    { name: 'On last page', page: 1, totalPages: 2, expected: true },
    { name: 'Not on last page', page: 0, totalPages: 2, expected: false },
  ];

  for (const tt of tests) {
    test(tt.name, () => {
      const model = newPaginator();
      model.setTotalPages(tt.totalPages);
      model.page = tt.page;
      expect(model.onLastPage()).toBe(tt.expected);
    });
  }
});

describe('OnFirstPage', () => {
  const tests = [
    { name: 'On first page', page: 0, totalPages: 2, expected: true },
    { name: 'Not on first page', page: 1, totalPages: 2, expected: false },
  ];

  for (const tt of tests) {
    test(tt.name, () => {
      const model = newPaginator();
      model.setTotalPages(tt.totalPages);
      model.page = tt.page;
      expect(model.onFirstPage()).toBe(tt.expected);
    });
  }
});

describe('ItemsOnPage', () => {
  const testCases = [
    { currentPage: 1, totalPages: 10, totalItems: 10, expectedItems: 1 },
    { currentPage: 3, totalPages: 10, totalItems: 10, expectedItems: 1 },
    { currentPage: 7, totalPages: 10, totalItems: 10, expectedItems: 1 },
  ];

  for (const tc of testCases) {
    test(`page ${tc.currentPage} of ${tc.totalPages}`, () => {
      const model = newPaginator();
      model.page = tc.currentPage;
      model.setTotalPages(tc.totalPages);
      const actual = model.itemsOnPage(tc.totalItems);
      expect(actual).toBe(tc.expectedItems);
    });
  }
});

describe('View', () => {
  test('Arabic view', () => {
    const model = newPaginator();
    model.setTotalPages(5);
    model.page = 2;
    expect(model.view()).toBe('3/5');
  });

  test('Dots view', () => {
    const model = newPaginator();
    model.type = Type.Dots;
    model.setTotalPages(3);
    model.page = 1;
    expect(model.view()).toBe('○•○');
  });
});
