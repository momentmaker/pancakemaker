import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppState } from './useAppState'
import { useDatabase } from '../db/DatabaseContext'
import { useSync } from '../sync/SyncContext'
import { saveNewExpense } from '../db/save-expense'
import { useCategories } from './useCategories'
import { usePanels } from './usePanels'
import { getCaptureHistory, type CategoryRow, type CreateExpenseInput } from '../db/queries'
import { QuickAdd, type QuickAddPrefill } from '../components/QuickAdd'
import { CaptureBar, type UsualChip } from '../components/CaptureBar'
import { CaptureToast, type CaptureToastSummary } from '../components/CaptureToast'
import { decideCapture, parseCaptureLine } from '../lib/keyboard/capture'
import { inferCategoryId, topUsuals, type HistoryEntry } from '../lib/usual'
import { formatCurrency } from '../lib/format'

export type { QuickAddPrefill }

const USUAL_CHIP_LIMIT = 6

function withTags(note: string, tags: readonly string[]): string {
  return [note, ...tags.map((t) => `+${t}`)].filter(Boolean).join(' ')
}

type ExpenseInput = Pick<
  CreateExpenseInput,
  'panelId' | 'categoryId' | 'amount' | 'currency' | 'date' | 'description'
>

export interface CaptureContextValue {
  targetRouteId: string
  targetRouteLabel: string
  categories: CategoryRow[]
  openQuickAdd: (prefill?: QuickAddPrefill) => void
  openCaptureBar: () => void
}

// Exported so tests can provide a stub capture value without the full provider.
export const CaptureContext = createContext<CaptureContextValue | null>(null)

