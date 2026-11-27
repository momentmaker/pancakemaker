import { describe, it, expect } from 'vitest'
import { inferCategoryId, topUsuals, type HistoryEntry } from './usual.js'

function entry(
  description: string,
  categoryId: string,
  amount = 450,
  date = '2026-11-20',
): HistoryEntry {
  return { description, category_id: categoryId, amount, currency: 'USD', date }
}

describe('inferCategoryId', () => {
  it('returns the category a description has always used', () => {
    const history = [entry('Coffee', 'meals'), entry('coffee ', 'meals')]
    expect(inferCategoryId('COFFEE', history)).toBe('meals')
  })

  it('returns null for a description never seen before', () => {
    expect(inferCategoryId('bagel', [entry('coffee', 'meals')])).toBeNull()
  })

  it('accepts a clear majority', () => {
    const history = [
      entry('lunch', 'meals'),
      entry('lunch', 'meals'),
      entry('lunch', 'meals'),
      entry('lunch', 'work'),
    ]
    expect(inferCategoryId('lunch', history)).toBe('meals')
  })

  it('returns null when history is split', () => {
    const history = [entry('lunch', 'meals'), entry('lunch', 'work')]
    expect(inferCategoryId('lunch', history)).toBeNull()
  })

  it('returns null for an empty note', () => {
    expect(inferCategoryId('  ', [entry('', 'meals')])).toBeNull()
  })
})

describe('topUsuals', () => {
  it('ranks repeated expenses by how often they recur', () => {
    const history = [
      entry('Bus', 'transit', 290),
      entry('Coffee', 'meals', 450),
      entry('Coffee', 'meals', 450),
      entry('Bus', 'transit', 290),
      entry('Coffee', 'meals', 450),
    ]
    expect(topUsuals(history, 5).map((u) => [u.description, u.count])).toEqual([
      ['Coffee', 3],
      ['Bus', 2],
    ])
  })

  it('leaves out one-off expenses and ones without a description', () => {
    const history = [entry('Sofa', 'home', 90000), entry('', 'meals'), entry('', 'meals')]
    expect(topUsuals(history, 5)).toEqual([])
  })

  it('treats a different amount as a different usual', () => {
    const history = [
      entry('Coffee', 'meals', 450),
      entry('Coffee', 'meals', 450),
      entry('Coffee', 'meals', 600),
      entry('Coffee', 'meals', 600),
    ]
    expect(
      topUsuals(history, 5)
        .map((u) => u.amount)
        .sort(),
    ).toEqual([450, 600])
  })

  it('breaks ties by the most recent use', () => {
    const history = [
      entry('Bus', 'transit', 290, '2026-11-01'),
      entry('Bus', 'transit', 290, '2026-11-02'),
      entry('Tea', 'meals', 300, '2026-11-20'),
      entry('Tea', 'meals', 300, '2026-11-21'),
    ]
    expect(topUsuals(history, 1)[0].description).toBe('Tea')
  })
})
