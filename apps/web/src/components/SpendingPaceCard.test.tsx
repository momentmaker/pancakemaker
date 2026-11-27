import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { SpendingPaceCard } from './SpendingPaceCard.js'

afterEach(cleanup)

const base = {
  totalAmount: 30000,
  projectedTotal: 90000,
  daysElapsed: 3,
  daysInMonth: 30,
  currency: 'USD',
  paceCurve: [10000, 20000, 30000],
}

describe('SpendingPaceCard', () => {
  it('says how far under the ghost this month is', () => {
    render(
      <SpendingPaceCard
        {...base}
        ghostCurve={[20000, 40000, 51200, 60000]}
        ghostLabel="your normal"
      />,
    )
    expect(screen.getByText('Day 3: $212.00 under your normal')).toBeTruthy()
  })

  it('says how far over the ghost this month is', () => {
    render(<SpendingPaceCard {...base} ghostCurve={[0, 0, 10000]} ghostLabel="last month" />)
    expect(screen.getByText('Day 3: $200.00 over last month')).toBeTruthy()
  })

  it('shows the projected month-end total', () => {
    render(<SpendingPaceCard {...base} ghostCurve={null} ghostLabel={null} />)
    expect(screen.getByText('$900.00')).toBeTruthy()
  })

  it('skips the comparison when there is no history', () => {
    render(<SpendingPaceCard {...base} ghostCurve={null} ghostLabel={null} />)
    expect(screen.queryByText(/under|over/)).toBeNull()
  })
})
