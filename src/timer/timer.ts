/**
 * Timer provides a simple timeout component.
 *
 * Port of charm.land/bubbles/v2/timer
 */
import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { Tick, Batch } from '@oakoliver/bubbletea';

/** Internal ID management. */
let _lastID = 0;
function nextID(): number {
  return ++_lastID;
}

/** Option for configuring the timer. */
export type Option = (m: Model) => void;

/** Sets the interval between ticks. */
export function withInterval(interval: number): Option {
  return (m: Model) => {
    m.interval = interval;
  };
}

// --- Messages ---

/** Sent when the timer should start or stop. */
export interface StartStopMsg {
  readonly type: 'timer.startStop';
  readonly id: number;
  readonly running: boolean;
}

/** Sent on every timer tick. */
export interface TickMsg {
  readonly type: 'timer.tick';
  readonly id: number;
  readonly timeout: boolean;
  readonly tag: number;
}

/** Sent once when the timer times out. */
export interface TimeoutMsg {
  readonly type: 'timer.timeout';
  readonly id: number;
}

// --- Model ---

/** Model of the timer component. */
export class Model {
  /** How long until the timer expires (ms). */
  timeout: number;
  /** How long to wait before every tick (ms). Defaults to 1000. */
  interval: number;

  private _id: number;
  private _tag: number;
  private _running: boolean;

  constructor(timeout: number, ...opts: Option[]) {
    this.timeout = timeout;
    this.interval = 1000;
    this._running = true;
    this._id = nextID();
    this._tag = 0;

    for (const opt of opts) {
      opt(this);
    }
  }

  /** Returns the model's identifier. */
  id(): number {
    return this._id;
  }

  /** Returns whether or not the timer is running. */
  running(): boolean {
    if (this.timedout() || !this._running) {
      return false;
    }
    return true;
  }

  /** Returns whether or not the timer has timed out. */
  timedout(): boolean {
    return this.timeout <= 0;
  }

  /** Init starts the timer. */
  init(): Cmd {
    return this._tick();
  }

  /** Update handles the timer tick. */
  update(msg: Msg): [Model, Cmd | null] {
    if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
      return [this, null];
    }
    const m = msg as { type: string; id?: number; running?: boolean; tag?: number };

    switch (m.type) {
      case 'timer.startStop': {
        if (m.id !== 0 && m.id !== this._id) {
          return [this, null];
        }
        this._running = m.running!;
        return [this, this._tick()];
      }

      case 'timer.tick': {
        if (!this.running() || (m.id !== 0 && m.id !== this._id)) {
          break;
        }
        if ((m.tag ?? 0) > 0 && m.tag !== this._tag) {
          return [this, null];
        }
        this.timeout -= this.interval;
        return [this, Batch(this._tick(), this._timedoutCmd())];
      }
    }

    return [this, null];
  }

  /** View of the timer component. */
  view(): string {
    return formatDuration(this.timeout);
  }

  /** Start resumes the timer. */
  start(): Cmd {
    return this._startStop(true);
  }

  /** Stop pauses the timer. */
  stop(): Cmd {
    return this._startStop(false);
  }

  /** Toggle stops/starts the timer. */
  toggle(): Cmd {
    return this._startStop(!this.running());
  }

  private _tick(): Cmd {
    const id = this._id;
    const tag = this._tag;
    return Tick(this.interval, (): Msg => {
      return {
        type: 'timer.tick',
        id,
        tag,
        timeout: this.timedout(),
      } as TickMsg;
    });
  }

  private _timedoutCmd(): Cmd | null {
    if (!this.timedout()) {
      return null;
    }
    const id = this._id;
    return (): Msg => {
      return { type: 'timer.timeout', id } as TimeoutMsg;
    };
  }

  private _startStop(v: boolean): Cmd {
    const id = this._id;
    return (): Msg => {
      return { type: 'timer.startStop', id, running: v } as StartStopMsg;
    };
  }
}

/** Creates a new timer. */
export function newTimer(timeout: number, ...opts: Option[]): Model {
  return new Model(timeout, ...opts);
}

/** Formats a duration in ms to a human-readable string like Go's time.Duration. */
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
