import { screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CaptureProvider, useCapture } from './useCapture.js'
import { renderWithProviders, setupTestDb, getTestDb } from '../test-utils.js'
import { useSync } from '../sync/SyncContext.js'

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
    expect(screen.getByText(/Couldn't pick a category from #foo/)).toBeTruthy()
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

  it('creates only one expense when the capture bar is submitted twice rapidly', async () => {
    renderCapture('/personal')
    await waitFor(() => expect(screen.getByTestId('cat-count').textContent).not.toBe('0'))

    fireEvent.click(screen.getByText('open-bar'))
    const input = screen.getByLabelText(/Quick capture/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '12.50 coffee #meals' } })
    const form = input.closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(async () => expect(await countExpenses()).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(await countExpenses()).toBe(1)
  })

  it('opens the capture bar from the home-screen shortcut link', () => {
    renderCapture('/?capture=1')
    expect(screen.getByLabelText(/Quick capture/)).toBeTruthy()
  })

  async function captureLine(line: string) {
    fireEvent.click(screen.getByText('open-bar'))
    const input = screen.getByLabelText(/Quick capture/) as HTMLInputElement
    fireEvent.change(input, { target: { value: line } })
    fireEvent.submit(input.closest('form')!)
  }

  it('logs a remembered description without a #category', async () => {
    // #given
    renderCapture('/personal')
    await waitFor(() => expect(screen.getByTestId('cat-count').textContent).not.toBe('0'))
    await captureLine('12.50 coffee #meals')
    await waitFor(async () => expect(await countExpenses()).toBe(1))

    // #when
    await captureLine('4.50 coffee')

    // #then
    await waitFor(async () => expect(await countExpenses()).toBe(2))
  })

  it('offers a repeated expense as a one-tap usual', async () => {
    // #given
    renderCapture('/personal')
    await waitFor(() => expect(screen.getByTestId('cat-count').textContent).not.toBe('0'))
    await captureLine('4.50 coffee #meals')
    await waitFor(async () => expect(await countExpenses()).toBe(1))
    await captureLine('4.50 coffee #meals')
    await waitFor(async () => expect(await countExpenses()).toBe(2))

    // #when
    fireEvent.click(screen.getByText('open-bar'))
    fireEvent.click(await screen.findByRole('button', { name: /coffee/ }))

    // #then
    await waitFor(async () => expect(await countExpenses()).toBe(3))
  })

  it('tells other views that expenses changed after a capture', async () => {
    // #given
    let expenseVersion = 0
    function VersionProbe() {
      expenseVersion = useSync().tableVersions['expenses'] ?? 0
      return null
    }
    renderWithProviders(
      <CaptureProvider>
        <Consumer />
        <VersionProbe />
      </CaptureProvider>,
      '/personal',
    )
    await waitFor(() => expect(screen.getByTestId('cat-count').textContent).not.toBe('0'))

    // #when
    await captureLine('4.50 coffee #meals')

    // #then
    await waitFor(() => expect(expenseVersion).toBe(1))
  })
})
