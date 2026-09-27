/**
 * Tests for textarea selection and v2.2.x keyboard changes — ported from
 * charmbracelet/bubbles v2.2.1 textarea/selection_test.go and the selection /
 * word-left additions to textarea/textarea_test.go.
 */
import { describe, expect, test } from 'bun:test';
import { KeyCode, KeyMod, KeyPressMsg } from '@oakoliver/bubbletea';
import { newStyle, stripAnsi } from '@oakoliver/lipgloss';
import { Model, defaultKeyMap, defaultStyles, newTextarea } from '../src/textarea/textarea.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function key(code: number, mod: number = KeyMod.None, text: string = ''): KeyPressMsg {
  return new KeyPressMsg({ code, mod, text });
}

function rune(ch: string): KeyPressMsg {
  return key(ch.codePointAt(0)!, KeyMod.None, ch);
}

function send(m: Model, msg: unknown, times: number = 1): Model {
  for (let i = 0; i < times; i++) [m] = m.update(msg as any);
  return m;
}

function sendString(m: Model, str: string): Model {
  for (const ch of str) m = send(m, rune(ch));
  return m;
}

const shiftRight = () => key(KeyCode.Right, KeyMod.Shift);
const shiftLeft = () => key(KeyCode.Left, KeyMod.Shift);

/** Mirrors Go newTextArea() + the selection tests' common setup. */
function plainTextarea(width: number, height: number): Model {
  const ta = newTextarea();
  ta.prompt = '';
  ta.showLineNumbers = false;
  ta.setWidth(width);
  ta.setHeight(height);
  ta.focus();
  return ta;
}

/** Mirrors Go newSelectionTextarea(). */
function newSelectionTextarea(value: string): Model {
  const ta = plainTextarea(20, 6);
  ta.setValue(value);
  return ta;
}

function cursorOf(ta: Model): { row: number; col: number } {
  return { row: ta.line(), col: ta.column() };
}

// ── Key map ─────────────────────────────────────────────────────────────────

describe('textarea v2.2.0 key map', () => {
  test('ctrl+left/right move by word and ctrl+backspace/delete delete words', () => {
    const km = defaultKeyMap();
    expect(km.wordForward.keys()).toEqual(['alt+right', 'ctrl+right', 'alt+f']);
    expect(km.wordBackward.keys()).toEqual(['alt+left', 'ctrl+left', 'alt+b']);
    expect(km.deleteWordBackward.keys()).toEqual(['alt+backspace', 'ctrl+w', 'ctrl+backspace']);
    expect(km.deleteWordForward.keys()).toEqual(['alt+delete', 'alt+d', 'ctrl+delete']);
  });

  test('selection bindings match upstream defaults', () => {
    const km = defaultKeyMap();
    expect(km.selectCharacterForward.keys()).toEqual(['shift+right']);
    expect(km.selectCharacterBackward.keys()).toEqual(['shift+left']);
    expect(km.selectWordForward.keys()).toEqual(['ctrl+shift+right', 'alt+shift+right', 'alt+shift+f']);
    expect(km.selectWordBackward.keys()).toEqual(['ctrl+shift+left', 'alt+shift+left', 'alt+shift+b']);
    expect(km.selectLineUp.keys()).toEqual(['shift+up']);
    expect(km.selectLineDown.keys()).toEqual(['shift+down']);
    expect(km.selectAll.keys()).toEqual(['ctrl+g']);
    expect(km.copySelection.keys()).toEqual(['ctrl+shift+c']);
    expect(km.copySelection.help()).toEqual({ key: 'ctrl+shift+c', desc: 'copy selection' });
  });

  test('ctrl+right / ctrl+left navigate words through update()', () => {
    let ta = plainTextarea(40, 3);
    ta = sendString(ta, 'alpha beta gamma');
    ta = send(ta, key(KeyCode.Left, KeyMod.Ctrl));
    expect(ta.column()).toBe('alpha beta '.length);
    ta = send(ta, key(KeyCode.Left, KeyMod.Ctrl));
    expect(ta.column()).toBe('alpha '.length);
    ta = send(ta, key(KeyCode.Right, KeyMod.Ctrl));
    expect(ta.column()).toBe('alpha beta'.length);
  });

  test('ctrl+backspace deletes the previous word; ctrl+delete the next', () => {
    let ta = plainTextarea(40, 3);
    ta = sendString(ta, 'alpha beta gamma');
    ta = send(ta, key(KeyCode.Backspace, KeyMod.Ctrl));
    expect(ta.value()).toBe('alpha beta ');
    ta.cursorStart();
    ta = send(ta, key(KeyCode.Delete, KeyMod.Ctrl));
    expect(ta.value()).toBe(' beta ');
  });

  test('selection style defaults to a light/dark background', () => {
    const dark = defaultStyles(true);
    const light = defaultStyles(false);
    expect(dark.focused.selection?.getBackground()).toEqual(newStyle().background('8').getBackground());
    expect(light.focused.selection?.getBackground()).toEqual(newStyle().background('253').getBackground());
    expect(dark.blurred.selection?.getBackground()).toEqual(newStyle().background('8').getBackground());
  });
});

