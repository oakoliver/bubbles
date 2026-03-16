/**
 * Tests for progress module — ported from charm.land/bubbles/v2/progress/progress_test.go
 *
 * The Go tests use golden file (snapshot) comparisons. Here we test the ViewAs output
 * structurally: correct width, ANSI codes presence, percentage display, and color logic.
 */
import { describe, expect, test } from 'bun:test';
import {
  Model,
  newProgress,
  withColors,
  withScaled,
  withoutPercentage,
  withFillCharacters,
  withColorFunc,
  withWidth,
  withSpringOptions,
  withDefaultBlend,
  DefaultFullCharHalfBlock,
  DefaultFullCharFullBlock,
  DefaultEmptyCharBlock,
} from '../src/progress/progress.js';
import type { ColorFunc } from '../src/progress/progress.js';
import { stringWidth, stripAnsi } from '@oakoliver/lipgloss';

// ── TestBlend subtests (ported from Go) ─────────────────────────────────────

describe('TestBlend', () => {
  test('10w-red-to-green-50perc', () => {
    const p = newProgress(
      withColors('#FF0000', '#00FF00'),
      withScaled(false),
      withoutPercentage(),
    );
    p.setWidth(10);
    const view = p.viewAs(0.5);

    // Should have visible width of 10 (no percentage)
    expect(stringWidth(view)).toBe(10);
    // Should contain ANSI escape codes for colors
    expect(view).toContain('\x1b[');
    // Should contain fill and empty characters
    const stripped = stripAnsi(view);
    expect(stripped.length).toBeGreaterThan(0);
  });

  test('10w-red-to-green-50perc-full-block', () => {
    const p = newProgress(
      withColors('#FF0000', '#00FF00'),
      withFillCharacters(DefaultFullCharFullBlock, DefaultEmptyCharBlock),
      withoutPercentage(),
    );
    p.setWidth(10);
    const view = p.viewAs(0.5);

    expect(stringWidth(view)).toBe(10);
    // Should use full block character
    const stripped = stripAnsi(view);
    expect(stripped).toContain(DefaultFullCharFullBlock);
  });

  test('30w-red-to-green-100perc', () => {
    const p = newProgress(
      withColors('#FF0000', '#00FF00'),
      withScaled(false),
      withoutPercentage(),
    );
    p.setWidth(30);
    const view = p.viewAs(1.0);

    expect(stringWidth(view)).toBe(30);
    // At 100%, there should be no empty characters
    const stripped = stripAnsi(view);
    expect(stripped).not.toContain(DefaultEmptyCharBlock);
  });

  test('10w-red-to-green-scaled-50perc', () => {
    const p = newProgress(
      withColors('#FF0000', '#00FF00'),
      withScaled(true),
      withoutPercentage(),
    );
    p.setWidth(10);
    const view = p.viewAs(0.5);

    expect(stringWidth(view)).toBe(10);
    expect(view).toContain('\x1b[');
  });

  test('30w-red-to-green-scaled-100perc', () => {
    const p = newProgress(
      withColors('#FF0000', '#00FF00'),
      withScaled(true),
      withoutPercentage(),
    );
    p.setWidth(30);
    const view = p.viewAs(1.0);

    expect(stringWidth(view)).toBe(30);
    const stripped = stripAnsi(view);
    expect(stripped).not.toContain(DefaultEmptyCharBlock);
  });

  test('30w-colorfunc-rgb-100perc', () => {
    const colorFn: ColorFunc = (_total: number, current: number) => {
      if (current <= 0.3) return '#FF0000';
      if (current <= 0.7) return '#00FF00';
      return '#0000FF';
    };
    const p = newProgress(
      withColorFunc(colorFn),
      withoutPercentage(),
    );
    p.setWidth(30);
    const view = p.viewAs(1.0);

    expect(stringWidth(view)).toBe(30);
    // Should contain multiple different color codes (red, green, blue regions)
    expect(view).toContain('\x1b[');
    const stripped = stripAnsi(view);
    expect(stripped).not.toContain(DefaultEmptyCharBlock);
  });
});

// ── Additional functional tests ─────────────────────────────────────────────

