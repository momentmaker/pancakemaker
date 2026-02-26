import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import { DatabaseProvider } from './db/DatabaseContext'
import { AppStateContext, type AppState } from './hooks/useAppState'
import { SyncProvider } from './sync/SyncContext'
import { createTestDatabase } from './db/test-db'
import { runMigrations } from './db/migrations'
import { seedDefaultData } from './db/seed'
import type { Database } from './db/interface'

let cachedDb: Database | null = null
let cachedState: AppState | null = null

export async function setupTestDb(): Promise<{ db: Database; state: AppState }> {
  const db = createTestDatabase()
  await runMigrations(db)
  const seed = await seedDefaultData(db, 'test@example.com', 'USD')
  const state: AppState = {
    userId: seed.userId,
    personalRouteId: seed.personalRouteId,
    businessRouteId: seed.businessRouteId,
    baseCurrency: 'USD',
  }
  cachedDb = db
  cachedState = state
  return { db, state }
}

export function getTestDb(): { db: Database; state: AppState } {
  if (!cachedDb || !cachedState) throw new Error('Call setupTestDb() in beforeEach first')
  return { db: cachedDb, state: cachedState }
}

export function renderWithProviders(ui: ReactNode, initialRoute = '/') {
  const { db, state } = getTestDb()
  return render(
    <DatabaseProvider database={db}>
      <AppStateContext.Provider value={state}>
        <SyncProvider>
          <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
        </SyncProvider>
      </AppStateContext.Provider>
    </DatabaseProvider>,
  )
}
