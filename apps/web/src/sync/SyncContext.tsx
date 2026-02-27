import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import { createSyncEngine, type SyncStatus, type SyncEngine } from './sync-engine.js'

interface SyncState {
  status: SyncStatus
  triggerSync: () => Promise<void>
}

const SyncContext = createContext<SyncState | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useDatabase()
  const engineRef = useRef<SyncEngine | null>(null)
  const [status, setStatus] = useState<SyncStatus>(!navigator.onLine ? 'offline' : 'local')

  useEffect(() => {
    const engine = createSyncEngine(db)
    engineRef.current = engine

    const unsubscribe = engine.onStatusChange(setStatus)
    engine.start()

    return () => {
      unsubscribe()
      engine.stop()
      engineRef.current = null
    }
  }, [db])

  const triggerSync = useCallback(async () => {
    await engineRef.current?.sync()
  }, [])

  return <SyncContext.Provider value={{ status, triggerSync }}>{children}</SyncContext.Provider>
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>')
  return ctx
}
