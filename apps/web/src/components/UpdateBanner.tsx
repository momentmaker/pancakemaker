import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export function UpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url: string, reg: ServiceWorkerRegistration | undefined) {
      if (reg) setRegistration(reg)
    },
  })

  useEffect(() => {
    if (!registration) return
    const id = setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [registration])

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-lg border border-neon-cyan/30 bg-bg-card px-4 py-2 shadow-lg">
        <span className="font-mono text-sm text-text-primary">New version available</span>
        <button
          onClick={() => updateServiceWorker(true)}
          className="rounded bg-neon-cyan px-3 py-1 font-mono text-xs font-medium text-bg-primary transition-opacity hover:opacity-80"
        >
          Update
        </button>
      </div>
    </div>
  )
}