// ── wordLeft boundary fix (#1036) ───────────────────────────────────────────

describe('textarea wordLeft stops at input boundary', () => {
  const cases: Array<{ name: string; value: string; row: number; col: number; wantRow: number; wantCol: number }> = [
    { name: 'empty input', value: '', row: 0, col: 0, wantRow: 0, wantCol: 0 },
    { name: 'buffer start before whitespace', value: ' word', row: 0, col: 0, wantRow: 0, wantCol: 0 },
    { name: 'inside leading whitespace', value: '   word', row: 0, col: 2, wantRow: 0, wantCol: 0 },
    { name: 'multiline whitespace prefix', value: '  \n  word', row: 1, col: 2, wantRow: 0, wantCol: 0 },
    { name: 'previous word', value: 'first second', row: 0, col: 'first second'.length, wantRow: 0, wantCol: 'first '.length },
  ];

  for (const tt of cases) {
    test(tt.name, () => {
      const ta = newTextarea();
      ta.setValue(tt.value);
      (ta as any)._row = tt.row;
      (ta as any)._col = tt.col;
      // Before the fix this looped forever at the buffer start.
      (ta as any)._wordLeft();
      expect(cursorOf(ta)).toEqual({ row: tt.wantRow, col: tt.wantCol });
    });
  }

  test('ctrl+left at the start of leading whitespace terminates via update()', () => {
    let ta = plainTextarea(20, 3);
    ta.setValue('   word');
    ta.cursorStart();
    ta = send(ta, key(KeyCode.Left, KeyMod.Ctrl));
    expect(cursorOf(ta)).toEqual({ row: 0, col: 0 });
  });
});

// ── Pointer selection API (selection_test.go) ──────────────────────────────

describe('textarea positionAt', () => {
  const ta = newSelectionTextarea('hello\nworld');
  const cases: Array<[string, number, number, { row: number; col: number }]> = [
    ['origin', 0, 0, { row: 0, col: 0 }],
    ['mid first line', 3, 0, { row: 0, col: 3 }],
    ['start second line', 0, 1, { row: 1, col: 0 }],
    ['mid second line', 2, 1, { row: 1, col: 2 }],
    ['past end of line clamps to line end', 40, 0, { row: 0, col: 5 }],
    ['negative y clamps to buffer start', 0, -3, { row: 0, col: 0 }],
    ['below last line clamps to buffer end', 0, 50, { row: 1, col: 5 }],
  ];
  for (const [name, x, y, want] of cases) {
    test(name, () => {
      expect(ta.positionAt(x, y)).toEqual(want);
    });
  }

  test('accounts for the prompt gutter', () => {
    const t2 = newTextarea();
    t2.prompt = '> ';
    t2.showLineNumbers = false;
    t2.setWidth(20);
    t2.setHeight(3);
    t2.focus();
    t2.setValue('hello');
    expect(t2.positionAt(2, 0)).toEqual({ row: 0, col: 0 });
    expect(t2.positionAt(5, 0)).toEqual({ row: 0, col: 3 });
    expect(t2.positionAt(0, 0)).toEqual({ row: 0, col: 0 });
  });

  test('accounts for the line-number gutter', () => {
    const t2 = newTextarea();
    t2.prompt = '';
    t2.showLineNumbers = true;
    t2.setWidth(20);
    t2.setValue('hello');
    // maxHeight 99 → 2 digits + 2 padding = 4 gutter columns.
    expect(t2.positionAt(4, 0)).toEqual({ row: 0, col: 0 });
    expect(t2.positionAt(6, 0)).toEqual({ row: 0, col: 2 });
  });

  test('maps double-width runes by display column', () => {
    const t2 = newSelectionTextarea('日本語');
    expect(t2.positionAt(0, 0)).toEqual({ row: 0, col: 0 });
    expect(t2.positionAt(1, 0)).toEqual({ row: 0, col: 0 });
    expect(t2.positionAt(2, 0)).toEqual({ row: 0, col: 1 });
    expect(t2.positionAt(5, 0)).toEqual({ row: 0, col: 2 });
  });
});

