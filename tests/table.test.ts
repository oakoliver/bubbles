/**
 * Tests for table module — ported from charm.land/bubbles/v2/table/table_test.go
 *
 * The Go tests use golden file snapshots for View(). We test structurally
 * by verifying cursor position, row/column counts, and view output properties.
 */
import { describe, expect, test } from 'bun:test';
import {
  Model,
  newTable,
  defaultKeyMap,
  defaultStyles,
  withColumns,
  withRows,
  withHeight,
  withWidth,
  withFocused,
  withStyles,
  withKeyMap,
} from '../src/table/table.js';
import type { Row, Column, Styles, KeyMap } from '../src/table/table.js';
import { stripAnsi, stringWidth, newStyle } from '@oakoliver/lipgloss';

const testCols: Column[] = [
  { title: 'col1', width: 10 },
  { title: 'col2', width: 10 },
  { title: 'col3', width: 10 },
];

// ── TestNew ─────────────────────────────────────────────────────────────────

describe('TestNew', () => {
  test('Default', () => {
    const table = newTable();
    expect(table.cursor()).toBe(0);
    expect(table.rows().length).toBe(0);
    expect(table.columns().length).toBe(0);
  });

  test('WithColumns', () => {
    const cols: Column[] = [
      { title: 'Foo', width: 1 },
      { title: 'Bar', width: 2 },
    ];
    const table = newTable(withColumns(cols));
    expect(table.columns().length).toBe(2);
    expect(table.columns()[0].title).toBe('Foo');
    expect(table.columns()[1].title).toBe('Bar');
  });

  test('WithColumns; WithRows', () => {
    const cols: Column[] = [
      { title: 'Foo', width: 1 },
      { title: 'Bar', width: 2 },
    ];
    const rows: Row[] = [
      ['1', 'Foo'],
      ['2', 'Bar'],
    ];
    const table = newTable(withColumns(cols), withRows(rows));
    expect(table.columns().length).toBe(2);
    expect(table.rows().length).toBe(2);
    expect(table.rows()[0]).toEqual(['1', 'Foo']);
    expect(table.rows()[1]).toEqual(['2', 'Bar']);
  });

  test('WithHeight', () => {
    const table = newTable(withHeight(10));
    // Viewport height is 1 less due to headers
    expect(table.height()).toBeLessThanOrEqual(10);
  });

  test('WithWidth', () => {
    const table = newTable(withWidth(10));
    expect(table.width()).toBe(10);
  });

  test('WithFocused', () => {
    const table = newTable(withFocused(true));
    expect(table.focused()).toBe(true);
  });

  test('WithStyles', () => {
    const s: Styles = {
      header: newStyle(),
      cell: newStyle(),
      selected: newStyle(),
    };
    const table = newTable(withStyles(s));
    // Just verify it doesn't throw
    expect(table).toBeDefined();
  });
});

// ── TestFromValues ──────────────────────────────────────────────────────────

describe('TestFromValues', () => {
  test('comma separator', () => {
    const input = 'foo1,bar1\nfoo2,bar2\nfoo3,bar3';
    const table = newTable(
      withColumns([{ title: 'Foo', width: 10 }, { title: 'Bar', width: 10 }]),
    );
    table.fromValues(input, ',');

    expect(table.rows().length).toBe(3);
    expect(table.rows()[0]).toEqual(['foo1', 'bar1']);
    expect(table.rows()[1]).toEqual(['foo2', 'bar2']);
    expect(table.rows()[2]).toEqual(['foo3', 'bar3']);
  });

  test('tab separator', () => {
    const input = 'foo1.\tbar1\nfoo,bar,baz\tbar,2';
    const table = newTable(
      withColumns([{ title: 'Foo', width: 10 }, { title: 'Bar', width: 10 }]),
    );
    table.fromValues(input, '\t');

    expect(table.rows().length).toBe(2);
    expect(table.rows()[0]).toEqual(['foo1.', 'bar1']);
    expect(table.rows()[1]).toEqual(['foo,bar,baz', 'bar,2']);
  });
});

// ── TestRenderRow ───────────────────────────────────────────────────────────

