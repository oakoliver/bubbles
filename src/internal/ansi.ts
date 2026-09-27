/**
 * ANSI-aware string utilities — internal module.
 *
 * A port of the escape-sequence handling in github.com/charmbracelet/x/ansi
 * (v0.11.8): `Strip`, `StringWidth`, `Truncate`, `TruncateLeft` and `Cut`.
 *
 * Escape sequences are recognised with x/ansi's DEC ANSI state machine
 * (https://vt100.net/emu/dec_ansi_parser):
 *
 * - CSI (`ESC [` or `0x9B`) ends at a final byte 0x40–0x7E.
 * - OSC (`ESC ]`), DCS (`ESC P`), SOS (`ESC X`), PM (`ESC ^`) and APC (`ESC _`)
 *   are strings that end at ST (`ESC \` or `0x9C`); OSC also ends at BEL.
 *   CAN and SUB abort them.
 * - Other `ESC` sequences are two bytes (`ESC 7`, `ESC c`), or carry
 *   intermediates (`ESC ( B`).
 *
 * Like x/ansi, truncation never drops an escape sequence. It drops only the
 * visible text outside the kept range. A hyperlink or SGR style that is open
 * at a cut point is therefore still closed by its own closing sequence, which
 * is kept even when the text around it is cut away.
 *
 * x/ansi works on UTF-8 bytes. Here strings are walked by code point: code
 * points below 0xA0 behave as the byte of the same value (so U+009B is the
 * 8-bit CSI, as in the byte-oriented original), and any higher code point
 * behaves as a UTF-8 lead byte, which is what x/ansi sees for it.
 *
 * Cell widths are counted per code point (combining marks are 0 wide, East
 * Asian wide characters 2), not per grapheme cluster.
 *
 * @internal
 */

// ── Parser states and actions (x/ansi/parser) ───────────────────────────────

const GROUND = 0;
const CSI_ENTRY = 1;
const CSI_INTERMEDIATE = 2;
const CSI_PARAM = 3;
const DCS_ENTRY = 4;
const DCS_INTERMEDIATE = 5;
const DCS_PARAM = 6;
const DCS_STRING = 7;
const ESCAPE = 8;
const ESCAPE_INTERMEDIATE = 9;
const OSC_STRING = 10;
const SOS_STRING = 11;
const PM_STRING = 12;
const APC_STRING = 13;
const UTF8 = 14;

const NONE = 0;
const CLEAR = 1;
const COLLECT = 2;
const PREFIX = 3;
const DISPATCH = 4;
const EXECUTE = 5;
const START = 6;
const PUT = 7;
const PARAM = 8;
const PRINT = 9;
const IGNORE = NONE;

const ACTION_SHIFT = 4;
const STATE_MASK = 15;

/** x/ansi's `GenerateTransitionTable`, indexed by `state << 8 | byte`. */
const TABLE: Uint8Array = generateTransitionTable();

