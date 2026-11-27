import { describe, it, expect } from 'vitest'
import { convertAmount, summarizeUnconverted, describeUnconverted } from './currency.js'

describe('convertAmount', () => {
  const rates = new Map([['EUR', 0.5]])

  it('returns the amount unchanged for the base currency', () => {
    expect(convertAmount(1000, 'USD', 'USD', rates)).toBe(1000)
  })

  it('converts using the rate for the source currency', () => {
    expect(convertAmount(1000, 'EUR', 'USD', rates)).toBe(2000)
  })

  it('returns null when no rate exists for the source currency', () => {
    expect(convertAmount(1000, 'JPY', 'USD', rates)).toBeNull()
  })

  it('returns null when the rate is zero', () => {
    expect(convertAmount(1000, 'EUR', 'USD', new Map([['EUR', 0]]))).toBeNull()
  })
})

describe('summarizeUnconverted', () => {
  const canConvert = (currency: string) => currency !== 'JPY' && currency !== 'THB'

  it('reports nothing when every amount converts', () => {
    expect(summarizeUnconverted([{ currency: 'USD' }], canConvert)).toEqual({
      count: 0,
      currencies: [],
    })
  })

  it('counts unconvertible amounts and lists their currencies once, sorted', () => {
    const items = [
      { currency: 'THB' },
      { currency: 'JPY' },
      { currency: 'JPY' },
      { currency: 'USD' },
    ]
    expect(summarizeUnconverted(items, canConvert)).toEqual({
      count: 3,
      currencies: ['JPY', 'THB'],
    })
  })

  it('weights grouped rows by their count', () => {
    expect(summarizeUnconverted([{ currency: 'JPY', count: 4 }], canConvert).count).toBe(4)
  })
})

describe('describeUnconverted', () => {
  it('returns null when nothing is unconverted', () => {
    expect(describeUnconverted({ count: 0, currencies: [] })).toBeNull()
  })

  it('uses the singular for one amount', () => {
    expect(describeUnconverted({ count: 1, currencies: ['JPY'] })).toBe(
      'Excludes 1 amount in JPY — no exchange rate yet',
    )
  })

  it('lists several currencies', () => {
    expect(describeUnconverted({ count: 3, currencies: ['JPY', 'THB'] })).toBe(
      'Excludes 3 amounts in JPY, THB — no exchange rate yet',
    )
  })
})
