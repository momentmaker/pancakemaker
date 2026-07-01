import { useEffect, useState } from 'react'

// Matches Tailwind's `sm` breakpoint — the divide the app already uses for
// desktop vs. mobile navigation. Centralized here so it can't drift.
export const DESKTOP_MIN_WIDTH = 640

const QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`

function matches(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(QUERY).matches
  )
}

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(matches)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mql = window.matchMedia(QUERY)
    function handleChange(e: MediaQueryListEvent): void {
      setIsDesktop(e.matches)
    }

    setIsDesktop(mql.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return isDesktop
}
