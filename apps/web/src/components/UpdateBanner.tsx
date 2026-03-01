import { useEffect, useState } from 'react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const SW_URL = '/sw.js'

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let intervalId: ReturnType<typeof setInterval> | null = null
    const hadController = !!navigator.serviceWorker.controller

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) setUpdateAvailable(true)
    })

    navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .then((reg) => {
        intervalId = setInterval(() => reg.update(), UPDATE_CHECK_INTERVAL_MS)
      })
      .catch((err) => console.error('SW registration failed:', err))

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-lg border border-neon-cyan/30 bg-bg-card px-4 py-2 shadow-lg">
        <span className="font-mono text-sm text-text-primary">New version available</span>
        <button
          onClick={() => window.location.reload()}
          className="rounded bg-neon-cyan px-3 py-1 font-mono text-xs font-medium text-bg-primary transition-opacity hover:opacity-80"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
