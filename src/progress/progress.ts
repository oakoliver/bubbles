/**
 * Progress — animated progress bar component.
 *
 * Zero-dependency port of charmbracelet/bubbles/progress (Go).
 * Features:
 * - Spring-based animation for smooth transitions
 * - Color blending (gradient fills)
 * - Dynamic color functions
 * - Half-block characters for double color resolution
 * - Percentage display
 *
 * @module
 */

import type { Cmd, Msg } from '@oakoliver/bubbletea';
import { Tick } from '@oakoliver/bubbletea';
import { Style, newStyle, stringWidth, colorToRGB, parseColor, fgColor, bgColor } from '@oakoliver/lipgloss';
import type { Color, RGBColor } from '@oakoliver/lipgloss';
import { NewSpring, FPS, springUpdate } from '../internal/harmonica.js';
import type { Spring } from '../internal/harmonica.js';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * ColorFunc dynamically determines the fill color based on percentage.
 * @param total - Total filled percentage (0-1)
 * @param current - Current position being filled (0-1)
 */
export type ColorFunc = (total: number, current: number) => Color;

/** Option configures a progress Model during construction. */
export type Option = (m: Model) => void;

// ── Constants ───────────────────────────────────────────────────────────────

/** Default fill character — half block for higher resolution blending. */
export const DefaultFullCharHalfBlock = '\u258C'; // ▌

/** Full block fill character — disables higher resolution blending. */
export const DefaultFullCharFullBlock = '\u2588'; // █

/** Default empty character. */
export const DefaultEmptyCharBlock = '\u2591'; // ░

const FRAME_RATE = 60;
const DEFAULT_WIDTH = 40;
const DEFAULT_FREQUENCY = 18.0;
const DEFAULT_DAMPING = 1.0;

const defaultBlendStart = '#5A56E0'; // Purple haze
const defaultBlendEnd = '#EE6FF8';   // Neon pink
const defaultFullColor = '#7571F9';  // Blueberry
const defaultEmptyColor = '#606060'; // Slate gray

// ── Internal ID management ──────────────────────────────────────────────────

let lastID = 0;
function nextID(): number {
  return ++lastID;
}

// ── Messages ────────────────────────────────────────────────────────────────

/** FrameMsg triggers an animation step for a specific progress bar. */
export interface FrameMsg {
  readonly type: 'progress.frame';
  readonly id: number;
  readonly tag: number;
}

// ── Option Functions ────────────────────────────────────────────────────────

/**
 * Sets the default blend (purple haze → neon pink).
 */
export function withDefaultBlend(): Option {
  return withColors(defaultBlendStart, defaultBlendEnd);
}

/**
 * Sets the fill colors.
 * - 0 colors: resets to defaults
 * - 1 color: solid fill
 * - 2+ colors: gradient blend
 */
export function withColors(...colors: Color[]): Option {
  if (colors.length === 0) {
    return (m: Model) => {
      m.fullColor = defaultFullColor;
      m._blend = null;
      m._colorFunc = null;
    };
  }
  if (colors.length === 1) {
    return (m: Model) => {
      m.fullColor = colors[0]!;
      m._colorFunc = null;
      m._blend = null;
    };
  }
  return (m: Model) => {
    m._blend = [...colors];
  };
}

/**
 * Sets a dynamic color function for per-cell coloring.
 * When specified, overrides any other defined colors and scaling.
 */
export function withColorFunc(fn: ColorFunc): Option {
  return (m: Model) => {
    m._colorFunc = fn;
    m._blend = null;
  };
}

/**
 * Sets the characters used for filled and empty portions.
 */
export function withFillCharacters(full: string, empty: string): Option {
  return (m: Model) => {
    m.full = full;
    m.empty = empty;
  };
}

/** Hides the numeric percentage display. */
export function withoutPercentage(): Option {
  return (m: Model) => {
    m.showPercentage = false;
  };
}

/** Sets the initial width of the progress bar. */
export function withWidth(w: number): Option {
  return (m: Model) => {
    m.setWidth(w);
  };
}

/**
 * Sets the spring animation parameters.
 * @param frequency - Speed of animation
 * @param damping - Bounciness (1.0 = critically damped)
 */
export function withSpringOptions(frequency: number, damping: number): Option {
  return (m: Model) => {
    m.setSpringOptions(frequency, damping);
    m._springCustomized = true;
  };
}

/**
 * Sets whether to scale the blend to fit only the filled portion.
 * When false (default), 100% is needed to see the full gradient.
 */
export function withScaled(enabled: boolean): Option {
  return (m: Model) => {
    m._scaleBlend = enabled;
  };
}

// ── Model ───────────────────────────────────────────────────────────────────

/**
 * Progress bar model. Use `newProgress()` to create.
 */
export class Model {
  /** Internal ID for routing animation messages. */
  private _id: number;
  /** Frame tag to prevent duplicate frame messages. */
  private _tag: number;
  /** Total width including percentage text. */
  private _width: number;

  /** Fill character (default: ▌ half block). */
  full: string;
  /** Fill color for solid mode. */
  fullColor: Color;

