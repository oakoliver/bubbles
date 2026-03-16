/**
 * Spinner provides a spinner component for Bubble Tea applications.
 *
 * Port of charm.land/bubbles/v2/spinner
 */
import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { Tick } from '@oakoliver/bubbletea';
import type { Style } from '@oakoliver/lipgloss';
import { newStyle } from '@oakoliver/lipgloss';

/** Internal ID management for spinner instances. */
let _lastID = 0;
function nextID(): number {
  return ++_lastID;
}

/** Spinner is a set of frames used in animating the spinner. */
export interface Spinner {
  frames: string[];
  fps: number; // milliseconds per frame
}

// --- Built-in spinners ---

export const Line: Spinner = {
  frames: ['|', '/', '-', '\\'],
  fps: 100,
};

export const Dot: Spinner = {
  frames: ['⣾ ', '⣽ ', '⣻ ', '⢿ ', '⡿ ', '⣟ ', '⣯ ', '⣷ '],
  fps: 100,
};

export const MiniDot: Spinner = {
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  fps: Math.floor(1000 / 12),
};

export const Jump: Spinner = {
  frames: ['⢄', '⢂', '⢁', '⡁', '⡈', '⡐', '⡠'],
  fps: 100,
};

export const Pulse: Spinner = {
  frames: ['█', '▓', '▒', '░'],
  fps: 125,
};

export const Points: Spinner = {
  frames: ['∙∙∙', '●∙∙', '∙●∙', '∙∙●'],
  fps: Math.floor(1000 / 7),
};

export const Globe: Spinner = {
  frames: ['🌍', '🌎', '🌏'],
  fps: 250,
};

export const Moon: Spinner = {
  frames: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
  fps: 125,
};

export const Monkey: Spinner = {
  frames: ['🙈', '🙉', '🙊'],
  fps: Math.floor(1000 / 3),
};

export const Meter: Spinner = {
  frames: ['▱▱▱', '▰▱▱', '▰▰▱', '▰▰▰', '▰▰▱', '▰▱▱', '▱▱▱'],
  fps: Math.floor(1000 / 7),
};

export const Hamburger: Spinner = {
  frames: ['☱', '☲', '☴', '☲'],
  fps: Math.floor(1000 / 3),
};

export const Ellipsis: Spinner = {
  frames: ['', '.', '..', '...'],
  fps: Math.floor(1000 / 3),
};

// --- Messages ---

/** TickMsg indicates that the timer has ticked and we should render a frame. */
export interface TickMsg {
  readonly type: 'spinner.tick';
  readonly time: number; // timestamp
  readonly tag: number;
  readonly id: number;
}

// --- Options ---

export type Option = (m: Model) => void;

/** WithSpinner sets the spinner type. */
export function withSpinner(spinner: Spinner): Option {
  return (m: Model) => {
    m.spinner = spinner;
  };
}

/** WithStyle sets the spinner style. */
export function withStyle(style: Style): Option {
  return (m: Model) => {
    m.style = style;
  };
}

// --- Model ---

/** Model contains the state for the spinner. */
export class Model {
  /** Spinner settings to use. */
  spinner: Spinner;

  /** Style sets the styling for the spinner. */
  style: Style;

  private _frame: number;
  private _id: number;
  private _tag: number;

  constructor(...opts: Option[]) {
    this.spinner = Line;
    this.style = newStyle();
    this._frame = 0;
    this._id = nextID();
    this._tag = 0;

    for (const opt of opts) {
      opt(this);
    }
  }

  /** Returns the spinner's unique ID. */
  id(): number {
    return this._id;
  }

  /** Update is the Tea update function. */
  update(msg: Msg): [Model, Cmd | null] {
    if (typeof msg === 'object' && msg !== null && 'type' in msg) {
      const m = msg as TickMsg;
      if (m.type === 'spinner.tick') {
        // If an ID is set, and the ID doesn't belong to this spinner, reject
        if (m.id > 0 && m.id !== this._id) {
          return [this, null];
        }
        // If a tag is set, and it's not the one we expect, reject
        if (m.tag > 0 && m.tag !== this._tag) {
          return [this, null];
        }

        this._frame++;
        if (this._frame >= this.spinner.frames.length) {
          this._frame = 0;
        }

        this._tag++;
        return [this, this._tick(this._id, this._tag)];
      }
    }
    return [this, null];
  }

  /** View renders the model's view. */
  view(): string {
    if (this._frame >= this.spinner.frames.length) {
      return '(error)';
    }
    return this.style.render(this.spinner.frames[this._frame]);
  }

  /**
   * Tick is the command used to advance the spinner one frame.
   * Use this command to effectively start the spinner.
   */
  tickMsg(): TickMsg {
    return {
      type: 'spinner.tick',
      time: Date.now(),
      id: this._id,
      tag: this._tag,
    };
  }

  /** Internal tick command. */
  private _tick(id: number, tag: number): Cmd {
    return Tick(this.spinner.fps, (t: Date): Msg => {
      return {
        type: 'spinner.tick',
        time: t.getTime(),
        id,
        tag,
      } as TickMsg;
    });
  }
}

/** Creates a new spinner model with default values. */
export function newSpinner(...opts: Option[]): Model {
  return new Model(...opts);
}
