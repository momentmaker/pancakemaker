import { useEffect, useState } from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import { useSync } from '../sync/SyncContext.js'
import { getRenewalRadar, type RenewalRadar } from '../db/renewals.js'

function todayString(): string {
  return new Date().toISOString().split('T')[0]
}

export function useRenewalRadar(horizonDays: number): RenewalRadar | null {
  const db = useDatabase()
  const { dataVersion } = useSync()
  const [radar, setRadar] = useState<RenewalRadar | null>(null)

  useEffect(() => {
    let cancelled = false
    getRenewalRadar(db, todayString(), horizonDays)
      .then((result) => {
        if (!cancelled) setRadar(result)
      })
      .catch((err: unknown) => {
        console.error('Failed to load upcoming charges:', err)
      })
    return () => {
      cancelled = true
    }
  }, [db, horizonDays, dataVersion])

  return radar
}
