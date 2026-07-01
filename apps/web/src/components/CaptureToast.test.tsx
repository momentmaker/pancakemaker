import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CaptureToast } from './CaptureToast.js'

const summary = { route: 'Personal', category: 'Meals', amount: '$12.50' }

afterEach(() => vi.useRealTimers())

describe('CaptureToast', () => {
  it('renders nothing when there is no summary', () => {
    const { container } = render(<CaptureToast summary={null} onDismiss={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows route, category, and amount (AE6)', () => {
    render(<CaptureToast summary={summary} onDismiss={vi.fn()} />)
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('Personal')
    expect(status.textContent).toContain('Meals')
    expect(status.textContent).toContain('$12.50')
  })

  it('announces politely without stealing focus', () => {
    render(<CaptureToast summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  })

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<CaptureToast summary={summary} onDismiss={onDismiss} durationMs={3000} />)
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(3000))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('dismisses early on Escape', () => {
    const onDismiss = vi.fn()
    render(<CaptureToast summary={summary} onDismiss={onDismiss} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