function generateTransitionTable(): Uint8Array {
  const t = new Uint8Array(4096);
  const set = (code: number, state: number, action: number, next: number) => {
    t[(state << 8) | code] = (action << ACTION_SHIFT) | next;
  };
  const range = (start: number, end: number, state: number, action: number, next: number) => {
    for (let c = start; c <= end; c++) set(c, state, action, next);
  };
  const many = (codes: number[], state: number, action: number, next: number) => {
    for (const c of codes) set(c, state, action, next);
  };

  // Default: NoneAction -> Ground (the typed array is zero-filled already).

  // Anywhere
  for (let state = GROUND; state <= UTF8; state++) {
    many([0x18, 0x1a, 0x99, 0x9a], state, EXECUTE, GROUND);
    range(0x80, 0x8f, state, EXECUTE, GROUND);
    range(0x90, 0x97, state, EXECUTE, GROUND);
    set(0x9c, state, EXECUTE, GROUND);
    set(0x1b, state, CLEAR, ESCAPE);
    set(0x98, state, START, SOS_STRING);
    set(0x9e, state, START, PM_STRING);
    set(0x9f, state, START, APC_STRING);
    set(0x9b, state, CLEAR, CSI_ENTRY);
    set(0x90, state, CLEAR, DCS_ENTRY);
    set(0x9d, state, START, OSC_STRING);
    range(0xc2, 0xdf, state, COLLECT, UTF8);
    range(0xe0, 0xef, state, COLLECT, UTF8);
    range(0xf0, 0xf4, state, COLLECT, UTF8);
  }

  // Ground
  range(0x00, 0x17, GROUND, EXECUTE, GROUND);
  set(0x19, GROUND, EXECUTE, GROUND);
  range(0x1c, 0x1f, GROUND, EXECUTE, GROUND);
  range(0x20, 0x7e, GROUND, PRINT, GROUND);
  set(0x7f, GROUND, EXECUTE, GROUND);

  // EscapeIntermediate
  range(0x00, 0x17, ESCAPE_INTERMEDIATE, EXECUTE, ESCAPE_INTERMEDIATE);
  set(0x19, ESCAPE_INTERMEDIATE, EXECUTE, ESCAPE_INTERMEDIATE);
  range(0x1c, 0x1f, ESCAPE_INTERMEDIATE, EXECUTE, ESCAPE_INTERMEDIATE);
  range(0x20, 0x2f, ESCAPE_INTERMEDIATE, COLLECT, ESCAPE_INTERMEDIATE);
  set(0x7f, ESCAPE_INTERMEDIATE, IGNORE, ESCAPE_INTERMEDIATE);
  range(0x30, 0x7e, ESCAPE_INTERMEDIATE, DISPATCH, GROUND);

  // Escape
  range(0x00, 0x17, ESCAPE, EXECUTE, ESCAPE);
  set(0x19, ESCAPE, EXECUTE, ESCAPE);
  range(0x1c, 0x1f, ESCAPE, EXECUTE, ESCAPE);
  set(0x7f, ESCAPE, IGNORE, ESCAPE);
  range(0x30, 0x4f, ESCAPE, DISPATCH, GROUND);
  range(0x51, 0x57, ESCAPE, DISPATCH, GROUND);
  set(0x59, ESCAPE, DISPATCH, GROUND);
  set(0x5a, ESCAPE, DISPATCH, GROUND);
  set(0x5c, ESCAPE, DISPATCH, GROUND);
  range(0x60, 0x7e, ESCAPE, DISPATCH, GROUND);
  range(0x20, 0x2f, ESCAPE, COLLECT, ESCAPE_INTERMEDIATE);
  set(0x58, ESCAPE, START, SOS_STRING); // X
  set(0x5e, ESCAPE, START, PM_STRING); // ^
  set(0x5f, ESCAPE, START, APC_STRING); // _
  set(0x50, ESCAPE, CLEAR, DCS_ENTRY); // P
  set(0x5b, ESCAPE, CLEAR, CSI_ENTRY); // [
  set(0x5d, ESCAPE, START, OSC_STRING); // ]

  // Sos/Pm/Apc strings
  for (let state = SOS_STRING; state <= APC_STRING; state++) {
    range(0x00, 0x17, state, PUT, state);
    set(0x19, state, PUT, state);
    range(0x1c, 0x1f, state, PUT, state);
    range(0x20, 0x7f, state, PUT, state);
    set(0x1b, state, DISPATCH, ESCAPE);
    set(0x9c, state, DISPATCH, GROUND);
    many([0x18, 0x1a], state, IGNORE, GROUND);
  }

  // Dcs entry
  range(0x00, 0x07, DCS_ENTRY, IGNORE, DCS_ENTRY);
  range(0x0e, 0x17, DCS_ENTRY, IGNORE, DCS_ENTRY);
  set(0x19, DCS_ENTRY, IGNORE, DCS_ENTRY);
  range(0x1c, 0x1f, DCS_ENTRY, IGNORE, DCS_ENTRY);
  set(0x7f, DCS_ENTRY, IGNORE, DCS_ENTRY);
  range(0x20, 0x2f, DCS_ENTRY, COLLECT, DCS_INTERMEDIATE);
  range(0x30, 0x3b, DCS_ENTRY, PARAM, DCS_PARAM);
  range(0x3c, 0x3f, DCS_ENTRY, PREFIX, DCS_PARAM);
  range(0x08, 0x0d, DCS_ENTRY, PUT, DCS_STRING);
  set(0x1b, DCS_ENTRY, PUT, DCS_STRING);
  range(0x40, 0x7e, DCS_ENTRY, START, DCS_STRING);

  // Dcs intermediate
  range(0x00, 0x17, DCS_INTERMEDIATE, IGNORE, DCS_INTERMEDIATE);
  set(0x19, DCS_INTERMEDIATE, IGNORE, DCS_INTERMEDIATE);
  range(0x1c, 0x1f, DCS_INTERMEDIATE, IGNORE, DCS_INTERMEDIATE);
  range(0x20, 0x2f, DCS_INTERMEDIATE, COLLECT, DCS_INTERMEDIATE);
  set(0x7f, DCS_INTERMEDIATE, IGNORE, DCS_INTERMEDIATE);
  range(0x30, 0x3f, DCS_INTERMEDIATE, START, DCS_STRING);
  range(0x40, 0x7e, DCS_INTERMEDIATE, START, DCS_STRING);

  // Dcs param
  range(0x00, 0x17, DCS_PARAM, IGNORE, DCS_PARAM);
  set(0x19, DCS_PARAM, IGNORE, DCS_PARAM);
  range(0x1c, 0x1f, DCS_PARAM, IGNORE, DCS_PARAM);
  range(0x30, 0x3b, DCS_PARAM, PARAM, DCS_PARAM);
  set(0x7f, DCS_PARAM, IGNORE, DCS_PARAM);
  range(0x3c, 0x3f, DCS_PARAM, IGNORE, DCS_PARAM);
  range(0x20, 0x2f, DCS_PARAM, COLLECT, DCS_INTERMEDIATE);
  range(0x40, 0x7e, DCS_PARAM, START, DCS_STRING);

  // Dcs passthrough
  range(0x00, 0x17, DCS_STRING, PUT, DCS_STRING);
  set(0x19, DCS_STRING, PUT, DCS_STRING);
  range(0x1c, 0x1f, DCS_STRING, PUT, DCS_STRING);
  range(0x20, 0x7e, DCS_STRING, PUT, DCS_STRING);
  set(0x7f, DCS_STRING, PUT, DCS_STRING);
  range(0x80, 0xff, DCS_STRING, PUT, DCS_STRING);
  set(0x1b, DCS_STRING, DISPATCH, ESCAPE);
  set(0x9c, DCS_STRING, DISPATCH, GROUND);
  many([0x18, 0x1a], DCS_STRING, IGNORE, GROUND);

  // Csi param
  range(0x00, 0x17, CSI_PARAM, EXECUTE, CSI_PARAM);
  set(0x19, CSI_PARAM, EXECUTE, CSI_PARAM);
  range(0x1c, 0x1f, CSI_PARAM, EXECUTE, CSI_PARAM);
  range(0x30, 0x3b, CSI_PARAM, PARAM, CSI_PARAM);
  set(0x7f, CSI_PARAM, IGNORE, CSI_PARAM);
  range(0x3c, 0x3f, CSI_PARAM, IGNORE, CSI_PARAM);
  range(0x40, 0x7e, CSI_PARAM, DISPATCH, GROUND);
  range(0x20, 0x2f, CSI_PARAM, COLLECT, CSI_INTERMEDIATE);

  // Csi intermediate
  range(0x00, 0x17, CSI_INTERMEDIATE, EXECUTE, CSI_INTERMEDIATE);
  set(0x19, CSI_INTERMEDIATE, EXECUTE, CSI_INTERMEDIATE);
  range(0x1c, 0x1f, CSI_INTERMEDIATE, EXECUTE, CSI_INTERMEDIATE);
  range(0x20, 0x2f, CSI_INTERMEDIATE, COLLECT, CSI_INTERMEDIATE);
  set(0x7f, CSI_INTERMEDIATE, IGNORE, CSI_INTERMEDIATE);
  range(0x40, 0x7e, CSI_INTERMEDIATE, DISPATCH, GROUND);
  range(0x30, 0x3f, CSI_INTERMEDIATE, IGNORE, GROUND);

  // Csi entry
  range(0x00, 0x17, CSI_ENTRY, EXECUTE, CSI_ENTRY);
  set(0x19, CSI_ENTRY, EXECUTE, CSI_ENTRY);
  range(0x1c, 0x1f, CSI_ENTRY, EXECUTE, CSI_ENTRY);
  set(0x7f, CSI_ENTRY, IGNORE, CSI_ENTRY);
  range(0x40, 0x7e, CSI_ENTRY, DISPATCH, GROUND);
  range(0x20, 0x2f, CSI_ENTRY, COLLECT, CSI_INTERMEDIATE);
  range(0x30, 0x3b, CSI_ENTRY, PARAM, CSI_PARAM);
  range(0x3c, 0x3f, CSI_ENTRY, PREFIX, CSI_PARAM);

  // Osc string (0x80–0xFF are string data so UTF-8 passes through)
  range(0x00, 0x06, OSC_STRING, IGNORE, OSC_STRING);
  range(0x08, 0x17, OSC_STRING, IGNORE, OSC_STRING);
  set(0x19, OSC_STRING, IGNORE, OSC_STRING);
  range(0x1c, 0x1f, OSC_STRING, IGNORE, OSC_STRING);
  range(0x20, 0xff, OSC_STRING, PUT, OSC_STRING);
  set(0x1b, OSC_STRING, DISPATCH, ESCAPE);
  set(0x07, OSC_STRING, DISPATCH, GROUND);
  set(0x9c, OSC_STRING, DISPATCH, GROUND);
  many([0x18, 0x1a], OSC_STRING, IGNORE, GROUND);

  return t;
}

