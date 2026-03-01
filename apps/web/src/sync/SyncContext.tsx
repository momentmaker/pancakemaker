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
  markPending: () => void
  dataVersion: number
  tableVersions: Readonly<Record<string, number>>
}

export const SyncContext = createContext<SyncState | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useDatabase()
  const engineRef = useRef<SyncEngine | null>(null)
  const [status, setStatus] = useState<SyncStatus>('local')
  const [dataVersion, setDataVersion] = useState(0)
  const [tableVersions, setTableVersions] = useState<Record<string, number>>({})

  useEffect(() => {
    const engine = createSyncEngine(db)
    engineRef.current = engine

    setStatus(engine.getStatus())
    const unsubStatus = engine.onStatusChange(setStatus)
    const unsubData = engine.onDataReceived((tables) => {
      setDataVersion((v) => v + 1)
      setTableVersions((prev) => {
        const next = { ...prev }
        for (const t of tables) next[t] = (next[t] ?? 0) + 1
        return next
      })
    })
    engine.start()

    return () => {
      unsubStatus()
      unsubData()
      engine.stop()
      engineRef.current = null
    }
  }, [db])

  const triggerSync = useCallback(async () => {
    await engineRef.current?.sync()
  }, [])

  const markPending = useCallback(() => {
    if (status === 'synced') setStatus('pending')
  }, [status])

  return (
    <SyncContext.Provider value={{ status, triggerSync, markPending, dataVersion, tableVersions }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>')
  return ctx
}
