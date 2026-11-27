import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { UndoProvider, useUndo } from './useUndo.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function OfferButton({ undo }: { undo: () => Promise<void> }) {
  const ctx = useUndo()
  return (
    <>
      <button onClick={() => ctx?.offerUndo({ message: 'Deleted Coffee', undo })}>offer</button>
      <button onClick={() => void ctx?.undoLast()}>undo-last</button>
    </>
  )
}

function renderWithUndo(undo = vi.fn().mockResolvedValue(undefined), durationMs?: number) {
  render(
    <UndoProvider durationMs={durationMs}>
      <OfferButton undo={undo} />
    </UndoProvider>,
  )
  return undo
}

describe('UndoProvider', () => {
  it('shows what can be undone', () => {
    // #given
    renderWithUndo()

    // #when
    fireEvent.click(screen.getByText('offer'))

    // #then
    expect(screen.getByRole('status').textContent).toContain('Deleted Coffee')
  })

  it('runs the undo action when Undo is clicked', async () => {
    // #given
    const undo = renderWithUndo()
    fireEvent.click(screen.getByText('offer'))

    // #when
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })

    // #then
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('hides the toast after undoing', async () => {
    // #given
    renderWithUndo()
    fireEvent.click(screen.getByText('offer'))

    // #when
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })

    // #then
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('undoLast runs the pending action once', async () => {
    // #given
    const undo = renderWithUndo()
    fireEvent.click(screen.getByText('offer'))

    // #when
    await act(async () => {
      fireEvent.click(screen.getByText('undo-last'))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('undo-last'))
    })

    // #then
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('stops offering the undo after its time runs out', () => {
    // #given
    vi.useFakeTimers()
    const undo = renderWithUndo(undefined, 1000)
    fireEvent.click(screen.getByText('offer'))

    // #when
    act(() => {
      vi.advanceTimersByTime(1001)
    })
    fireEvent.click(screen.getByText('undo-last'))

    // #then
    expect({ toast: screen.queryByRole('status'), calls: undo.mock.calls.length }).toEqual({
      toast: null,
      calls: 0,
    })
  })
})
