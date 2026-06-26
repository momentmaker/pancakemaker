import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useKeyboardShortcuts } from './useKeyboardShortcuts.js'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="path">{location.pathname}</div>
}

function Harness({ onCheatsheet = () => {} }: { onCheatsheet?: () => void }) {
  useKeyboardShortcuts({ onCheatsheet })
  return (
    <>
      <LocationProbe />
      <input data-testid="field" />
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

function renderHarness(initialRoute = '/', props: { onCheatsheet?: () => void } = {}) {
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

  it('blurs a focused field on Escape (R15)', () => {
    renderHarness('/')
    const field = screen.getByTestId('field')
    field.focus()
    expect(document.activeElement).toBe(field)
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(document.activeElement).not.toBe(field)
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
