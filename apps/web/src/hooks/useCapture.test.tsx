import { screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CaptureProvider, useCapture } from './useCapture.js'
import { renderWithProviders, setupTestDb } from '../test-utils.js'

afterEach(cleanup)

function Consumer() {
  const capture = useCapture()
  if (!capture) return null
  return (
    <>
      <div data-testid="route">{capture.targetRouteLabel}</div>
      <button onClick={() => capture.openQuickAdd()}>open-blank</button>
      <button
        onClick={() =>
          capture.openQuickAdd({ amount: '12.50', description: 'coffee', categoryHint: 'foo' })
        }
      >
        open-prefill
      </button>
    </>
  )
}

function renderCapture(route: string) {
  return renderWithProviders(
    <CaptureProvider>
      <Consumer />
    </CaptureProvider>,
    route,
  )
}

describe('CaptureProvider', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('targets the current route, defaulting to Personal off-route', () => {
    renderCapture('/personal')
    expect(screen.getByTestId('route').textContent).toBe('Personal')
    cleanup()
    renderCapture('/business')
    expect(screen.getByTestId('route').textContent).toBe('Business')
    cleanup()
    renderCapture('/')
    expect(screen.getByTestId('route').textContent).toBe('Personal')
  })

  it('opens QuickAdd pre-filled and surfaces why the category did not resolve', () => {
    renderCapture('/personal')
    fireEvent.click(screen.getByText('open-prefill'))
    const amount = screen.getByLabelText('Amount') as HTMLInputElement
    expect(amount.value).toBe('12.50')
    expect(screen.getByText(/No match for #foo/)).toBeTruthy()
  })

  it('shows the target route in the QuickAdd title', () => {
    renderCapture('/business')
    fireEvent.click(screen.getByText('open-blank'))
    expect(screen.getByText('Add Expense · Business')).toBeTruthy()
  })
})
