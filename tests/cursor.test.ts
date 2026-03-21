/**
 * Tests for the cursor module.
 * Port of charm.land/bubbles/v2/cursor tests.
 */
import { describe, test, expect } from 'bun:test';
import { Model, newCursor, Mode, blink, modeString } from '../src/cursor/cursor';

describe('Cursor', () => {
  /**
   * TestBlinkCmdDataRace tests for a race on cursor.blinkTag.
   *
   * Port of TestBlinkCmdDataRace from cursor_test.go
   *
   * The original Go test checks for race conditions on m.blinkTag when:
   * 1. blinkCmd() is called (e.g. by focus())
   * 2. The command is kept busy and doesn't execute immediately
   * 3. BlinkSpeed time elapses
   * 4. blinkCmd() is called again
   * 5. The original command finally executes
   *
   * In JavaScript, since we're single-threaded, true data races don't occur.
   * However, we can test that:
   * 1. The blink message contains the tag captured at creation time
   * 2. Calling blinkCmd() again properly cancels previous commands
   * 3. Multiple concurrent commands can be created without issues
   */
  test('TestBlinkCmdDataRace', async () => {
    const m = newCursor();
    m.blinkSpeed = 10; // Use short blink speed for testing

    // Focus to enable blinking
    m.focus();

    // Get a blink command
    const cmd1 = m.blinkCmd();
    expect(cmd1).not.toBeNull();

    // Call blinkCmd again - this cancels the previous command and creates new one
    const cmd2 = m.blinkCmd();
    expect(cmd2).not.toBeNull();

    // Execute the first command - it should be canceled since cmd2 was created
    const msg1 = (await cmd1!()) as { type: string; id?: number; tag?: number };

    // The first command should be canceled because a new command was created
    expect(msg1.type).toBe('cursor.blinkCanceled');

    // Execute the second command - this one should succeed
    const msg2 = (await cmd2!()) as { type: string; id: number; tag: number };
    expect(msg2.type).toBe('cursor.blink');
    expect(msg2.id).toBe(m.id());
  });

  /**
   * Test that the blink tag is properly captured at command creation time.
   * This is the semantic correctness that Go's race test verifies.
   */
  test('TestBlinkTagCapturedAtCreation', async () => {
    const m = newCursor();
    m.blinkSpeed = 10;
    m.focus();

    // Create a command and immediately execute it (no intervening blinkCmd calls)
    const cmd = m.blinkCmd();
    expect(cmd).not.toBeNull();

    const msg = (await cmd!()) as { type: string; id: number; tag: number };
    expect(msg.type).toBe('cursor.blink');
    expect(msg.id).toBe(m.id());
    // The tag should be a positive number (incremented from 0)
    expect(msg.tag).toBeGreaterThan(0);
  });

  /**
   * Test concurrent blink operations similar to Go's goroutine test.
   * This simulates the scenario where multiple blink commands are created
   * and executed concurrently.
   */
  test('TestBlinkCmdConcurrent', async () => {
    const m = newCursor();
    m.blinkSpeed = 10;
    m.focus();

    const cmd = m.blinkCmd();
    expect(cmd).not.toBeNull();

    // Simulate concurrent operations using Promise.all
    const [result1, result2] = await Promise.all([
      // Simulate delayed command execution
      new Promise<unknown>(async (resolve) => {
        await new Promise((r) => setTimeout(r, m.blinkSpeed * 3));
        const msg = await cmd!();
        resolve(msg);
      }),
      // Simulate calling blink again while waiting
      new Promise<unknown>((resolve) => {
        setTimeout(() => {
          const newCmd = m.blinkCmd();
          resolve(newCmd);
        }, m.blinkSpeed * 2);
      }),
    ]);

    // First should be a blink message (or blinkCanceled if canceled)
    expect(result1).toHaveProperty('type');
    // Second should be a new command function
    expect(typeof result2).toBe('function');
  });

  // Additional cursor tests
  test('newCursor creates cursor with default settings', () => {
    const m = newCursor();
    expect(m.blinkSpeed).toBe(530);
    expect(m.mode()).toBe(Mode.CursorBlink);
    expect(m.isBlinked).toBe(true);
  });

  test('mode returns the correct mode', () => {
    const m = newCursor();
    expect(m.mode()).toBe(Mode.CursorBlink);

    m.setMode(Mode.CursorStatic);
    expect(m.mode()).toBe(Mode.CursorStatic);

    m.setMode(Mode.CursorHide);
    expect(m.mode()).toBe(Mode.CursorHide);
  });

  test('modeString returns human-readable mode names', () => {
    expect(modeString(Mode.CursorBlink)).toBe('blink');
    expect(modeString(Mode.CursorStatic)).toBe('static');
    expect(modeString(Mode.CursorHide)).toBe('hidden');
  });

  test('focus enables blinking', () => {
    const m = newCursor();
    const cmd = m.focus();
    expect(cmd).not.toBeNull();
    expect(m.isBlinked).toBe(false);
  });

  test('blur disables blinking', () => {
    const m = newCursor();
    m.focus();
    m.blur();
    expect(m.isBlinked).toBe(true);
  });

  test('setChar and view render correctly', () => {
    const m = newCursor();
    m.setChar('A');

    // When blinked, shows character with textStyle
    const viewBlinked = m.view();
    expect(viewBlinked).toContain('A');

    // Focus and unblink to show cursor
    m.focus();
    m.isBlinked = false;
    const viewNotBlinked = m.view();
    expect(viewNotBlinked).toContain('A');
  });

  test('blink() returns InitialBlinkMsg', () => {
    const msg = blink();
    expect(msg).toEqual({ type: 'cursor.initialBlink' });
  });

  test('update handles focus message', () => {
    const m = newCursor();
    const [, cmd] = m.update({ type: 'focus' });
    expect(cmd).not.toBeNull();
    expect(m.isBlinked).toBe(false);
  });

  test('update handles blur message', () => {
    const m = newCursor();
    m.focus();
    const [, cmd] = m.update({ type: 'blur' });
    expect(cmd).toBeNull();
    expect(m.isBlinked).toBe(true);
  });

  test('update handles initialBlink message', () => {
    const m = newCursor();
    m.focus();
    const [, cmd] = m.update({ type: 'cursor.initialBlink' });
    expect(cmd).not.toBeNull();
  });

  test('update ignores blink message with wrong id/tag', () => {
    const m = newCursor();
    m.focus();
    const originalBlinked = m.isBlinked;
    const [, cmd] = m.update({ type: 'cursor.blink', id: 999, tag: 999 });
    expect(cmd).toBeNull();
    expect(m.isBlinked).toBe(originalBlinked);
  });

  test('setMode returns command for CursorBlink mode', () => {
    const m = newCursor();
    m.setMode(Mode.CursorStatic);
    const cmd = m.setMode(Mode.CursorBlink);
    expect(cmd).not.toBeNull();
  });

  test('setMode returns null for invalid mode', () => {
    const m = newCursor();
    const cmd = m.setMode(-1 as Mode);
    expect(cmd).toBeNull();
  });

  test('id returns unique id', () => {
    const m1 = newCursor();
    const m2 = newCursor();
    expect(m1.id()).not.toBe(m2.id());
  });
});
