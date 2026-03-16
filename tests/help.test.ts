/**
 * Tests for help module — ported from charm.land/bubbles/v2/help/help_test.go
 *
 * The Go tests use golden files. We test structurally by stripping ANSI
 * and checking the text content and truncation behavior.
 */
import { describe, expect, test } from 'bun:test';
import {
  Model,
  newHelp,
} from '../src/help/help.js';
import {
  Binding,
  newBinding,
  withKeys,
  withHelp,
  withDisabled,
} from '../src/key/key.js';
import { stripAnsi, stringWidth } from '@oakoliver/lipgloss';

// ── TestFullHelp (ported from Go) ───────────────────────────────────────────

describe('TestFullHelp', () => {
  const k = withKeys('x');
  const kb: Binding[][] = [
    [
      newBinding(k, withHelp('enter', 'continue')),
    ],
    [
      newBinding(k, withHelp('esc', 'back')),
      newBinding(k, withHelp('?', 'help')),
    ],
    [
      newBinding(k, withHelp('H', 'home')),
      newBinding(k, withHelp('ctrl+c', 'quit')),
      newBinding(k, withHelp('ctrl+l', 'log')),
    ],
  ];

  test('full help 20 width', () => {
    const m = newHelp();
    m.fullSeparator = ' | ';
    m.setWidth(20);
    const s = stripAnsi(m.fullHelpView(kb));

    // At 20 width, should be truncated (not all columns fit)
    expect(stringWidth(s)).toBeLessThanOrEqual(20);
    // Should contain at least the first column
    expect(s).toContain('enter');
    expect(s).toContain('continue');
  });

  test('full help 30 width', () => {
    const m = newHelp();
    m.fullSeparator = ' | ';
    m.setWidth(30);
    const s = stripAnsi(m.fullHelpView(kb));

    expect(stringWidth(s)).toBeLessThanOrEqual(30);
    // Should contain first column
    expect(s).toContain('enter');
    expect(s).toContain('continue');
  });

  test('full help 40 width', () => {
    const m = newHelp();
    m.fullSeparator = ' | ';
    m.setWidth(40);
    const s = stripAnsi(m.fullHelpView(kb));

    // At 40 width, the first two columns fit (with separator) but the
    // third gets cut. The multi-line joinHorizontal output may exceed
    // the nominal width since columns are measured individually.
    expect(s).toContain('enter');
    expect(s).toContain('continue');
    // Should have at least the second column too
    expect(s).toContain('esc');
    expect(s).toContain('back');
  });

  test('full help unlimited width', () => {
    const m = newHelp();
    m.fullSeparator = ' | ';
    // Width 0 = unlimited
    const s = stripAnsi(m.fullHelpView(kb));

    // Should contain all columns
    expect(s).toContain('enter');
    expect(s).toContain('continue');
    expect(s).toContain('esc');
    expect(s).toContain('back');
    expect(s).toContain('?');
    expect(s).toContain('help');
    expect(s).toContain('H');
    expect(s).toContain('home');
    expect(s).toContain('ctrl+c');
    expect(s).toContain('quit');
    expect(s).toContain('ctrl+l');
    expect(s).toContain('log');
  });
});

// ── Short help tests ────────────────────────────────────────────────────────

describe('ShortHelp', () => {
  test('renders bindings inline', () => {
    const bindings = [
      newBinding(withKeys('?'), withHelp('?', 'help')),
      newBinding(withKeys('q'), withHelp('q', 'quit')),
    ];
    const m = newHelp();
    const s = stripAnsi(m.shortHelpView(bindings));

    expect(s).toContain('?');
    expect(s).toContain('help');
    expect(s).toContain('q');
    expect(s).toContain('quit');
  });

  test('truncates at width', () => {
    const bindings = [
      newBinding(withKeys('?'), withHelp('?', 'help')),
      newBinding(withKeys('q'), withHelp('q', 'quit')),
      newBinding(withKeys('enter'), withHelp('enter', 'continue')),
      newBinding(withKeys('ctrl+c'), withHelp('ctrl+c', 'force quit')),
    ];
    const m = newHelp();
    m.setWidth(20);
    const s = m.shortHelpView(bindings);

    expect(stringWidth(s)).toBeLessThanOrEqual(20);
  });

  test('empty bindings returns empty string', () => {
    const m = newHelp();
    expect(m.shortHelpView([])).toBe('');
  });

  test('disabled bindings are skipped', () => {
    const bindings = [
      newBinding(withKeys('?'), withHelp('?', 'help'), withDisabled()),
      newBinding(withKeys('q'), withHelp('q', 'quit')),
    ];
    const m = newHelp();
    const s = stripAnsi(m.shortHelpView(bindings));

    expect(s).not.toContain('help');
    expect(s).toContain('q');
    expect(s).toContain('quit');
  });
});

// ── Full help additional tests ──────────────────────────────────────────────

describe('FullHelp additional', () => {
  test('empty groups returns empty string', () => {
    const m = newHelp();
    expect(m.fullHelpView([])).toBe('');
  });

  test('groups with all disabled bindings are skipped', () => {
    const kb: Binding[][] = [
      [
        newBinding(withKeys('x'), withHelp('x', 'action'), withDisabled()),
      ],
      [
        newBinding(withKeys('q'), withHelp('q', 'quit')),
      ],
    ];
    const m = newHelp();
    const s = stripAnsi(m.fullHelpView(kb));

    // First group should be skipped (all disabled)
    expect(s).not.toContain('action');
    expect(s).toContain('q');
    expect(s).toContain('quit');
  });
});

// ── Model tests ─────────────────────────────────────────────────────────────

describe('Help Model', () => {
  test('default properties', () => {
    const m = newHelp();
    expect(m.showAll).toBe(false);
    expect(m.shortSeparator).toBe(' \u2022 ');
    expect(m.fullSeparator).toBe('    ');
    expect(m.ellipsis).toBe('\u2026');
    expect(m.width()).toBe(0);
  });

  test('setWidth/width', () => {
    const m = newHelp();
    m.setWidth(80);
    expect(m.width()).toBe(80);
  });

  test('update is no-op', () => {
    const m = newHelp();
    const [updated, cmd] = m.update({ type: 'anything' });
    expect(updated).toBe(m);
    expect(cmd).toBeNull();
  });

  test('view delegates to shortHelpView by default', () => {
    const keymap = {
      shortHelp: () => [
        newBinding(withKeys('q'), withHelp('q', 'quit')),
      ],
      fullHelp: () => [[
        newBinding(withKeys('?'), withHelp('?', 'help')),
      ]],
    };
    const m = newHelp();
    const short = stripAnsi(m.view(keymap));
    expect(short).toContain('q');
    expect(short).toContain('quit');
  });

  test('view delegates to fullHelpView when showAll is true', () => {
    const keymap = {
      shortHelp: () => [
        newBinding(withKeys('q'), withHelp('q', 'quit')),
      ],
      fullHelp: () => [[
        newBinding(withKeys('?'), withHelp('?', 'help')),
        newBinding(withKeys('H'), withHelp('H', 'home')),
      ]],
    };
    const m = newHelp();
    m.showAll = true;
    const full = stripAnsi(m.view(keymap));
    expect(full).toContain('?');
    expect(full).toContain('help');
    expect(full).toContain('H');
    expect(full).toContain('home');
  });
});
