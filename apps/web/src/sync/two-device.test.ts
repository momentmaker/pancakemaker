import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData } from '../db/seed.js'
import { createCategory, createExpense } from '../db/queries.js'
import type { Database } from '../db/interface.js'
import { reconcileAfterAuth } from './reconcile.js'
import { createSyncEngine } from './sync-engine.js'
import { installFakeSyncServer } from './test-sync-server.js'
import { getStoredSyncCursor, storeSyncCursor, clearSyncCursor } from './api-client.js'

const SERVER_USER = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('pancakemaker_jwt', 'test-token')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function createDevice(): Promise<Database> {
  const device = createTestDatabase()
  await runMigrations(device)
  await seedDefaultData(device, 'local@pancakemaker.app', 'USD')
  return device
}

async function syncOnce(device: Database): Promise<void> {
  const engine = createSyncEngine(device)
  await engine.sync(true)
  engine.stop()
}

async function idsIn(device: Database, table: string): Promise<string[]> {
  const rows = await device.query<{ id: string }>(`SELECT id FROM ${table} ORDER BY id`)
  return rows.map((r) => r.id)
}

async function snapshot(device: Database): Promise<Record<string, string[]>> {
  return {
    routes: await idsIn(device, 'routes'),
    categories: await idsIn(device, 'categories'),
    panels: await idsIn(device, 'panels'),
    expenses: await idsIn(device, 'expenses'),
  }
}

async function twoDevicesAfterMerge(): Promise<{
  deviceA: Record<string, string[]>
  deviceB: Record<string, string[]>
}> {
  installFakeSyncServer()
  const deviceA = await createDevice()
  await reconcileAfterAuth(deviceA, SERVER_USER)
  await syncOnce(deviceA)
  const cursorA = getStoredSyncCursor()
  clearSyncCursor()

  const deviceB = await createDevice()
  const personal = await deviceB.query<{ id: string }>(
    "SELECT id FROM routes WHERE type = 'personal'",
  )
  const coffee = await createCategory(deviceB, personal[0].id, 'Coffee', '#6b4f3a', 99)
  const daily = await deviceB.query<{ id: string }>(
    "SELECT id FROM panels WHERE route_id = ? AND name = 'Daily'",
    [personal[0].id],
  )
  await createExpense(deviceB, {
    panelId: daily[0].id,
    categoryId: coffee.id,
    amount: 300,
    currency: 'USD',
    date: '2026-01-05',
  })

  await reconcileAfterAuth(deviceB, SERVER_USER)
  await syncOnce(deviceB)
  storeSyncCursor(cursorA!)
  await syncOnce(deviceA)

  return { deviceA: await snapshot(deviceA), deviceB: await snapshot(deviceB) }
}

describe('two devices on one account', () => {
  it('end with the same routes, categories, panels and expenses after the second device merges', async () => {
    // #given / #when
    const { deviceA, deviceB } = await twoDevicesAfterMerge()

    // #then
    expect(deviceA).toEqual(deviceB)
  })

  it('end with one route of each type after the second device merges', async () => {
    // #given / #when
    const { deviceA } = await twoDevicesAfterMerge()

    // #then
    expect(deviceA.routes).toHaveLength(2)
  })
})
