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
import { useLocation } from 'react-router-dom'
import { useAppState } from './useAppState'
import { useDatabase } from '../db/DatabaseContext'
import { useSync } from '../sync/SyncContext'
import { useCategories } from './useCategories'
import { usePanels } from './usePanels'
import {
  createExpense,
  logSyncEntry,
  type CategoryRow,
  type CreateExpenseInput,
} from '../db/queries'
import { QuickAdd, type QuickAddPrefill } from '../components/QuickAdd'
import { CaptureBar } from '../components/CaptureBar'
import { CaptureToast, type CaptureToastSummary } from '../components/CaptureToast'
import { decideCapture } from '../lib/keyboard/capture'
import { formatCurrency } from '../lib/format'

export type { QuickAddPrefill }

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
  const { userId, personalRouteId, businessRouteId } = useAppState()
  const db = useDatabase()
  const { markPending, triggerSync } = useSync()

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
      const expense = await createExpense(db, data)
      await logSyncEntry(
        db,
        userId,
        'expenses',
        expense.id,
        'create',
        expense as unknown as Record<string, unknown>,
      )
      markPending()
      triggerSync()
    },
    [db, userId, markPending, triggerSync],
  )

  const submitCapture = useCallback(
    async (input: string) => {
      // Guard against a second Enter landing while the first create is in flight —
      // without it a fast double-press writes the expense twice.
      if (submittingRef.current) return
      const decision = decideCapture(input, categories, defaultPanel)

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
            description: decision.note || undefined,
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
        description: decision.note || undefined,
        categoryHint: decision.categoryToken ?? undefined,
      })
      setBarOpen(false)
    },
    [categories, defaultPanel, handleAdd, openQuickAdd, targetRouteLabel],
  )

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
      />
      <CaptureBar
        open={barOpen}
        routeLabel={targetRouteLabel}
        onSubmit={submitCapture}
        onClose={() => setBarOpen(false)}
      />
      <CaptureToast summary={toast} onDismiss={dismissToast} />
    </CaptureContext.Provider>
  )
}

export function useCapture(): CaptureContextValue | null {
  return useContext(CaptureContext)
}
