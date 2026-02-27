import { useState, useCallback, useEffect, useRef } from 'react'
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
  defaultPanelId?: string
  lockedCategoryId?: string
}

export function QuickAdd({
  open,
  onClose,
  categories,
  onAdd,
  panelId: fixedPanelId,
  currency: fixedCurrency,
  panels,
  defaultPanelId,
  lockedCategoryId,
}: QuickAddProps) {
  const initialPanelId = fixedPanelId ?? defaultPanelId ?? panels?.[0]?.id ?? ''
  const initialCategoryId = lockedCategoryId ?? categories[0]?.id ?? ''

  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [selectedPanelId, setSelectedPanelId] = useState(initialPanelId)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const prevOpen = useRef(false)
  useEffect(() => {
    if (open && !prevOpen.current) {
      setAmount('')
      setCategoryId(lockedCategoryId ?? categories[0]?.id ?? '')
      setSelectedPanelId(fixedPanelId ?? defaultPanelId ?? panels?.[0]?.id ?? '')
      setDate(new Date().toISOString().slice(0, 10))
      setDescription('')
      setShowMore(false)
    }
    prevOpen.current = open
  }, [open, categories, panels, fixedPanelId, defaultPanelId, lockedCategoryId])

  const resolvedPanelId = fixedPanelId ?? selectedPanelId
  const selectedPanel = panels?.find((p) => p.id === resolvedPanelId)
  const resolvedCurrency = fixedCurrency ?? selectedPanel?.currency ?? 'USD'
  const showPanelPicker = !fixedPanelId && panels && panels.length > 0

  const reset = useCallback(() => {
    setAmount('')
    setCategoryId(lockedCategoryId ?? categories[0]?.id ?? '')
    setSelectedPanelId(fixedPanelId ?? defaultPanelId ?? panels?.[0]?.id ?? '')
    setDate(new Date().toISOString().slice(0, 10))
    setDescription('')
    setShowMore(false)
  }, [categories, fixedPanelId, defaultPanelId, panels, lockedCategoryId])

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

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const panelOptions =
    panels?.map((p) => ({ value: p.id, label: `${p.name} (${p.currency})` })) ?? []

  return (
    <Modal open={open} onClose={onClose} title="Add Expense">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormInput
          label="Amount"
          type="number"
          step="0.01"
          min="0.01"
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

        {showPanelPicker && (
          <FormSelect
            label="Panel"
            value={selectedPanelId}
            onChange={setSelectedPanelId}
            options={panelOptions}
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
          <Button type="submit" disabled={submitting || !amount || !categoryId}>
            {submitting ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