/** Representative byte for a code point (see the module comment). */
function byteOf(cp: number): number {
  return cp < 0xa0 ? cp : 0xc2;
}

function transition(state: number, cp: number): [number, number] {
  const v = TABLE[(state << 8) | byteOf(cp)];
  return [v & STATE_MASK, v >> ACTION_SHIFT];
}

/** Length in UTF-16 code units of the code point starting at `i`. */
function cpLen(str: string, i: number): number {
  const c = str.charCodeAt(i);
  if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
    const n = str.charCodeAt(i + 1);
    if (n >= 0xdc00 && n <= 0xdfff) return 2;
  }
  return 1;
}

// ── Tokenizer ───────────────────────────────────────────────────────────────

export interface AnsiToken {
  readonly text: string;
  readonly ansi: boolean;
}

/**
 * Splits a string into escape sequences (`ansi: true`) and text chunks.
 * Text is what x/ansi's `Strip` keeps: printable characters plus C0/C1
 * controls that are executed, such as `\n` and `\t`.
 */
export function tokenizeAnsi(str: string): AnsiToken[] {
  const tokens: AnsiToken[] = [];
  let buf = '';
  let bufAnsi = false;
  let state = GROUND;
  const push = (text: string, ansi: boolean) => {
    if (buf && bufAnsi !== ansi) {
      tokens.push({ text: buf, ansi: bufAnsi });
      buf = '';
    }
    bufAnsi = ansi;
    buf += text;
  };
  for (let i = 0; i < str.length;) {
    const len = cpLen(str, i);
    const ch = str.slice(i, i + len);
    const [next, action] = transition(state, str.codePointAt(i)!);
    i += len;
    if (next === UTF8 || action === PRINT || action === EXECUTE) {
      push(ch, false);
      state = next === UTF8 ? GROUND : next;
      continue;
    }
    push(ch, true);
    state = next;
  }
  if (buf) tokens.push({ text: buf, ansi: bufAnsi });
  return tokens;
}

