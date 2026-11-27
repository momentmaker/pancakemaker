import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, afterEach } from 'vitest'
import { UpcomingChargeRow } from './UpcomingChargeRow.js'
import type { UpcomingCharge } from '../db/renewals.js'

afterEach(cleanup)

function charge(overrides: Partial<UpcomingCharge> = {}): UpcomingCharge {
  return {
    seriesId: 's1',
    name: 'Netflix',
    categoryName: 'Subscriptions',
    categoryColor: '#ff00ff',
    panelId: 'p1',
    routeType: 'personal',
    recurrenceType: 'monthly',
    nextDate: '2026-12-14',
    daysUntil: 17,
    amount: 1799,
    currency: 'USD',
    priceChange: null,
    chargesInWindow: 1,
    totalInWindow: 1799,
    ...overrides,
  }
}

function renderRow(c: UpcomingCharge, showWindowTotal = false) {
  return render(
    <MemoryRouter>
      <UpcomingChargeRow charge={c} showWindowTotal={showWindowTotal} />
    </MemoryRouter>,
  )
}

describe('UpcomingChargeRow', () => {
  it('shows when the charge is due', () => {
    renderRow(charge())
    expect(screen.getByText('Dec 14 · in 17 days')).toBeTruthy()
  })

  it('says tomorrow for a charge due the next day', () => {
    renderRow(charge({ nextDate: '2026-11-28', daysUntil: 1 }))
    expect(screen.getByText('Nov 28 · tomorrow')).toBeTruthy()
  })

  it('flags a recent price change with the old price', () => {
    renderRow(charge({ priceChange: { from: 1549, to: 1799, since: '2026-10-14' } }))
    expect(screen.getByText('↑ was $15.49')).toBeTruthy()
  })

  it('tags annual charges', () => {
    renderRow(charge({ recurrenceType: 'annual' }))
    expect(screen.getByText('annual')).toBeTruthy()
  })

  it('links to the panel the series lives in', () => {
    renderRow(charge())
    expect(screen.getByRole('link').getAttribute('href')).toBe('/personal/panel/p1')
  })

  it('shows how many charges fall in the window and their total', () => {
    renderRow(charge({ chargesInWindow: 12, totalInWindow: 21588 }), true)
    expect(screen.getByText('×12 · $215.88')).toBeTruthy()
  })
})
