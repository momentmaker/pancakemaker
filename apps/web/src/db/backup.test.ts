import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from './test-db.js'
import { runMigrations } from './migrations.js'
import { seedDefaultData } from './seed.js'
import {
  createCategory,
  createExpense,
  createTag,
  addTagToExpense,
  getPanelsByRoute,
  getCategoriesByRoute,
  softDeleteExpense,
  updateExpense,
  type ExpenseRow,
} from './queries.js'
import { generateRecurringExpenses } from './recurring-generator.js'
import { createBackup, parseBackup, restoreBackup, type PancakeBackup } from './backup.js'
import type { Database } from './interface.js'

interface Device {
  db: Database
  userId: string
  personalRouteId: string
}

async function newDevice(email = 'me@example.com'): Promise<Device> {
  const db = createTestDatabase()
  await runMigrations(db)
  const seed = await seedDefaultData(db, email)
  return { db, userId: seed.userId, personalRouteId: seed.personalRouteId }
}

async function firstCategory(device: Device, name: string) {
  const cats = await getCategoriesByRoute(device.db, device.personalRouteId)
  return cats.find((c) => c.name === name)!
}

async function panelNamed(device: Device, name: string) {
  const panels = await getPanelsByRoute(device.db, device.personalRouteId)
  return panels.find((p) => p.name === name)!
}

async function liveExpenses(device: Device): Promise<ExpenseRow[]> {
  return device.db.query<ExpenseRow>(
    'SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY date, description',
  )
}

