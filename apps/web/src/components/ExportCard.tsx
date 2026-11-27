import { useCallback, useState } from 'react'
import { useDatabase } from '../db/DatabaseContext'
import { useAppState } from '../hooks/useAppState'
import { exportData } from '../lib/export'
import { Card } from './Card'
import { Button } from './Button'

type ExportFormat = 'csv' | 'json' | 'tax'

function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

export function ExportCard() {
  const db = useDatabase()
  const { userId } = useAppState()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const thisYear = new Date().getFullYear()

  const setRange = (range: { from: string; to: string }) => {
    setFrom(range.from)
    setTo(range.to)
  }

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setExporting(true)
      try {
        const range = { ...(from && { from }), ...(to && { to }) }
        await exportData(db, userId, format, range)
      } catch (err) {
        console.error(`Export (${format}) failed`, err)
      } finally {
        setExporting(false)
      }
    },
    [db, userId, from, to],
  )

  const dateInput =
    'rounded-md border border-border-dim bg-bg-primary px-2 py-1 font-mono text-xs text-text-primary focus:border-neon-cyan focus:outline-none'

  return (
    <Card className="mt-4">
      <h2 className="font-mono text-sm font-semibold text-text-secondary">Export Data</h2>
      <p className="mt-1 text-xs text-text-muted">
        Download your expenses — all of them, or a date range. The tax envelope holds Business
        expenses plus any Personal ones tagged +deductible, totalled per category for your
        accountant.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          From
          <input
            type="date"
            aria-label="From"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={dateInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          To
          <input
            type="date"
            aria-label="To"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={dateInput}
          />
        </label>
        <button
          type="button"
          onClick={() => setRange(yearRange(thisYear))}
          className="rounded px-2 py-1 font-mono text-xs text-text-muted transition-colors hover:text-neon-cyan"
        >
          This year
        </button>
        <button
          type="button"
          onClick={() => setRange(yearRange(thisYear - 1))}
          className="rounded px-2 py-1 font-mono text-xs text-text-muted transition-colors hover:text-neon-cyan"
        >
          Last year
        </button>
        {(from || to) && (
          <button
            type="button"
            onClick={() => setRange({ from: '', to: '' })}
            className="rounded px-2 py-1 font-mono text-xs text-text-muted transition-colors hover:text-neon-cyan"
          >
            All time
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          data-fhint
          onClick={() => handleExport('csv')}
          disabled={exporting}
        >
          Download CSV
        </Button>
        <Button
          variant="secondary"
          data-fhint
          onClick={() => handleExport('json')}
          disabled={exporting}
        >
          Download JSON
        </Button>
        <Button
          variant="secondary"
          data-fhint
          onClick={() => handleExport('tax')}
          disabled={exporting}
        >
          Tax envelope
        </Button>
      </div>
    </Card>
  )
}
