import { useState, useRef, type FormEvent, type KeyboardEvent, type ClipboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { requestMagicLink, verifyCode, storeToken, storeUserEmail } from '../sync/api-client'
import { useSync } from '../sync/SyncContext'
import { useDatabase } from '../db/DatabaseContext'
import { reconcileAfterAuth } from '../sync/reconcile'

const CODE_LENGTH = 6

export function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [verifying, setVerifying] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const db = useDatabase()
  const { triggerSync } = useSync()

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await requestMagicLink(email.trim())

    setLoading(false)
    if (result.success) {
      setSent(true)
    } else {
      setError(result.error)
    }
  }

  async function submitCode(allDigits: string[]): Promise<void> {
    const code = allDigits.join('')
    if (code.length !== CODE_LENGTH) return

    setError(null)
    setVerifying(true)

    const result = await verifyCode(email.trim(), code)

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

    window.location.href = '/'
  }

  function handleDigitChange(index: number, value: string): void {
    if (!/^\d?$/.test(value)) return

    const next = [...digits]
    next[index] = value
    setDigits(next)

    if (value && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    if (value && index === CODE_LENGTH - 1) {
      submitCode(next)
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>): void {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!pasted) return

    const next = [...digits]
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i]
    }
    setDigits(next)

    const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1)
    inputRefs.current[focusIndex]?.focus()

    if (pasted.length === CODE_LENGTH) {
      submitCode(next)
    }
  }

  function resetToEmail(): void {
    setSent(false)
    setEmail('')
    setDigits(Array(CODE_LENGTH).fill(''))
    setError(null)
    setVerifying(false)
    setSyncing(false)
  }

  const isSubmitting = verifying || syncing

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm rounded-lg border border-border-dim bg-bg-card p-8">
        <h1 className="text-center font-mono text-2xl font-bold text-neon-cyan">pancakemaker</h1>

        {sent ? (
          <div className="mt-6 text-center">
            {syncing ? (
              <p className="text-sm text-text-secondary">Syncing your data...</p>
            ) : (
              <>
                <p className="text-sm text-text-primary">Enter the code from your email</p>
                <p className="mt-1 text-xs text-text-muted">
                  We sent a code to <span className="text-text-primary">{email}</span>
                </p>

                <div className="mt-6 flex justify-center gap-2">
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        inputRefs.current[i] = el
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={i === 0 ? handlePaste : undefined}
                      disabled={isSubmitting}
                      autoFocus={i === 0}
                      className="h-12 w-10 rounded-md border border-border-dim bg-bg-secondary text-center font-mono text-xl text-text-primary focus:border-neon-cyan focus:outline-none disabled:opacity-40"
                    />
                  ))}
                </div>

                {verifying && (
                  <p className="mt-4 text-xs text-text-muted">Verifying...</p>
                )}
                {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

                <button
                  type="button"
                  onClick={resetToEmail}
                  disabled={isSubmitting}
                  className="mt-4 text-xs text-neon-cyan hover:underline disabled:opacity-40"
                >
                  Try a different email
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-text-secondary">
              Enter your email for a magic link
            </p>
            <form className="mt-6" onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-border-dim bg-bg-secondary px-4 py-2.5 font-mono text-base text-text-primary placeholder:text-text-muted focus:border-neon-cyan focus:outline-none"
              />
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="mt-4 w-full rounded-md bg-neon-cyan px-4 py-2.5 text-sm font-semibold text-bg-primary transition-colors hover:bg-neon-cyan/80 disabled:opacity-40"
              >
                {loading ? 'Sending...' : 'Send Magic Link'}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-text-muted hover:text-text-secondary">
            Continue without sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
