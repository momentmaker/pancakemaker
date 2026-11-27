import { describe, it, expect } from 'vitest'
import { parseCaptureLine, resolveCategory, decideCapture, splitTags } from './capture.js'
import type { CategoryRow, PanelRow } from '../../db/queries'

function cat(id: string, name: string): CategoryRow {
  return { id, name } as unknown as CategoryRow
}

function panel(id: string): PanelRow {
  return { id, currency: 'USD' } as unknown as PanelRow
}

describe('parseCaptureLine', () => {
  it('parses amount + note + trailing #category', () => {
    expect(parseCaptureLine('12.50 coffee #food')).toEqual({
      amount: 12.5,
      note: 'coffee',
      categoryToken: 'food',
      tags: [],
    })
  })

  it('strips a leading $ and thousands separators from the amount', () => {
    expect(parseCaptureLine('$1,250 rent #housing')).toEqual({
      amount: 1250,
      note: 'rent',
      categoryToken: 'housing',
      tags: [],
    })
  })

  it('parses amount + note with no category', () => {
    expect(parseCaptureLine('12 lunch')).toEqual({
      amount: 12,
      note: 'lunch',
      categoryToken: null,
      tags: [],
    })
  })

  it('parses amount + trailing category with no note', () => {
    expect(parseCaptureLine('12.50 #food')).toEqual({
      amount: 12.5,
      note: '',
      categoryToken: 'food',
      tags: [],
    })
  })

  it('parses a bare amount', () => {
    expect(parseCaptureLine('12.50')).toEqual({
      amount: 12.5,
      note: '',
      categoryToken: null,
      tags: [],
    })
  })

  it('keeps the whole text as the note when there is no valid amount (AE5)', () => {
    expect(parseCaptureLine('coffee')).toEqual({
      amount: null,
      note: 'coffee',
      categoryToken: null,
      tags: [],
    })
  })

  it('treats invalid/zero/negative leading tokens as no amount', () => {
    expect(parseCaptureLine('0 coffee').amount).toBeNull()
    expect(parseCaptureLine('-5 coffee').amount).toBeNull()
    expect(parseCaptureLine('abc coffee').amount).toBeNull()
  })

  it('only treats a # token as the category when it is the trailing token', () => {
    expect(parseCaptureLine('12 lunch #2 with bob')).toEqual({
      amount: 12,
      note: 'lunch #2 with bob',
      categoryToken: null,
      tags: [],
    })
  })

  it('returns empty fields for blank input', () => {
    expect(parseCaptureLine('   ')).toEqual({
      amount: null,
      note: '',
      categoryToken: null,
      tags: [],
    })
  })
})

describe('parseCaptureLine +tags', () => {
  it('pulls +tags out of the note', () => {
    expect(parseCaptureLine('45 ramen +japan-trip #meals')).toEqual({
      amount: 45,
      note: 'ramen',
      categoryToken: 'meals',
      tags: ['japan-trip'],
    })
  })

  it('accepts several tags anywhere after the amount, lowercased and once each', () => {
    expect(parseCaptureLine('12 +Japan lunch +work +japan').tags).toEqual(['japan', 'work'])
  })

  it('reads a leading +number as the amount, not a tag', () => {
    expect(parseCaptureLine('+5 tip').amount).toBe(5)
  })

  it('ignores a lone plus sign', () => {
    expect(parseCaptureLine('5 a + b').note).toBe('a + b')
  })
})

describe('splitTags', () => {
  it('separates +tags from the rest of a note', () => {
    expect(splitTags('ramen near the station +japan-trip +Food')).toEqual({
      text: 'ramen near the station',
      tags: ['japan-trip', 'food'],
    })
  })

  it('returns a note without tags unchanged', () => {
    expect(splitTags('just coffee')).toEqual({ text: 'just coffee', tags: [] })
  })
})

describe('resolveCategory', () => {
  const categories = [cat('c1', 'Food'), cat('c2', 'Fitness'), cat('c3', 'Travel')]

  it('resolves a unique case-insensitive prefix match', () => {
    const r = resolveCategory('foo', categories)
    expect(r.status).toBe('resolved')
    expect(r.status === 'resolved' && r.category.id).toBe('c1')
  })

  it('resolves case-insensitively', () => {
    expect(resolveCategory('TRAV', categories).status).toBe('resolved')
  })

  it('reports ambiguous when the prefix matches more than one', () => {
    expect(resolveCategory('f', categories).status).toBe('ambiguous')
  })

  it('reports none when nothing matches', () => {
    expect(resolveCategory('zzz', categories).status).toBe('none')
  })
})

describe('decideCapture', () => {
  const categories = [cat('c1', 'Meals'), cat('c2', 'Health'), cat('c3', 'Housing')]
  const defaultPanel = panel('p1')

  it('creates when amount, a uniquely-resolved category, and a default panel all exist (AE1)', () => {
    expect(decideCapture('12.50 coffee #meals', categories, defaultPanel)).toEqual({
      kind: 'create',
      panel: defaultPanel,
      category: categories[0],
      amount: 12.5,
      note: 'coffee',
      tags: [],
    })
  })

  it('creates without a #category when history names one', () => {
    const fromHistory = (note: string) => (note === 'coffee' ? categories[0] : undefined)
    expect(decideCapture('4.50 coffee', categories, defaultPanel, fromHistory)).toEqual({
      kind: 'create',
      panel: defaultPanel,
      category: categories[0],
      amount: 4.5,
      note: 'coffee',
      tags: [],
    })
  })

  it('still prefills without a #category when history has no answer', () => {
    const d = decideCapture('4.50 bagel', categories, defaultPanel, () => undefined)
    expect(d.kind).toBe('prefill')
  })

  it('lets an explicit #category win over history', () => {
    const d = decideCapture('4.50 coffee #health', categories, defaultPanel, () => categories[0])
    expect(d.kind === 'create' && d.category.name).toBe('Health')
  })

  it('prefills (creates nothing) when there is no #category (AE2)', () => {
    expect(decideCapture('12.50 coffee', categories, defaultPanel)).toEqual({
      kind: 'prefill',
      amount: 12.5,
      note: 'coffee',
      categoryToken: null,
      tags: [],
    })
  })

  it('prefills and carries the token when the category is ambiguous (AE3)', () => {
    const d = decideCapture('12.50 gym #h', categories, defaultPanel)
    expect(d.kind).toBe('prefill')
    expect(d.kind === 'prefill' && d.categoryToken).toBe('h')
  })

  it('prefills, carrying the token, when the category matches nothing', () => {
    const d = decideCapture('12 lunch #zzz', categories, defaultPanel)
    expect(d.kind).toBe('prefill')
    expect(d.kind === 'prefill' && d.categoryToken).toBe('zzz')
  })

  it('prefills when there is no amount (AE5)', () => {
    expect(decideCapture('coffee', categories, defaultPanel)).toEqual({
      kind: 'prefill',
      amount: null,
      note: 'coffee',
      categoryToken: null,
      tags: [],
    })
  })

  it('prefills even on a full match when the route has no default panel', () => {
    expect(decideCapture('12.50 coffee #meals', categories, undefined).kind).toBe('prefill')
  })

  it('prefills when a positive sub-cent amount would round to $0.00', () => {
    expect(decideCapture('0.004 tip #meals', categories, defaultPanel).kind).toBe('prefill')
  })
})
