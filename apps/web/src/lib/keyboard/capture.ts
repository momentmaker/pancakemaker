import type { CategoryRow, PanelRow } from '../../db/queries'

// Pure parser + resolver for the `:` command-line capture. No DOM/state — the
// testable contract the capture bar builds on.

export interface ParsedCapture {
  amount: number | null
  note: string
  categoryToken: string | null
  tags: string[]
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

// Grammar: <amount> <note...> [+tag...] [#category]. `+tag` tokens may sit
// anywhere after the amount; they are lowercased and pulled out of the note. The amount is the leading token
// (a `$` prefix and thousands separators are stripped); the category is only
// the trailing token when it starts with `#`, so notes may contain `#` freely;
// the note is everything in between (and includes the leading token when it is
// not a valid amount, so `:coffee` keeps "coffee" as the note).
function splitTagTokens(tokens: readonly string[]): { text: string; tags: string[] } {
  const tags: string[] = []
  const rest: string[] = []
  for (const token of tokens) {
    if (token.startsWith('+') && token.length > 1) {
      const tag = token.slice(1).toLowerCase()
      if (!tags.includes(tag)) tags.push(tag)
    } else {
      rest.push(token)
    }
  }
  return { text: rest.join(' '), tags }
}

// Pulls `+tag` tokens out of free text such as an expense note.
export function splitTags(text: string): { text: string; tags: string[] } {
  return splitTagTokens(text.trim().split(/\s+/).filter(Boolean))
}

export function parseCaptureLine(input: string): ParsedCapture {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { amount: null, note: '', categoryToken: null, tags: [] }

  let categoryToken: string | null = null
  let end = tokens.length
  const last = tokens[tokens.length - 1]
  if (tokens.length > 1 && last.startsWith('#') && last.length > 1) {
    categoryToken = last.slice(1)
    end = tokens.length - 1
  }

  const amount = parseAmount(tokens[0])
  const noteStart = amount !== null ? 1 : 0
  const { text, tags } = splitTagTokens(tokens.slice(noteStart, end))

  return { amount, note: text, categoryToken, tags }
}

export function resolveCategory(token: string, categories: CategoryRow[]): CategoryResolution {
  const prefix = token.toLowerCase()
  const matches = categories.filter((c) => c.name.toLowerCase().startsWith(prefix))
  if (matches.length === 1) return { status: 'resolved', category: matches[0] }
  if (matches.length === 0) return { status: 'none' }
  return { status: 'ambiguous' }
}

export type CaptureDecision =
  | {
      kind: 'create'
      panel: PanelRow
      category: CategoryRow
      amount: number
      note: string
      tags: string[]
    }
  | {
      kind: 'prefill'
      amount: number | null
      note: string
      categoryToken: string | null
      tags: string[]
    }

// One-shot create fires only when the line gives an amount worth at least one
// cent, a uniquely-resolved category (from the #token, or else from history via
// inferCategory), and the route has a default panel to land in. Every uncertain case falls back to a pre-filled QuickAdd, carrying the
// unresolved token so the user sees why it didn't one-shot rather than facing a
// silent empty picker.
export function decideCapture(
  input: string,
  categories: CategoryRow[],
  defaultPanel: PanelRow | undefined,
  inferCategory?: (note: string) => CategoryRow | undefined,
): CaptureDecision {
  const parsed = parseCaptureLine(input)
  const prefill: CaptureDecision = {
    kind: 'prefill',
    amount: parsed.amount,
    note: parsed.note,
    categoryToken: parsed.categoryToken,
    tags: parsed.tags,
  }

  if (parsed.amount === null || !defaultPanel) return prefill
  // A positive sub-cent amount (e.g. 0.004) would round to a $0.00 expense.
  if (Math.round(parsed.amount * 100) <= 0) return prefill

  let category: CategoryRow | undefined
  if (parsed.categoryToken !== null) {
    const resolution = resolveCategory(parsed.categoryToken, categories)
    if (resolution.status === 'resolved') category = resolution.category
  } else {
    category = inferCategory?.(parsed.note)
  }
  if (!category) return prefill

  return {
    kind: 'create',
    panel: defaultPanel,
    category,
    amount: parsed.amount,
    note: parsed.note,
    tags: parsed.tags,
  }
}
