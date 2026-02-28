import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import type { Database } from '../db/interface.js'
import { DatabaseProvider } from '../db/DatabaseContext.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData, seedRoutesForUser } from '../db/seed.js'
import { clearSyncCursor } from '../sync/api-client.js'
import { getRoutesByUser, getPanelsByRoute, createPanel } from '../db/queries.js'
import { generateRecurringExpenses } from '../db/recurring-generator.js'

export interface AppState {
  userId: string
  personalRouteId: string
  businessRouteId: string
  baseCurrency: string
}

export const AppStateContext = createContext<AppState | null>(null)

interface AppProviderProps {
  createDatabase: () => Promise<Database>
  children: ReactNode
}

let sharedDb: Database | null = null
let initPromise: Promise<{ db: Database; state: AppState }> | null = null

export function AppProvider({ createDatabase, children }: AppProviderProps) {
  const [db, setDb] = useState<Database | null>(null)
  const [appState, setAppState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true

    async function init() {
      if (!initPromise) {
        initPromise = (async () => {
          const database = sharedDb ?? (await createDatabase())
          sharedDb = database

          await runMigrations(database)
          await generateRecurringExpenses(database)

          const users = await database.query<{ id: string; base_currency: string }>(
            'SELECT id, base_currency FROM users LIMIT 1',
          )

          let userId: string
          let baseCurrency: string

          if (users.length === 0) {
            const seed = await seedDefaultData(database, 'local@pancakemaker.app')
            userId = seed.userId
            baseCurrency = 'USD'
          } else {
            userId = users[0].id
            baseCurrency = users[0].base_currency
          }

          let routes = await getRoutesByUser(database, userId)
          let personalRoute = routes.find((r) => r.type === 'personal')
          let businessRoute = routes.find((r) => r.type === 'business')

          if (!personalRoute || !businessRoute) {
            clearSyncCursor()
            await seedRoutesForUser(database, userId, baseCurrency)
            routes = await getRoutesByUser(database, userId)
            personalRoute = routes.find((r) => r.type === 'personal')
            businessRoute = routes.find((r) => r.type === 'business')
          }

          if (!personalRoute || !businessRoute) {
            throw new Error('Missing personal or business route')
          }

          for (const route of [personalRoute, businessRoute]) {
            const panels = await getPanelsByRoute(database, route.id, true)
            const hasRecurring = panels.some((p) => p.recurrence_type !== null)
            if (!hasRecurring && panels.length > 0) {
              await createPanel(
                database,
                route.id,
                'Monthly',
                baseCurrency,
                panels.length,
                'monthly',
              )
              await createPanel(
                database,
                route.id,
                'Annual',
                baseCurrency,
                panels.length + 1,
                'annual',
              )
            }
            if (panels.length === 0) {
              await createPanel(database, route.id, 'Daily', baseCurrency, 0, null, true)
              await createPanel(database, route.id, 'Monthly', baseCurrency, 1, 'monthly')
              await createPanel(database, route.id, 'Annual', baseCurrency, 2, 'annual')
            }
          }

          return {
            db: database,
            state: {
              userId,
              personalRouteId: personalRoute.id,
              businessRouteId: businessRoute.id,
              baseCurrency,
            },
          }
        })()
      }

      try {
        const result = await initPromise
        if (mounted.current) {
          setDb(result.db)
          setAppState(result.state)
        }
      } catch (err) {
        initPromise = null
        sharedDb = null
        if (mounted.current) {
          setError(err instanceof Error ? err.message : 'Failed to initialize database')
        }
      }
    }

    init()
    return () => {
      mounted.current = false
    }
  }, [createDatabase, retryCount])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-red-500/30 bg-bg-card p-6 text-center">
          <p className="font-mono text-sm text-red-400">{error}</p>
          <button
            onClick={() => {
              setError(null)
              setRetryCount((c) => c + 1)
            }}
            className="rounded bg-neon-cyan px-4 py-2 font-mono text-sm font-medium text-bg-primary transition-opacity hover:opacity-80"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!db || !appState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
          <p className="font-mono text-sm text-text-muted">loading pancakemaker...</p>
        </div>
      </div>
    )
  }

  return (
    <DatabaseProvider database={db}>
      <AppStateContext.Provider value={appState}>{children}</AppStateContext.Provider>
    </DatabaseProvider>
  )
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext)
  if (!state) throw new Error('useAppState must be used inside <AppProvider>')
  return state
}
