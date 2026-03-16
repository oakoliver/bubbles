/**
 * ANSI-aware string utilities — internal module.
 *
 * Provides Cut() and related functions for slicing strings
 * while preserving ANSI escape codes. Equivalent to
 * github.com/charmbracelet/x/ansi StringWidth and Cut.
 *
 * @internal
 */

// ── ANSI regex ──────────────────────────────────────────────────────────────

const ANSI_REGEX = /[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:[;:][0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|\x1b\]8;[^\x1b]*\x1b\\/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

/**
 * Measure the visible (printable) width of a string, ignoring ANSI codes.
 */
export function stringWidth(str: string): number {
  const stripped = stripAnsi(str);
  let width = 0;
  for (let i = 0; i < stripped.length; i++) {
    const code = stripped.charCodeAt(i);
    // Skip combining characters
    if (isCombining(code)) continue;
    // Surrogate pairs
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = stripped.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        width += (cp >= 0x20000 && cp <= 0x3ffff) ? 2 : 1;
        i++;
        continue;
      }
    }
    width += isFullWidth(code) ? 2 : 1;
  }
  return width;
}

/**
 * Cut extracts a visible-column substring [start, end) from a string,
 * properly handling ANSI escape codes and wide characters.
 *
 * This is the TypeScript equivalent of Go's ansi.Cut(s, start, end).
 *
 * ANSI escape codes that are active at the start position are preserved,
 * and a reset is appended if needed.
 */
export function cut(str: string, start: number, end: number): string {
  if (start >= end) return '';
  if (start < 0) start = 0;

  let visibleCol = 0;   // Current visible column position
  let result = '';
  let inRange = false;
  let hasContent = false;
  let inEscape = false;
  let escapeSeq = '';
  // Track active ANSI sequences before the start position
  let activeSequences = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    // Handle ANSI escape sequences
    if (inEscape) {
      escapeSeq += ch;
      if (isEscapeTerminator(ch, escapeSeq)) {
        if (inRange) {
          result += escapeSeq;
        } else {
          // Track active sequences for when we enter the range
          if (isResetSequence(escapeSeq)) {
            activeSequences = '';
          } else {
            activeSequences += escapeSeq;
          }
        }
        inEscape = false;
        escapeSeq = '';
      }
      continue;
    }

    if (ch === '\x1b' || ch === '\x9b') {
      inEscape = true;
      escapeSeq = ch;
      continue;
    }

    // Calculate character width
    const code = ch.charCodeAt(0);
    let charWidth: number;

    if (isCombining(code)) {
      charWidth = 0;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        charWidth = (cp >= 0x20000 && cp <= 0x3ffff) ? 2 : 1;
      } else {
        charWidth = 1;
      }
    } else {
      charWidth = isFullWidth(code) ? 2 : 1;
    }

    // Check if this character falls in our target range
    if (visibleCol + charWidth > start && !inRange) {
      inRange = true;
      // Emit any accumulated ANSI sequences
      if (activeSequences) {
        result += activeSequences;
      }
    }

    if (inRange) {
      if (visibleCol >= end) break;
      // For wide characters that would extend past the end, don't include them
      if (visibleCol + charWidth > end) break;
      result += ch;
      hasContent = true;
      // Handle surrogate pair
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          result += str[i + 1];
          i++;
        }
      }
    } else {
      // Handle surrogate pair outside range
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          i++;
        }
      }
    }

    visibleCol += charWidth;
  }

  // Append reset if we included any ANSI sequences
  if (hasContent && activeSequences) {
    result += '\x1b[0m';
  }

  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isCombining(code: number): boolean {
  return (
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f)
  );
}

function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3040 && code <= 0x33bf) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

function isEscapeTerminator(ch: string, seq: string): boolean {
  // Standard CSI sequence: ends with a letter
  if (/[A-Za-z~]/.test(ch)) return true;
  // OSC hyperlink: \x1b]8;...\x1b\\
  if (seq.startsWith('\x1b]') && ch === '\\' && seq.length >= 2 && seq[seq.length - 2] === '\x1b') {
    return true;
  }
  return false;
}

function isResetSequence(seq: string): boolean {
  return seq === '\x1b[0m' || seq === '\x1b[m';
}
