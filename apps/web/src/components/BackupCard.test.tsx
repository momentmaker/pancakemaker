import { screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BackupCard } from './BackupCard.js'
import { renderWithProviders, setupTestDb, getTestDb } from '../test-utils.js'
import { createBackup } from '../db/backup.js'
import { createExpense, getCategoriesByRoute, getPanelsByRoute } from '../db/queries.js'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData } from '../db/seed.js'

afterEach(cleanup)

function pickFile(text: string, name = 'backup.pancake') {
  const input = screen.getByLabelText('Restore from backup file') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File([text], name)] } })
}

async function otherDeviceBackup(): Promise<string> {
  const db = createTestDatabase()
  await runMigrations(db)
  const seed = await seedDefaultData(db, 'other@example.com')
  const [daily] = await getPanelsByRoute(db, seed.personalRouteId)
  const [category] = await getCategoriesByRoute(db, seed.personalRouteId)
  await createExpense(db, {
    panelId: daily.id,
    categoryId: category.id,
    amount: 450,
    currency: 'USD',
    date: '2026-11-20',
    description: 'coffee',
  })
  return JSON.stringify(await createBackup(db))
}

describe('BackupCard', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('reports what a restore added', async () => {
    // #given
    renderWithProviders(<BackupCard />)
    const backup = await otherDeviceBackup()

    // #when
    pickFile(backup)

    // #then
    expect(
      await screen.findByText('Restored: 1 added, 0 updated, 0 already up to date.'),
    ).toBeTruthy()
  })

  it('explains when the file is not a backup', async () => {
    // #given
    renderWithProviders(<BackupCard />)

    // #when
    pickFile('date,amount', 'expenses.csv')

    // #then
    expect(await screen.findByText('This file is not a pancakemaker backup.')).toBeTruthy()
  })

  it('leaves the data untouched when the file is not a backup', async () => {
    // #given
    renderWithProviders(<BackupCard />)

    // #when
    pickFile('date,amount', 'expenses.csv')
    await screen.findByText('This file is not a pancakemaker backup.')

    // #then
    const { db } = getTestDb()
    const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM expenses')
    expect(rows[0].n).toBe(0)
  })
})
