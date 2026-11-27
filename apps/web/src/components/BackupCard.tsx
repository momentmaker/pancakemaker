import { useCallback, useState, type ChangeEvent } from 'react'
import { useDatabase } from '../db/DatabaseContext'
import { useAppState } from '../hooks/useAppState'
import { useSync } from '../sync/SyncContext'
import { createBackup, parseBackup, restoreBackup, InvalidBackupError } from '../db/backup'
import { downloadFile } from '../lib/export'
import { Card } from './Card'
import { Button } from './Button'

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
    reader.readAsText(file)
  })
}

type Status =
  | { kind: 'idle' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string }

export function BackupCard() {
  const db = useDatabase()
  const { userId } = useAppState()
  const { markPending, triggerSync } = useSync()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const handleDownload = useCallback(async () => {
    setBusy(true)
    try {
      const backup = await createBackup(db)
      const date = new Date().toISOString().slice(0, 10)
      downloadFile(JSON.stringify(backup), `pancakemaker-${date}.pancake`, 'application/json')
    } finally {
      setBusy(false)
    }
  }, [db])

  const handleRestore = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      setBusy(true)
      setStatus({ kind: 'idle' })
      try {
        const backup = parseBackup(await readFileText(file))
        const result = await restoreBackup(db, userId, backup)
        if (result.added + result.updated > 0) {
          markPending()
          triggerSync()
        }
        setStatus({
          kind: 'ok',
          message: `Restored: ${result.added} added, ${result.updated} updated, ${result.unchanged} already up to date.`,
        })
      } catch (err) {
        if (!(err instanceof InvalidBackupError)) console.error('Restore failed:', err)
        setStatus({
          kind: 'error',
          message:
            err instanceof InvalidBackupError
              ? err.message
              : 'Restore failed. Nothing was changed. Check the console for details.',
        })
      } finally {
        setBusy(false)
      }
    },
    [db, userId, markPending, triggerSync],
  )

  return (
    <Card className="mt-4">
      <h2 className="font-mono text-sm font-semibold text-text-secondary">Backup &amp; Restore</h2>
      <p className="mt-1 text-xs text-text-muted">
        A .pancake file holds everything — categories, panels, recurring series and their history.
        Restoring merges it in: nothing already here is lost, and the newer copy of each expense
        wins.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" data-fhint onClick={handleDownload} disabled={busy}>
          Download backup
        </Button>
        <label
          className={`inline-flex cursor-pointer items-center rounded-md border border-border-dim px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-border-glow ${busy ? 'pointer-events-none opacity-50' : ''}`}
        >
          Restore from backup…
          <input
            type="file"
            accept=".pancake,application/json"
            aria-label="Restore from backup file"
            className="sr-only"
            onChange={handleRestore}
          />
        </label>
      </div>
      {status.kind !== 'idle' && (
        <p
          role="status"
          className={`mt-2 font-mono text-xs ${status.kind === 'ok' ? 'text-neon-cyan' : 'text-neon-orange'}`}
        >
          {status.message}
        </p>
      )}
    </Card>
  )
}
