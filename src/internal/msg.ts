/**
 * Message type guard helpers.
 *
 * These accept both the internal `{ type: 'keyPress' }` format
 * and bubbletea's `KeyPressMsg` class (which has `_tag: 'KeyPressMsg'`).
 */

/** Returns true if msg is a key press message (either format). */
export function isKeyPress(msg: unknown): boolean {
  if (msg == null || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'keyPress' || m._tag === 'KeyPressMsg';
}
