import { useEffect, useState, useCallback, useMemo } from 'react'
import { type RouteType, SUPPORTED_CURRENCIES } from '@pancakemaker/shared'
import { useAppState } from '../hooks/useAppState'
import { usePanels } from '../hooks/usePanels'
import { useCategories } from '../hooks/useCategories'
import { useExchangeRates } from '../hooks/useExchangeRates'
import { useDatabase } from '../db/DatabaseContext'
import { useSync } from '../sync/SyncContext'
import {
  getCategoryTotalsByCurrency,
  getPanelsByRoute,
  createExpense,
  logSyncEntry,
  type CategoryCurrencyTotal,
  type ExpenseRow,
  type PanelRow,
  type CreateExpenseInput,
} from '../db/queries'
import { PanelCard } from '../components/PanelCard'
import { CategoryCard } from '../components/CategoryCard'
import { MonthPicker } from '../components/MonthPicker'
import { QuickAdd } from '../components/QuickAdd'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Toggle } from '../components/Toggle'
import { Modal } from '../components/Modal'
import { FormInput, FormSelect } from '../components/FormInput'

interface RouteViewProps {
  type: RouteType
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function RouteView({ type }: RouteViewProps) {
  const label = type.charAt(0).toUpperCase() + type.slice(1)
  const { userId, personalRouteId, businessRouteId, baseCurrency } = useAppState()
  const routeId = type === 'personal' ? personalRouteId : businessRouteId
  const db = useDatabase()
  const { dataVersion } = useSync()

  const [activeTab, setActiveTab] = useState<'categories' | 'panels'>('categories')
  const [month, setMonth] = useState(currentMonth)
  const [showArchived, setShowArchived] = useState(false)

  const {
    panels,
    loading: panelsLoading,
    load: loadPanels,
    add: addPanel,
  } = usePanels(routeId, showArchived)
  const { categories, loading: categoriesLoading, load: loadCategories } = useCategories(routeId)
  const [categoryTotals, setCategoryTotals] = useState<CategoryCurrencyTotal[]>([])
  const [panelTotals, setPanelTotals] = useState<Record<string, { count: number; total: number }>>(
    {},
  )

  const [allPanels, setAllPanels] = useState<PanelRow[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [newPanelName, setNewPanelName] = useState('')
  const [newPanelCurrency, setNewPanelCurrency] = useState(baseCurrency)
  const [newPanelRecurrence, setNewPanelRecurrence] = useState<'none' | 'monthly' | 'annual'>(
    'none',
  )

  useEffect(() => {
    loadPanels()
    loadCategories()
  }, [loadPanels, loadCategories])

  useEffect(() => {
    async function loadAllPanels() {
      const rows = await getPanelsByRoute(db, routeId)
      setAllPanels(rows)
    }
    loadAllPanels()
  }, [db, routeId, dataVersion])

  const { convert } = useExchangeRates(baseCurrency)

  useEffect(() => {
    async function loadCategoryTotals() {
      const totals = await getCategoryTotalsByCurrency(db, routeId, month)
      setCategoryTotals(totals)
    }
    loadCategoryTotals()
  }, [db, routeId, month, dataVersion])

  useEffect(() => {
    async function loadPanelTotals() {
      const totals: Record<string, { count: number; total: number }> = {}
      for (const panel of panels) {
        const rows = await db.query<ExpenseRow>(
          'SELECT amount FROM expenses WHERE panel_id = ? AND deleted_at IS NULL',
          [panel.id],
        )
        totals[panel.id] = {
          count: rows.length,
          total: rows.reduce((sum, r) => sum + r.amount, 0),
        }
      }
      setPanelTotals(totals)
    }
    if (panels.length > 0) loadPanelTotals()
  }, [panels, db])

  const handleAddExpense = useCallback(
    async (input: CreateExpenseInput) => {
      const expense = await createExpense(db, input)
      await logSyncEntry(
        db,
        userId,
        'expenses',
        expense.id,
        'create',
        expense as unknown as Record<string, unknown>,
      )
      const totals = await getCategoryTotalsByCurrency(db, routeId, month)
      setCategoryTotals(totals)
      setShowQuickAdd(false)
    },
    [db, userId, routeId, month],
  )

  const defaultPanel = allPanels.find((p) => p.is_default === 1) ?? allPanels[0]

  const handleAddPanel = useCallback(async () => {
    if (!newPanelName.trim()) return
    const recurrence = newPanelRecurrence === 'none' ? null : newPanelRecurrence
    await addPanel(newPanelName.trim(), newPanelCurrency, panels.length, recurrence)
    setNewPanelName('')
    setNewPanelCurrency(baseCurrency)
    setNewPanelRecurrence('none')
    setShowAdd(false)
  }, [addPanel, newPanelName, newPanelCurrency, newPanelRecurrence, baseCurrency, panels.length])

  const loading = activeTab === 'categories' ? categoriesLoading : panelsLoading

  return (
    <div>
      <h1 className="font-mono text-2xl font-bold text-neon-cyan">{label}</h1>

      <div className="mt-4 flex items-center gap-1 border-b border-border-dim">
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 font-mono text-sm transition-colors ${
            activeTab === 'categories'
              ? 'border-b-2 border-neon-cyan text-neon-cyan'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Categories
        </button>
        <button
          onClick={() => setActiveTab('panels')}
          className={`px-4 py-2 font-mono text-sm transition-colors ${
            activeTab === 'panels'
              ? 'border-b-2 border-neon-cyan text-neon-cyan'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Panels
        </button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        </div>
      ) : activeTab === 'categories' ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <MonthPicker month={month} onChange={setMonth} />
            <Button variant="secondary" onClick={() => setShowQuickAdd(true)}>
              +<span className="hidden sm:inline"> Add Expense</span>
            </Button>
          </div>

          {categories.length === 0 ? (
            <div className="mt-8">
              <EmptyState message={`No ${type} categories yet`} />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => {
                const rows = categoryTotals.filter((t) => t.category_id === cat.id)
                const total = rows.reduce((sum, r) => sum + convert(r.total, r.currency), 0)
                const count = rows.reduce((sum, r) => sum + r.count, 0)
                return (
                  <CategoryCard
                    key={cat.id}
                    id={cat.id}
                    name={cat.name}
                    color={cat.color}
                    total={total}
                    count={count}
                    currency={baseCurrency}
                    routeType={type}
                  />
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <Toggle checked={showArchived} onChange={setShowArchived} label="Show archived" />
            <Button variant="secondary" onClick={() => setShowAdd(true)}>
              + New Panel
            </Button>
          </div>

          {panels.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                message={`No ${type} panels yet`}
                action="Create your first panel"
                onAction={() => setShowAdd(true)}
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {panels.map((panel) => (
                <PanelCard
                  key={panel.id}
                  id={panel.id}
                  name={panel.name}
                  currency={panel.currency}
                  routeType={type}
                  expenseCount={panelTotals[panel.id]?.count ?? 0}
                  total={panelTotals[panel.id]?.total ?? 0}
                  isDefault={panel.is_default === 1}
                  isArchived={panel.is_archived === 1}
                  recurrenceType={panel.recurrence_type}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <QuickAdd
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        categories={categories}
        panels={allPanels}
        defaultPanelId={defaultPanel?.id}
        onAdd={handleAddExpense}
      />

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Panel">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleAddPanel()
          }}
        >
          <FormInput
            label="Panel Name"
            value={newPanelName}
            onChange={(e) => setNewPanelName(e.target.value)}
            placeholder="e.g. Japan Trip"
            autoFocus
          />
          <div className="mt-3">
            <FormSelect
              label="Currency"
              value={newPanelCurrency}
              onChange={setNewPanelCurrency}
              options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div className="mt-3">
            <FormSelect
              label="Recurrence"
              value={newPanelRecurrence}
              onChange={(v) => setNewPanelRecurrence(v as 'none' | 'monthly' | 'annual')}
              options={[
                { value: 'none', label: 'One-time (no recurrence)' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'annual', label: 'Annual' },
              ]}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!newPanelName.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
