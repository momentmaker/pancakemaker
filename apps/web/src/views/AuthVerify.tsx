import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { verifyToken, storeToken, storeUserEmail } from '../sync/api-client'
import { useSync } from '../sync/SyncContext'
import { useDatabase } from '../db/DatabaseContext'
import { reconcileAfterAuth } from '../sync/reconcile'

export function AuthVerify() {
  const [searchParams] = useSearchParams()
  const db = useDatabase()
  const { triggerSync } = useSync()
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setError('No token provided')
      setVerifying(false)
      return
    }

    async function verify(t: string): Promise<void> {
      const result = await verifyToken(t)
      if (!result.success) {
        setError(result.error)
        setVerifying(false)
        return
      }

      storeToken(result.data.token)
      storeUserEmail(result.data.user.email)
      setVerifying(false)
      setSyncing(true)

      try {
        await reconcileAfterAuth(db, result.data.user)
        await triggerSync()
      } catch {
        setError('Failed to sync your data. Please refresh and try again.')
        setSyncing(false)
        return
      }

      window.location.reload()
    }

    verify(token).catch(() => {
      setError('Something went wrong. Please try again.')
      setVerifying(false)
      setSyncing(false)
    })
  }, [searchParams, db, triggerSync])

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm rounded-lg border border-border-dim bg-bg-card p-8 text-center">
        <h1 className="font-mono text-2xl font-bold text-neon-cyan">pancakemaker</h1>

        {verifying && !error && (
          <p className="mt-6 text-sm text-text-secondary">Verifying your magic link...</p>
        )}

        {syncing && !error && (
          <p className="mt-6 text-sm text-text-secondary">Syncing your data...</p>
        )}

        {error && (
          <div className="mt-6">
            <p className="text-sm text-red-400">{error}</p>
            <Link
              to="/auth/login"
              className="mt-4 inline-block text-xs text-neon-cyan hover:underline"
            >
              Try signing in again
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
