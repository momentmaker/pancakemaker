export interface HistoryEntry {
  description: string
  category_id: string
  amount: number
  currency: string
  date: string
}

export interface UsualExpense {
  description: string
  categoryId: string
  amount: number
  currency: string
  count: number
  lastDate: string
}

const MAJORITY_SHARE = 0.75
const MIN_REPEATS = 2

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

// A description that has (almost) always landed in one category picks that
// category on its own, so `4.50 coffee` can log without a #token.
export function inferCategoryId(note: string, history: readonly HistoryEntry[]): string | null {
  const key = normalize(note)
  if (!key) return null
  const counts = new Map<string, number>()
  let total = 0
  for (const e of history) {
    if (normalize(e.description) !== key) continue
    counts.set(e.category_id, (counts.get(e.category_id) ?? 0) + 1)
    total++
  }
  if (total === 0) return null
  const [bestId, bestCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return bestCount / total >= MAJORITY_SHARE ? bestId : null
}

export function topUsuals(history: readonly HistoryEntry[], limit: number): UsualExpense[] {
  const groups = new Map<string, UsualExpense>()
  for (const e of history) {
    const description = e.description.trim()
    if (!description) continue
    const key = `${normalize(description)}|${e.amount}|${e.currency}|${e.category_id}`
    const existing = groups.get(key)
    if (existing) {
      existing.count++
      if (e.date > existing.lastDate) existing.lastDate = e.date
    } else {
      groups.set(key, {
        description,
        categoryId: e.category_id,
        amount: e.amount,
        currency: e.currency,
        count: 1,
        lastDate: e.date,
      })
    }
  }
  return [...groups.values()]
    .filter((u) => u.count >= MIN_REPEATS)
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit)
}
