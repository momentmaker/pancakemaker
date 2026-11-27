import { describe, it, expect } from 'vitest'
import { noSpendStats, heatmapWeeks, intensityLevel, yearOverYear } from './year.js'

describe('noSpendStats', () => {
  it('counts days without spending and the longest run of them, up to today', () => {
    const spent = new Map([
      ['2026-01-01', 500],
      ['2026-01-05', 300],
    ])
    expect(noSpendStats('2026', spent, '2026-01-07')).toEqual({ noSpendDays: 5, longestStreak: 3 })
  })

  it('covers the whole year once it is over', () => {
    expect(noSpendStats('2025', new Map(), '2026-03-01')).toEqual({
      noSpendDays: 365,
      longestStreak: 365,
    })
  })

  it('reports nothing for a future year', () => {
    expect(noSpendStats('2027', new Map(), '2026-11-27')).toEqual({
      noSpendDays: 0,
      longestStreak: 0,
    })
  })
})

describe('heatmapWeeks', () => {
  it('lays the year out in Sunday-first weeks', () => {
    // 2026-01-01 is a Thursday, so the first week has four blank days.
    const weeks = heatmapWeeks('2026', new Map([['2026-01-01', 900]]))
    expect(weeks[0].map((d) => d && d.date)).toEqual([
      null,
      null,
      null,
      null,
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ])
  })

  it('covers every day of the year exactly once', () => {
    const days = heatmapWeeks('2028', new Map()).flat().filter(Boolean)
    expect(days).toHaveLength(366)
  })

  it("carries each day's spending", () => {
    const weeks = heatmapWeeks('2026', new Map([['2026-01-01', 900]]))
    expect(weeks[0][4]?.value).toBe(900)
  })
})

describe('intensityLevel', () => {
  it('is 0 for a day without spending', () => {
    expect(intensityLevel(0, 1000)).toBe(0)
  })

  it('is 4 for the biggest day', () => {
    expect(intensityLevel(1000, 1000)).toBe(4)
  })

  it('gives a small day the lowest visible level', () => {
    expect(intensityLevel(1, 1000)).toBe(1)
  })
})

describe('yearOverYear', () => {
  it('returns the percentage change from last year', () => {
    expect(yearOverYear(12000, 10000)).toBe(20)
  })

  it('returns null when there is nothing to compare with', () => {
    expect(yearOverYear(12000, 0)).toBeNull()
  })
})
