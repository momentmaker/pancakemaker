import { getExportRows, type ExportRange, type ExportRow } from '../db/queries.js'
import type { Database } from '../db/interface.js'

const CSV_HEADERS = [
  'Date',
  'Amount',
  'Currency',
  'Category',
  'Panel',
  'Type',
  'Description',
  'Tags',
]

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function formatCSV(rows: ExportRow[]): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.date,
        (row.amount / 100).toFixed(2),
        row.currency,
        escapeCSVField(row.category),
        escapeCSVField(row.panel),
        row.route_type,
        escapeCSVField(row.description),
        escapeCSVField(row.tags),
      ].join(','),
    )
  }
  return lines.join('\n')
}

export function formatJSON(rows: ExportRow[]): string {
  const data = rows.map((row) => ({
    date: row.date,
    amount: row.amount / 100,
    currency: row.currency,
    category: row.category,
    panel: row.panel,
    type: row.route_type,
    description: row.description,
    tags: row.tags ? row.tags.split(' ').map((t) => t.slice(1)) : [],
  }))
  return JSON.stringify(data, null, 2)
}

const DEDUCTIBLE_TAG = '+deductible'

function isTaxRelevant(row: ExportRow): boolean {
  return row.route_type === 'business' || row.tags.split(' ').includes(DEDUCTIBLE_TAG)
}

// An accountant-ready CSV: business expenses plus personal ones tagged
// +deductible, summarised per category, then itemised.
export function formatTaxEnvelope(rows: ExportRow[], range: ExportRange): string {
  const items = rows.filter(isTaxRelevant).sort((a, b) => b.date.localeCompare(a.date))

  const totals = new Map<
    string,
    { category: string; currency: string; count: number; amount: number }
  >()
  for (const row of items) {
    const key = `${row.category}|${row.currency}`
    const total = totals.get(key) ?? {
      category: row.category,
      currency: row.currency,
      count: 0,
      amount: 0,
    }
    total.count++
    total.amount += row.amount
    totals.set(key, total)
  }
  const summary = [...totals.values()].sort((a, b) => b.amount - a.amount)

  return [
    ['pancakemaker tax envelope', range.from ?? 'all time', range.to ?? 'today'].join(','),
    '',
    'Category,Expenses,Total,Currency',
    ...summary.map((t) =>
      [escapeCSVField(t.category), t.count, (t.amount / 100).toFixed(2), t.currency].join(','),
    ),
    '',
    'Date,Amount,Currency,Category,Panel,Source,Description,Tags',
    ...items.map((row) =>
      [
        row.date,
        (row.amount / 100).toFixed(2),
        row.currency,
        escapeCSVField(row.category),
        escapeCSVField(row.panel),
        row.route_type === 'business' ? 'Business' : 'Personal +deductible',
        escapeCSVField(row.description),
        escapeCSVField(row.tags),
      ].join(','),
    ),
  ].join('\n')
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Query, format, and download in one shot — the single export path shared by
// the Settings buttons and the command palette.
export async function exportData(
  db: Database,
  userId: string,
  format: 'csv' | 'json' | 'tax',
  range: ExportRange = {},
): Promise<void> {
  const rows = await getExportRows(db, userId, range)
  const date = new Date().toISOString().slice(0, 10)
  if (format === 'csv') {
    downloadFile(formatCSV(rows), `pancakemaker-${date}.csv`, 'text/csv')
  } else if (format === 'json') {
    downloadFile(formatJSON(rows), `pancakemaker-${date}.json`, 'application/json')
  } else {
    const period = `${range.from ?? 'start'}-to-${range.to ?? date}`
    downloadFile(formatTaxEnvelope(rows, range), `pancakemaker-tax-${period}.csv`, 'text/csv')
  }
}
