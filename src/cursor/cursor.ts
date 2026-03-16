/**
 * Cursor provides a virtual cursor to support the textinput and textarea elements.
 *
 * Port of charm.land/bubbles/v2/cursor
 */
import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { Tick } from '@oakoliver/bubbletea';
import type { Style } from '@oakoliver/lipgloss';
import { newStyle } from '@oakoliver/lipgloss';

const DEFAULT_BLINK_SPEED = 530; // milliseconds

/** Internal ID management for cursor instances. */
let _lastID = 0;
function nextID(): number {
  return ++_lastID;
}

// --- Messages ---

/** Initializes cursor blinking. */
export interface InitialBlinkMsg {
  readonly type: 'cursor.initialBlink';
}

/** Signals that the cursor should blink. */
export interface BlinkMsg {
  readonly type: 'cursor.blink';
  readonly id: number;
  readonly tag: number;
}

/** Sent when a blink operation is canceled. */
export interface BlinkCanceledMsg {
  readonly type: 'cursor.blinkCanceled';
}

/** Focus message from bubbletea. */
export interface FocusMsg {
  readonly type: 'focus';
}

/** Blur message from bubbletea. */
export interface BlurMsg {
  readonly type: 'blur';
}

export type CursorMsg = InitialBlinkMsg | BlinkMsg | BlinkCanceledMsg | FocusMsg | BlurMsg;

// --- Mode ---

/** Mode describes the behavior of the cursor. */
export enum Mode {
  CursorBlink = 0,
  CursorStatic = 1,
  CursorHide = 2,
}

/** Returns the cursor mode in a human-readable format. */
export function modeString(m: Mode): string {
  return ['blink', 'static', 'hidden'][m] ?? 'unknown';
}

// --- Blink context ---

interface BlinkCtx {
  timer: ReturnType<typeof setTimeout> | null;
  cancel: (() => void) | null;
}

// --- Model ---

/** Model is the Bubble Tea model for the cursor element. */
export class Model {
  /** Style styles the cursor block. */
  style: Style;

  /** TextStyle is the style used for the cursor when it is blinking (hidden). */
  textStyle: Style;

  /** BlinkSpeed is the speed at which the cursor blinks (ms). */
  blinkSpeed: number;

  /** IsBlinked is the state of the cursor blink. When true, the cursor is hidden. */
  isBlinked: boolean;

  /** The character under the cursor. */
  private _char: string;

  /** The ID of this Model. */
  private _id: number;

  /** Whether the containing input is focused. */
  private _focus: boolean;

  /** Used to manage cursor blink. */
  private _blinkCtx: BlinkCtx;

  /** The ID of the blink message we're expecting to receive. */
  private _blinkTag: number;

  /** The cursor mode. */
  private _mode: Mode;

  constructor() {
    this._id = nextID();
    this.blinkSpeed = DEFAULT_BLINK_SPEED;
    this.isBlinked = true;
    this._mode = Mode.CursorBlink;
    this._char = '';
    this._focus = false;
    this._blinkCtx = { timer: null, cancel: null };
    this._blinkTag = 0;
    this.style = newStyle();
    this.textStyle = newStyle();
  }

  /** Returns the model's cursor mode. */
  mode(): Mode {
    return this._mode;
  }

  /** Returns the cursor's unique ID. */
  id(): number {
    return this._id;
  }

  /**
   * Sets the model's cursor mode. Returns a command if mode is CursorBlink.
   */
  setMode(mode: Mode): Cmd | null {
    if (mode < Mode.CursorBlink || mode > Mode.CursorHide) {
      return null;
    }
    this._mode = mode;
    this.isBlinked = this._mode === Mode.CursorHide || !this._focus;
    if (mode === Mode.CursorBlink) {
      return blink;
    }
    return null;
  }

  /** Update updates the cursor. */
  update(msg: Msg): [Model, Cmd | null] {
    if (typeof msg === 'object' && msg !== null && 'type' in msg) {
      const m = msg as { type: string; id?: number; tag?: number };

      switch (m.type) {
        case 'cursor.initialBlink': {
          if (this._mode !== Mode.CursorBlink || !this._focus) {
            return [this, null];
          }
          const cmd = this.blinkCmd();
          return [this, cmd];
        }

        case 'focus': {
          return [this, this.focus()];
        }

        case 'blur': {
          this.blur();
          return [this, null];
        }

        case 'cursor.blink': {
          if (this._mode !== Mode.CursorBlink || !this._focus) {
            return [this, null];
          }
          if (m.id !== this._id || m.tag !== this._blinkTag) {
            return [this, null];
          }
          if (this._mode === Mode.CursorBlink) {
            this.isBlinked = !this.isBlinked;
            const cmd = this.blinkCmd();
            return [this, cmd];
          }
          return [this, null];
        }

        case 'cursor.blinkCanceled': {
          return [this, null];
        }
      }
    }
    return [this, null];
  }

  /** Blink command — manages cursor blinking. */
  blinkCmd(): Cmd | null {
    if (this._mode !== Mode.CursorBlink) {
      return null;
    }

    // Cancel previous blink
    if (this._blinkCtx.cancel) {
      this._blinkCtx.cancel();
    }

    this._blinkTag++;
    const blinkMsg: BlinkMsg = {
      type: 'cursor.blink',
      id: this._id,
      tag: this._blinkTag,
    };

    const speed = this.blinkSpeed;
    let canceled = false;

    const cancel = () => {
      canceled = true;
      if (this._blinkCtx.timer) {
        clearTimeout(this._blinkCtx.timer);
        this._blinkCtx.timer = null;
      }
    };
    this._blinkCtx.cancel = cancel;

    return (): Promise<Msg> => {
      return new Promise((resolve) => {
        this._blinkCtx.timer = setTimeout(() => {
          if (canceled) {
            resolve({ type: 'cursor.blinkCanceled' } as BlinkCanceledMsg);
          } else {
            resolve(blinkMsg);
          }
        }, speed);
      });
    };
  }

  /** Focus focuses the cursor to allow it to blink. */
  focus(): Cmd | null {
    this._focus = true;
    this.isBlinked = this._mode === Mode.CursorHide;
    if (this._mode === Mode.CursorBlink && this._focus) {
      return this.blinkCmd();
    }
    return null;
  }

  /** Blur blurs the cursor. */
  blur(): void {
    this._focus = false;
    this.isBlinked = true;
  }

  /** Sets the character under the cursor. */
  setChar(char: string): void {
    this._char = char;
  }

  /** View displays the cursor. */
  view(): string {
    if (this.isBlinked) {
      return this.textStyle.inline(true).render(this._char);
    }
    return this.style.inline(true).reverse(true).render(this._char);
  }
}

/** Creates a new cursor model with default settings. */
export function newCursor(): Model {
  return new Model();
}

/** Blink is a command used to initialize cursor blinking. */
export function blink(): Msg {
  return { type: 'cursor.initialBlink' } as InitialBlinkMsg;
}
