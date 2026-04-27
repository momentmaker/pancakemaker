import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { FormInput, FormSelect } from './FormInput'
import type { CategoryRow, PanelRow } from '../db/queries'

interface QuickAddProps {
  open: boolean
  onClose: () => void
  categories: CategoryRow[]
  onAdd: (data: {
    panelId: string
    categoryId: string
    amount: number
    currency: string
    date: string
    description?: string
  }) => Promise<void>
  panelId?: string
  currency?: string
  panels?: PanelRow[]
  lockedCategoryId?: string
  personalRouteId?: string
}

function pickDefaultPanel(panels: PanelRow[] | undefined, routeId: string): PanelRow | undefined {
  if (!panels) return undefined
  let fallback: PanelRow | undefined
  for (const p of panels) {
    if (p.route_id !== routeId || p.is_archived !== 0) continue
    if (p.is_default === 1) return p
    if (!fallback || p.sort_order < fallback.sort_order) fallback = p
  }
  return fallback
}

export function QuickAdd({
  open,
  onClose,
  categories,
  onAdd,
  panelId: fixedPanelId,
  currency: fixedCurrency,
  panels,
  lockedCategoryId,
  personalRouteId,
}: QuickAddProps) {
  const initialCategoryId = lockedCategoryId ?? categories[0]?.id ?? ''

  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const prevOpen = useRef(false)
  useEffect(() => {
    if (open && !prevOpen.current) {
      setAmount('')
      setCategoryId(lockedCategoryId ?? categories[0]?.id ?? '')
      setDate(new Date().toISOString().slice(0, 10))
      setDescription('')
      setShowMore(false)
    }
    prevOpen.current = open
  }, [open, categories, lockedCategoryId])

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  )

  const derivedPanel = useMemo(() => {
    if (fixedPanelId) return panels?.find((p) => p.id === fixedPanelId)
    if (!selectedCategory) return undefined
    return pickDefaultPanel(panels, selectedCategory.route_id)
  }, [fixedPanelId, panels, selectedCategory])

  const resolvedPanelId = fixedPanelId ?? derivedPanel?.id ?? ''
  const resolvedCurrency = fixedCurrency ?? derivedPanel?.currency ?? 'USD'

  const showRouteMarkers = useMemo(() => {
    if (!personalRouteId) return false
    const routeIds = new Set(categories.map((c) => c.route_id))
    return routeIds.size > 1
  }, [categories, personalRouteId])

  const reset = useCallback(() => {
    setAmount('')
    setCategoryId(lockedCategoryId ?? categories[0]?.id ?? '')
    setDate(new Date().toISOString().slice(0, 10))
    setDescription('')
    setShowMore(false)
  }, [categories, lockedCategoryId])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const cents = Math.round(parseFloat(amount) * 100)
      if (isNaN(cents) || cents <= 0 || !categoryId || !resolvedPanelId) return

      setSubmitting(true)
      try {
        await onAdd({
          panelId: resolvedPanelId,
          categoryId,
          amount: cents,
          currency: resolvedCurrency,
          date,
          description: description || undefined,
        })
        reset()
        onClose()
      } finally {
        setSubmitting(false)
      }
    },
    [
      amount,
      categoryId,
      resolvedPanelId,
      resolvedCurrency,
      date,
      description,
      onAdd,
      onClose,
      reset,
    ],
  )

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.name,
    meta: showRouteMarkers ? (c.route_id === personalRouteId ? 'p' : 'b') : undefined,
  }))

  return (
    <Modal open={open} onClose={onClose} title="Add Expense">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormInput
          label="Amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          mono
          autoFocus
        />

        {lockedCategoryId ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Category</label>
            <div className="rounded-md border border-border-dim bg-bg-elevated px-3 py-2 text-sm text-text-secondary">
              {categories.find((c) => c.id === lockedCategoryId)?.name ?? 'Unknown'}
            </div>
          </div>
        ) : (
          <FormSelect
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={categoryOptions}
          />
        )}

        <FormInput
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        {!showMore && (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="self-start text-xs text-text-muted transition-colors hover:text-neon-cyan"
          >
            + More details
          </button>
        )}

        {showMore && (
          <FormInput
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional note"
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !amount || !categoryId || !resolvedPanelId}>
            {submitting ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
