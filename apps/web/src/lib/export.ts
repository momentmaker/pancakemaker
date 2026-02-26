import type { ExportRow } from '../db/queries.js'

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