describe('TestRenderRow', () => {
  // Go tests directly call m.renderRow(0) on a partially-initialized model,
  // bypassing the viewport. We do the same via bracket notation.
  test('simple row', () => {
    const table = newTable(
      withColumns(testCols),
      withRows([['Foooooo', 'Baaaaar', 'Baaaaaz']]),
      withStyles({ header: newStyle(), cell: newStyle(), selected: newStyle() }),
    );

    const rendered = stripAnsi((table as any).renderRow(0));
    expect(rendered).toContain('Foooooo');
    expect(rendered).toContain('Baaaaar');
    expect(rendered).toContain('Baaaaaz');
  });

  test('row with truncation', () => {
    const table = newTable(
      withColumns(testCols),
      withRows([['Foooooooooo', 'Baaaaaaaaar', 'Quuuuuuuuux']]),
      withStyles({ header: newStyle(), cell: newStyle(), selected: newStyle() }),
    );

    const rendered = stripAnsi((table as any).renderRow(0));
    // Each value exceeds width 10, so truncation ellipsis should appear
    expect(rendered).toContain('…');
  });

  test('ANSI width handling', () => {
    const value = '\x1b[31mABCDEFGH\x1b[0m';
    const table = newTable(
      withColumns([{ title: 'col1', width: 8 }]),
      withRows([[value]]),
      withStyles({ header: newStyle(), cell: newStyle(), selected: newStyle() }),
    );

    const rendered = stripAnsi((table as any).renderRow(0));
    expect(rendered).toContain('ABCDEFGH');
  });
});

// ── TestCursorNavigation ────────────────────────────────────────────────────

describe('TestCursorNavigation', () => {
  const rows: Row[] = [['r1'], ['r2'], ['r3'], ['r4']];

  test('New', () => {
    const table = newTable(withColumns(testCols), withRows(rows));
    expect(table.cursor()).toBe(0);
  });

  test('MoveDown', () => {
    const table = newTable(withColumns(testCols), withRows(rows));
    table.moveDown(2);
    expect(table.cursor()).toBe(2);
  });

  test('MoveUp', () => {
    const table = newTable(withColumns(testCols), withRows(rows));
    table.setCursor(3);
    table.moveUp(2);
    expect(table.cursor()).toBe(1);
  });

  test('GotoBottom', () => {
    const table = newTable(withColumns(testCols), withRows(rows));
    table.gotoBottom();
    expect(table.cursor()).toBe(3);
  });

  test('GotoTop', () => {
    const table = newTable(withColumns(testCols), withRows(rows));
    table.setCursor(3);
    table.gotoTop();
    expect(table.cursor()).toBe(0);
  });

  test('SetCursor', () => {
    const table = newTable(withColumns(testCols), withRows(rows));
    table.setCursor(2);
    expect(table.cursor()).toBe(2);
  });

  test('MoveDown with overflow', () => {
    const table = newTable(withColumns(testCols), withRows(rows));
    table.moveDown(5);
    expect(table.cursor()).toBe(3);
  });

  test('MoveUp with overflow', () => {
    const table = newTable(withColumns(testCols), withRows(rows));
    table.setCursor(3);
    table.moveUp(5);
    expect(table.cursor()).toBe(0);
  });

  test('Blur does not stop movement', () => {
    const table = newTable(withColumns(testCols), withRows(rows));
    table.blur();
    table.moveDown(2);
    expect(table.cursor()).toBe(2);
  });
});

// ── TestSetRows ─────────────────────────────────────────────────────────────

describe('TestSetRows', () => {
  test('SetRows', () => {
    const table = newTable(withColumns(testCols));
    expect(table.rows().length).toBe(0);

    table.setRows([['r1'], ['r2']]);
    expect(table.rows().length).toBe(2);
    expect(table.rows()[0]).toEqual(['r1']);
    expect(table.rows()[1]).toEqual(['r2']);
  });
});

// ── TestSetColumns ──────────────────────────────────────────────────────────

describe('TestSetColumns', () => {
  test('SetColumns', () => {
    const table = newTable();
    expect(table.columns().length).toBe(0);

    table.setColumns([{ title: 'Foo', width: 10 }, { title: 'Bar', width: 10 }]);
    expect(table.columns().length).toBe(2);
    expect(table.columns()[0].title).toBe('Foo');
    expect(table.columns()[1].title).toBe('Bar');
  });
});

// ── TestView ────────────────────────────────────────────────────────────────

