import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { type ExpenseRow as ExpenseRowType, type CategoryRow } from '../db/queries'
import { AmountDisplay } from './AmountDisplay'
import { Badge } from './Badge'

interface ExpenseRowProps {
  expense: ExpenseRowType
  category?: CategoryRow
  onUpdateAmount: (id: string, amount: number) => Promise<void>
  onUpdateDescription?: (id: string, description: string) => Promise<void>
  onDuplicate?: (expense: ExpenseRowType) => Promise<void>
  onDelete: (id: string) => Promise<void>
  cursored?: boolean
}

// Imperative surface the keyboard cursor drives. Lets the global shortcut layer
// trigger this row's existing edit / 2-tap-delete / duplicate UX without
// duplicating any of it.
export interface ExpenseRowHandle {
  startEdit: () => void
  startConfirmDelete: () => void
  confirmDelete: () => void
  cancelConfirm: () => void
  isConfirming: () => boolean
  duplicate: () => void
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

function dollarsToCents(dollars: string): number | null {
  const parsed = parseFloat(dollars)
  if (isNaN(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

export const ExpenseRow = forwardRef<ExpenseRowHandle, ExpenseRowProps>(function ExpenseRow(
  {
    expense,
    category,
    onUpdateAmount,
    onUpdateDescription,
    onDuplicate,
    onDelete,
    cursored = false,
  },
  ref,
) {
  const [editingAmount, setEditingAmount] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [editDescValue, setEditDescValue] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const descInputRef = useRef<HTMLInputElement>(null)
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

  const startEditingDescription = useCallback(() => {
    setEditDescValue(expense.description ?? '')
    setEditingDescription(true)
    requestAnimationFrame(() => descInputRef.current?.select())
  }, [expense.description])

  const saveDescription = useCallback(async () => {
    setEditingDescription(false)
    const trimmed = editDescValue.trim()
    if (trimmed === (expense.description ?? '')) return
    await onUpdateDescription?.(expense.id, trimmed)
  }, [editDescValue, expense.id, expense.description, onUpdateDescription])

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

  const runDuplicate = useCallback(async () => {
    if (duplicating || !onDuplicate) return
    setDuplicating(true)
    try {
      await onDuplicate(expense)
    } finally {
      setDuplicating(false)
    }
  }, [duplicating, onDuplicate, expense])

  // The keyboard handle is created once and reads the latest callbacks/state
  // through this ref, so the exposed handle identity stays stable.
  const apiRef = useRef({
    startEditing,
    startConfirm,
    confirmDelete,
    cancelConfirm,
    runDuplicate,
    confirming,
  })
  apiRef.current = {
    startEditing,
    startConfirm,
    confirmDelete,
    cancelConfirm,
    runDuplicate,
    confirming,
  }

  useImperativeHandle(
    ref,
    () => ({
      startEdit: () => apiRef.current.startEditing(),
      startConfirmDelete: () => apiRef.current.startConfirm(),
      confirmDelete: () => void apiRef.current.confirmDelete(),
      cancelConfirm: () => apiRef.current.cancelConfirm(),
      isConfirming: () => apiRef.current.confirming,
      duplicate: () => void apiRef.current.runDuplicate(),
    }),
    [],
  )

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
    <div
      data-kbd-item-id={expense.id}
      tabIndex={-1}
      aria-current={cursored ? true : undefined}
      className={`flex items-center justify-between rounded-md border border-border-dim bg-bg-card px-4 py-3 transition-colors hover:border-border-glow ${cursored ? 'kbd-cursor' : ''}`}
    >
      <div className="flex items-center gap-3">
        {category && <Badge label={category.name} color={category.color} />}
        {editingDescription ? (
          <input
            ref={descInputRef}
            type="text"
            value={editDescValue}
            onChange={(e) => setEditDescValue(e.target.value)}
            onBlur={saveDescription}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveDescription()
              if (e.key === 'Escape') setEditingDescription(false)
            }}
            className="w-32 border-b-2 border-neon-cyan bg-transparent text-sm text-text-primary outline-none"
            placeholder="add note"
          />
        ) : (
          <button
            onClick={onUpdateDescription ? startEditingDescription : undefined}
            className={`text-sm ${expense.description ? 'text-text-secondary' : 'text-text-muted/50 italic'} ${onUpdateDescription ? 'cursor-text transition-opacity hover:opacity-70' : ''}`}
            title="Click to edit description"
          >
            {expense.description || 'add note'}
          </button>
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
        {onDuplicate && (
          <button
            onClick={runDuplicate}
            disabled={duplicating}
            className={`transition-colors ${duplicating ? 'text-neon-cyan/50' : 'text-text-muted/60 hover:text-neon-cyan'}`}
            aria-label="Duplicate expense"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect
                x="5"
                y="5"
                width="9"
                height="9"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
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
})