  /** Empty character (default: ░). */
  empty: string;
  /** Empty portion color. */
  emptyColor: Color;

  /** Whether to show numeric percentage. */
  showPercentage: boolean;
  /** Format string for percentage (sprintf-style). */
  percentFormat: string;
  /** Style applied to the percentage text. */
  percentageStyle: Style;

  /** @internal Spring for animation. */
  private _spring: Spring;
  /** @internal Whether spring was explicitly configured. */
  _springCustomized: boolean;
  /** @internal Current displayed percentage. */
  private _percentShown: number;
  /** @internal Target percentage for animation. */
  private _targetPercent: number;
  /** @internal Current spring velocity. */
  private _velocity: number;

  /** @internal Blend colors array (null = solid fill). */
  _blend: Color[] | null;
  /** @internal Whether to scale blend to filled width only. */
  _scaleBlend: boolean;
  /** @internal Dynamic color function. */
  _colorFunc: ColorFunc | null;

  constructor() {
    this._id = nextID();
    this._tag = 0;
    this._width = DEFAULT_WIDTH;
    this.full = DefaultFullCharHalfBlock;
    this.fullColor = defaultFullColor;
    this.empty = DefaultEmptyCharBlock;
    this.emptyColor = defaultEmptyColor;
    this.showPercentage = true;
    this.percentFormat = ' %3.0f%%';
    this.percentageStyle = newStyle();
    this._spring = NewSpring(FPS(FRAME_RATE), DEFAULT_FREQUENCY, DEFAULT_DAMPING);
    this._springCustomized = false;
    this._percentShown = 0;
    this._targetPercent = 0;
    this._velocity = 0;
    this._blend = null;
    this._scaleBlend = false;
    this._colorFunc = null;
  }

  /** Satisfies the tea.Model interface. */
  init(): Cmd | null {
    return null;
  }

  /**
   * Handles animation frame messages. Use setPercent() to trigger animation.
   * If rendering with viewAs(), you don't need this.
   */
  update(msg: Msg): [Model, Cmd | null] {
    if (isFrameMsg(msg)) {
      if (msg.id !== this._id || msg.tag !== this._tag) {
        return [this, null];
      }

      // If we've reached equilibrium, stop.
      if (!this.isAnimating()) {
        return [this, null];
      }

      const [newPos, newVel] = springUpdate(
        this._spring,
        this._percentShown,
        this._velocity,
        this._targetPercent,
      );
      this._percentShown = newPos;
      this._velocity = newVel;
      return [this, this._nextFrame()];
    }

    return [this, null];
  }

  /**
   * Sets the spring animation parameters.
   */
  setSpringOptions(frequency: number, damping: number): void {
    this._spring = NewSpring(FPS(FRAME_RATE), frequency, damping);
  }

  /**
   * Returns the target percentage (0-1).
   */
  percent(): number {
    return this._targetPercent;
  }

  /**
   * Sets the target percentage and returns an animation command.
   * If rendering with viewAs(), you don't need this.
   */
  setPercent(p: number): Cmd {
    this._targetPercent = Math.max(0, Math.min(1, p));
    this._tag++;
    return this._nextFrame();
  }

  /**
   * Increments the percentage and returns an animation command.
   */
  incrPercent(v: number): Cmd {
    return this.setPercent(this.percent() + v);
  }

  /**
   * Decrements the percentage and returns an animation command.
   */
  decrPercent(v: number): Cmd {
    return this.setPercent(this.percent() - v);
  }

  /**
   * Renders the animated progress bar in its current state.
   * To render statically, use viewAs() instead.
   */
  view(): string {
    return this.viewAs(this._percentShown);
  }

  /**
   * Renders the progress bar at a given percentage (0-1).
   */
  viewAs(percent: number): string {
    const percentView = this._percentageView(percent);
    const barStr = this._barView(percent, stringWidth(percentView));
    return barStr + percentView;
  }

  /** Sets the total width of the progress bar. */
  setWidth(w: number): void {
    this._width = w;
  }

  /** Returns the total width. */
  width(): number {
    return this._width;
  }

