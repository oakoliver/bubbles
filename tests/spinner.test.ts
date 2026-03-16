/**
 * Tests for spinner module — ported from charm.land/bubbles/v2/spinner/spinner_test.go
 */
import { describe, expect, test } from 'bun:test';
import {
  Model,
  newSpinner,
  withSpinner,
  Line,
  Dot,
  MiniDot,
  Jump,
  Pulse,
  Points,
  Globe,
  Moon,
  Monkey,
  Meter,
  Hamburger,
  Ellipsis,
} from '../src/spinner/spinner.js';
import type { Spinner } from '../src/spinner/spinner.js';

function assertEqualSpinner(exp: Spinner, got: Spinner) {
  expect(got.fps).toBe(exp.fps);
  expect(got.frames.length).toBe(exp.frames.length);
  for (let i = 0; i < exp.frames.length; i++) {
    expect(got.frames[i]).toBe(exp.frames[i]);
  }
}

describe('SpinnerNew', () => {
  test('default', () => {
    const s = newSpinner();
    assertEqualSpinner(Line, s.spinner);
  });

  test('WithSpinner', () => {
    const customSpinner: Spinner = {
      frames: ['a', 'b', 'c', 'd'],
      fps: 16,
    };
    const s = newSpinner(withSpinner(customSpinner));
    assertEqualSpinner(customSpinner, s.spinner);
  });

  const builtInSpinners: Record<string, Spinner> = {
    Line,
    Dot,
    MiniDot,
    Jump,
    Pulse,
    Points,
    Globe,
    Moon,
    Monkey,
  };

  for (const [name, spinner] of Object.entries(builtInSpinners)) {
    test(name, () => {
      const s = newSpinner(withSpinner(spinner));
      assertEqualSpinner(spinner, s.spinner);
    });
  }

  test('Meter', () => {
    const s = newSpinner(withSpinner(Meter));
    assertEqualSpinner(Meter, s.spinner);
  });

  test('Hamburger', () => {
    const s = newSpinner(withSpinner(Hamburger));
    assertEqualSpinner(Hamburger, s.spinner);
  });

  test('Ellipsis', () => {
    const s = newSpinner(withSpinner(Ellipsis));
    assertEqualSpinner(Ellipsis, s.spinner);
  });
});

describe('Spinner Model', () => {
  test('view returns first frame initially', () => {
    const s = newSpinner();
    const view = s.view();
    expect(view).toBe(Line.frames[0]);
  });

  test('unique IDs', () => {
    const s1 = newSpinner();
    const s2 = newSpinner();
    expect(s1.id()).not.toBe(s2.id());
  });

  test('tickMsg has correct type', () => {
    const s = newSpinner();
    const msg = s.tickMsg();
    expect(msg.type).toBe('spinner.tick');
    expect(msg.id).toBe(s.id());
  });

  test('update advances frame on tick', () => {
    const s = newSpinner();
    const tick = s.tickMsg();
    const [updated] = s.update(tick);
    expect(updated.view()).toBe(Line.frames[1]);
  });

  test('update wraps around frames', () => {
    const customSpinner: Spinner = { frames: ['a', 'b'], fps: 100 };
    let s = newSpinner(withSpinner(customSpinner));

    // Frame 0 -> view is 'a'
    expect(s.view()).toBe('a');

    // Tick to frame 1
    let tick = s.tickMsg();
    [s] = s.update(tick);
    expect(s.view()).toBe('b');

    // Tick to frame 0 (wrap)
    tick = s.tickMsg();
    [s] = s.update(tick);
    expect(s.view()).toBe('a');
  });

  test('update ignores tick from different spinner', () => {
    const s1 = newSpinner();
    const s2 = newSpinner();
    const tick = s2.tickMsg();
    const [updated, cmd] = s1.update(tick);
    // Should not advance since IDs don't match
    expect(updated.view()).toBe(Line.frames[0]);
    expect(cmd).toBeNull();
  });
});
