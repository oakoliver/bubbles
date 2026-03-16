/**
 * Stopwatch provides a simple stopwatch component.
 *
 * Port of charm.land/bubbles/v2/stopwatch
 */
import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { Tick, Sequence } from '@oakoliver/bubbletea';

/** Internal ID management. */
let _lastID = 0;
function nextID(): number {
  return ++_lastID;
}

/** Option for configuring the stopwatch. */
export type Option = (m: Model) => void;

/** Sets the interval between ticks. */
export function withInterval(interval: number): Option {
  return (m: Model) => {
    m.interval = interval;
  };
}

// --- Messages ---

/** Sent on every stopwatch tick. */
export interface TickMsg {
  readonly type: 'stopwatch.tick';
  readonly id: number;
  readonly tag: number;
}

/** Sent when the stopwatch should start or stop. */
export interface StartStopMsg {
  readonly type: 'stopwatch.startStop';
  readonly id: number;
  readonly running: boolean;
}

/** Sent when the stopwatch should reset. */
export interface ResetMsg {
  readonly type: 'stopwatch.reset';
  readonly id: number;
}

// --- Model ---

/** Model for the stopwatch component. */
export class Model {
  /** How long to wait before every tick (ms). Defaults to 1000. */
  interval: number;

  private _d: number; // elapsed duration in ms
  private _id: number;
  private _tag: number;
  private _running: boolean;

  constructor(...opts: Option[]) {
    this._d = 0;
    this._id = nextID();
    this._tag = 0;
    this._running = false;
    this.interval = 1000;

    for (const opt of opts) {
      opt(this);
    }
  }

  /** Returns the unique ID of the model. */
  id(): number {
    return this._id;
  }

  /** Returns true if the stopwatch is running. */
  running(): boolean {
    return this._running;
  }

  /** Init starts the stopwatch. */
  init(): Cmd {
    return this.start();
  }

  /** Start starts the stopwatch. */
  start(): Cmd {
    const id = this._id;
    const tag = this._tag;
    const interval = this.interval;
    return Sequence(
      (): Msg => ({
        type: 'stopwatch.startStop',
        id,
        running: true,
      } as StartStopMsg),
      _tick(id, tag, interval),
    );
  }

  /** Stop stops the stopwatch. */
  stop(): Cmd {
    const id = this._id;
    return (): Msg => ({
      type: 'stopwatch.startStop',
      id,
      running: false,
    } as StartStopMsg);
  }

  /** Toggle stops if running, starts if stopped. */
  toggle(): Cmd {
    if (this.running()) {
      return this.stop();
    }
    return this.start();
  }

  /** Reset resets the stopwatch to 0. */
  reset(): Cmd {
    const id = this._id;
    return (): Msg => ({
      type: 'stopwatch.reset',
      id,
    } as ResetMsg);
  }

  /** Update handles the stopwatch tick. */
  update(msg: Msg): [Model, Cmd | null] {
    if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
      return [this, null];
    }
    const m = msg as { type: string; id?: number; running?: boolean; tag?: number };

    switch (m.type) {
      case 'stopwatch.startStop': {
        if (m.id !== this._id) {
          return [this, null];
        }
        this._running = m.running!;
        return [this, null];
      }

      case 'stopwatch.reset': {
        if (m.id !== this._id) {
          return [this, null];
        }
        this._d = 0;
        return [this, null];
      }

      case 'stopwatch.tick': {
        if (!this._running || m.id !== this._id) {
          break;
        }
        if ((m.tag ?? 0) > 0 && m.tag !== this._tag) {
          return [this, null];
        }
        this._d += this.interval;
        this._tag++;
        return [this, _tick(this._id, this._tag, this.interval)];
      }
    }

    return [this, null];
  }

  /** Returns the time elapsed (ms). */
  elapsed(): number {
    return this._d;
  }

  /** View of the stopwatch component. */
  view(): string {
    return formatDuration(this._d);
  }
}

/** Creates a new stopwatch. */
export function newStopwatch(...opts: Option[]): Model {
  return new Model(...opts);
}

function _tick(id: number, tag: number, interval: number): Cmd {
  return Tick(interval, (): Msg => ({
    type: 'stopwatch.tick',
    id,
    tag,
  } as TickMsg));
}

/** Formats a duration in ms to a human-readable string. */
function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const remainingMs = ms % 1000;

  if (minutes > 0) {
    if (seconds > 0 || remainingMs > 0) {
      return `${minutes}m${seconds}s`;
    }
    return `${minutes}m0s`;
  }
  if (remainingMs > 0) {
    return `${totalSeconds}.${String(remainingMs).padStart(3, '0').replace(/0+$/, '')}s`;
  }
  return `${totalSeconds}s`;
}