describe('textarea pointer selection', () => {
  test('selected text on a single line', () => {
    const ta = newSelectionTextarea('hello world');
    ta.beginSelection(0, 0);
    ta.extendSelection(5, 0);
    ta.endSelection();
    expect(ta.hasSelection()).toBe(true);
    expect(ta.selectedText()).toBe('hello');
    expect(cursorOf(ta)).toEqual({ row: 0, col: 5 });
  });

  test('selected text across lines', () => {
    const ta = newSelectionTextarea('one\ntwo\nthree');
    ta.beginSelection(2, 0);
    ta.extendSelection(1, 2);
    ta.endSelection();
    expect(ta.selectedText()).toBe('e\ntwo\nt');
  });

  test('backward drag equals forward drag', () => {
    const forward = newSelectionTextarea('one\ntwo\nthree');
    forward.beginSelection(2, 0);
    forward.extendSelection(1, 2);
    forward.endSelection();

    const backward = newSelectionTextarea('one\ntwo\nthree');
    backward.beginSelection(1, 2);
    backward.extendSelection(2, 0);
    backward.endSelection();

    expect(backward.selectedText()).toBe(forward.selectedText());
    expect(backward.selectedText()).toBe('e\ntwo\nt');
  });

  test('a click without a drag makes no selection', () => {
    const ta = newSelectionTextarea('hello world');
    ta.beginSelection(3, 0);
    ta.endSelection();
    expect(ta.hasSelection()).toBe(false);
    expect(ta.selectedText()).toBe('');
    expect(cursorOf(ta)).toEqual({ row: 0, col: 3 });
  });

  test('extendSelection requires beginSelection', () => {
    const ta = newSelectionTextarea('hello world');
    ta.extendSelection(5, 0);
    expect(ta.hasSelection()).toBe(false);
  });

  test('clearSelection', () => {
    const ta = newSelectionTextarea('hello world');
    ta.beginSelection(0, 0);
    ta.extendSelection(5, 0);
    ta.endSelection();
    expect(ta.hasSelection()).toBe(true);
    ta.clearSelection();
    expect(ta.hasSelection()).toBe(false);
    expect(ta.selectedText()).toBe('');
  });

  test('selectAll', () => {
    const ta = newSelectionTextarea('one\ntwo');
    ta.selectAll();
    expect(ta.selectedText()).toBe('one\ntwo');
  });

  test('keypress replaces and clears the selection', () => {
    let ta = newSelectionTextarea('hello world');
    ta.beginSelection(0, 0);
    ta.extendSelection(5, 0);
    ta.endSelection();
    expect(ta.hasSelection()).toBe(true);
    ta = send(ta, rune('x'));
    expect(ta.hasSelection()).toBe(false);
    expect(ta.value()).toBe('x world');
  });

  test('selection renders with the selection style without changing text', () => {
    const ta = newSelectionTextarea('hello world');
    ta.setStyles({
      ...ta.styles(),
      focused: { ...ta.styles().focused, selection: newStyle().background('#ff0000') },
    });
    const plain = ta.view();
    ta.beginSelection(0, 0);
    ta.extendSelection(5, 0);
    ta.endSelection();
    const selected = ta.view();

    expect(selected).not.toBe(plain);
    expect(stripAnsi(selected).trim()).toBe(stripAnsi(plain).trim());
    expect(selected).toContain(newStyle().background('#ff0000').inline(true).render('hello'));
  });

  test('selection survives soft wrap', () => {
    const ta = plainTextarea(10, 6);
    ta.setValue('aaaaabbbbbccccc');
    const pos = ta.positionAt(0, 1);
    expect(pos.row).toBe(0);
    expect(pos.col).toBe(10);

    ta.beginSelection(0, 1);
    ta.extendSelection(5, 1);
    ta.endSelection();
    expect(ta.selectedText()).toBe('ccccc');
  });

  test('empty buffer never reports a selection', () => {
    const ta = newSelectionTextarea('');
    ta.beginSelection(0, 0);
    ta.extendSelection(5, 3);
    ta.endSelection();
    ta.selectAll();
    expect(ta.hasSelection()).toBe(false);
    expect(ta.selectedText()).toBe('');
    expect(typeof ta.view()).toBe('string');
  });

  test('selection() returns a normalized range', () => {
    const ta = newSelectionTextarea('hello world');
    ta.beginSelection(5, 0);
    ta.extendSelection(0, 0);
    ta.endSelection();
    const [start, end, ok] = ta.selection();
    expect(ok).toBe(true);
    expect(start).toEqual({ row: 0, col: 0 });
    expect(end).toEqual({ row: 0, col: 5 });
  });

  test('reset() and setValue() clear the selection', () => {
    const ta = newSelectionTextarea('hello world');
    ta.selectAll();
    expect(ta.hasSelection()).toBe(true);
    ta.setValue('new');
    expect(ta.hasSelection()).toBe(false);
  });
});