  /**
   * Returns true if the progress bar is still animating toward its target.
   */
  isAnimating(): boolean {
    const dist = Math.abs(this._percentShown - this._targetPercent);
    return !(dist < 0.001 && this._velocity < 0.01);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _nextFrame(): Cmd {
    const id = this._id;
    const tag = this._tag;
    const durationMs = 1000 / FRAME_RATE;
    return Tick(durationMs, () => ({
      type: 'progress.frame' as const,
      id,
      tag,
    }));
  }

  private _barView(percent: number, textWidth: number): string {
    const tw = Math.max(0, this._width - textWidth); // total bar width
    let fw = Math.round(tw * percent);                // filled width
    fw = Math.max(0, Math.min(tw, fw));

    const isHalfBlock = this.full === DefaultFullCharHalfBlock;
    let result = '';

    if (this._colorFunc != null) {
      // Dynamic color function mode
      const halfBlockPerc = 0.5 / tw;
      for (let i = 0; i < fw; i++) {
        const current = tw > 0 ? i / tw : 0;
        const fgRgb = colorToRGB(this._colorFunc(percent, current));
        let cell = '';
        if (fgRgb) {
          cell += fgColor(fgRgb.r, fgRgb.g, fgRgb.b);
        }
        if (isHalfBlock) {
          const bgRgb = colorToRGB(
            this._colorFunc(percent, Math.min(current + halfBlockPerc, 1)),
          );
          if (bgRgb) {
            cell += bgColor(bgRgb.r, bgRgb.g, bgRgb.b);
          }
        }
        cell += this.full + '\x1b[0m';
        result += cell;
      }
    } else if (this._blend != null && this._blend.length > 0) {
      // Gradient blend mode
      const multiplier = isHalfBlock ? 2 : 1;
      const blendCount = this._scaleBlend ? fw * multiplier : tw * multiplier;
      const blend = blend1D(Math.max(1, blendCount), ...this._blend);

      let blendIndex = 0;
      for (let i = 0; i < fw; i++) {
        if (!isHalfBlock) {
          const rgb = blend[i];
          if (rgb) {
            result += fgColor(rgb.r, rgb.g, rgb.b) + this.full + '\x1b[0m';
          } else {
            result += this.full;
          }
          continue;
        }

        const fgRgb = blend[blendIndex];
        const bgRgb = blend[blendIndex + 1];
        let cell = '';
        if (fgRgb) cell += fgColor(fgRgb.r, fgRgb.g, fgRgb.b);
        if (bgRgb) cell += bgColor(bgRgb.r, bgRgb.g, bgRgb.b);
        cell += this.full + '\x1b[0m';
        result += cell;
        blendIndex += 2;
      }
    } else {
      // Solid fill mode
      const rgb = colorToRGB(this.fullColor);
      if (rgb && fw > 0) {
        result += fgColor(rgb.r, rgb.g, rgb.b) + this.full.repeat(fw) + '\x1b[0m';
      } else {
        result += this.full.repeat(fw);
      }
    }

    // Empty fill
    const emptyCount = Math.max(0, tw - fw);
    if (emptyCount > 0) {
      const rgb = colorToRGB(this.emptyColor);
      if (rgb) {
        result += fgColor(rgb.r, rgb.g, rgb.b) + this.empty.repeat(emptyCount) + '\x1b[0m';
      } else {
        result += this.empty.repeat(emptyCount);
      }
    }

    return result;
  }

  private _percentageView(percent: number): string {
    if (!this.showPercentage) return '';
    percent = Math.max(0, Math.min(1, percent));
    const pct = percent * 100;
    // Emulate the Go fmt.Sprintf(" %3.0f%%", pct)
    const numStr = Math.round(pct).toString();
    const padded = numStr.padStart(3, ' ');
    let percentage = ` ${padded}%`;
    // Apply percentage style if it has any styling
    percentage = this.percentageStyle.inline(true).render(percentage);
    return percentage;
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a new progress bar model with the given options.
 *
 * @example
 * ```ts
 * const bar = newProgress(
 *   withColors('#5A56E0', '#EE6FF8'),
 *   withoutPercentage(),
 * );
 * console.log(bar.viewAs(0.5));
 * ```
 */
export function newProgress(...opts: Option[]): Model {
  const m = new Model();
  for (const opt of opts) {
    opt(m);
  }
  if (!m._springCustomized) {
    m.setSpringOptions(DEFAULT_FREQUENCY, DEFAULT_DAMPING);
  }
  return m;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isFrameMsg(msg: unknown): msg is FrameMsg {
  return (
    msg != null &&
    typeof msg === 'object' &&
    (msg as FrameMsg).type === 'progress.frame'
  );
}

/**
 * Generate a 1D gradient (array of RGB colors) by interpolating between
 * the given color stops. This is the equivalent of Go lipgloss.Blend1D().
 */
function blend1D(count: number, ...colors: Color[]): RGBColor[] {
  if (count <= 0) return [];
  if (colors.length === 0) return [];

  // Convert all stops to RGB
  const stops: RGBColor[] = [];
  for (const c of colors) {
    const rgb = colorToRGB(c);
    stops.push(rgb ?? { r: 0, g: 0, b: 0 });
  }

  if (stops.length === 1 || count === 1) {
    return Array(count).fill(stops[0]);
  }

  const result: RGBColor[] = [];
  for (let i = 0; i < count; i++) {
    // Map i to a position in the stops array
    const t = i / (count - 1); // 0.0 to 1.0
    const segmentFloat = t * (stops.length - 1);
    const segIndex = Math.min(Math.floor(segmentFloat), stops.length - 2);
    const segT = segmentFloat - segIndex;

    const a = stops[segIndex];
    const b = stops[segIndex + 1];
    result.push({
      r: Math.round(a.r + (b.r - a.r) * segT),
      g: Math.round(a.g + (b.g - a.g) * segT),
      b: Math.round(a.b + (b.b - a.b) * segT),
    });
  }

  return result;
}
