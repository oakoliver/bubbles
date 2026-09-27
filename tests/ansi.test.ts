/**
 * ANSI helpers and viewport rendering checked against goldens generated with
 * real Go: github.com/charmbracelet/x/ansi v0.11.8 (StringWidth, Strip,
 * Truncate, TruncateLeft, Cut) and charm.land/bubbles/v2 v2.2.1 (viewport).
 * See testdata/ansi/generate_goldens.go.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cut,
  stringWidth,
  stripAnsi,
  tokenizeAnsi,
  truncate,
  truncateLeft,
} from '../src/internal/ansi.js';
import { newViewport, withHeight, withWidth } from '../src/viewport/viewport.js';

interface Goldens {
  widths: { input: string; width: number; strip: string }[];
  truncate: { input: string; n: number; tail: string; expect: string }[];
  truncateLeft: { input: string; n: number; tail: string; expect: string }[];
  cut: { input: string; left: number; right: number; expect: string }[];
  viewport: {
    name: string;
    width: number;
    height: number;
    xOffset: number;
    yOffset: number;
    softWrap: boolean;
    lines: string[];
    view: string;
  }[];
}

const goldens: Goldens = JSON.parse(
  readFileSync(join(import.meta.dir, 'testdata', 'ansi', 'xansi-goldens.json'), 'utf8'),
);

const q = (s: string) => JSON.stringify(s);

describe('x/ansi goldens', () => {
  test('StringWidth and Strip', () => {
    for (const c of goldens.widths) {
      expect([q(c.input), stringWidth(c.input)]).toEqual([q(c.input), c.width]);
      expect(stripAnsi(c.input)).toBe(c.strip);
    }
  });

  test(`Truncate (${goldens.truncate.length} cases)`, () => {
    for (const c of goldens.truncate) {
      expect([q(c.input), c.n, c.tail, truncate(c.input, c.n, c.tail)])
        .toEqual([q(c.input), c.n, c.tail, c.expect]);
    }
  });

  test(`TruncateLeft (${goldens.truncateLeft.length} cases)`, () => {
    for (const c of goldens.truncateLeft) {
      expect([q(c.input), c.n, c.tail, truncateLeft(c.input, c.n, c.tail)])
        .toEqual([q(c.input), c.n, c.tail, c.expect]);
    }
  });

  test(`Cut (${goldens.cut.length} cases)`, () => {
    for (const c of goldens.cut) {
      expect([q(c.input), c.left, c.right, cut(c.input, c.left, c.right)])
        .toEqual([q(c.input), c.left, c.right, c.expect]);
    }
  });
});

describe('escape sequence parsing', () => {
  test('OSC 8 hyperlink parameters are not visible text', () => {
    const s = 'x \x1b]8;id=1;https://example.com\x1b\\link\x1b]8;;\x1b\\ y';
    expect(stringWidth(s)).toBe(8);
    expect(stripAnsi(s)).toBe('x link y');
    // Cutting inside the link keeps the opener and the closer intact.
    expect(cut(s, 0, 4)).toBe('x \x1b]8;id=1;https://example.com\x1b\\li\x1b]8;;\x1b\\');
  });

  test('BEL-terminated OSC', () => {
    const s = '\x1b]8;;https://npmjs.com\x07available on npm\x1b]8;;\x07!';
    expect(stringWidth(s)).toBe(17);
    expect(cut(s, 10, 17)).toBe('\x1b]8;;https://npmjs.com\x07on npm\x1b]8;;\x07!');
  });

  test('tokenizeAnsi groups whole sequences', () => {
    const s = 'a\x1b]0;title\x07b\x1b[1;31mc\x1bPq#0\x1b\\d\x1b7e';
    expect(tokenizeAnsi(s)).toEqual([
      { text: 'a', ansi: false },
      { text: '\x1b]0;title\x07', ansi: true },
      { text: 'b', ansi: false },
      { text: '\x1b[1;31m', ansi: true },
      { text: 'c', ansi: false },
      { text: '\x1bPq#0\x1b\\', ansi: true },
      { text: 'd', ansi: false },
      { text: '\x1b7', ansi: true },
      { text: 'e', ansi: false },
    ]);
  });
});

describe('viewport with hyperlinks (bubbles v2.2.1 goldens)', () => {
  for (const c of goldens.viewport) {
    test(c.name, () => {
      const vp = newViewport(withWidth(c.width), withHeight(c.height));
      vp.softWrap = c.softWrap;
      vp.setContent(c.lines.join('\n'));
      vp.setYOffset(c.yOffset);
      vp.setXOffset(c.xOffset);
      expect(vp.view()).toBe(c.view);
    });
  }
});
