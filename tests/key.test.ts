/**
 * Tests for key module — ported from charm.land/bubbles/v2/key/key_test.go
 */
import { describe, expect, test } from 'bun:test';
import { Binding, newBinding, withKeys, withHelp, withDisabled, matches } from '../src/key/key.js';

describe('Binding', () => {
  test('Enabled', () => {
    const binding = newBinding(
      withKeys('k', 'up'),
      withHelp('↑/k', 'move up'),
    );
    expect(binding.enabled()).toBe(true);

    binding.setEnabled(false);
    expect(binding.enabled()).toBe(false);

    binding.setEnabled(true);
    binding.unbind();
    expect(binding.enabled()).toBe(false);
  });

  test('keys are stored correctly', () => {
    const binding = newBinding(withKeys('a', 'b', 'c'));
    expect(binding.keys()).toEqual(['a', 'b', 'c']);
  });

  test('help is stored correctly', () => {
    const binding = newBinding(withHelp('ctrl+c', 'quit'));
    const h = binding.help();
    expect(h.key).toBe('ctrl+c');
    expect(h.desc).toBe('quit');
  });

  test('withDisabled creates disabled binding', () => {
    const binding = newBinding(withKeys('q'), withDisabled());
    expect(binding.enabled()).toBe(false);
  });

  test('default binding has no keys and is effectively disabled', () => {
    const binding = new Binding();
    // No keys => enabled() returns false even though not explicitly disabled
    expect(binding.enabled()).toBe(false);
    expect(binding.keys()).toEqual([]);
  });

  test('setKeys replaces existing keys', () => {
    const binding = newBinding(withKeys('a', 'b'));
    binding.setKeys('x', 'y', 'z');
    expect(binding.keys()).toEqual(['x', 'y', 'z']);
  });

  test('setHelp replaces existing help', () => {
    const binding = newBinding(withHelp('a', 'first'));
    binding.setHelp('b', 'second');
    expect(binding.help()).toEqual({ key: 'b', desc: 'second' });
  });

  test('unbind clears keys and help', () => {
    const binding = newBinding(withKeys('a'), withHelp('a', 'do thing'));
    binding.unbind();
    expect(binding.keys()).toEqual([]);
    expect(binding.help()).toEqual({ key: '', desc: '' });
  });
});

describe('matches', () => {
  test('matches a key in a binding', () => {
    const binding = newBinding(withKeys('k', 'up'));
    const key = { toString: () => 'k' };
    expect(matches(key, binding)).toBe(true);
  });

  test('matches second key in a binding', () => {
    const binding = newBinding(withKeys('k', 'up'));
    const key = { toString: () => 'up' };
    expect(matches(key, binding)).toBe(true);
  });

  test('does not match unrelated key', () => {
    const binding = newBinding(withKeys('k', 'up'));
    const key = { toString: () => 'down' };
    expect(matches(key, binding)).toBe(false);
  });

  test('does not match disabled binding', () => {
    const binding = newBinding(withKeys('k'), withDisabled());
    const key = { toString: () => 'k' };
    expect(matches(key, binding)).toBe(false);
  });

  test('matches against multiple bindings', () => {
    const b1 = newBinding(withKeys('a'));
    const b2 = newBinding(withKeys('b'));
    const b3 = newBinding(withKeys('c'));
    expect(matches({ toString: () => 'b' }, b1, b2, b3)).toBe(true);
  });

  test('no match in multiple bindings', () => {
    const b1 = newBinding(withKeys('a'));
    const b2 = newBinding(withKeys('b'));
    expect(matches({ toString: () => 'z' }, b1, b2)).toBe(false);
  });
});
