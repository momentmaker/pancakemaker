import { useLocation } from 'react-router-dom'
import { screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RouteView } from './RouteView.js'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js'
import { KeyboardCursorProvider } from '../hooks/useKeyboardCursor.js'
import { renderWithProviders, setupTestDb } from '../test-utils.js'

afterEach(cleanup)

function ShortcutsMount() {
  useKeyboardShortcuts({ onCheatsheet: () => {} })
  return null
}

function LocationProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>
}

function Harness() {
  return (
    <KeyboardCursorProvider>
      <ShortcutsMount />
      <RouteView type="personal" />
      <LocationProbe />
    </KeyboardCursorProvider>
  )
}

describe('RouteView keyboard cursor', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(async () => {
    await setupTestDb()
    // No exchange rates arrive mid-test: a late rate load re-renders the grid
    // and raced the keypress on CI.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in tests')))
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    vi.unstubAllGlobals()
  })

  it('j focuses the first category card and Enter opens it', async () => {
    renderWithProviders(<Harness />, '/personal')
    await screen.findByText('Health')

    // The cards register with the cursor in an effect after they render.
    await waitFor(() => {
      fireEvent.keyDown(document, { key: 'j' })
      expect((document.activeElement as HTMLElement).getAttribute('data-kbd-item-id')).toBeTruthy()
    })

    fireEvent.keyDown(document, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toMatch(/^\/personal\/category\//),
    )
  })
})
