import { describe, expect, test } from 'bun:test';
import { newStopwatch, withInterval } from '../src/stopwatch/stopwatch.js';

describe('stopwatch v2 parity', () => {
  test('tracks elapsed time and formats Go durations', () => {
    const stopwatch = newStopwatch(withInterval(250));
    stopwatch.update({
      type: 'stopwatch.startStop',
      id: stopwatch.id(),
      running: true,
    });
    stopwatch.update({
      type: 'stopwatch.tick',
      id: stopwatch.id(),
      tag: 0,
    });

    expect(stopwatch.elapsed()).toBe(250);
    expect(stopwatch.view()).toBe('250ms');
  });

  test('rejects stale tags and reset clears elapsed time', () => {
    const stopwatch = newStopwatch(withInterval(1_000));
    stopwatch.update({
      type: 'stopwatch.startStop',
      id: stopwatch.id(),
      running: true,
    });
    stopwatch.update({ type: 'stopwatch.tick', id: stopwatch.id(), tag: 0 });
    stopwatch.update({ type: 'stopwatch.tick', id: stopwatch.id(), tag: 99 });
    expect(stopwatch.elapsed()).toBe(1_000);

    stopwatch.update({ type: 'stopwatch.reset', id: stopwatch.id() });
    expect(stopwatch.elapsed()).toBe(0);
    expect(stopwatch.view()).toBe('0s');
  });
});
