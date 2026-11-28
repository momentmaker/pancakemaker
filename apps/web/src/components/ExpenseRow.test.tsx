import { createRef } from 'react'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ExpenseRow, type ExpenseRowHandle } from './ExpenseRow.js'
import type { ExpenseRow as ExpenseRowType } from '../db/queries'

afterEach(cleanup)

function makeExpense(overrides: Partial<ExpenseRowType> = {}): ExpenseRowType {
  return {
    ...overrides,
    id: 'e1',
    amount: 1500,
    currency: 'USD',
    date: '2026-06-26',
    description: 'Coffee',
    category_id: 'c1',
    panel_id: 'p1',
  } as unknown as ExpenseRowType
}

describe('ExpenseRow imperative handle', () => {
  it('startEdit opens the amount editor', () => {
    const ref = createRef<ExpenseRowHandle>()
    render(
      <ExpenseRow ref={ref} expense={makeExpense()} onUpdateAmount={vi.fn()} onDelete={vi.fn()} />,
    )
    act(() => ref.current!.startEdit())
    expect(document.querySelector('input[inputmode="decimal"]')).toBeTruthy()
  })

  it('drives the two-tap delete: arm, then confirm', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const ref = createRef<ExpenseRowHandle>()
    render(
      <ExpenseRow ref={ref} expense={makeExpense()} onUpdateAmount={vi.fn()} onDelete={onDelete} />,
    )

    expect(ref.current!.isConfirming()).toBe(false)
    act(() => ref.current!.startConfirmDelete())
    expect(ref.current!.isConfirming()).toBe(true)
    expect(screen.getByText('Delete?')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()

    await act(async () => {
      ref.current!.confirmDelete()
    })
    expect(onDelete).toHaveBeenCalledWith('e1')
  })

  it('cancelConfirm disarms an armed row', () => {
    const ref = createRef<ExpenseRowHandle>()
    render(
      <ExpenseRow ref={ref} expense={makeExpense()} onUpdateAmount={vi.fn()} onDelete={vi.fn()} />,
    )
    act(() => ref.current!.startConfirmDelete())
    expect(ref.current!.isConfirming()).toBe(true)
    act(() => ref.current!.cancelConfirm())
    expect(ref.current!.isConfirming()).toBe(false)
    expect(screen.queryByText('Delete?')).toBeNull()
  })

  it('duplicate invokes onDuplicate with the expense', async () => {
    const onDuplicate = vi.fn().mockResolvedValue(undefined)
    const ref = createRef<ExpenseRowHandle>()
    render(
      <ExpenseRow
        ref={ref}
        expense={makeExpense()}
        onUpdateAmount={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={onDuplicate}
      />,
    )
    await act(async () => {
      ref.current!.duplicate()
    })
    expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
  })

  it('marks the row with the cursor highlight when cursored', () => {
    const { container, rerender } = render(
      <ExpenseRow expense={makeExpense()} onUpdateAmount={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(container.querySelector('.kbd-cursor')).toBeNull()
    rerender(
      <ExpenseRow expense={makeExpense()} onUpdateAmount={vi.fn()} onDelete={vi.fn()} cursored />,
    )
    expect(container.querySelector('.kbd-cursor')).toBeTruthy()
    expect(container.querySelector('[data-kbd-item-id="e1"]')).toBeTruthy()
  })
})

describe('ExpenseRow recurring delete', () => {
  it('stops the series from this month when "This & future" is chosen', async () => {
    // #given
    const onStopRecurring = vi.fn().mockResolvedValue(undefined)
    const expense = makeExpense({ source_expense_id: 'orig' })
    const ref = createRef<ExpenseRowHandle>()
    render(
      <ExpenseRow
        ref={ref}
        expense={expense}
        onUpdateAmount={vi.fn()}
        onDelete={vi.fn()}
        onStopRecurring={onStopRecurring}
      />,
    )
    act(() => ref.current!.startConfirmDelete())

    // #when
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'This & future' }))
    })

    // #then
    expect(onStopRecurring).toHaveBeenCalledWith(expense)
  })

  it('deletes only this month when "This month" is chosen', async () => {
    // #given
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const ref = createRef<ExpenseRowHandle>()
    render(
      <ExpenseRow
        ref={ref}
        expense={makeExpense({ source_expense_id: 'orig' })}
        onUpdateAmount={vi.fn()}
        onDelete={onDelete}
        onStopRecurring={vi.fn()}
      />,
    )
    act(() => ref.current!.startConfirmDelete())

    // #when
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'This month' }))
    })

    // #then
    expect(onDelete).toHaveBeenCalledWith('e1')
  })

  it('offers only a plain confirm for a one-off expense', () => {
    // #given
    const ref = createRef<ExpenseRowHandle>()
    render(
      <ExpenseRow
        ref={ref}
        expense={makeExpense({ source_expense_id: null })}
        onUpdateAmount={vi.fn()}
        onDelete={vi.fn()}
        onStopRecurring={vi.fn()}
      />,
    )

    // #when
    act(() => ref.current!.startConfirmDelete())

    // #then
    expect(screen.queryByRole('button', { name: 'This & future' })).toBeNull()
  })
})

describe('ExpenseRow delete button', () => {
  it('deletes a one-off expense with a single tap', async () => {
    // #given
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<ExpenseRow expense={makeExpense()} onUpdateAmount={vi.fn()} onDelete={onDelete} />)

    // #when
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete expense' }))
    })

    // #then
    expect(onDelete).toHaveBeenCalledWith('e1')
  })

  it('asks a generated recurring month which deletion is meant before deleting', () => {
    // #given
    const onDelete = vi.fn()
    render(
      <ExpenseRow
        expense={makeExpense({ source_expense_id: 'orig' })}
        onUpdateAmount={vi.fn()}
        onDelete={onDelete}
        onStopRecurring={vi.fn()}
      />,
    )

    // #when
    fireEvent.click(screen.getByRole('button', { name: 'Delete expense' }))

    // #then
    expect({
      deleted: onDelete.mock.calls.length,
      offersFuture: screen.queryByRole('button', { name: 'This & future' }) !== null,
    }).toEqual({ deleted: 0, offersFuture: true })
  })
})

describe('ExpenseRow tags', () => {
  it('links each tag to its lens', () => {
    render(
      <MemoryRouter>
        <ExpenseRow
          expense={makeExpense()}
          onUpdateAmount={vi.fn()}
          onDelete={vi.fn()}
          tags={['japan-trip']}
          tagLinkPrefix="/demo/chaos-goblin"
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '+japan-trip' }).getAttribute('href')).toBe(
      '/demo/chaos-goblin/lens/japan-trip',
    )
  })

  it('removes a tag from its ✕', async () => {
    // #given
    const onRemoveTag = vi.fn().mockResolvedValue(undefined)
    render(
      <MemoryRouter>
        <ExpenseRow
          expense={makeExpense()}
          onUpdateAmount={vi.fn()}
          onDelete={vi.fn()}
          tags={['japan-trip']}
          onRemoveTag={onRemoveTag}
        />
      </MemoryRouter>,
    )

    // #when
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove tag japan-trip' }))
    })

    // #then
    expect(onRemoveTag).toHaveBeenCalledWith('e1', 'japan-trip')
  })

  it('shows no ✕ when tags cannot be removed here', () => {
    render(
      <MemoryRouter>
        <ExpenseRow
          expense={makeExpense()}
          onUpdateAmount={vi.fn()}
          onDelete={vi.fn()}
          tags={['japan-trip']}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /Remove tag/ })).toBeNull()
  })
})
