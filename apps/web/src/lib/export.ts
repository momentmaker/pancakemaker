import { getExportRows, type ExportRow } from '../db/queries.js'
import type { Database } from '../db/interface.js'

const CSV_HEADERS = ['Date', 'Amount', 'Currency', 'Category', 'Panel', 'Type', 'Description']

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
  }))
  return JSON.stringify(data, null, 2)
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
  format: 'csv' | 'json',
): Promise<void> {
  const rows = await getExportRows(db, userId)
  const date = new Date().toISOString().slice(0, 10)
  if (format === 'csv') {
    downloadFile(formatCSV(rows), `pancakemaker-${date}.csv`, 'text/csv')
  } else {
    downloadFile(formatJSON(rows), `pancakemaker-${date}.json`, 'application/json')
  }
}
