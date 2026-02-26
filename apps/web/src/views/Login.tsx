export function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm rounded-lg border border-border-dim bg-bg-card p-8">
        <h1 className="text-center font-mono text-2xl font-bold text-neon-cyan">pancakemaker</h1>
        <p className="mt-2 text-center text-sm text-text-secondary">
          Enter your email for a magic link
        </p>
        <form className="mt-6">
          <input
            type="email"
            placeholder="you@example.com"
            className="w-full rounded-md border border-border-dim bg-bg-secondary px-4 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-neon-cyan focus:outline-none"
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-neon-cyan px-4 py-2.5 text-sm font-semibold text-bg-primary transition-colors hover:bg-neon-cyan/80"
          >
            Send Magic Link
          </button>
        </form>
      </div>
    </div>
  )
}
