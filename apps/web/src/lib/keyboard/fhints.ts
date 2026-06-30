// Pure, DOM-free helpers for f-hint mode: the label pool and deterministic
// target ordering. No DOM access — the testable core the overlay builds on,
// in the spirit of lib/keyboard/capture.ts.

// Home-row letters first (fastest to reach), then the rest of the alphabet.
export const HINT_LABELS: string[] = [...'asdfghjkl', ...'qwertyuiopzxcvbnm']

// First `count` labels; capped at the pool size, so excess targets go unbadged.
export function assignLabels(count: number): string[] {
  return HINT_LABELS.slice(0, Math.max(0, count))
}

// Order targets the way a reader scans: top-to-bottom, then left-to-right within
// a row. Array.prototype.sort is stable, so identical positions keep input order.
export function orderByPosition<T extends { top: number; left: number }>(targets: T[]): T[] {
  return [...targets].sort((a, b) => a.top - b.top || a.left - b.left)
}
