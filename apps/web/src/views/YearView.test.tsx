import { screen, cleanup } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, setupTestDb, getTestDb } from '../test-utils.js'
import { createExpense, getCategoriesByRoute, getPanelsByRoute } from '../db/queries.js'
import { YearView } from './YearView.js'

afterEach(cleanup)

describe('YearView', () => {
  beforeEach(async () => {
    const { db, state } = await setupTestDb()
    const [panel] = await getPanelsByRoute(db, state.personalRouteId)
    const [category] = await getCategoriesByRoute(db, state.personalRouteId)
    for (const [amount, date] of [
      [1500, '2025-03-01'],
      [1000, '2024-05-01'],
    ] as const) {
      await createExpense(db, {
        panelId: panel.id,
        categoryId: category.id,
        amount,
        currency: 'USD',
        date,
      })
    }
  })

  function renderYear(year: string) {
    getTestDb()
    return renderWithProviders(
      <Routes>
        <Route path="/year/:year" element={<YearView />} />
      </Routes>,
      `/year/${year}`,
    )
  }

  it("shows the year's total and the change from the year before", async () => {
    renderYear('2025')
    expect(await screen.findByText('+50% vs 2024')).toBeTruthy()
  })

  it('counts the no-spend days of a finished year', async () => {
    renderYear('2025')
    expect(await screen.findByText('364')).toBeTruthy()
  })
})