/** Removes ANSI escape sequences, like x/ansi's `Strip`. */
export function stripAnsi(str: string): string {
  let out = '';
  for (const token of tokenizeAnsi(str)) {
    if (!token.ansi) out += token.text;
  }
  return out;
}

// ── Width ───────────────────────────────────────────────────────────────────

/**
 * Measure the visible (printable) width of a string in cells, ignoring ANSI
 * escape sequences and control characters (x/ansi's `StringWidth`).
 */
export function stringWidth(str: string): number {
  let width = 0;
  let state = GROUND;
  for (let i = 0; i < str.length;) {
    const cp = str.codePointAt(i)!;
    const [next, action] = transition(state, cp);
    i += cpLen(str, i);
    if (next === UTF8 || action === PRINT) {
      width += cpWidth(cp);
      state = GROUND;
      continue;
    }
    state = next;
  }
  return width;
}

// ── Truncate / Cut ──────────────────────────────────────────────────────────

/**
 * Truncate a string to `length` cells, appending `tail` when it was cut.
 * Escape sequences are all kept, including those past the cut. Port of
 * x/ansi's `Truncate`.
 */
export function truncate(str: string, length: number, tail = ''): string {
  if (stringWidth(str) <= length) return str;

  length -= stringWidth(tail);
  if (length < 0) return '';

  let out = '';
  let curWidth = 0;
  let ignoring = false;
  let state = GROUND;

  for (let i = 0; i < str.length;) {
    const cp = str.codePointAt(i)!;
    const len = cpLen(str, i);
    const [next, action] = transition(state, cp);

    if (next === UTF8) {
      i += len;
      curWidth += cpWidth(cp);
      if (ignoring) continue;
      if (curWidth > length) {
        ignoring = true;
        out += tail;
        continue;
      }
      out += String.fromCodePoint(cp);
      state = GROUND;
      continue;
    }

    if (action === PRINT) {
      if (curWidth >= length && !ignoring) {
        ignoring = true;
        out += tail;
      }
      if (ignoring) {
        i += len;
        continue;
      }
      curWidth++;
    } else if (action === EXECUTE && ignoring) {
      i += len;
      continue;
    }
    out += str.slice(i, i + len);
    i += len;

    state = next;
    if (curWidth > length && !ignoring) {
      ignoring = true;
      out += tail;
    }
  }

  return out;
}

