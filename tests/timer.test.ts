import { describe, expect, test } from 'bun:test';
import { newTimer, withInterval } from '../src/timer/timer.js';

describe('timer v2 parity', () => {
  test('formats subsecond and negative durations like Go time.Duration', () => {
    expect(newTimer(500).view()).toBe('500ms');
    expect(newTimer(-500).view()).toBe('-500ms');
    expect(newTimer(3_661_250).view()).toBe('1h1m1.25s');
  });

  test('ticks by the configured interval and emits a timeout command', () => {
    const timer = newTimer(750, withInterval(500));
    const [, firstCommand] = timer.update({
      type: 'timer.tick',
      id: timer.id(),
      tag: 0,
      timeout: false,
    });
    expect(timer.timeout).toBe(250);
    expect(firstCommand).not.toBeNull();

    timer.update({
      type: 'timer.tick',
      id: timer.id(),
      tag: 0,
      timeout: false,
    });
    expect(timer.timedout()).toBe(true);
    expect(timer.view()).toBe('-250ms');
  });
});
