/**
 * Key provides types and functions for generating user-definable keymappings
 * useful in Bubble Tea components.
 *
 * Port of charm.land/bubbles/v2/key
 */

/**
 * Help is help information for a given keybinding.
 */
export interface Help {
  key: string;
  desc: string;
}

/**
 * Binding describes a set of keybindings and, optionally, their associated
 * help text.
 */
export class Binding {
  private _keys: string[];
  private _help: Help;
  private _disabled: boolean;

  constructor() {
    this._keys = [];
    this._help = { key: '', desc: '' };
    this._disabled = false;
  }

  /** Sets the keys for the keybinding. */
  setKeys(...keys: string[]): void {
    this._keys = keys;
  }

  /** Returns the keys for the keybinding. */
  keys(): string[] {
    return this._keys;
  }

  /** Sets the help text for the keybinding. */
  setHelp(key: string, desc: string): void {
    this._help = { key, desc };
  }

  /** Returns the Help information for the keybinding. */
  help(): Help {
    return this._help;
  }

  /**
   * Returns whether or not the keybinding is enabled. Disabled keybindings
   * won't be activated and won't show up in help. Keybindings are enabled
   * by default.
   */
  enabled(): boolean {
    return !this._disabled && this._keys.length > 0;
  }

  /** Enables or disables the keybinding. */
  setEnabled(v: boolean): void {
    this._disabled = !v;
  }

  /**
   * Removes the keys and help from this binding, effectively nullifying it.
   * This is a step beyond disabling it, since applications can enable or
   * disable key bindings based on application state.
   */
  unbind(): void {
    this._keys = [];
    this._help = { key: '', desc: '' };
  }
}

/** BindingOpt is an initialization option for a keybinding. */
export type BindingOpt = (b: Binding) => void;

/** Returns a new keybinding from a set of BindingOpt options. */
export function newBinding(...opts: BindingOpt[]): Binding {
  const b = new Binding();
  for (const opt of opts) {
    opt(b);
  }
  return b;
}

/** Initializes a keybinding with the given keystrokes. */
export function withKeys(...keys: string[]): BindingOpt {
  return (b: Binding) => {
    b.setKeys(...keys);
  };
}

/** Initializes a keybinding with the given help text. */
export function withHelp(key: string, desc: string): BindingOpt {
  return (b: Binding) => {
    b.setHelp(key, desc);
  };
}

/** Initializes a disabled keybinding. */
export function withDisabled(): BindingOpt {
  return (b: Binding) => {
    b.setEnabled(false);
  };
}

/**
 * Checks if the given key matches any of the given bindings.
 * The key must have a toString() method (like bubbletea KeyPressMsg).
 */
export function matches(k: { toString(): string }, ...bindings: Binding[]): boolean {
  const keys = k.toString();
  for (const binding of bindings) {
    if (!binding) continue;
    for (const v of binding.keys()) {
      if (keys === v && binding.enabled()) {
        return true;
      }
    }
  }
  return false;
}
