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
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('j focuses the first category card and Enter opens it', async () => {
    renderWithProviders(<Harness />, '/personal')
    await screen.findByText('Health')

    fireEvent.keyDown(document, { key: 'j' })
    const focused = document.activeElement as HTMLElement
    expect(focused.getAttribute('data-kbd-item-id')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toMatch(/^\/personal\/category\//),
    )
  })
})
