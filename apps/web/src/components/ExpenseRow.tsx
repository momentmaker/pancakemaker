import { useState, useRef, useEffect, useCallback } from 'react'
import { type ExpenseRow as ExpenseRowType, type CategoryRow } from '../db/queries'
import { AmountDisplay } from './AmountDisplay'
import { Badge } from './Badge'

interface ExpenseRowProps {
  expense: ExpenseRowType
  category?: CategoryRow
  onUpdateAmount: (id: string, amount: number) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

function dollarsToCents(dollars: string): number | null {
  const parsed = parseFloat(dollars)
  if (isNaN(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

export function ExpenseRow({ expense, category, onUpdateAmount, onDelete }: ExpenseRowProps) {
  const [editingAmount, setEditingAmount] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const confirmRef = useRef<HTMLDivElement>(null)

  const startEditing = useCallback(() => {
    setEditValue(centsToDollars(expense.amount))
    setEditingAmount(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [expense.amount])

  const saveAmount = useCallback(async () => {
    setEditingAmount(false)
    const cents = dollarsToCents(editValue)
    if (cents === null || cents === expense.amount) return
    await onUpdateAmount(expense.id, cents)
  }, [editValue, expense.id, expense.amount, onUpdateAmount])

  const startConfirm = useCallback(() => {
    setConfirming(true)
    confirmTimerRef.current = setTimeout(() => setConfirming(false), 3000)
  }, [])

  const cancelConfirm = useCallback(() => {
    setConfirming(false)
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    setConfirming(false)
    await onDelete(expense.id)
  }, [expense.id, onDelete])

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!confirming) return
    function handleClick(e: MouseEvent) {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        cancelConfirm()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [confirming, cancelConfirm])

  return (
    <div className="flex items-center justify-between rounded-md border border-border-dim bg-bg-card px-4 py-3 transition-colors hover:border-border-glow">
      <div className="flex items-center gap-3">
        {category && <Badge label={category.name} color={category.color} />}
        {expense.description && (
          <span className="text-sm text-text-secondary">{expense.description}</span>
        )}
        {expense.source_expense_id && (
          <span className="text-xs text-text-muted" title="Recurring">
            ↻
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {editingAmount ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveAmount}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveAmount()
              if (e.key === 'Escape') setEditingAmount(false)
            }}
            className="w-24 border-b-2 border-neon-cyan bg-transparent text-right font-mono text-base font-semibold text-text-primary outline-none"
          />
        ) : (
          <button
            onClick={startEditing}
            className="cursor-text transition-opacity hover:opacity-70"
            title="Click to edit amount"
          >
            <AmountDisplay amount={expense.amount} currency={expense.currency} size="sm" />
          </button>
        )}
        {confirming ? (
          <div ref={confirmRef} className="flex items-center gap-1.5">
            <span className="text-xs text-red-400">Delete?</span>
            <button
              onClick={confirmDelete}
              className="rounded px-1.5 py-0.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-400/15"
            >
              Yes
            </button>
            <button
              onClick={cancelConfirm}
              className="rounded px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:bg-bg-elevated"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={startConfirm}
            className="text-red-400/60 transition-colors hover:text-red-400"
            aria-label="Delete expense"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