describe('backup round trip', () => {
  let source: Device
  let target: Device

  beforeEach(async () => {
    source = await newDevice()
    target = await newDevice()
  })

  async function addCoffee(device: Device, date = '2026-11-20') {
    const meals = await firstCategory(device, 'Meals')
    const daily = await panelNamed(device, 'Daily')
    return createExpense(device.db, {
      panelId: daily.id,
      categoryId: meals.id,
      amount: 450,
      currency: 'USD',
      date,
      description: 'coffee',
    })
  }

  it('restores expenses into a device whose categories have different ids', async () => {
    // #given
    await addCoffee(source)
    const backup = await createBackup(source.db)

    // #when
    await restoreBackup(target.db, target.userId, backup)

    // #then
    const [restored] = await liveExpenses(target)
    expect({
      description: restored.description,
      categoryId: restored.category_id,
      panelId: restored.panel_id,
    }).toEqual({
      description: 'coffee',
      categoryId: (await firstCategory(target, 'Meals')).id,
      panelId: (await panelNamed(target, 'Daily')).id,
    })
  })

  it('keeps recurring series, their end dates and deleted months', async () => {
    // #given
    const monthly = await panelNamed(source, 'Monthly')
    const housing = await firstCategory(source, 'Housing')
    const rent = await createExpense(source.db, {
      panelId: monthly.id,
      categoryId: housing.id,
      amount: 150000,
      currency: 'USD',
      date: '2026-08-01',
      description: 'Rent',
    })
    await generateRecurringExpenses(source.db, '2026-11-15')
    const [october] = await source.db.query<ExpenseRow>(
      "SELECT * FROM expenses WHERE date = '2026-10-01'",
    )
    await softDeleteExpense(source.db, october.id)
    await updateExpense(source.db, rent.id, { recurrenceEndDate: '2026-11-30' })

    // #when
    await restoreBackup(target.db, target.userId, await createBackup(source.db))
    await generateRecurringExpenses(target.db, '2026-12-15')

    // #then
    expect((await liveExpenses(target)).map((e) => e.date)).toEqual([
      '2026-08-01',
      '2026-09-01',
      '2026-11-01',
    ])
  })

  it('adds nothing when the same backup is restored twice', async () => {
    // #given
    await addCoffee(source)
    const backup = await createBackup(source.db)
    await restoreBackup(target.db, target.userId, backup)

    // #when
    const second = await restoreBackup(target.db, target.userId, backup)

    // #then
    expect({ added: second.added, rows: (await liveExpenses(target)).length }).toEqual({
      added: 0,
      rows: 1,
    })
  })

  it('keeps a newer local edit over an older backup copy', async () => {
    // #given
    const coffee = await addCoffee(source)
    const backup = await createBackup(source.db)
    await restoreBackup(target.db, target.userId, backup)
    await new Promise((r) => setTimeout(r, 5))
    await updateExpense(target.db, coffee.id, { amount: 500 })

    // #when
    await restoreBackup(target.db, target.userId, backup)

    // #then
    expect((await liveExpenses(target))[0].amount).toBe(500)
  })

  it('takes a newer backup copy over an older local one', async () => {
    // #given
    const coffee = await addCoffee(source)
    await restoreBackup(target.db, target.userId, await createBackup(source.db))
    await new Promise((r) => setTimeout(r, 5))
    await updateExpense(source.db, coffee.id, { amount: 600 })

    // #when
    const result = await restoreBackup(target.db, target.userId, await createBackup(source.db))

    // #then
    expect({ updated: result.updated, amount: (await liveExpenses(target))[0].amount }).toEqual({
      updated: 1,
      amount: 600,
    })
  })

  it('creates a category the device does not have', async () => {
    // #given
    const daily = await panelNamed(source, 'Daily')
    const pets = await createCategory(source.db, source.personalRouteId, 'Pets', '#123456', 99)
    await createExpense(source.db, {
      panelId: daily.id,
      categoryId: pets.id,
      amount: 2000,
      currency: 'USD',
      date: '2026-11-01',
      description: 'kibble',
    })

    // #when
    await restoreBackup(target.db, target.userId, await createBackup(source.db))

    // #then
    const targetPets = await firstCategory(target, 'Pets')
    expect((await liveExpenses(target))[0].category_id).toBe(targetPets.id)
  })

  it('restores tags on expenses', async () => {
    // #given
    const coffee = await addCoffee(source)
    const tag = await createTag(source.db, source.userId, 'japan-trip')
    await addTagToExpense(source.db, coffee.id, tag.id)

    // #when
    await restoreBackup(target.db, target.userId, await createBackup(source.db))

    // #then
    const rows = await target.db.query<{ name: string }>(
      'SELECT t.name FROM tags t JOIN expense_tags et ON et.tag_id = t.id WHERE et.expense_id = ?',
      [coffee.id],
    )
    expect(rows.map((r) => r.name)).toEqual(['japan-trip'])
  })

  it('queues restored expenses for sync', async () => {
    // #given
    const coffee = await addCoffee(source)

    // #when
    await restoreBackup(target.db, target.userId, await createBackup(source.db))

    // #then
    const entries = await target.db.query<{ action: string }>(
      "SELECT action FROM sync_log WHERE table_name = 'expenses' AND record_id = ?",
      [coffee.id],
    )
    expect(entries.map((e) => e.action)).toEqual(['create'])
  })
})

describe('parseBackup', () => {
  it('rejects a file that is not a pancakemaker backup', () => {
    expect(() => parseBackup('{"hello": "world"}')).toThrow(/not a pancakemaker backup/i)
  })

  it('rejects text that is not JSON', () => {
    expect(() => parseBackup('date,amount\n2026-01-01,4.50')).toThrow(/not a pancakemaker backup/i)
  })

  it('rejects a backup from a newer, unknown format version', () => {
    const future = JSON.stringify({ format: 'pancakemaker-backup', version: 99 })
    expect(() => parseBackup(future)).toThrow(/newer version/i)
  })

  it('accepts a backup it created', async () => {
    const device = await newDevice()
    const backup: PancakeBackup = await createBackup(device.db)
    expect(parseBackup(JSON.stringify(backup)).format).toBe('pancakemaker-backup')
  })
})
