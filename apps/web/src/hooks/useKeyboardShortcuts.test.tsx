import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useKeyboardShortcuts } from './useKeyboardShortcuts.js'
import { CaptureContext, type CaptureContextValue } from './useCapture.js'
import { CommandPaletteContext, type CommandPaletteContextValue } from './useCommandPalette.js'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="path">{location.pathname}</div>
}

function Harness({
  onCheatsheet = () => {},
  onFieldBlur,
}: {
  onCheatsheet?: () => void
  onFieldBlur?: () => void
}) {
  useKeyboardShortcuts({ onCheatsheet })
  return (
    <>
      <LocationProbe />
      <input data-testid="field" onBlur={onFieldBlur} />
    </>
  )
}

function setDesktop(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    media: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function renderHarness(
  initialRoute = '/',
  props: { onCheatsheet?: () => void; onFieldBlur?: () => void } = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Harness {...props} />
    </MemoryRouter>,
  )
}

function path() {
  return screen.getByTestId('path').textContent
}

describe('useKeyboardShortcuts', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => setDesktop(true))
  afterEach(() => {
    window.matchMedia = originalMatchMedia
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('navigates on a g-prefix route chord (R14)', () => {
    renderHarness('/')
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'b' })
    expect(path()).toBe('/business')
  })

  it('does nothing on mobile viewports (R1 / AE3)', () => {
    setDesktop(false)
    renderHarness('/')
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'b' })
    expect(path()).toBe('/')
  })

  it('suppresses shortcuts while a field is focused (R3 / AE1)', () => {
    renderHarness('/')
    const field = screen.getByTestId('field')
    field.focus()
    fireEvent.keyDown(field, { key: 'g' })
    fireEvent.keyDown(field, { key: 'b' })
    expect(path()).toBe('/')
  })

  it('stands down on Escape while a field is focused — does not blur or save it', () => {
    // Regression: blurring a focused inline editor fires its save-on-blur, which
    // commits the very edit the user pressed Esc to cancel. The field's own Esc
    // handler owns cancellation; the global handler must leave it alone.
    const onFieldBlur = vi.fn()
    renderHarness('/', { onFieldBlur })
    const field = screen.getByTestId('field')
    field.focus()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(document.activeElement).toBe(field)
    expect(onFieldBlur).not.toHaveBeenCalled()
  })

  it('does not suppress Enter when no cursor item is active (focused buttons still activate)', () => {
    renderHarness('/')
    // fireEvent.keyDown returns false when the event's default was prevented.
    const notPrevented = fireEvent.keyDown(document, { key: 'Enter' })
    expect(notPrevented).toBe(true)
  })

  it('suppresses the browser default for a handled route chord', () => {
    renderHarness('/')
    fireEvent.keyDown(document, { key: 'g' })
    const notPrevented = fireEvent.keyDown(document, { key: 'p' })
    expect(notPrevented).toBe(false)
  })

  it('stands down while a native dialog owns the keyboard (R4 / AE2)', () => {
    renderHarness('/')
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.appendChild(dialog)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'b' })
    expect(path()).toBe('/')
  })

  it('stands down while a custom popover marker is present', () => {
    renderHarness('/')
    const popover = document.createElement('div')
    popover.setAttribute('data-kbd-popover-open', '')
    document.body.appendChild(popover)
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'b' })
    expect(path()).toBe('/')
  })

  it('opens the cheatsheet on ? (R6)', () => {
    const onCheatsheet = vi.fn()
    renderHarness('/', { onCheatsheet })
    fireEvent.keyDown(document, { key: '?' })
    expect(onCheatsheet).toHaveBeenCalledOnce()
  })

  function renderWithCapture(overrides: Partial<CaptureContextValue> = {}) {
    const value: CaptureContextValue = {
      targetRouteId: 'r1',
      targetRouteLabel: 'Personal',
      categories: [],
      openQuickAdd: vi.fn(),
      openCaptureBar: vi.fn(),
      ...overrides,
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <CaptureContext.Provider value={value}>
          <Harness />
        </CaptureContext.Provider>
      </MemoryRouter>,
    )
    return value
  }

  it('opens QuickAdd on `a` via the capture context', () => {
    const { openQuickAdd } = renderWithCapture()
    fireEvent.keyDown(document, { key: 'a' })
    expect(openQuickAdd).toHaveBeenCalledOnce()
  })

  it('opens the capture bar on `:` via the capture context', () => {
    const { openCaptureBar } = renderWithCapture()
    fireEvent.keyDown(document, { key: ':' })
    expect(openCaptureBar).toHaveBeenCalledOnce()
  })

  function renderWithPalette(overrides: Partial<CommandPaletteContextValue> = {}) {
    const value: CommandPaletteContextValue = {
      openPalette: vi.fn(),
      openCheatsheet: vi.fn(),
      ...overrides,
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteContext.Provider value={value}>
          <Harness />
        </CommandPaletteContext.Provider>
      </MemoryRouter>,
    )
    return value
  }

  it('opens the command palette on Cmd-K (R1)', () => {
    const { openPalette } = renderWithPalette()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(openPalette).toHaveBeenCalledOnce()
  })

  it('opens the command palette on Ctrl-K', () => {
    const { openPalette } = renderWithPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(openPalette).toHaveBeenCalledOnce()
  })

  it('opens the palette on Cmd-K even while a field is focused (AE8)', () => {
    const { openPalette } = renderWithPalette()
    const field = screen.getByTestId('field')
    field.focus()
    fireEvent.keyDown(field, { key: 'k', metaKey: true })
    expect(openPalette).toHaveBeenCalledOnce()
  })

  it('does not open the palette on Cmd-K while another overlay owns the keyboard (AE6 / R2)', () => {
    const { openPalette } = renderWithPalette()
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.appendChild(dialog)
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(openPalette).not.toHaveBeenCalled()
  })

  it('does not open the palette on Cmd-K on mobile viewports', () => {
    setDesktop(false)
    const { openPalette } = renderWithPalette()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(openPalette).not.toHaveBeenCalled()
  })

  it('does not open the palette on a bare k', () => {
    const { openPalette } = renderWithPalette()
    fireEvent.keyDown(document, { key: 'k' })
    expect(openPalette).not.toHaveBeenCalled()
  })

  it('clears a pending chord after the timeout', () => {
    vi.useFakeTimers()
    renderHarness('/')
    fireEvent.keyDown(document, { key: 'g' })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    // 'b' alone is not a binding, so navigation only happens if 'g' is still pending.
    fireEvent.keyDown(document, { key: 'b' })
    expect(path()).toBe('/')
  })

  it('removes its keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHarness('/')
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })
})
