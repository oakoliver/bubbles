/**
 * Tests for textinput module — ported from charmbracelet/bubbles/textinput/textinput_test.go
 *
 * Go tests:
 * - Test_CurrentSuggestion: suggestion workflow (setSuggestions, setValue, nextSuggestion)
 * - Test_SlicingOutsideCap: Chinese placeholder at width 32 does not crash
 * - TestChinesePlaceholder: SKIPPED in Go — flaky
 * - TestPlaceholderTruncate: SKIPPED in Go — flaky
 * - ExampleValidateFunc: example code, no assertions
 */
import { describe, expect, test } from 'bun:test';
import { Model, newTextInput, EchoMode } from '../src/textinput/textinput.js';
import { stripAnsi } from '@oakoliver/lipgloss';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a keyPress msg compatible with textinput's update().
 * Mirrors the Go `keyPress(key rune)` helper.
 */
function keyPress(key: string): any {
  return {
    type: 'keyPress',
    text: key,
    code: key.codePointAt(0) ?? 0,
    mod: 0,
    toString() { return key; },
  };
}

/**
 * Send a string character-by-character through update().
 * Mirrors Go `sendString(m Model, str string) Model`.
 */
function sendString(m: Model, str: string): Model {
  for (const ch of str) {
    [m] = m.update(keyPress(ch));
  }
  return m;
}

// ── Test_CurrentSuggestion ──────────────────────────────────────────────────

describe('Test_CurrentSuggestion', () => {
  test('no suggestions initially', () => {
    const ti = newTextInput();
    ti.showSuggestions = true;

    const suggestion = ti.currentSuggestion();
    expect(suggestion).toBe('');
  });

  test('no matching suggestion when value is empty', () => {
    const ti = newTextInput();
    ti.showSuggestions = true;

    ti.setSuggestions(['test1', 'test2', 'test3']);
    const suggestion = ti.currentSuggestion();
    expect(suggestion).toBe('');
  });

  test('suggestion after setValue and nextSuggestion', () => {
    const ti = newTextInput();
    ti.showSuggestions = true;

    ti.setSuggestions(['test1', 'test2', 'test3']);
    ti.setValue('test');

    // Force update suggestions (private method)
    (ti as any).updateSuggestions();
    // Move to next suggestion (private method)
    (ti as any).nextSuggestion();

    const suggestion = ti.currentSuggestion();
    expect(suggestion).toBe('test2');
  });

  test('suggestions not rendered when blurred', () => {
    const ti = newTextInput();
    ti.showSuggestions = true;

    ti.setSuggestions(['test1', 'test2', 'test3']);
    ti.setValue('test');

    (ti as any).updateSuggestions();
    (ti as any).nextSuggestion();

    ti.blur();
    const view = ti.view();
    // When blurred, the view should not end with the suggestion "test2"
    expect(stripAnsi(view).endsWith('test2')).toBe(false);
  });
});

// ── Test_SlicingOutsideCap ──────────────────────────────────────────────────

describe('Test_SlicingOutsideCap', () => {
  test('Chinese placeholder at width 32 does not crash', () => {
    const ti = newTextInput();
    ti.placeholder = '作業ディレクトリを指定してください';
    ti.setWidth(32);

    // This should not throw
    expect(() => ti.view()).not.toThrow();
  });
});

// ── TestChinesePlaceholder (SKIPPED in Go) ──────────────────────────────────

describe('TestChinesePlaceholder', () => {
  test.skip('Chinese placeholder — skipped in Go (flaky)', () => {
    const ti = newTextInput();
    ti.placeholder = '输入消息...';
    ti.setWidth(20);

    const got = ti.view();
    const expected = '> 输入消息...       ';
    expect(got).toBe(expected);
  });
});

// ── TestPlaceholderTruncate (SKIPPED in Go) ─────────────────────────────────

describe('TestPlaceholderTruncate', () => {
  test.skip('Placeholder truncation — skipped in Go (flaky)', () => {
    const ti = newTextInput();
    ti.placeholder = 'A very long placeholder, or maybe not so much';
    ti.setWidth(10);

    const got = ti.view();
    const expected = '> A very …';
    expect(got).toBe(expected);
  });
});

// ── Additional model tests ──────────────────────────────────────────────────

