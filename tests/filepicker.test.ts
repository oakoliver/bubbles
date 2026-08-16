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
import { WindowSizeMsg } from '@oakoliver/bubbletea';
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

