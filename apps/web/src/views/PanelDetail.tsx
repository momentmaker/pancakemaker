import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom'
import { useDatabase } from '../db/DatabaseContext'
import { useAppState } from '../hooks/useAppState'
import { useExpenses } from '../hooks/useExpenses'
import { useCategories } from '../hooks/useCategories'
import {
  updatePanel,
  deletePanel,
  getPanelsByRoute,
  getPanelMonthlyTrend,
  logSyncEntry,
  type PanelRow,
  type CategoryRow,
  type MonthlyTotal,
} from '../db/queries'
import { AmountDisplay } from '../components/AmountDisplay'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ExpenseRow } from '../components/ExpenseRow'
import { EmptyState } from '../components/EmptyState'
import { MonthPicker } from '../components/MonthPicker'
import { QuickAdd } from '../components/QuickAdd'
import { SparkBars } from '../components/SparkBars'
import { Modal } from '../components/Modal'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short' })
}

export function PanelDetail() {
  const { panelId } = useParams<{ panelId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const routeType = location.pathname.startsWith('/business/') ? 'business' : 'personal'
  const { userId, personalRouteId, businessRouteId } = useAppState()
  const routeId = routeType === 'personal' ? personalRouteId : businessRouteId
  const db = useDatabase()

  const [panel, setPanel] = useState<PanelRow | null>(null)
  const [month, setMonth] = useState(currentMonth)
  const [trend, setTrend] = useState<MonthlyTotal[]>([])
  const { expenses, loading, load, add, update, remove } = useExpenses({ panelId: panelId!, month })
  const { categories, load: loadCategories } = useCategories(routeId)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [otherPanelsExist, setOtherPanelsExist] = useState(false)

  useEffect(() => {
    async function loadPanel() {
      const rows = await db.query<PanelRow>('SELECT * FROM panels WHERE id = ?', [panelId!])
      if (rows[0]) setPanel(rows[0])
    }
    loadPanel()
    loadCategories()
  }, [panelId, db, loadCategories])

  useEffect(() => {
    load()
    getPanelMonthlyTrend(db, panelId!, month).then(setTrend)
  }, [db, panelId, month, load])

  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryRow>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, typeof expenses>()
    for (const expense of expenses) {
      const existing = groups.get(expense.date) ?? []
      existing.push(expense)
      groups.set(expense.date, existing)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [expenses])

  const total = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses])

  const sparkData = useMemo(
    () => trend.map((t) => ({ label: monthLabel(t.month), value: t.total })),
    [trend],
  )

  const handleAdd = useCallback(
    async (data: Parameters<typeof add>[0]) => {
      await add(data)
      getPanelMonthlyTrend(db, panelId!, month).then(setTrend)
    },
    [add, db, panelId, month],
  )

  const handleUpdateAmount = useCallback(
    async (id: string, amount: number) => {
      await update(id, { amount })
      getPanelMonthlyTrend(db, panelId!, month).then(setTrend)
    },
    [update, db, panelId, month],
  )

  const handleRemove = useCallback(
    async (id: string) => {
      await remove(id)
      getPanelMonthlyTrend(db, panelId!, month).then(setTrend)
    },
    [remove, db, panelId, month],
  )

  const startEditing = useCallback(() => {
    if (!panel) return
    setEditName(panel.name)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [panel])

  const saveName = useCallback(async () => {
    if (!panel || !editName.trim() || editName.trim() === panel.name) {
      setEditing(false)
      return
    }
    const updated = await updatePanel(db, panel.id, { name: editName.trim() })
    if (updated) {
      setPanel(updated)
      await logSyncEntry(db, userId, 'panels', panel.id, 'update', { name: editName.trim() })
    }
    setEditing(false)
  }, [db, userId, panel, editName])

  const handleSetDefault = useCallback(async () => {
    if (!panel || panel.is_default === 1) return
    await db.transaction(async () => {
      await db.execute('UPDATE panels SET is_default = 0, updated_at = ? WHERE route_id = ?', [
        new Date().toISOString(),
        routeId,
      ])
      await db.execute('UPDATE panels SET is_default = 1, updated_at = ? WHERE id = ?', [
        new Date().toISOString(),
        panel.id,
      ])
    })
    setPanel((prev) => (prev ? { ...prev, is_default: 1 } : prev))
    await logSyncEntry(db, userId, 'panels', panel.id, 'update', { is_default: 1 })
  }, [db, userId, panel, routeId])

  const handleArchiveToggle = useCallback(async () => {
    if (!panel) return
    const newValue = panel.is_archived === 1 ? 0 : 1
    const updated = await updatePanel(db, panel.id, { is_archived: newValue })
    if (updated) {
      setPanel(updated)
      await logSyncEntry(db, userId, 'panels', panel.id, 'update', { is_archived: newValue })
    }
  }, [db, userId, panel])

  const handleOpenDelete = useCallback(async () => {
    const allPanels = await getPanelsByRoute(db, routeId, true)
    setOtherPanelsExist(allPanels.filter((p) => p.id !== panelId).length > 0)
    setShowDeleteModal(true)
  }, [db, routeId, panelId])

  const handleDelete = useCallback(
    async (keepExpenses: boolean) => {
      if (!panel) return
      if (keepExpenses) {
        const allPanels = await getPanelsByRoute(db, routeId, true)
        const target =
          allPanels.find((p) => p.is_default === 1 && p.id !== panel.id) ??
          allPanels.find((p) => p.id !== panel.id)
        if (target) {
          await deletePanel(db, panel.id, target.id)
        }
      } else {
        await deletePanel(db, panel.id)
      }
      await logSyncEntry(db, userId, 'panels', panel.id, 'delete', { id: panel.id })
      setShowDeleteModal(false)
      navigate(`/${routeType}`)
    },
    [db, userId, panel, routeId, routeType, navigate],
  )

  if (!panel) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
      </div>
    )
  }

  const routeLabel = routeType.charAt(0).toUpperCase() + routeType.slice(1)
  const isDefault = panel.is_default === 1
  const isArchived = panel.is_archived === 1

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Link to={`/${routeType}`} className="transition-colors hover:text-neon-cyan">
          {routeLabel}
        </Link>
        <span>/</span>
        <span className="text-text-primary">{panel.name}</span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="border-b-2 border-neon-cyan bg-transparent font-mono text-2xl font-bold text-neon-cyan outline-none"
            />
          ) : (
            <h1
              onClick={startEditing}
              className="cursor-text font-mono text-2xl font-bold text-neon-cyan transition-opacity hover:opacity-80"
              title="Click to rename"
            >
              {panel.name}
            </h1>
          )}
          <div className="mt-1 flex items-center gap-3">
            <AmountDisplay amount={total} currency={panel.currency} size="md" />
            <span className="text-xs text-text-muted">
              {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
            </span>
            {isDefault && (
              <span className="rounded bg-neon-cyan/15 px-1.5 py-0.5 text-[10px] font-medium text-neon-cyan">
                Default
              </span>
            )}
            {panel.recurrence_type && (
              <span className="rounded bg-neon-violet/15 px-1.5 py-0.5 text-[10px] font-medium text-neon-violet">
                {panel.recurrence_type === 'monthly' ? 'Monthly' : 'Annual'}
              </span>
            )}
            {isArchived && (
              <span className="rounded bg-text-muted/15 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                Archived
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowQuickAdd(true)}>+ Add</Button>
          <div className="relative">
            <PanelActions
              isDefault={isDefault}
              isArchived={isArchived}
              onSetDefault={handleSetDefault}
              onArchiveToggle={handleArchiveToggle}
              onDelete={handleOpenDelete}
            />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {sparkData.length > 0 && (
        <div className="mt-4">
          <SparkBars data={sparkData} color="#00ffcc" currency={panel.currency} highlightLast />
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
          </div>
        ) : expenses.length === 0 ? (
          <EmptyState
            message="No expenses in this panel yet"
            action="Add your first expense"
            onAction={() => setShowQuickAdd(true)}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groupedByDate.map(([date, dateExpenses]) => (
              <div key={date}>
                <h3 className="mb-2 font-mono text-xs font-medium text-text-muted">
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h3>
                <div className="flex flex-col gap-1">
                  {dateExpenses.map((expense) => (
                    <ExpenseRow
                      key={expense.id}
                      expense={expense}
                      category={categoryMap.get(expense.category_id)}
                      onUpdateAmount={handleUpdateAmount}
                      onDelete={handleRemove}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowQuickAdd(true)}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-neon-cyan text-bg-primary shadow-lg shadow-neon-cyan/20 transition-transform hover:scale-105 active:scale-95 sm:hidden"
        aria-label="Add expense"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <QuickAdd
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        panelId={panelId!}
        currency={panel.currency}
        categories={categories}
        onAdd={handleAdd}
      />

      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Panel">
        <p className="text-sm text-text-secondary">
          Delete <span className="font-medium text-text-primary">{panel.name}</span>?
        </p>
        {expenses.length > 0 && (
          <p className="mt-2 text-xs text-text-muted">
            This panel has {expenses.length} expense(s).
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {otherPanelsExist && (
            <Button variant="secondary" onClick={() => handleDelete(true)}>
              Delete panel only (move expenses to default)
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => handleDelete(false)}
            className="text-red-400 hover:text-red-300"
          >
            Delete panel and all expenses
          </Button>
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function PanelActions({
  isDefault,
  isArchived,
  onSetDefault,
  onArchiveToggle,
  onDelete,
}: {
  isDefault: boolean
  isArchived: boolean
  onSetDefault: () => void
  onArchiveToggle: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md border border-border-dim px-2 py-1.5 text-text-muted transition-colors hover:border-border-glow hover:text-text-secondary"
        aria-label="Panel actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-md border border-border-dim bg-bg-card py-1 shadow-lg">
          {!isDefault && (
            <button
              onClick={() => {
                onSetDefault()
                setOpen(false)
              }}
              className="flex w-full px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-neon-cyan"
            >
              Set as default
            </button>
          )}
          <button
            onClick={() => {
              onArchiveToggle()
              setOpen(false)
            }}
            className="flex w-full px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            {isArchived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            onClick={() => {
              onDelete()
              setOpen(false)
            }}
            className="flex w-full px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-bg-elevated hover:text-red-300"
          >
            Delete panel
          </button>
        </div>
      )}
    </div>
  )
}
