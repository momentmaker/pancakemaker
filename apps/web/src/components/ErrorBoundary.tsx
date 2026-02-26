import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md rounded-lg border border-red-500/30 bg-bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="font-mono text-lg font-bold text-text-primary">Something went wrong</h2>
            <p className="mt-2 font-mono text-sm text-red-400">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-6 rounded-md bg-neon-cyan px-4 py-2 text-sm font-semibold text-bg-primary transition-colors hover:bg-neon-cyan/80"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
