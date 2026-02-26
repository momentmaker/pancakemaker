import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Database } from './interface.js'

interface DatabaseContextValue {
  db: Database | null
  isReady: boolean
}

const DatabaseContext = createContext<DatabaseContextValue>({
  db: null,
  isReady: false,
})

interface DatabaseProviderProps {
  database: Database | null
  children: ReactNode
}

export function DatabaseProvider({ database, children }: DatabaseProviderProps) {
  const value: DatabaseContextValue = {
    db: database,
    isReady: database !== null,
  }

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>
}

export function useDatabase(): Database {
  const { db } = useContext(DatabaseContext)
  if (!db) throw new Error('Database not initialized. Wrap your app in <DatabaseProvider>.')
  return db
}

export function useDatabaseReady(): boolean {
  const { isReady } = useContext(DatabaseContext)
  return isReady
}