/**
 * Remove the first `n` cells of a string, prepending `prefix` when anything
 * is left. Escape sequences in the removed part are kept. Port of x/ansi's
 * `TruncateLeft`.
 */
export function truncateLeft(str: string, n: number, prefix = ''): string {
  if (n <= 0) return str;

  let out = '';
  let curWidth = 0;
  let ignoring = true;
  let state = GROUND;

  for (let i = 0; i < str.length;) {
    if (!ignoring) {
      out += str.slice(i);
      break;
    }

    const cp = str.codePointAt(i)!;
    const len = cpLen(str, i);
    const [next, action] = transition(state, cp);

    if (next === UTF8) {
      i += len;
      curWidth += cpWidth(cp);
      if (curWidth > n && ignoring) {
        ignoring = false;
        out += prefix;
      }
      if (curWidth > n) out += String.fromCodePoint(cp);
      if (ignoring) continue;
      state = GROUND;
      continue;
    }

    if (action === PRINT) {
      curWidth++;
      if (curWidth > n && ignoring) {
        ignoring = false;
        out += prefix;
      }
      if (ignoring) {
        i += len;
        continue;
      }
    } else if (action === EXECUTE && ignoring) {
      i += len;
      continue;
    }
    out += str.slice(i, i + len);
    i += len;

    state = next;
    if (curWidth > n && ignoring) {
      ignoring = false;
      out += prefix;
    }
  }

  return out;
}

/**
 * Cut extracts the visible columns `[start, end)` of a string. Port of
 * x/ansi's `Cut`: every escape sequence is kept, so styles and hyperlinks
 * opened before the range, and their closing sequences after it, survive.
 */
export function cut(str: string, start: number, end: number): string {
  if (end <= start) return '';
  if (start === 0) return truncate(str, end, '');
  return truncateLeft(truncate(str, end, ''), start, '');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function cpWidth(cp: number): number {
  if (isCombining(cp)) return 0;
  if (cp > 0xffff) return cp >= 0x20000 && cp <= 0x3ffff ? 2 : 1;
  return isFullWidth(cp) ? 2 : 1;
}

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
