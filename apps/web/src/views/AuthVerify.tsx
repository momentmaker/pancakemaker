import { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { verifyToken, storeToken, storeUserEmail } from '../sync/api-client'
import { useSync } from '../sync/SyncContext'

export function AuthVerify() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { triggerSync } = useSync()
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(true)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setError('No token provided')
      setVerifying(false)
      return
    }

    verifyToken(token).then((result) => {
      if (result.success) {
        storeToken(result.data.token)
        storeUserEmail(result.data.user.email)
        triggerSync()
        navigate('/settings', { replace: true })
      } else {
        setError(result.error)
        setVerifying(false)
      }
    })
  }, [searchParams, navigate, triggerSync])

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm rounded-lg border border-border-dim bg-bg-card p-8 text-center">
        <h1 className="font-mono text-2xl font-bold text-neon-cyan">pancakemaker</h1>

        {verifying && !error && (
          <p className="mt-6 text-sm text-text-secondary">Verifying your magic link...</p>
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
