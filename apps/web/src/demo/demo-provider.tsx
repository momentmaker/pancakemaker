import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import type { Database } from '../db/interface.js'
import { DatabaseProvider } from '../db/DatabaseContext.js'
import { AppStateContext, type AppState } from '../hooks/useAppState.js'
import { SyncContext } from '../sync/SyncContext.js'
import { createInMemoryDatabase } from '../db/wa-sqlite-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDemoData } from './demo-seed.js'
import { PERSONAS } from './demo-personas.js'
import { DemoContext, type DemoPersonaInfo } from './demo-context.js'

const noopSync = async (): Promise<void> => {}

export function DemoSyncProvider({ children }: { children: ReactNode }) {
  const [dataVersion, setDataVersion] = useState(0)
  const [tableVersions, setTableVersions] = useState<Record<string, number>>({})
  const notifyLocalChange = useCallback((tables: Iterable<string>) => {
    setDataVersion((v) => v + 1)
    setTableVersions((prev) => {
      const next = { ...prev }
      for (const t of tables) next[t] = (next[t] ?? 0) + 1
      return next
    })
  }, [])

  return (
    <SyncContext.Provider
      value={{
        status: 'local',
        triggerSync: noopSync,
        forceSync: noopSync,
        markPending: () => {},
        notifyLocalChange,
        dataVersion,
        tableVersions,
      }}
    >
      {children}
    </SyncContext.Provider>
  )
}

interface DemoAppProviderProps {
  personaSlug: string
  children: ReactNode
}

export function DemoAppProvider({ personaSlug, children }: DemoAppProviderProps) {
  const [db, setDb] = useState<Database | null>(null)
  const [appState, setAppState] = useState<AppState | null>(null)
  const [personaInfo, setPersonaInfo] = useState<DemoPersonaInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    async function init() {
      try {
        const persona = PERSONAS[personaSlug]
        if (!persona) {
          setError(`Unknown persona: ${personaSlug}`)
          return
        }

        const database = await createInMemoryDatabase('pancakemaker-demo')
        await runMigrations(database)
        const state = await seedDemoData(database, persona)

        if (mounted.current) {
          setDb(database)
          setAppState(state)
          setPersonaInfo({
            slug: personaSlug,
            name: persona.name,
            emoji: persona.emoji,
            tagline: persona.tagline,
          })
        }
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : 'Failed to initialize demo')
        }
      }
    }

    init()
    return () => {
      mounted.current = false
    }
  }, [personaSlug])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="rounded-lg border border-red-500/30 bg-bg-card p-6 text-center">
          <p className="font-mono text-sm text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!db || !appState || !personaInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
          <p className="font-mono text-sm text-text-muted">loading demo...</p>
        </div>
      </div>
    )
  }

  return (
    <DemoContext.Provider value={personaInfo}>
      <DatabaseProvider database={db}>
        <AppStateContext.Provider value={appState}>
          <DemoSyncProvider>{children}</DemoSyncProvider>
        </AppStateContext.Provider>
      </DatabaseProvider>
    </DemoContext.Provider>
  )
}
