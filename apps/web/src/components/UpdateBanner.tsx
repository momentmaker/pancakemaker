import { useEffect, useState, useCallback } from 'react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const SW_URL = '/sw.js'

export function UpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null

    function trackWaiting(reg: ServiceWorkerRegistration): void {
      if (reg.waiting) setWaitingWorker(reg.waiting)

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(installing)
          }
        })
      })
    }

    navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .then((reg) => {
        registration = reg
        trackWaiting(reg)
        intervalId = setInterval(() => reg.update(), UPDATE_CHECK_INTERVAL_MS)
      })
      .catch((err) => console.error('SW registration failed:', err))

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    waitingWorker.addEventListener('statechange', () => {
      if (waitingWorker.state === 'activated') window.location.reload()
    })
  }, [waitingWorker])

  if (!waitingWorker) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-lg border border-neon-cyan/30 bg-bg-card px-4 py-2 shadow-lg">
        <span className="font-mono text-sm text-text-primary">New version available</span>
        <button
          onClick={applyUpdate}
          className="rounded bg-neon-cyan px-3 py-1 font-mono text-xs font-medium text-bg-primary transition-opacity hover:opacity-80"
        >
          Update
        </button>
      </div>
    </div>
  )
}
