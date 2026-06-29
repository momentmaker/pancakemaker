import type { CategoryRow } from '../../db/queries'

// Pure parser + resolver for the `:` command-line capture. No DOM/state — the
// testable contract the capture bar builds on.

export interface ParsedCapture {
  amount: number | null
  note: string
  categoryToken: string | null
}

export type CategoryResolution =
  | { status: 'resolved'; category: CategoryRow }
  | { status: 'none' }
  | { status: 'ambiguous' }

function parseAmount(token: string): number | null {
  const cleaned = token.replace(/^\$/, '').replace(/,/g, '')
  const n = parseFloat(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

// Grammar: <amount> <note...> [#category]. The amount is the leading token
// (a `$` prefix and thousands separators are stripped); the category is only
// the trailing token when it starts with `#`, so notes may contain `#` freely;
// the note is everything in between (and includes the leading token when it is
// not a valid amount, so `:coffee` keeps "coffee" as the note).
export function parseCaptureLine(input: string): ParsedCapture {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { amount: null, note: '', categoryToken: null }

  let categoryToken: string | null = null
  let end = tokens.length
  const last = tokens[tokens.length - 1]
  if (tokens.length > 1 && last.startsWith('#') && last.length > 1) {
    categoryToken = last.slice(1)
    end = tokens.length - 1
  }

  const amount = parseAmount(tokens[0])
  const noteStart = amount !== null ? 1 : 0
  const note = tokens.slice(noteStart, end).join(' ')

  return { amount, note, categoryToken }
}

export function resolveCategory(token: string, categories: CategoryRow[]): CategoryResolution {
  const prefix = token.toLowerCase()
  const matches = categories.filter((c) => c.name.toLowerCase().startsWith(prefix))
  if (matches.length === 1) return { status: 'resolved', category: matches[0] }
  if (matches.length === 0) return { status: 'none' }
  return { status: 'ambiguous' }
}