// ── Keyboard selection (textarea_test.go additions) ────────────────────────

describe('textarea keyboard selection', () => {
  test('shift+right selects forward', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello world');
    ta.cursorStart();
    ta = send(ta, shiftRight(), 5);
    expect(ta.selectedText()).toBe('hello');
    expect(ta.hasSelection()).toBe(true);
  });

  test('shift+left selects backward', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello');
    ta = send(ta, shiftLeft(), 5);
    expect(ta.selectedText()).toBe('hello');
  });

  test('alt+shift+right selects a word', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello world foo');
    ta.cursorStart();
    ta = send(ta, key(KeyCode.Right, KeyMod.Shift | KeyMod.Alt));
    expect(ta.selectedText()).toBe('hello');
  });

  test('ctrl+shift+left selects the previous word', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello world');
    ta = send(ta, key(KeyCode.Left, KeyMod.Shift | KeyMod.Ctrl));
    expect(ta.selectedText()).toBe('world');
  });

  test('shift+down / shift+right extend across lines', () => {
    let ta = plainTextarea(20, 10);
    ta = sendString(ta, 'line one');
    ta = send(ta, key(KeyCode.Enter));
    ta = sendString(ta, 'line two');
    ta.moveToBegin();

    ta = send(ta, key(KeyCode.Down, KeyMod.Shift));
    expect(ta.selectedText()).toBe('line one\n');

    ta = send(ta, shiftRight(), 8);
    expect(ta.selectedText()).toBe('line one\nline two');
  });

  test('shift+up selects upward', () => {
    let ta = plainTextarea(20, 10);
    ta.setValue('abc\ndef');
    ta = send(ta, key(KeyCode.Up, KeyMod.Shift));
    expect(ta.selectedText()).toBe('\ndef');
  });

  test('ctrl+g selects all', () => {
    let ta = plainTextarea(20, 10);
    ta = sendString(ta, 'hello world');
    ta = send(ta, key('g'.codePointAt(0)!, KeyMod.Ctrl));
    expect(ta.selectedText()).toBe('hello world');
  });

  test('plain movement clears the selection', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello');
    ta.cursorStart();
    ta = send(ta, shiftRight());
    expect(ta.hasSelection()).toBe(true);
    ta = send(ta, key(KeyCode.Right));
    expect(ta.hasSelection()).toBe(false);
  });

  test('typing clears the selection', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello');
    ta.cursorStart();
    ta = send(ta, shiftRight());
    expect(ta.hasSelection()).toBe(true);
    ta = send(ta, rune('x'));
    expect(ta.hasSelection()).toBe(false);
  });

  test('typing replaces the selection', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello world');
    ta.cursorStart();
    ta = send(ta, shiftRight(), 5);
    expect(ta.selectedText()).toBe('hello');
    ta = send(ta, rune('X'));
    expect(ta.value()).toBe('X world');
    expect(ta.hasSelection()).toBe(false);
  });

  test('backspace deletes the selection', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello world');
    ta.cursorStart();
    ta = send(ta, shiftRight(), 6);
    ta = send(ta, key(KeyCode.Backspace));
    expect(ta.value()).toBe('world');
    expect(ta.hasSelection()).toBe(false);
  });

  test('delete deletes the selection', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello world');
    ta.cursorStart();
    ta = send(ta, shiftRight(), 5);
    ta = send(ta, key(KeyCode.Delete));
    expect(ta.value()).toBe(' world');
  });

  test('word/line deletions act on the selection instead', () => {
    for (const k of [
      key('k'.codePointAt(0)!, KeyMod.Ctrl),
      key('u'.codePointAt(0)!, KeyMod.Ctrl),
      key('w'.codePointAt(0)!, KeyMod.Ctrl),
      key('d'.codePointAt(0)!, KeyMod.Alt),
    ]) {
      let ta = plainTextarea(20, 5);
      ta = sendString(ta, 'hello big world');
      ta.cursorStart();
      ta = send(ta, key(KeyCode.Right), 6);
      ta = send(ta, shiftRight(), 4);
      expect(ta.selectedText()).toBe('big ');
      ta = send(ta, k);
      expect(ta.value()).toBe('hello world');
      expect(ta.column()).toBe(6);
    }
  });

  test('paste replaces the selection', () => {
    let ta = plainTextarea(40, 5);
    ta = sendString(ta, 'hello world');
    ta.cursorStart();
    ta = send(ta, shiftRight(), 5);
    ta = send(ta, { type: 'textarea.paste', content: 'REPLACED' });
    expect(ta.value()).toBe('REPLACED world');
  });

  test('enter replaces the selection with a newline', () => {
    let ta = plainTextarea(20, 10);
    ta = sendString(ta, 'hello world');
    ta.cursorStart();
    ta = send(ta, shiftRight(), 6);
    ta = send(ta, key(KeyCode.Enter));
    expect(ta.value()).toBe('\nworld');
  });

  test('multi-line selection deletion merges lines', () => {
    let ta = plainTextarea(20, 10);
    ta = sendString(ta, 'line one');
    ta = send(ta, key(KeyCode.Enter));
    ta = sendString(ta, 'line two');
    ta = send(ta, key(KeyCode.Enter));
    ta = sendString(ta, 'line three');
    ta.moveToBegin();
    ta = send(ta, shiftRight(), 18);
    expect(ta.selectedText()).toBe('line one\nline two\n');
    ta = send(ta, key(KeyCode.Backspace));
    expect(ta.value()).toBe('line three');
    expect(ta.lineCount()).toBe(1);
  });

  test('backward keyboard selection is normalized', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello world');
    ta = send(ta, shiftLeft(), 5);
    expect(ta.selectedText()).toBe('world');
  });

  test('keyboard selection renders a highlight', () => {
    let ta = plainTextarea(20, 5);
    ta = sendString(ta, 'hello');
    ta.cursorStart();
    ta = send(ta, shiftRight(), 3);
    const view = ta.view();
    const selStyle = ta.styles().focused.selection!;
    expect(view).toContain(selStyle.inherit(ta.styles().focused.text).inline(true).render('hel'));
    expect(stripAnsi(view)).toContain('hello');
  });

  test('deleteSelection() is public and a no-op without a selection', () => {
    const ta = newSelectionTextarea('hello world');
    ta.deleteSelection();
    expect(ta.value()).toBe('hello world');
    ta.beginSelection(6, 0);
    ta.extendSelection(11, 0);
    ta.endSelection();
    ta.deleteSelection();
    expect(ta.value()).toBe('hello ');
    expect(cursorOf(ta)).toEqual({ row: 0, col: 6 });
  });

  test('copySelection returns null without a selection and a command otherwise', () => {
    const ta = newSelectionTextarea('hello world');
    expect(ta.copySelection()).toBeNull();
    ta.selectAll();
    expect(typeof ta.copySelection()).toBe('function');
  });

  test('ctrl+shift+c emits a copy command only with a selection', () => {
    const ta = newSelectionTextarea('hello');
    ta.setVirtualCursor(false); // no blink commands to muddy the result
    const copyKey = key('c'.codePointAt(0)!, KeyMod.Ctrl | KeyMod.Shift);
    const [, withoutSel] = ta.update(copyKey);
    expect(withoutSel).toBeNull();
    ta.selectAll();
    const [, withSel] = ta.update(copyKey);
    expect(typeof withSel).toBe('function');
    expect(ta.selectedText()).toBe('hello');
    expect(ta.value()).toBe('hello');
  });

  test('copy errors are surfaced on err', () => {
    let ta = newSelectionTextarea('hello');
    const error = new Error('no clipboard');
    ta = send(ta, { type: 'textarea.copyErr', error });
    expect(ta.err).toBe(error);
  });
});
