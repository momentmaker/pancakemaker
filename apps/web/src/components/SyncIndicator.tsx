import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { SyncStatus } from '../sync/sync-engine'
import { getStoredUserEmail, clearToken, clearUserEmail } from '../sync/api-client'
import { useSync } from '../sync/SyncContext'

const statusConfig: Record<SyncStatus, { color: string; label: string; pulse: boolean }> = {
  synced: { color: 'var(--color-sync-synced)', label: 'Synced', pulse: false },
  pending: { color: 'var(--color-sync-pending)', label: 'Syncing', pulse: true },
  offline: { color: 'var(--color-sync-offline)', label: 'Offline', pulse: false },
  local: { color: 'var(--color-text-muted)', label: 'Local', pulse: false },
}

export function SyncIndicator({ status, interactive = true }: { status: SyncStatus; interactive?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { triggerSync } = useSync()
  const config = statusConfig[status]
  const email = getStoredUserEmail()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleSignOut(): void {
    clearToken()
    clearUserEmail()
    setOpen(false)
    window.location.reload()
  }

  const dot = (
    <>
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ backgroundColor: config.color }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{
            backgroundColor: config.color,
            boxShadow: `0 0 6px ${config.color}`,
          }}
        />
      </span>
      <span style={{ color: config.color }}>{config.label}</span>
    </>
  )

  if (!interactive) {
    return <div className="flex items-center gap-2 text-xs">{dot}</div>
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={status === 'local' ? 'Your data is 100% private — stored only in your browser, never sent to any server' : undefined}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-bg-card"
      >
        {dot}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border-dim bg-bg-card p-3 shadow-lg">
          {status === 'local' && (
            <>
              <p className="text-xs text-text-muted">Data stays on this device.</p>
              <Link
                to="/auth/login"
                onClick={() => setOpen(false)}
                className="mt-2 inline-block text-xs text-neon-cyan hover:underline"
              >
                Enable cloud sync
              </Link>
            </>
          )}

          {status === 'offline' && (
            <p className="text-xs text-text-muted">No network connection.</p>
          )}

          {(status === 'synced' || status === 'pending') && (
            <>
              {email && <p className="truncate text-xs text-text-secondary">{email}</p>}
              <p className="mt-1 text-xs text-text-muted">
                {status === 'synced' ? 'All changes synced.' : 'Syncing changes...'}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    triggerSync()
                    setOpen(false)
                  }}
                  className="text-xs text-neon-cyan hover:underline"
                >
                  Sync now
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-xs text-text-muted hover:text-red-400"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
