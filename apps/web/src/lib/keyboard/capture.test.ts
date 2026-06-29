import { describe, it, expect } from 'vitest'
import { parseCaptureLine, resolveCategory } from './capture.js'
import type { CategoryRow } from '../../db/queries'

function cat(id: string, name: string): CategoryRow {
  return { id, name } as unknown as CategoryRow
}

describe('parseCaptureLine', () => {
  it('parses amount + note + trailing #category', () => {
    expect(parseCaptureLine('12.50 coffee #food')).toEqual({
      amount: 12.5,
      note: 'coffee',
      categoryToken: 'food',
    })
  })

  it('strips a leading $ and thousands separators from the amount', () => {
    expect(parseCaptureLine('$1,250 rent #housing')).toEqual({
      amount: 1250,
      note: 'rent',
      categoryToken: 'housing',
    })
  })

  it('parses amount + note with no category', () => {
    expect(parseCaptureLine('12 lunch')).toEqual({
      amount: 12,
      note: 'lunch',
      categoryToken: null,
    })
  })

  it('parses amount + trailing category with no note', () => {
    expect(parseCaptureLine('12.50 #food')).toEqual({
      amount: 12.5,
      note: '',
      categoryToken: 'food',
    })
  })

  it('parses a bare amount', () => {
    expect(parseCaptureLine('12.50')).toEqual({ amount: 12.5, note: '', categoryToken: null })
  })

  it('keeps the whole text as the note when there is no valid amount (AE5)', () => {
    expect(parseCaptureLine('coffee')).toEqual({ amount: null, note: 'coffee', categoryToken: null })
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
    })
  })

  it('returns empty fields for blank input', () => {
    expect(parseCaptureLine('   ')).toEqual({ amount: null, note: '', categoryToken: null })
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
