// Pure, DOM-free fuzzy match + rank for the command palette. No dependency —
// the testable core the palette filters with, in the spirit of lib/keyboard/capture.ts.

const CONTIGUOUS_BONUS = 5
const WORD_START_BONUS = 10

function isWordChar(ch: string): boolean {
  return /[a-z0-9]/.test(ch)
}

// Case-insensitive subsequence match. Returns null when the query characters do
// not appear in order in the text; otherwise a score where contiguous runs and
// word-start hits rank higher (so `bus` ranks "Business" above a scattered hit).
// An empty query is a neutral match (score 0), letting callers show a default set.
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase()
  if (q === '') return 0

  const t = text.toLowerCase()
  let score = 0
  let qi = 0
  let prevMatch = -2

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue
    score += 1
    if (ti === prevMatch + 1) score += CONTIGUOUS_BONUS
    if (ti === 0 || !isWordChar(t[ti - 1])) score += WORD_START_BONUS
    prevMatch = ti
    qi++
  }

  return qi === q.length ? score : null
}

// Filters items to those matching the query and sorts by descending score,
// stable for equal scores (original order preserved).
export function rankWithin<T>(query: string, items: T[], getText: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, getText(item)) }))
    .filter((entry): entry is { item: T; index: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item)
}
