/**
 * Runeutil provides utility functions for tidying up incoming runes
 * from key messages.
 *
 * Port of charm.land/bubbles/v2/internal/runeutil
 */

/** Sanitizer removes control characters from runes. */
export interface Sanitizer {
  /**
   * Sanitize removes control characters from the input string,
   * and optionally replaces newline/carriage return/tabs by a
   * specified string.
   */
  sanitize(input: string): string;
}

/** Option for configuring the sanitizer. */
export type Option = (s: SanitizerImpl) => SanitizerImpl;

/** Replaces tabs by the specified string. */
export function replaceTabs(tabRepl: string): Option {
  return (s: SanitizerImpl): SanitizerImpl => {
    s.replaceTab = tabRepl;
    return s;
  };
}

/** Replaces newline characters by the specified string. */
export function replaceNewlines(nlRepl: string): Option {
  return (s: SanitizerImpl): SanitizerImpl => {
    s.replaceNewLine = nlRepl;
    return s;
  };
}

class SanitizerImpl implements Sanitizer {
  replaceNewLine: string;
  replaceTab: string;

  constructor() {
    this.replaceNewLine = '\n';
    this.replaceTab = '    ';
  }

  sanitize(input: string): string {
    let result = '';
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      const ch = input[i];

      if (code === 0xFFFD) {
        // Unicode replacement character (equivalent to RuneError) — skip
        continue;
      }

      if (ch === '\r' || ch === '\n') {
        result += this.replaceNewLine;
        continue;
      }

      if (ch === '\t') {
        result += this.replaceTab;
        continue;
      }

      // Skip other control characters (C0 control codes 0x00-0x1F except the ones handled above, and DEL 0x7F)
      if ((code < 0x20 && code !== 0x0A && code !== 0x0D && code !== 0x09) || code === 0x7F) {
        continue;
      }
      // Also skip C1 control codes 0x80-0x9F
      if (code >= 0x80 && code <= 0x9F) {
        continue;
      }

      result += ch;
    }
    return result;
  }
}

/** Constructs a new rune sanitizer. */
export function newSanitizer(...opts: Option[]): Sanitizer {
  let s = new SanitizerImpl();
  for (const o of opts) {
    s = o(s);
  }
  return s;
}
