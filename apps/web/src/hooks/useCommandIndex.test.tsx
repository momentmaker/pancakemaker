import { waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useCommandIndex, type CommandActions } from './useCommandIndex.js'
import { renderWithProviders, setupTestDb, getTestDb } from '../test-utils.js'
import { getCategoriesByRoute, getPanelsByRoute, createExpense } from '../db/queries.js'
import type { CommandItem } from '../lib/command-palette/types.js'

afterEach(cleanup)

const actions: CommandActions = {
  navigate: vi.fn(),
  openQuickAdd: vi.fn(),
  openCheatsheet: vi.fn(),
  syncNow: vi.fn(),
  focusExpense: vi.fn(),
  exportCsv: vi.fn(),
  exportJson: vi.fn(),
}

let items: CommandItem[] = []

function Probe() {
  items = useCommandIndex(actions)
  return <div data-testid="count">{items.length}</div>
}

let healthCategoryId: string
let expenseId: string
let expenseCategoryId: string

beforeEach(async () => {
  vi.clearAllMocks()
  items = []
  const { state } = await setupTestDb()
  const { db } = getTestDb()
  const cats = await getCategoriesByRoute(db, state.personalRouteId)
  const panels = await getPanelsByRoute(db, state.personalRouteId)
  healthCategoryId = cats.find((c) => c.name === 'Health')!.id
  expenseCategoryId = cats[0].id
  const expense = await createExpense(db, {
    panelId: panels[0].id,
    categoryId: expenseCategoryId,
    amount: 1250,
    currency: 'USD',
    date: '2026-04-10',
    description: 'flat white',
  })
  expenseId = expense.id
})

function find(label: string): CommandItem {
  return items.find((i) => i.label === label)!
}

describe('useCommandIndex', () => {
  it('indexes routes, categories, panels, recent expenses, and actions', async () => {
    renderWithProviders(<Probe />, '/personal')
    await waitFor(() => expect(items.some((i) => i.group === 'Recent expenses')).toBe(true))

    expect(new Set(items.map((i) => i.group))).toEqual(
      new Set(['Routes', 'Categories', 'Panels', 'Recent expenses', 'Actions']),
    )
    expect(items.filter((i) => i.group === 'Routes')).toHaveLength(4)
    // Personal (10) + Business (8) seeded categories are both indexed.
    expect(items.filter((i) => i.group === 'Categories').length).toBe(18)
    expect(items.filter((i) => i.group === 'Actions').map((i) => i.label)).toEqual([
      'Add expense',
      'Export CSV',
      'Export JSON',
      'Open keyboard cheatsheet',
      'Sync now',
    ])
  })

  it("a category's run navigates to its detail route", async () => {
    renderWithProviders(<Probe />, '/personal')
    await waitFor(() => expect(items.some((i) => i.group === 'Categories')).toBe(true))

    const health = items.find((i) => i.group === 'Categories' && i.label === 'Health')!
    health.run()
    expect(actions.navigate).toHaveBeenCalledWith(`/personal/category/${healthCategoryId}`)
  })

  it('a recent-expense run focuses the expense and navigates with month + focusId state', async () => {
    renderWithProviders(<Probe />, '/personal')
    await waitFor(() => expect(items.some((i) => i.group === 'Recent expenses')).toBe(true))

    find('flat white').run()
    expect(actions.focusExpense).toHaveBeenCalledWith(expenseId)
    expect(actions.navigate).toHaveBeenCalledWith(`/personal/category/${expenseCategoryId}`, {
      state: { month: '2026-04', focusId: expenseId },
    })
  })

  it('action items run the injected effects', async () => {
    renderWithProviders(<Probe />, '/personal')
    await waitFor(() => expect(items.length).toBeGreaterThan(0))

    find('Add expense').run()
    find('Sync now').run()
    find('Export CSV').run()
    find('Open keyboard cheatsheet').run()
    expect(actions.openQuickAdd).toHaveBeenCalledOnce()
    expect(actions.syncNow).toHaveBeenCalledOnce()
    expect(actions.exportCsv).toHaveBeenCalledOnce()
    expect(actions.openCheatsheet).toHaveBeenCalledOnce()
  })
})
