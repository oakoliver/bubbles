import { afterEach, describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KeyCode, KeyMod, KeyPressMsg, WindowSizeMsg } from '@oakoliver/bubbletea';
import { newFilePicker } from '../src/filepicker/filepicker.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function initialize(directory: string) {
  const picker = newFilePicker();
  picker.currentDirectory = directory;
  picker.setHeight(5);
  const command = picker.init();
  if (!command) throw new Error('file picker init command was missing');
  const message = await command();
  picker.update(message);
  return { picker, message };
}

describe('file picker v2 parity', () => {
  test('uses canonical pgup, pgdown, and esc key names', () => {
    const picker = newFilePicker();
    expect(picker.keyMap.pageUp.keys()).toContain('pgup');
    expect(picker.keyMap.pageDown.keys()).toContain('pgdown');
    expect(picker.keyMap.back.keys()).toContain('esc');
  });

  test('handles Bubble Tea WindowSizeMsg auto-height', () => {
    const picker = newFilePicker();
    picker.update(new WindowSizeMsg(80, 24));
    expect(picker.height()).toBe(19);
  });

  test('filters dotfiles and keeps symlinked directories in file sort order', async () => {
    if (process.platform === 'win32') return;

    const directory = mkdtempSync(join(tmpdir(), 'bubbles-filepicker-'));
    temporaryDirectories.push(directory);
    mkdirSync(join(directory, 'z-directory'));
    symlinkSync(join(directory, 'z-directory'), join(directory, 'a-link'));
    writeFileSync(join(directory, 'b-file'), 'data');
    writeFileSync(join(directory, '.hidden'), 'secret');

    const { picker } = await initialize(directory);
    expect(picker.highlightedPath()).toBe(join(directory, 'z-directory'));
    expect(picker.view()).not.toContain('.hidden');
  });

  test('sorts names in upstream UTF-8 byte order', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bubbles-filepicker-sort-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, '\ue000'), 'private use');
    writeFileSync(join(directory, '\ud83d\ude00'), 'emoji');

    const { picker } = await initialize(directory);
    const rendered = picker.view();
    expect(rendered.indexOf('\ue000')).toBeLessThan(rendered.indexOf('\ud83d\ude00'));
  });

  test('handles directory read failures without retaining stale entries', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'bubbles-filepicker-error-'));
    temporaryDirectories.push(parent);
    writeFileSync(join(parent, 'stale-file'), 'data');
    const { picker } = await initialize(parent);
    expect(picker.view()).toContain('stale-file');

    picker.currentDirectory = join(parent, 'missing');
    const command = picker.init();
    if (!command) throw new Error('file picker init command was missing');
    const message = await command() as { type: string; error?: unknown };
    picker.update(message);

    expect(message.type).toBe('filepicker.error');
    expect(message.error).toBeInstanceOf(Error);
    expect(picker.error).toBe(message.error);
    expect(picker.highlightedPath()).toBe('');
    expect(picker.view()).not.toContain('stale-file');
  });
});

// ── v2.2.0 parity: filepicker/filepicker_test.go ────────────────────────────

/** Creates a directory containing a subdirectory with a file in it. */
function newTestDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'bubbles-filepicker-v22-'));
  temporaryDirectories.push(root);
  mkdirSync(join(root, 'subdir'));
  writeFileSync(join(root, 'subdir', 'file.go'), 'package main');
  return root;
}

/** Sends msg to the model and feeds the resulting command's message back. */
async function step(picker: ReturnType<typeof newFilePicker>, msg: unknown) {
  const [, cmd] = picker.update(msg as any);
  if (cmd) picker.update(await cmd() as any);
  return picker;
}

const keyL = () => new KeyPressMsg({ code: 'l'.codePointAt(0)!, text: 'l', mod: KeyMod.None });
const keyEnter = () => new KeyPressMsg({ code: KeyCode.Enter, text: '', mod: KeyMod.None });

describe('file picker v2.2.0 parity', () => {
  test('navigates without a WindowSizeMsg and never renders a blank view', async () => {
    const picker = newFilePicker();
    picker.currentDirectory = newTestDir();

    await step(picker, await picker.init()());
    expect(picker.view()).toContain('subdir');

    await step(picker, keyL());
    expect(picker.currentDirectory.endsWith('subdir')).toBe(true);
    expect(picker['_maxIdx']).toBeGreaterThanOrEqual(picker['_minIdx']);
    expect(picker.view()).toContain('file.go');
  });

  test('a selection is only reported once a path was actually selected', async () => {
    const picker = newFilePicker();
    picker.currentDirectory = join(newTestDir(), 'subdir');
    picker.allowedTypes = ['.txt'];

    await step(picker, await picker.init()());

    expect(picker.didSelectFile(keyEnter())).toEqual([false, '']);
    expect(picker.didSelectDisabledFile(keyEnter())).toEqual([false, '']);

    picker.allowedTypes = ['.go'];
    await step(picker, keyEnter());
    const [didSelect, selectedPath] = picker.didSelectFile(keyEnter());
    expect(didSelect).toBe(true);
    expect(selectedPath.endsWith('file.go')).toBe(true);
  });

  test('a disallowed directory never reports a stale path', async () => {
    const picker = newFilePicker();
    picker.currentDirectory = newTestDir();
    picker.dirAllowed = false;
    picker.path = '/stale/path';
    await step(picker, await picker.init()());
    // The highlighted entry is a directory and directories are not allowed.
    expect(picker.didSelectFile(keyEnter())).toEqual([false, '']);
    expect(picker.didSelectDisabledFile(keyEnter())).toEqual([false, '']);
  });

  test('go-to-last and page-down never produce a negative minIdx', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bubbles-filepicker-idx-'));
    temporaryDirectories.push(directory);
    for (const name of ['a', 'b', 'c']) writeFileSync(join(directory, name), name);

    const { picker } = await initialize(directory); // height 5 > 3 files
    picker.update(new KeyPressMsg({ code: 'G'.codePointAt(0)!, text: 'G', mod: KeyMod.None }));
    expect(picker['_minIdx']).toBe(0);
    expect(picker['_maxIdx']).toBe(2);
    expect(picker.view()).toContain('a');

    picker.update(new KeyPressMsg({ code: 'g'.codePointAt(0)!, text: 'g', mod: KeyMod.None }));
    picker.update(new KeyPressMsg({ code: KeyCode.PgDown, text: '', mod: KeyMod.None }));
    expect(picker['_minIdx']).toBe(0);
    expect(picker['_maxIdx']).toBe(2);
    const view = picker.view();
    for (const name of ['a', 'b', 'c']) expect(view).toContain(name);
  });

  test('zero height shows exactly one entry after go-to-top', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bubbles-filepicker-h0-'));
    temporaryDirectories.push(directory);
    for (const name of ['one', 'two']) writeFileSync(join(directory, name), name);

    const picker = newFilePicker();
    picker.currentDirectory = directory;
    await step(picker, await picker.init()());
    picker.update(new KeyPressMsg({ code: 'g'.codePointAt(0)!, text: 'g', mod: KeyMod.None }));
    expect(picker['_minIdx']).toBe(0);
    expect(picker['_maxIdx']).toBe(0);
    expect(picker.view()).toContain('one');
  });
});
