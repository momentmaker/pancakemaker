import { useEffect, useMemo, useState } from 'react'
import type { NavigateOptions } from 'react-router-dom'
import { useAppState } from './useAppState'
import { useDatabase } from '../db/DatabaseContext'
import { useSync } from '../sync/SyncContext'
import { useCategories } from './useCategories'
import { usePanels } from './usePanels'
import { getRecentExpenses, type RecentExpenseRow } from '../db/queries'
import { navItems } from '../components/nav-items'
import { formatCurrency } from '../lib/format'
import type { CommandItem } from '../lib/command-palette/types'

const RECENT_LIMIT = 50

// The effects the palette can run, injected by the provider so this hook stays
// about data assembly (and is testable with spies).
export interface CommandActions {
  navigate: (to: string, options?: NavigateOptions) => void
  openQuickAdd: () => void
  openCheatsheet: () => void
  syncNow: () => void
  focusExpense: (id: string) => void
  exportCsv: () => void
  exportJson: () => void
}

// Builds the command palette's grouped index from live data — routes, both
// routes' categories and panels, and recent expenses — each carrying a run().
export function useCommandIndex(actions: CommandActions): CommandItem[] {
  const { userId, personalRouteId, businessRouteId } = useAppState()
  const db = useDatabase()
  const { tableVersions } = useSync()
  const expenseVersion = tableVersions['expenses'] ?? 0

  const personalCats = useCategories(personalRouteId)
  const businessCats = useCategories(businessRouteId)
  const personalPanels = usePanels(personalRouteId, false)
  const businessPanels = usePanels(businessRouteId, false)

  const loadPersonalCats = personalCats.load
  const loadBusinessCats = businessCats.load
  const loadPersonalPanels = personalPanels.load
  const loadBusinessPanels = businessPanels.load
  useEffect(() => {
    loadPersonalCats()
    loadBusinessCats()
    loadPersonalPanels()
    loadBusinessPanels()
  }, [loadPersonalCats, loadBusinessCats, loadPersonalPanels, loadBusinessPanels])

  const [recent, setRecent] = useState<RecentExpenseRow[]>([])
  useEffect(() => {
    let cancelled = false
    getRecentExpenses(db, userId, RECENT_LIMIT)
      .then((rows) => {
        if (!cancelled) setRecent(rows)
      })
      // A failed load leaves the recent group empty; the palette stays usable.
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // expenseVersion bumps on any expense mutation (incl. the palette's own
    // "Add expense"), keeping the index fresh rather than a stale snapshot.
  }, [db, userId, expenseVersion])

  return useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    for (const item of navItems) {
      items.push({
        id: `route:${item.to}`,
        group: 'Routes',
        label: item.label,
        matchText: item.label,
        run: () => actions.navigate(item.to),
      })
    }

    const routeCats = [
      { routeType: 'personal' as const, label: 'Personal', cats: personalCats.categories },
      { routeType: 'business' as const, label: 'Business', cats: businessCats.categories },
    ]
    for (const { routeType, label, cats } of routeCats) {
      for (const c of cats) {
        items.push({
          id: `category:${c.id}`,
          group: 'Categories',
          label: c.name,
          sublabel: label,
          matchText: `${c.name} ${label}`,
          run: () => actions.navigate(`/${routeType}/category/${c.id}`),
        })
      }
    }

    const routePanels = [
      { routeType: 'personal' as const, label: 'Personal', panels: personalPanels.panels },
      { routeType: 'business' as const, label: 'Business', panels: businessPanels.panels },
    ]
    for (const { routeType, label, panels } of routePanels) {
      for (const p of panels) {
        items.push({
          id: `panel:${p.id}`,
          group: 'Panels',
          label: p.name,
          sublabel: label,
          matchText: `${p.name} ${label}`,
          run: () => actions.navigate(`/${routeType}/panel/${p.id}`),
        })
      }
    }

    for (const e of recent) {
      const month = e.date.slice(0, 7)
      items.push({
        id: `expense:${e.id}`,
        group: 'Recent expenses',
        label: e.description || '(no note)',
        sublabel: `${e.category_name} · ${formatCurrency(e.amount, e.currency)}`,
        matchText: `${e.description} ${e.category_name} ${(e.amount / 100).toFixed(2)}`,
        run: () => {
          // requestFocus lands the cursor once the detail view's rows register;
          // the month seeds the detail view so the target row is rendered.
          actions.focusExpense(e.id)
          actions.navigate(`/${e.route_type}/category/${e.category_id}`, {
            state: { month },
          })
        },
      })
    }

    items.push({
      id: 'action:add-expense',
      group: 'Actions',
      label: 'Add expense',
      matchText: 'Add expense new',
      run: actions.openQuickAdd,
    })
    items.push({
      id: 'action:export-csv',
      group: 'Actions',
      label: 'Export CSV',
      matchText: 'Export CSV data',
      run: actions.exportCsv,
    })
    items.push({
      id: 'action:export-json',
      group: 'Actions',
      label: 'Export JSON',
      matchText: 'Export JSON data',
      run: actions.exportJson,
    })
    items.push({
      id: 'action:cheatsheet',
      group: 'Actions',
      label: 'Open keyboard cheatsheet',
      matchText: 'Open keyboard cheatsheet shortcuts help',
      run: actions.openCheatsheet,
    })
    items.push({
      id: 'action:sync',
      group: 'Actions',
      label: 'Sync now',
      matchText: 'Sync now refresh',
      run: actions.syncNow,
    })

    return items
  }, [
    actions,
    personalCats.categories,
    businessCats.categories,
    personalPanels.panels,
    businessPanels.panels,
    recent,
  ])
}
