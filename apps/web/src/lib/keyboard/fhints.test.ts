import { describe, it, expect } from 'vitest'
import { HINT_LABELS, assignLabels, orderByPosition } from './fhints.js'

describe('assignLabels', () => {
  it('assigns home-row letters first', () => {
    expect(assignLabels(3)).toEqual(['a', 's', 'd'])
  })

  it('returns an empty array for zero targets', () => {
    expect(assignLabels(0)).toEqual([])
  })

  it('caps at the pool size when more targets are requested (overflow unbadged)', () => {
    expect(assignLabels(1000)).toEqual(HINT_LABELS)
    expect(assignLabels(1000).length).toBe(HINT_LABELS.length)
  })

  it('exposes a pool of unique single letters', () => {
    expect(new Set(HINT_LABELS).size).toBe(HINT_LABELS.length)
    expect(HINT_LABELS.every((l) => l.length === 1)).toBe(true)
  })
})

describe('orderByPosition', () => {
  it('orders top-to-bottom, then left-to-right within a row', () => {
    const items = [
      { id: 'c', top: 100, left: 0 },
      { id: 'a', top: 0, left: 50 },
      { id: 'b', top: 0, left: 10 },
    ]
    expect(orderByPosition(items).map((i) => i.id)).toEqual(['b', 'a', 'c'])
  })

  it('is stable for identical positions (preserves input order)', () => {
    const items = [
      { id: 'x', top: 0, left: 0 },
      { id: 'y', top: 0, left: 0 },
    ]
    expect(orderByPosition(items).map((i) => i.id)).toEqual(['x', 'y'])
  })
})
