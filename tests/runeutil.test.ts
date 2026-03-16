/**
 * Tests for internal/runeutil — ported from charm.land/bubbles/v2/internal/runeutil/runeutil_test.go
 */
import { describe, expect, test } from 'bun:test';
import { newSanitizer, replaceNewlines, replaceTabs } from '../src/internal/runeutil.js';

describe('Sanitize', () => {
  const testCases: Array<{ input: string; output: string }> = [
    { input: '', output: '' },
    { input: 'x', output: 'x' },
    { input: '\n', output: 'XX' },
    { input: '\na\n', output: 'XXaXX' },
    { input: '\n\n', output: 'XXXX' },
    { input: '\t', output: '' },
    { input: 'hello', output: 'hello' },
    { input: 'hel\nlo', output: 'helXXlo' },
    { input: 'hel\rlo', output: 'helXXlo' },
    { input: 'hel\tlo', output: 'hello' },
    { input: 'he\n\nl\tlo', output: 'heXXXXllo' },
    { input: 'he\tl\n\nlo', output: 'helXXXXlo' },
    { input: 'hel\x1blo', output: 'hello' },
    // Note: Go test has invalid utf8 case "hello\xc2" -> "hello"
    // In JS, invalid UTF-8 doesn't produce replacement char the same way,
    // but we handle the Unicode replacement character U+FFFD
    { input: 'hello\uFFFD', output: 'hello' },
  ];

  const s = newSanitizer(replaceNewlines('XX'), replaceTabs(''));

  for (const tc of testCases) {
    test(`input: ${JSON.stringify(tc.input)}`, () => {
      const result = s.sanitize(tc.input);
      expect(result).toBe(tc.output);
    });
  }

  test('default sanitizer preserves newlines and replaces tabs with spaces', () => {
    const defaultSanitizer = newSanitizer();
    expect(defaultSanitizer.sanitize('hello\tworld')).toBe('hello    world');
    expect(defaultSanitizer.sanitize('hello\nworld')).toBe('hello\nworld');
  });

  test('custom tab replacement', () => {
    const s = newSanitizer(replaceTabs('->'));
    expect(s.sanitize('a\tb')).toBe('a->b');
  });

  test('custom newline replacement', () => {
    const s = newSanitizer(replaceNewlines(' '));
    expect(s.sanitize('a\nb')).toBe('a b');
  });

  test('strips control characters', () => {
    const s = newSanitizer();
    // \x01 through \x1F (excluding \t, \n, \r) should be stripped
    expect(s.sanitize('a\x01b')).toBe('ab');
    expect(s.sanitize('a\x02b')).toBe('ab');
    expect(s.sanitize('a\x7Fb')).toBe('ab'); // DEL
  });
});
