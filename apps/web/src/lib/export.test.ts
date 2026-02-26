import { describe, it, expect } from 'vitest'
import type { ExportRow } from '../db/queries'
import { formatCSV, formatJSON } from './export'

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