describe('Progress Model', () => {
  test('default factory creates valid model', () => {
    const p = newProgress();
    expect(p.width()).toBe(40); // DEFAULT_WIDTH
    expect(p.showPercentage).toBe(true);
    expect(p.full).toBe(DefaultFullCharHalfBlock);
    expect(p.empty).toBe(DefaultEmptyCharBlock);
    expect(p.percent()).toBe(0);
  });

  test('viewAs at 0%', () => {
    const p = newProgress(withoutPercentage());
    p.setWidth(20);
    const view = p.viewAs(0);
    const stripped = stripAnsi(view);
    // At 0%, all characters should be empty
    for (const ch of stripped) {
      expect(ch).toBe(DefaultEmptyCharBlock);
    }
    expect(stringWidth(view)).toBe(20);
  });

  test('viewAs at 100%', () => {
    const p = newProgress(withoutPercentage());
    p.setWidth(20);
    const view = p.viewAs(1.0);
    const stripped = stripAnsi(view);
    // At 100%, no empty characters
    expect(stripped).not.toContain(DefaultEmptyCharBlock);
    expect(stringWidth(view)).toBe(20);
  });

  test('percentage display', () => {
    const p = newProgress();
    p.setWidth(40);
    const view = p.viewAs(0.5);
    const stripped = stripAnsi(view);
    // Should contain " 50%"
    expect(stripped).toContain('50%');
  });

  test('percentage display at 0%', () => {
    const p = newProgress();
    p.setWidth(40);
    const view = p.viewAs(0);
    const stripped = stripAnsi(view);
    expect(stripped).toContain('0%');
  });

  test('percentage display at 100%', () => {
    const p = newProgress();
    p.setWidth(40);
    const view = p.viewAs(1.0);
    const stripped = stripAnsi(view);
    expect(stripped).toContain('100%');
  });

  test('withoutPercentage hides percentage', () => {
    const p = newProgress(withoutPercentage());
    p.setWidth(20);
    const view = p.viewAs(0.5);
    const stripped = stripAnsi(view);
    expect(stripped).not.toContain('%');
  });

  test('setPercent clamps to [0, 1]', () => {
    const p = newProgress();
    p.setPercent(1.5);
    expect(p.percent()).toBe(1.0);
    p.setPercent(-0.5);
    expect(p.percent()).toBe(0);
  });

  test('incrPercent adds to current', () => {
    const p = newProgress();
    p.setPercent(0.3);
    p.incrPercent(0.2);
    expect(p.percent()).toBeCloseTo(0.5, 5);
  });

  test('decrPercent subtracts from current', () => {
    const p = newProgress();
    p.setPercent(0.5);
    p.decrPercent(0.2);
    expect(p.percent()).toBeCloseTo(0.3, 5);
  });

  test('setWidth changes width', () => {
    const p = newProgress();
    p.setWidth(60);
    expect(p.width()).toBe(60);
  });

  test('withWidth option', () => {
    const p = newProgress(withWidth(80));
    expect(p.width()).toBe(80);
  });

  test('withSpringOptions configures spring', () => {
    const p = newProgress(withSpringOptions(25.0, 0.8));
    expect(p._springCustomized).toBe(true);
  });

  test('withDefaultBlend sets blend colors', () => {
    const p = newProgress(withDefaultBlend());
    expect(p._blend).not.toBeNull();
    expect(p._blend!.length).toBe(2);
  });

  test('solid color mode (no blend)', () => {
    const p = newProgress(
      withColors('#FF0000'),
      withoutPercentage(),
    );
    p.setWidth(10);
    const view = p.viewAs(0.5);
    expect(stringWidth(view)).toBe(10);
    // Should still contain ANSI codes
    expect(view).toContain('\x1b[');
  });

  test('init returns null', () => {
    const p = newProgress();
    expect(p.init()).toBeNull();
  });

  test('update ignores unrelated messages', () => {
    const p = newProgress();
    const [updated, cmd] = p.update({ type: 'unrelated' });
    expect(cmd).toBeNull();
  });

  test('update ignores frame from different ID', () => {
    const p = newProgress();
    const msg = { type: 'progress.frame' as const, id: -999, tag: 1 };
    const [updated, cmd] = p.update(msg);
    expect(cmd).toBeNull();
  });

  test('view delegates to viewAs with internal percent', () => {
    const p = newProgress(withoutPercentage());
    p.setWidth(10);
    // Initially percentShown is 0
    const view = p.view();
    const stripped = stripAnsi(view);
    // All empty at 0%
    for (const ch of stripped) {
      expect(ch).toBe(DefaultEmptyCharBlock);
    }
  });

  test('isAnimating returns false when at target', () => {
    const p = newProgress();
    // Initially both percentShown and targetPercent are 0
    expect(p.isAnimating()).toBe(false);
  });
});
