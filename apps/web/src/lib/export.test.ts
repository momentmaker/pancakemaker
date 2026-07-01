import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createUser,
  createRoute,
  createCategory,
  createPanel,
  createExpense,
  getExportRows,
  type ExportRow,
} from '../db/queries'
import type { Database } from '../db/interface'
import { createTestDatabase } from '../db/test-db'
import { runMigrations } from '../db/migrations'
import { formatCSV, formatJSON, exportData } from './export'

const rows: ExportRow[] = [
  {
    date: '2026-01-15',
    amount: 1500,
    currency: 'USD',
    category: 'Health',
    panel: 'January 2026',
    route_type: 'personal',
    description: 'Gym membership',
  },
  {
    date: '2026-01-14',
    amount: 2300,
    currency: 'EUR',
    category: 'Meals',
    panel: 'January 2026',
    route_type: 'personal',
    description: '',
  },
]

describe('formatCSV', () => {
  it('produces header row and data rows', () => {
    const csv = formatCSV(rows)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Date,Amount,Currency,Category,Panel,Type,Description')
    expect(lines[1]).toBe('2026-01-15,15.00,USD,Health,January 2026,personal,Gym membership')
    expect(lines[2]).toBe('2026-01-14,23.00,EUR,Meals,January 2026,personal,')
  })

  it('converts amounts from cents to decimal', () => {
    const csv = formatCSV([{ ...rows[0], amount: 99 }])
    expect(csv.split('\n')[1]).toContain('0.99')
  })

  it('escapes fields containing commas', () => {
    const csv = formatCSV([{ ...rows[0], description: 'food, drink' }])
    expect(csv.split('\n')[1]).toContain('"food, drink"')
  })

  it('escapes fields containing quotes', () => {
    const csv = formatCSV([{ ...rows[0], description: 'the "best" gym' }])
    expect(csv.split('\n')[1]).toContain('"the ""best"" gym"')
  })

  it('returns only header for empty rows', () => {
    const csv = formatCSV([])
    expect(csv).toBe('Date,Amount,Currency,Category,Panel,Type,Description')
  })
})

describe('formatJSON', () => {
  it('produces array of objects with decimal amounts', () => {
    const json = formatJSON(rows)
    const parsed = JSON.parse(json)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].amount).toBe(15)
    expect(parsed[0].type).toBe('personal')
  })

  it('returns empty array for no rows', () => {
    const json = formatJSON([])
    expect(JSON.parse(json)).toEqual([])
  })
})

describe('exportData', () => {
  let db: Database
  let userId: string
  let blobContents: string[]
  let lastDownload: string | null
  const OrigBlob = globalThis.Blob
  const origCreate = URL.createObjectURL
  const origRevoke = URL.revokeObjectURL

  beforeEach(async () => {
    db = createTestDatabase()
    await runMigrations(db)
    const user = await createUser(db, 'export@example.com', 'USD')
    userId = user.id
    const route = await createRoute(db, userId, 'personal')
    const category = await createCategory(db, route.id, 'Health', '#00ffcc', 0)
    const panel = await createPanel(db, route.id, 'Daily', 'USD', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: category.id,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
      description: 'Gym',
    })

    // jsdom's Blob has no .text(); capture the content passed to its constructor.
    blobContents = []
    globalThis.Blob = class extends OrigBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options)
        blobContents.push(typeof parts?.[0] === 'string' ? parts[0] : '')
      }
    } as unknown as typeof Blob

    lastDownload = null
    URL.createObjectURL = vi.fn(() => 'blob:test') as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      lastDownload = this.download
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.Blob = OrigBlob
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
  })

  it('downloads CSV content matching formatCSV(getExportRows) with a .csv name', async () => {
    await exportData(db, userId, 'csv')
    expect(lastDownload).toMatch(/^pancakemaker-.*\.csv$/)
    expect(blobContents[0]).toBe(formatCSV(await getExportRows(db, userId)))
  })

  it('downloads JSON content matching formatJSON(getExportRows) with a .json name', async () => {
    await exportData(db, userId, 'json')
    expect(lastDownload).toMatch(/^pancakemaker-.*\.json$/)
    expect(blobContents[0]).toBe(formatJSON(await getExportRows(db, userId)))
  })
})
