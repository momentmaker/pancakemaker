import { useState } from 'react'
import { render, screen, act, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  MonthScrubProvider,
  useMonthScrub,
  useMonthScrubControls,
  type MonthScrubContextValue,
} from './useMonthScrub.js'
import { addMonths } from '../lib/month.js'

afterEach(cleanup)

let controls: MonthScrubContextValue | null = null
function Controls() {
  controls = useMonthScrubControls()
  return null
}

describe('MonthScrubProvider / useMonthScrub', () => {
  it('scrub calls the registered handler with the delta', () => {
    const handler = vi.fn()
    function View() {
      useMonthScrub(handler)
      return null
    }
    render(
      <MonthScrubProvider>
        <Controls />
        <View />
      </MonthScrubProvider>,
    )
    act(() => controls!.scrub(1))
    act(() => controls!.scrub(-1))
    expect(handler).toHaveBeenNthCalledWith(1, 1)
    expect(handler).toHaveBeenNthCalledWith(2, -1)
  })

  it('scrub is a no-op when nothing is registered', () => {
    render(
      <MonthScrubProvider>
        <Controls />
      </MonthScrubProvider>,
    )
    expect(() => act(() => controls!.scrub(1))).not.toThrow()
  })

  it('a view using useMonthScrub renders without a provider (no throw)', () => {
    function View() {
      useMonthScrub(vi.fn())
      return <div data-testid="ok">ok</div>
    }
    expect(() => render(<View />)).not.toThrow()
    expect(screen.getByTestId('ok')).toBeTruthy()
  })

  it('uses the functional updater so +1 then -1 round-trips the month (stale-safe)', () => {
    function View() {
      const [month, setMonth] = useState('2026-06')
      useMonthScrub((delta) => setMonth((m) => addMonths(m, delta)))
      return <div data-testid="month">{month}</div>
    }
    render(
      <MonthScrubProvider>
        <Controls />
        <View />
      </MonthScrubProvider>,
    )
    act(() => controls!.scrub(1))
    expect(screen.getByTestId('month').textContent).toBe('2026-07')
    act(() => controls!.scrub(-1))
    expect(screen.getByTestId('month').textContent).toBe('2026-06')
  })

  it('clears the handler when the registering view unmounts', () => {
    const handler = vi.fn()
    function View() {
      useMonthScrub(handler)
      return null
    }
    const { rerender } = render(
      <MonthScrubProvider>
        <Controls />
        <View />
      </MonthScrubProvider>,
    )
    rerender(
      <MonthScrubProvider>
        <Controls />
      </MonthScrubProvider>,
    )
    act(() => controls!.scrub(1))
    expect(handler).not.toHaveBeenCalled()
  })
})
