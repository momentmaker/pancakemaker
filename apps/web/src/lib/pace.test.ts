import { describe, it, expect } from 'vitest'
import { cumulative, ghostCurve, projectMonthEnd, ghostDelta } from './pace.js'

describe('cumulative', () => {
  it('turns daily amounts into a running total', () => {
    expect(cumulative([100, 200, 0, 300])).toEqual([100, 300, 300, 600])
  })
})

describe('ghostCurve', () => {
  it('takes the median of past months for each day', () => {
    expect(
      ghostCurve(
        [
          [100, 200, 300],
          [300, 400, 500],
          [200, 200, 200],
        ],
        3,
      ),
    ).toEqual([200, 200, 300])
  })

  it('holds a shorter month flat at its final total', () => {
    expect(ghostCurve([[100, 200]], 4)).toEqual([100, 200, 200, 200])
  })

  it('returns null when there is no history', () => {
    expect(ghostCurve([], 30)).toBeNull()
  })
})

describe('projectMonthEnd', () => {
  it('does not extrapolate rent paid on day 1 across the month', () => {
    // Rent $1,500 on day 1 plus $10/day of everyday spending, on day 3 of 30.
    expect(
      projectMonthEnd({
        spentSoFar: 153000,
        recurringSpentSoFar: 150000,
        upcomingRecurring: 0,
        daysElapsed: 3,
        daysInMonth: 30,
      }),
    ).toBe(180000)
  })

  it('adds recurring charges still to come this month', () => {
    expect(
      projectMonthEnd({
        spentSoFar: 3000,
        recurringSpentSoFar: 0,
        upcomingRecurring: 1799,
        daysElapsed: 3,
        daysInMonth: 30,
      }),
    ).toBe(31799)
  })

  it('returns the spent total once the month is over', () => {
    expect(
      projectMonthEnd({
        spentSoFar: 5000,
        recurringSpentSoFar: 0,
        upcomingRecurring: 0,
        daysElapsed: 30,
        daysInMonth: 30,
      }),
    ).toBe(5000)
  })

  it('returns null before there are two days of data', () => {
    expect(
      projectMonthEnd({
        spentSoFar: 5000,
        recurringSpentSoFar: 0,
        upcomingRecurring: 0,
        daysElapsed: 1,
        daysInMonth: 30,
      }),
    ).toBeNull()
  })
})

describe('ghostDelta', () => {
  it('compares this month with the ghost on the same day', () => {
    expect(ghostDelta([100, 300, 500], [200, 400, 900], 2)).toBe(-100)
  })

  it('returns null without a ghost', () => {
    expect(ghostDelta([100], null, 1)).toBeNull()
  })
})
