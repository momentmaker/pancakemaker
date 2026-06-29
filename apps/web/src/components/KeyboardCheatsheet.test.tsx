import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KeyboardCheatsheet } from './KeyboardCheatsheet.js'
import { Layout } from './Layout.js'
import { renderWithProviders, setupTestDb } from '../test-utils.js'

// Auto-cleanup is normally registered by the shared test setup; register it
// explicitly so these tests are isolated regardless of setup-file load order.
afterEach(cleanup)

describe('KeyboardCheatsheet', () => {
  it('lists the Phase 1 bindings when open', () => {
    render(<KeyboardCheatsheet open onClose={() => {}} />)
    expect(screen.getByText('Go to Dashboard')).toBeTruthy()
    expect(screen.getByText('g d')).toBeTruthy()
    expect(screen.getByText('Move cursor down / up')).toBeTruthy()
  })

  it('renders nothing when closed', () => {
    render(<KeyboardCheatsheet open={false} onClose={() => {}} />)
    expect(screen.queryByText('Go to Dashboard')).toBeNull()
  })

  it('does not advertise the deferred / filter key', () => {
    const { container } = render(<KeyboardCheatsheet open onClose={() => {}} />)
    const keys = Array.from(container.querySelectorAll('kbd')).map((el) => el.textContent)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys).not.toContain('/')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<KeyboardCheatsheet open onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('Layout keyboard wiring', () => {
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

  it('opens the cheatsheet when ? is pressed (AE5)', () => {
    renderWithProviders(<Layout />, '/')
    expect(screen.queryByText('Go to Dashboard')).toBeNull()
    fireEvent.keyDown(document, { key: '?' })
    expect(screen.getByText('Go to Dashboard')).toBeTruthy()
  })

  it('closes the cheatsheet via the close button', () => {
    renderWithProviders(<Layout />, '/')
    fireEvent.keyDown(document, { key: '?' })
    // Layout also renders the capture QuickAdd (its own Close), so scope to the cheatsheet dialog.
    const sheet = screen.getByText('Go to Dashboard').closest('dialog') as HTMLElement
    fireEvent.click(within(sheet).getByLabelText('Close'))
    expect(screen.queryByText('Go to Dashboard')).toBeNull()
  })
})