export function CaptureProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { userId, personalRouteId, businessRouteId } = useAppState()
  const db = useDatabase()
  const { markPending, triggerSync, notifyLocalChange, tableVersions } = useSync()
  const expenseVersion = tableVersions['expenses'] ?? 0

  // Target route = the route in the current path, else Personal (Dashboard/Settings).
  const targetRouteType: 'personal' | 'business' = location.pathname.includes('/business')
    ? 'business'
    : 'personal'
  const targetRouteId = targetRouteType === 'business' ? businessRouteId : personalRouteId
  const targetRouteLabel = targetRouteType === 'business' ? 'Business' : 'Personal'

  const { categories, load: loadCategories } = useCategories(targetRouteId)
  const { panels, load: loadPanels } = usePanels(targetRouteId, false)
  useEffect(() => {
    loadCategories()
    loadPanels()
  }, [loadCategories, loadPanels])

  const defaultPanel = useMemo(() => {
    if (panels.length === 0) return undefined
    return (
      panels.find((p) => p.is_default === 1) ??
      [...panels].sort((a, b) => a.sort_order - b.sort_order)[0]
    )
  }, [panels])

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const loadHistory = useCallback(async () => {
    setHistory(await getCaptureHistory(db, targetRouteId))
  }, [db, targetRouteId])
  useEffect(() => {
    loadHistory().catch((err: unknown) => console.error('Failed to load capture history:', err))
  }, [loadHistory, expenseVersion])

  const inferCategory = useCallback(
    (note: string) => {
      const id = inferCategoryId(note, history)
      return id ? categories.find((c) => c.id === id) : undefined
    },
    [history, categories],
  )

  const usuals = useMemo(
    () =>
      topUsuals(history, USUAL_CHIP_LIMIT).filter((u) =>
        categories.some((c) => c.id === u.categoryId),
      ),
    [history, categories],
  )
  const usualChips = useMemo<UsualChip[]>(
    () =>
      usuals.map((u, i) => ({
        key: String(i),
        label: u.description,
        detail: `${formatCurrency(u.amount, u.currency)} · ${categories.find((c) => c.id === u.categoryId)?.name ?? ''}`,
      })),
    [usuals, categories],
  )

  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<QuickAddPrefill | undefined>(undefined)
  const [barOpen, setBarOpen] = useState(false)
  const [toast, setToast] = useState<CaptureToastSummary | null>(null)

  // A prefilled open (`:` hand-off) lands on the category; a blank `a` lands on amount.
  const autoFocusField: 'amount' | 'category' = prefill ? 'category' : 'amount'

  const openQuickAdd = useCallback((next?: QuickAddPrefill) => {
    setPrefill(next)
    setOpen(true)
  }, [])

  const openCaptureBar = useCallback(() => setBarOpen(true), [])
  const dismissToast = useCallback(() => setToast(null), [])
  const submittingRef = useRef(false)

  const handleAdd = useCallback(
    async (data: ExpenseInput) => {
      await saveNewExpense(db, userId, data)
      markPending()
      triggerSync()
      notifyLocalChange(['expenses'])
      await loadHistory()
    },
    [db, userId, markPending, triggerSync, notifyLocalChange, loadHistory],
  )

  const submitCapture = useCallback(
    async (input: string) => {
      // Guard against a second Enter landing while the first create is in flight —
      // without it a fast double-press writes the expense twice.
      if (submittingRef.current) return
      const decision = decideCapture(input, categories, defaultPanel, inferCategory)

      if (decision.kind === 'create') {
        const cents = Math.round(decision.amount * 100)
        submittingRef.current = true
        setBarOpen(false)
        try {
          await handleAdd({
            panelId: decision.panel.id,
            categoryId: decision.category.id,
            amount: cents,
            currency: decision.panel.currency,
            date: new Date().toISOString().slice(0, 10),
            description: withTags(decision.note, decision.tags) || undefined,
          })
          setToast({
            route: targetRouteLabel,
            category: decision.category.name,
            amount: formatCurrency(cents, decision.panel.currency),
          })
        } catch (err) {
          // The one-shot write failed — fall back to the full form so the user can
          // retry rather than losing the capture to an unhandled rejection.
          console.error('Quick capture failed; opening the form to retry', err)
          openQuickAdd({
            amount: String(decision.amount),
            description: decision.note || undefined,
          })
        } finally {
          submittingRef.current = false
        }
        return
      }

      openQuickAdd({
        amount: decision.amount !== null ? String(decision.amount) : undefined,
        description: withTags(decision.note, decision.tags) || undefined,
        categoryHint: decision.categoryToken ?? undefined,
      })
      setBarOpen(false)
    },
    [categories, defaultPanel, inferCategory, handleAdd, openQuickAdd, targetRouteLabel],
  )

  const pickUsual = useCallback(
    async (key: string) => {
      const usual = usuals[Number(key)]
      const category = usual && categories.find((c) => c.id === usual.categoryId)
      if (!usual || !category) return
      setBarOpen(false)
      if (!defaultPanel) {
        openQuickAdd({ amount: String(usual.amount / 100), description: usual.description })
        return
      }
      await handleAdd({
        panelId: defaultPanel.id,
        categoryId: category.id,
        amount: usual.amount,
        currency: defaultPanel.currency,
        date: new Date().toISOString().slice(0, 10),
        description: usual.description,
      })
      setToast({
        route: targetRouteLabel,
        category: category.name,
        amount: formatCurrency(usual.amount, defaultPanel.currency),
      })
    },
    [usuals, categories, defaultPanel, handleAdd, openQuickAdd, targetRouteLabel],
  )

  const openFullForm = useCallback(
    (input: string) => {
      const parsed = parseCaptureLine(input)
      setBarOpen(false)
      openQuickAdd(
        input.trim()
          ? {
              amount: parsed.amount !== null ? String(parsed.amount) : undefined,
              description: withTags(parsed.note, parsed.tags) || undefined,
              categoryHint: parsed.categoryToken ?? undefined,
            }
          : undefined,
      )
    },
    [openQuickAdd],
  )

  // The PWA's "Log expense" home-screen shortcut opens /?capture=1.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('capture') !== '1') return
    params.delete('capture')
    const search = params.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true })
    setBarOpen(true)
  }, [location.pathname, location.search, navigate])

  const value = useMemo<CaptureContextValue>(
    () => ({ targetRouteId, targetRouteLabel, categories, openQuickAdd, openCaptureBar }),
    [targetRouteId, targetRouteLabel, categories, openQuickAdd, openCaptureBar],
  )

  return (
    <CaptureContext.Provider value={value}>
      {children}
      <QuickAdd
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
        panels={panels}
        onAdd={handleAdd}
        personalRouteId={personalRouteId}
        routeLabel={targetRouteLabel}
        autoFocusField={autoFocusField}
        prefill={prefill}
        defaultCategoryId={history[0]?.category_id}
      />
      <CaptureBar
        open={barOpen}
        routeLabel={targetRouteLabel}
        onSubmit={submitCapture}
        onClose={() => setBarOpen(false)}
        usuals={usualChips}
        onPickUsual={pickUsual}
        onMore={openFullForm}
      />
      <CaptureToast summary={toast} onDismiss={dismissToast} />
    </CaptureContext.Provider>
  )
}

export function useCapture(): CaptureContextValue | null {
  return useContext(CaptureContext)
}
