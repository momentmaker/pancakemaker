import { act, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RouteView } from './RouteView.js'
import {
  MonthScrubProvider,
  useMonthScrubControls,
  type MonthScrubContextValue,
} from '../hooks/useMonthScrub.js'
import { renderWithProviders, setupTestDb } from '../test-utils.js'

afterEach(cleanup)

let controls: MonthScrubContextValue | null = null
function ScrubControls() {
  controls = useMonthScrubControls()
  return null
}

function Harness() {
  return (
    <MonthScrubProvider>
      <ScrubControls />
      <RouteView type="personal" />
    </MonthScrubProvider>
  )
}

// The MonthPicker label lives between its two arrow buttons; read it relative to
// the arrow so the assertion never hard-codes a month (which would couple to the
// test clock, since RouteView seeds the picker from the current month). Awaited
// because switching tabs unmounts the picker until the categories load settles.
async function monthLabel(): Promise<string> {
  const prev = await screen.findByLabelText('Previous month')
  return prev.parentElement!.querySelector('span')!.textContent ?? ''
}

describe('RouteView month scrub tab-gating', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(async () => {
    await setupTestDb()
    controls = null
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

  it('scrubs the month on the Categories tab (R7)', async () => {
    renderWithProviders(<Harness />, '/personal')
    const before = await monthLabel()

    act(() => controls!.scrub(1))
    expect(await monthLabel()).not.toBe(before)

    act(() => controls!.scrub(-1))
    expect(await monthLabel()).toBe(before)
  })

  it('is a no-op on the Panels tab, leaving the month unchanged', async () => {
    renderWithProviders(<Harness />, '/personal')
    const before = await monthLabel()

    fireEvent.click(screen.getByText('Panels'))
    await act(async () => {}) // flush the panels-tab async load
    act(() => controls!.scrub(1))
    fireEvent.click(screen.getByText('Categories'))

    expect(await monthLabel()).toBe(before)
  })
})
