import { createRef } from 'react'
import { render, screen, act, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ExpenseRow, type ExpenseRowHandle } from './ExpenseRow.js'
import type { ExpenseRow as ExpenseRowType } from '../db/queries'

afterEach(cleanup)

function makeExpense(): ExpenseRowType {
  return {
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
