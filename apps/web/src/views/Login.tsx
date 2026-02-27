import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { requestMagicLink } from '../sync/api-client'

export function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm rounded-lg border border-border-dim bg-bg-card p-8">
        <h1 className="text-center font-mono text-2xl font-bold text-neon-cyan">pancakemaker</h1>

        {sent ? (
          <div className="mt-6 text-center">
            <p className="text-sm text-text-primary">Check your email</p>
            <p className="mt-2 text-xs text-text-muted">
              We sent a magic link to <span className="text-text-primary">{email}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false)
                setEmail('')
              }}
              className="mt-4 text-xs text-neon-cyan hover:underline"
            >
              Try a different email
            </button>
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
