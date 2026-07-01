import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useIsDesktop, DESKTOP_MIN_WIDTH } from './useIsDesktop.js'

type ChangeHandler = (e: { matches: boolean }) => void

function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<ChangeHandler>()
  const addEventListener = vi.fn((_event: string, cb: ChangeHandler) => {
    listeners.add(cb)
  })
  const removeEventListener = vi.fn((_event: string, cb: ChangeHandler) => {
    listeners.delete(cb)
  })
  const mql = {
    get matches() {
      return matches
    },
    media: '',
    addEventListener,
    removeEventListener,
  }
  const matchMedia = vi.fn(() => mql as unknown as MediaQueryList)
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia
  return {
    matchMedia,
    addEventListener,
    removeEventListener,
    setMatches(next: boolean) {
      matches = next
      listeners.forEach((cb) => cb({ matches: next }))
    },
  }
}

describe('useIsDesktop', () => {
  const original = window.matchMedia

  afterEach(() => {
    window.matchMedia = original
  })

  it('returns true when the desktop media query matches', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(true)
  })

  it('returns false when the desktop media query does not match', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
  })

  it('updates when the media query flips to matching', () => {
    const mm = stubMatchMedia(false)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
    act(() => mm.setMatches(true))
    expect(result.current).toBe(true)
  })

  it('removes its listener on unmount', () => {
    const mm = stubMatchMedia(true)
    const { unmount } = renderHook(() => useIsDesktop())
    unmount()
    expect(mm.removeEventListener).toHaveBeenCalled()
  })

  it('queries the centralized 640px breakpoint', () => {
    const mm = stubMatchMedia(true)
    renderHook(() => useIsDesktop())
    expect(mm.matchMedia).toHaveBeenCalledWith(`(min-width: ${DESKTOP_MIN_WIDTH}px)`)
    expect(DESKTOP_MIN_WIDTH).toBe(640)
  })
})