describe('TestView', () => {
  test('Empty', () => {
    const table = newTable(withWidth(60), withHeight(21));
    const view = table.view();
    expect(view).toBeDefined();
    expect(typeof view).toBe('string');
  });

  test('Single row and column', () => {
    const table = newTable(
      withWidth(27),
      withHeight(21),
      withColumns([{ title: 'Name', width: 25 }]),
      withRows([['Chocolate Digestives']]),
    );
    const view = stripAnsi(table.view());
    expect(view).toContain('Name');
    expect(view).toContain('Chocolate Digestives');
  });

  test('Multiple rows and columns', () => {
    const table = newTable(
      withWidth(59),
      withHeight(21),
      withColumns([
        { title: 'Name', width: 25 },
        { title: 'Country of Origin', width: 16 },
        { title: 'Dunk-able', width: 12 },
      ]),
      withRows([
        ['Chocolate Digestives', 'UK', 'Yes'],
        ['Tim Tams', 'Australia', 'No'],
        ['Hobnobs', 'UK', 'Yes'],
      ]),
    );
    const view = stripAnsi(table.view());
    expect(view).toContain('Name');
    // "Country of Origin" (17 chars) at width 16 gets truncated to "Country of Orig…"
    expect(view).toContain('Country of Orig');
    expect(view).toContain('Dunk-able');
    expect(view).toContain('Chocolate Digestives');
    expect(view).toContain('Tim Tams');
    expect(view).toContain('Hobnobs');
    expect(view).toContain('UK');
    expect(view).toContain('Australia');
  });

  test('Height greater than rows', () => {
    const table = newTable(
      withWidth(59),
      withHeight(6),
      withColumns([
        { title: 'Name', width: 25 },
        { title: 'Country of Origin', width: 16 },
        { title: 'Dunk-able', width: 12 },
      ]),
      withRows([
        ['Chocolate Digestives', 'UK', 'Yes'],
        ['Tim Tams', 'Australia', 'No'],
        ['Hobnobs', 'UK', 'Yes'],
      ]),
    );
    const view = stripAnsi(table.view());
    expect(view).toContain('Chocolate Digestives');
  });

  test('Height less than rows', () => {
    const table = newTable(
      withWidth(59),
      withHeight(2),
      withColumns([
        { title: 'Name', width: 25 },
        { title: 'Country of Origin', width: 16 },
        { title: 'Dunk-able', width: 12 },
      ]),
      withRows([
        ['Chocolate Digestives', 'UK', 'Yes'],
        ['Tim Tams', 'Australia', 'No'],
        ['Hobnobs', 'UK', 'Yes'],
      ]),
    );
    const view = table.view();
    expect(view).toBeDefined();
  });

  test('Width greater than columns', () => {
    const table = newTable(
      withWidth(80),
      withHeight(21),
      withColumns([
        { title: 'Name', width: 25 },
        { title: 'Country of Origin', width: 16 },
        { title: 'Dunk-able', width: 12 },
      ]),
      withRows([
        ['Chocolate Digestives', 'UK', 'Yes'],
        ['Tim Tams', 'Australia', 'No'],
        ['Hobnobs', 'UK', 'Yes'],
      ]),
    );
    const view = stripAnsi(table.view());
    expect(view).toContain('Name');
    expect(view).toContain('Chocolate Digestives');
  });
});

// ── Additional model tests ──────────────────────────────────────────────────

describe('Model methods', () => {
  test('selectedRow returns current row', () => {
    const table = newTable(
      withColumns(testCols),
      withRows([['a', 'b', 'c'], ['d', 'e', 'f']]),
    );
    expect(table.selectedRow()).toEqual(['a', 'b', 'c']);

    table.moveDown(1);
    expect(table.selectedRow()).toEqual(['d', 'e', 'f']);
  });

  test('selectedRow returns null for empty table', () => {
    const table = newTable(withColumns(testCols));
    expect(table.selectedRow()).toBeNull();
  });

  test('focus/blur toggle', () => {
    const table = newTable();
    expect(table.focused()).toBe(false);

    table.focus();
    expect(table.focused()).toBe(true);

    table.blur();
    expect(table.focused()).toBe(false);
  });

  test('setWidth/setHeight', () => {
    const table = newTable();
    table.setWidth(100);
    expect(table.width()).toBe(100);
  });

  test('helpView returns a string', () => {
    const table = newTable();
    const help = table.helpView();
    expect(typeof help).toBe('string');
  });

  test('update with key when focused', () => {
    const table = newTable(
      withColumns(testCols),
      withRows([['r1'], ['r2'], ['r3']]),
      withFocused(true),
    );
    expect(table.cursor()).toBe(0);

    // Simulate down key
    table.update({ type: 'keyPress', toString: () => 'down' });
    expect(table.cursor()).toBe(1);
  });

  test('update with key when blurred does nothing', () => {
    const table = newTable(
      withColumns(testCols),
      withRows([['r1'], ['r2'], ['r3']]),
    );
    // Not focused by default
    table.update({ type: 'keyPress', toString: () => 'down' });
    expect(table.cursor()).toBe(0);
  });
});
