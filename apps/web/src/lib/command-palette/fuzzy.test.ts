import { describe, it, expect } from 'vitest'
import { fuzzyScore, rankWithin } from './fuzzy.js'

describe('fuzzyScore', () => {
  it('returns null when the query is not a subsequence of the text', () => {
    expect(fuzzyScore('xyz', 'Business')).toBeNull()
    expect(fuzzyScore('bz', 'Business')).toBeNull() // no z follows b
  })

  it('matches a case-insensitive subsequence', () => {
    expect(fuzzyScore('MEAL', 'Meals')).not.toBeNull()
    expect(fuzzyScore('mls', 'Meals')).not.toBeNull() // m..l.s subsequence
  })

  it('scores an exact prefix higher than a scattered subsequence', () => {
    const prefix = fuzzyScore('bus', 'Business')!
    const scattered = fuzzyScore('bus', 'submarine bunkers')! // b-u-s scattered, not word-start contiguous
    expect(prefix).toBeGreaterThan(scattered)
  })

  it('treats an empty query as a neutral match (score 0)', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
})

describe('rankWithin', () => {
  const items = ['Dashboard', 'Personal', 'Business', 'Settings']

  it('ranks the word-start contiguous match first', () => {
    const ranked = rankWithin('bus', items, (s: string) => s)
    expect(ranked[0]).toBe('Business')
  })

  it('drops non-matches', () => {
    const ranked = rankWithin('zzz', items, (s: string) => s)
    expect(ranked).toEqual([])
  })

  it('is stable for equal scores (preserves input order)', () => {
    const equal = ['alpha', 'alpine', 'alto']
    // query 'al' is a word-start prefix of all three → equal-ish; ensure deterministic order
    const ranked = rankWithin('al', equal, (s: string) => s)
    expect(ranked).toEqual(['alpha', 'alpine', 'alto'])
  })

  it('returns all items for an empty query, in input order', () => {
    expect(rankWithin('', items, (s: string) => s)).toEqual(items)
  })
})
