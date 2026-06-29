import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useAppState } from './useAppState'
import { useDatabase } from '../db/DatabaseContext'
import { useSync } from '../sync/SyncContext'
import { useCategories } from './useCategories'
import { usePanels } from './usePanels'
import { createExpense, logSyncEntry, type CategoryRow } from '../db/queries'
import { QuickAdd } from '../components/QuickAdd'

export interface QuickAddPrefill {
  amount?: string
  description?: string
  categoryHint?: string
}

interface ExpenseInput {
  panelId: string
  categoryId: string
  amount: number
  currency: string
  date: string
  description?: string
}

export interface CaptureContextValue {
  targetRouteId: string
  targetRouteLabel: string
  categories: CategoryRow[]
  openQuickAdd: (prefill?: QuickAddPrefill) => void
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

  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<QuickAddPrefill | undefined>(undefined)
  const [autoFocusField, setAutoFocusField] = useState<'amount' | 'category'>('amount')

  const openQuickAdd = useCallback((next?: QuickAddPrefill) => {
    setPrefill(next)
    // A prefilled open (`:` hand-off) lands on the category; a blank `a` lands on amount.
    setAutoFocusField(next ? 'category' : 'amount')
    setOpen(true)
  }, [])

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

  const value = useMemo<CaptureContextValue>(
    () => ({ targetRouteId, targetRouteLabel, categories, openQuickAdd }),
    [targetRouteId, targetRouteLabel, categories, openQuickAdd],
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
    </CaptureContext.Provider>
  )
}

export function useCapture(): CaptureContextValue | null {
  return useContext(CaptureContext)
}