describe('Model basics', () => {
  test('default prompt is "> "', () => {
    const ti = newTextInput();
    expect(ti.prompt).toBe('> ');
  });

  test('default value is empty', () => {
    const ti = newTextInput();
    expect(ti.value()).toBe('');
  });

  test('setValue / value roundtrip', () => {
    const ti = newTextInput();
    ti.setValue('hello world');
    expect(ti.value()).toBe('hello world');
  });

  test('focus / blur', () => {
    const ti = newTextInput();
    expect(ti.focused()).toBe(false);

    ti.focus();
    expect(ti.focused()).toBe(true);

    ti.blur();
    expect(ti.focused()).toBe(false);
  });

  test('reset clears value', () => {
    const ti = newTextInput();
    ti.setValue('hello');
    expect(ti.value()).toBe('hello');

    ti.reset();
    expect(ti.value()).toBe('');
  });

  test('charLimit is enforced', () => {
    const ti = newTextInput();
    ti.charLimit = 5;
    ti.setValue('hello world');
    expect(ti.value()).toBe('hello');
  });

  test('setWidth / width', () => {
    const ti = newTextInput();
    ti.setWidth(42);
    expect(ti.width()).toBe(42);
  });

  test('echoMode password', () => {
    const ti = newTextInput();
    ti.echoMode = EchoMode.EchoPassword;
    ti.setValue('secret');
    ti.focus();

    const view = stripAnsi(ti.view());
    // Should not contain the actual text
    expect(view).not.toContain('secret');
    // Should contain mask characters
    expect(view).toContain('*');
  });

  test('echoMode none', () => {
    const ti = newTextInput();
    ti.echoMode = EchoMode.EchoNone;
    ti.setValue('hidden');
    ti.focus();

    const view = stripAnsi(ti.view());
    expect(view).not.toContain('hidden');
  });

  test('typing via update', () => {
    let ti = newTextInput();
    ti.focus();
    ti = sendString(ti, 'abc');
    expect(ti.value()).toBe('abc');
  });

  test('backspace via update', () => {
    let ti = newTextInput();
    ti.focus();
    ti = sendString(ti, 'abc');

    // Send backspace
    const bsMsg = {
      type: 'keyPress',
      text: '',
      code: 0x08, // backspace
      mod: 0,
      toString() { return 'backspace'; },
    };
    [ti] = ti.update(bsMsg);
    expect(ti.value()).toBe('ab');
  });

  test('setCursor / position', () => {
    const ti = newTextInput();
    ti.setValue('hello');
    ti.setCursor(2);
    expect(ti.position()).toBe(2);
  });

  test('cursorStart / cursorEnd', () => {
    const ti = newTextInput();
    ti.setValue('hello');
    ti.cursorStart();
    expect(ti.position()).toBe(0);

    ti.cursorEnd();
    expect(ti.position()).toBe(5);
  });

  test('view produces non-empty output', () => {
    const ti = newTextInput();
    ti.focus();
    ti.setValue('test');
    const view = ti.view();
    expect(view.length).toBeGreaterThan(0);
    expect(stripAnsi(view)).toContain('test');
  });

  test('placeholder view when empty', () => {
    const ti = newTextInput();
    ti.placeholder = 'Type here...';
    ti.focus();
    const view = stripAnsi(ti.view());
    expect(view).toContain('Type here...');
  });
});

// ── Suggestion workflow ─────────────────────────────────────────────────────

describe('Suggestions', () => {
  test('setSuggestions / availableSuggestions', () => {
    const ti = newTextInput();
    ti.setSuggestions(['alpha', 'beta', 'gamma']);
    expect(ti.availableSuggestions()).toEqual(['alpha', 'beta', 'gamma']);
  });

  test('matchedSuggestions filters by prefix', () => {
    const ti = newTextInput();
    ti.showSuggestions = true;
    ti.setSuggestions(['apple', 'banana', 'apricot']);
    ti.setValue('ap');
    (ti as any).updateSuggestions();

    const matched = ti.matchedSuggestions();
    expect(matched).toContain('apple');
    expect(matched).toContain('apricot');
    expect(matched).not.toContain('banana');
  });

  test('currentSuggestionIndex cycling', () => {
    const ti = newTextInput();
    ti.showSuggestions = true;
    ti.setSuggestions(['test1', 'test2', 'test3']);
    ti.setValue('test');
    (ti as any).updateSuggestions();

    expect(ti.currentSuggestionIndex()).toBe(0);
    expect(ti.currentSuggestion()).toBe('test1');

    (ti as any).nextSuggestion();
    expect(ti.currentSuggestionIndex()).toBe(1);
    expect(ti.currentSuggestion()).toBe('test2');

    (ti as any).nextSuggestion();
    expect(ti.currentSuggestionIndex()).toBe(2);
    expect(ti.currentSuggestion()).toBe('test3');

    // Wraps around
    (ti as any).nextSuggestion();
    expect(ti.currentSuggestionIndex()).toBe(0);
    expect(ti.currentSuggestion()).toBe('test1');
  });

  test('previousSuggestion wraps', () => {
    const ti = newTextInput();
    ti.showSuggestions = true;
    ti.setSuggestions(['test1', 'test2', 'test3']);
    ti.setValue('test');
    (ti as any).updateSuggestions();

    // At index 0, go previous — wraps to last
    (ti as any).previousSuggestion();
    expect(ti.currentSuggestionIndex()).toBe(2);
    expect(ti.currentSuggestion()).toBe('test3');
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('Validation', () => {
  test('validate rejects invalid input', () => {
    let ti = newTextInput();
    ti.validate = (s: string) => {
      if (s.length > 3) return 'too long';
      return null;
    };
    ti.focus();

    ti = sendString(ti, 'abcd');
    // Validation error should be set
    expect(ti.err).toBe('too long');
  });

  test('validate allows valid input', () => {
    let ti = newTextInput();
    ti.validate = (s: string) => {
      if (/[^0-9]/.test(s)) return 'numbers only';
      return null;
    };
    ti.focus();

    ti = sendString(ti, '123');
    expect(ti.err).toBeNull();
    expect(ti.value()).toBe('123');
  });
});
