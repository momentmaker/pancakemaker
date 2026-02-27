import type { SyncStatus } from '../sync/sync-engine'

const statusConfig: Record<SyncStatus, { color: string; label: string; pulse: boolean }> = {
  synced: { color: 'var(--color-sync-synced)', label: 'Synced', pulse: false },
  pending: { color: 'var(--color-sync-pending)', label: 'Syncing', pulse: true },
  offline: { color: 'var(--color-sync-offline)', label: 'Offline', pulse: false },
  local: { color: 'var(--color-text-muted)', label: 'Local', pulse: false },
}

export function SyncIndicator({ status }: SyncIndicatorProps) {
  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2 text-xs" title={config.label}>
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
    </div>
  )
}
