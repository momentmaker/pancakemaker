import { screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CaptureProvider, useCapture } from './useCapture.js'
import { renderWithProviders, setupTestDb, getTestDb } from '../test-utils.js'

afterEach(cleanup)

function Consumer() {
  const capture = useCapture()
  if (!capture) return null
  return (
    <>
      <div data-testid="route">{capture.targetRouteLabel}</div>
      <div data-testid="cat-count">{capture.categories.length}</div>
      <button onClick={() => capture.openQuickAdd()}>open-blank</button>
      <button
        onClick={() =>
          capture.openQuickAdd({ amount: '12.50', description: 'coffee', categoryHint: 'foo' })
        }
      >
        open-prefill
      </button>
      <button onClick={() => capture.openCaptureBar()}>open-bar</button>
    </>
  )
}

async function countExpenses(): Promise<number> {
  const { db } = getTestDb()
  const rows = await db.query<{ n: number }>('SELECT COUNT(*) as n FROM expenses')
  return rows[0].n
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

  it('creates exactly one expense from the capture bar when everything resolves (AE1)', async () => {
    renderCapture('/personal')
    await waitFor(() => expect(screen.getByTestId('cat-count').textContent).not.toBe('0'))

    fireEvent.click(screen.getByText('open-bar'))
    const input = screen.getByLabelText(/Quick capture/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '12.50 coffee #meals' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(async () => expect(await countExpenses()).toBe(1))
    const { db } = getTestDb()
    const rows = await db.query<{ amount: number; description: string }>(
      'SELECT amount, description FROM expenses',
    )
    expect(rows[0].amount).toBe(1250)
    expect(rows[0].description).toBe('coffee')

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Personal')
    expect(status.textContent).toContain('Meals')
    expect(status.textContent).toContain('$12.50')
  })

  it('opens a pre-filled QuickAdd and creates nothing when no category is given (AE2)', async () => {
    renderCapture('/personal')
    await waitFor(() => expect(screen.getByTestId('cat-count').textContent).not.toBe('0'))

    fireEvent.click(screen.getByText('open-bar'))
    const input = screen.getByLabelText(/Quick capture/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '12.50 coffee' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() =>
      expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('12.5'),
    )
    expect(await countExpenses()).toBe(0)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
