import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CommandPaletteProvider, useCommandPalette } from './useCommandPalette.js'
import { CaptureProvider } from './useCapture.js'
import { KeyboardCursorProvider } from './useKeyboardCursor.js'
import { renderWithProviders, setupTestDb, getTestDb } from '../test-utils.js'
import { getCategoriesByRoute, getPanelsByRoute, createExpense } from '../db/queries.js'

afterEach(cleanup)

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="path">{location.pathname}</div>
}

function Probe() {
  const palette = useCommandPalette()
  return (
    <>
      <button onClick={() => palette?.openPalette()}>open-palette</button>
      <button onClick={() => palette?.openCheatsheet()}>open-cheatsheet</button>
      <LocationProbe />
    </>
  )
}

function renderPalette(route = '/personal') {
  return renderWithProviders(
    <CaptureProvider>
      <KeyboardCursorProvider>
        <CommandPaletteProvider>
          <Probe />
        </CommandPaletteProvider>
      </KeyboardCursorProvider>
    </CaptureProvider>,
    route,
  )
}

let categoryId: string

beforeEach(async () => {
  const { state } = await setupTestDb()
  const { db } = getTestDb()
  const cats = await getCategoriesByRoute(db, state.personalRouteId)
  const panels = await getPanelsByRoute(db, state.personalRouteId)
  categoryId = cats[0].id
  await createExpense(db, {
    panelId: panels[0].id,
    categoryId,
    amount: 1250,
    currency: 'USD',
    date: '2026-04-10',
    description: 'flat white',
  })
})

describe('CommandPaletteProvider', () => {
  it('opens the palette and routes "Add expense" to the global QuickAdd', () => {
    renderPalette()
    fireEvent.click(screen.getByText('open-palette'))
    fireEvent.click(screen.getByText('Add expense'))
    expect(screen.getByText('Add Expense · Personal')).toBeInTheDocument()
  })

  it('opens the cheatsheet from the palette', () => {
    renderPalette()
    fireEvent.click(screen.getByText('open-palette'))
    fireEvent.click(screen.getByText('Open keyboard cheatsheet'))
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument()
  })

  it("jumps to a recent expense's category detail route", async () => {
    renderPalette()
    fireEvent.click(screen.getByText('open-palette'))
    await waitFor(() => expect(screen.getByText('flat white')).toBeInTheDocument())
    fireEvent.click(screen.getByText('flat white'))
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe(`/personal/category/${categoryId}`),
    )
  })

  it('still opens the cheatsheet via the ? path (openCheatsheet)', () => {
    renderPalette()
    fireEvent.click(screen.getByText('open-cheatsheet'))
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument()
  })
})
