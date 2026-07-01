// Pure, DOM-free core the FHintProvider builds on — kept here for testability,
// mirroring lib/keyboard/capture.ts.

// Home-row letters first (fastest to reach), then the rest of the alphabet.
export const HINT_LABELS: string[] = [...'asdfghjkl', ...'qwertyuiopzxcvbnm']

// First `count` labels; capped at the pool size, so excess targets go unbadged.
export function assignLabels(count: number): string[] {
  return HINT_LABELS.slice(0, Math.max(0, count))
}

// Array.prototype.sort is stable, so targets at identical positions keep their
// DOM order rather than shuffling between activations.
export function orderByPosition<T extends { top: number; left: number }>(targets: T[]): T[] {
  return [...targets].sort((a, b) => a.top - b.top || a.left - b.left)
}
