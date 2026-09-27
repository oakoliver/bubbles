/**
 * Cursor colour handling for textinput and textarea, checked against real
 * Go output from charm.land/bubbles/v2 v2.2.1.
 *
 * Upstream's updateVirtualCursorStyle always replaces the virtual cursor style
 * with lipgloss.NewStyle().Foreground(styles.Cursor.Color), so a nil colour
 * yields a cursor with no foreground colour (not the previous colour).
 *
 * See testdata/cursor/generate_goldens.go.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as textinput from '../src/textinput/textinput.js';
import * as textarea from '../src/textarea/textarea.js';

interface GoldenCase {
  name: string;
  component: 'textinput' | 'textarea';
  color: string | null;
  blink: boolean;
  value: string;
  view: string;
}

/**
 * Normalises ANSI output to a list of styled cells so that goldens compare on
 * what is rendered rather than on SGR byte encoding (Go's lipgloss merges
 * parameters and resets with ESC[m; ours emits one sequence per attribute
 * and resets with ESC[0m).
 */
function cells(s: string): string {
  let fg = '';
  let bg = '';
  const attrs = new Set<number>();
  const out: string[] = [];
  const re = /\x1b\[([0-9;]*)m|([\s\S])/gu;
  for (const m of s.matchAll(re)) {
    if (m[2] !== undefined) {
      if (m[2] === '\n') {
        out.push('\n');
        continue;
      }
      out.push(`${m[2]}{${[...attrs].sort().join(',')}|${fg}|${bg}}`);
      continue;
    }
    const ps = m[1] === '' ? [0] : m[1]!.split(';').map(Number);
    for (let i = 0; i < ps.length; i++) {
      const n = ps[i]!;
      if (n === 0) {
        fg = '';
        bg = '';
        attrs.clear();
      } else if (n === 38 || n === 48) {
        const mode = ps[i + 1];
        let v: string;
        if (mode === 5) {
          v = `5;${ps[i + 2]}`;
          i += 2;
        } else {
          v = `2;${ps[i + 2]};${ps[i + 3]};${ps[i + 4]}`;
          i += 4;
        }
        if (n === 38) fg = v;
        else bg = v;
      } else if (n === 39) fg = '';
      else if (n === 49) bg = '';
      else if ((n >= 30 && n <= 37) || (n >= 90 && n <= 97)) fg = String(n);
      else if ((n >= 40 && n <= 47) || (n >= 100 && n <= 107)) bg = String(n);
      else if (n === 22) {
        attrs.delete(1);
        attrs.delete(2);
      } else if (n >= 23 && n <= 29) attrs.delete(n - 20);
      else attrs.add(n);
    }
  }
  return out.join(' ');
}

const goldens: GoldenCase[] = JSON.parse(
  readFileSync(join(import.meta.dir, 'testdata', 'cursor', 'cursor-colour-goldens.json'), 'utf8'),
);

function renderTextInput(c: GoldenCase): string {
  const ti = textinput.newTextInput();
  ti.placeholder = c.value === '' ? 'type' : '';
  ti.setWidth(20);
  const s = textinput.defaultDarkStyles();
  s.cursor.color = c.color;
  s.cursor.blink = c.blink;
  ti.setStyles(s);
  ti.focus();
  ti.setValue(c.value);
  return ti.view();
}

function renderTextarea(c: GoldenCase): string {
  const ta = textarea.newTextarea();
  ta.placeholder = c.value === '' ? 'type' : '';
  ta.setWidth(20);
  ta.setHeight(2);
  const s = textarea.defaultDarkStyles();
  s.cursor.color = c.color;
  s.cursor.blink = c.blink;
  ta.setStyles(s);
  ta.focus();
  ta.setValue(c.value);
  return ta.view();
}

describe('cursor colour matches Go bubbles v2.2.1', () => {
  for (const c of goldens) {
    const label = `${c.name} blink=${c.blink} value=${JSON.stringify(c.value)}`;
    test(label, () => {
      const got = c.component === 'textinput' ? renderTextInput(c) : renderTextarea(c);
      expect(cells(got)).toBe(cells(c.view));
    });
  }
});

describe('setting styles replaces the previous cursor colour', () => {
  test('textinput: nil colour after a set colour clears it', () => {
    const ti = textinput.newTextInput();
    ti.setWidth(20);
    const coloured = textinput.defaultDarkStyles();
    coloured.cursor.color = '2';
    ti.setStyles(coloured);
    const plain = textinput.defaultDarkStyles();
    plain.cursor.color = null;
    ti.setStyles(plain);
    ti.focus();
    ti.setValue('hi');
    const want = goldens.find(
      (g) => g.component === 'textinput' && g.color === null && g.blink && g.value === 'hi',
    )!;
    expect(cells(ti.view())).toBe(cells(want.view));
  });

  test('textinput: undefined colour behaves like nil', () => {
    const ti = textinput.newTextInput();
    ti.setWidth(20);
    const s = textinput.defaultDarkStyles();
    (s.cursor as { color: unknown }).color = undefined;
    ti.setStyles(s);
    ti.focus();
    ti.setValue('hi');
    const want = goldens.find(
      (g) => g.component === 'textinput' && g.color === null && g.blink && g.value === 'hi',
    )!;
    expect(cells(ti.view())).toBe(cells(want.view));
  });

  test('textarea: nil colour after a set colour clears it', () => {
    const ta = textarea.newTextarea();
    ta.setWidth(20);
    ta.setHeight(2);
    const coloured = textarea.defaultDarkStyles();
    coloured.cursor.color = '2';
    ta.setStyles(coloured);
    const plain = textarea.defaultDarkStyles();
    plain.cursor.color = null;
    ta.setStyles(plain);
    ta.focus();
    ta.setValue('hi');
    const want = goldens.find(
      (g) => g.component === 'textarea' && g.color === null && g.blink && g.value === 'hi',
    )!;
    expect(cells(ta.view())).toBe(cells(want.view));
  });

  test('real cursor carries a nil colour through', () => {
    const ti = textinput.newTextInput();
    ti.setVirtualCursor(false);
    const s = textinput.defaultDarkStyles();
    s.cursor.color = null;
    ti.setStyles(s);
    ti.focus();
    expect(ti.cursor()!.color).toBeNull();

    const ta = textarea.newTextarea();
    ta.setVirtualCursor(false);
    const ts = textarea.defaultDarkStyles();
    ts.cursor.color = null;
    ta.setStyles(ts);
    ta.focus();
    expect(ta.cursor()!.color).toBeNull();
  });
});
