import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { DatabaseProvider } from '../db/DatabaseContext.js'
import { AppStateContext, type AppState } from './useAppState.js'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData } from '../db/seed.js'
import { useCategories } from './useCategories.js'
import type { Database } from '../db/interface.js'

let db: Database
let routeId: string
let appState: AppState

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DatabaseProvider database={db}>
      <AppStateContext.Provider value={appState}>{children}</AppStateContext.Provider>
    </DatabaseProvider>
  )
}

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)
  const seed = await seedDefaultData(db, 'test@example.com')
  routeId = seed.personalRouteId
  appState = {
    userId: seed.userId,
    personalRouteId: seed.personalRouteId,
    businessRouteId: seed.businessRouteId,
    baseCurrency: 'USD',
  }
})

describe('useCategories', () => {
  it('loads seeded categories', async () => {
    const { result } = renderHook(() => useCategories(routeId), { wrapper })

    await act(async () => {
      await result.current.load()
    })

    expect(result.current.categories).toHaveLength(10)
    expect(result.current.categories[0].name).toBe('Health')
  })

  it('adds a category', async () => {
    const { result } = renderHook(() => useCategories(routeId), { wrapper })

    await act(async () => {
      await result.current.load()
    })

    await act(async () => {
      await result.current.add('Custom', '#abcdef', 10)
    })

    expect(result.current.categories).toHaveLength(11)
  })

  it('updates a category', async () => {
    const { result } = renderHook(() => useCategories(routeId), { wrapper })

    await act(async () => {
      await result.current.load()
    })

    const catId = result.current.categories[0].id
    await act(async () => {
      await result.current.update(catId, { name: 'Wellness' })
    })

    expect(result.current.categories.find((c) => c.id === catId)!.name).toBe('Wellness')
  })

  it('removes a category', async () => {
    const { result } = renderHook(() => useCategories(routeId), { wrapper })

    await act(async () => {
      await result.current.load()
    })

    const catId = result.current.categories[0].id
    await act(async () => {
      await result.current.remove(catId)
    })

    expect(result.current.categories).toHaveLength(9)
  })
})
