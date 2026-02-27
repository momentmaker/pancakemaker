import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { SyncIndicator } from './SyncIndicator'
import { useSync } from '../sync/SyncContext'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4',
  },
  {
    to: '/personal',
    label: 'Personal',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  {
    to: '/business',
    label: 'Business',
    icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6M8 6H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
]

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="nav-glow-cyan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#00ccaa" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="nav-glow-magenta" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6b9d" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#cc4477" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="nav-glow-amber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#d49a10" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="nav-glow-violet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#9955dd" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="nav-glow-lime" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3e635" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7dbb18" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="nav-syrup" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#00ffcc" stopOpacity="0.15" />
        </linearGradient>
        <filter id="nav-neon" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="nav-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="nav-outer" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="blur" />
          <feFlood floodColor="#00ffcc" floodOpacity="0.3" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="256" cy="380" rx="160" ry="40" fill="#00ffcc" opacity="0.06" />
      <ellipse cx="256" cy="380" rx="120" ry="28" fill="#00ffcc" opacity="0.08" />
      <ellipse cx="256" cy="370" rx="150" ry="26" fill="#1a1a2e" opacity="0.8" />

      <g filter="url(#nav-neon)">
        <ellipse cx="256" cy="340" rx="138" ry="36" fill="#12121a" />
        <ellipse cx="256" cy="340" rx="138" ry="36" fill="url(#nav-glow-amber)" opacity="0.35" />
        <ellipse
          cx="256"
          cy="340"
          rx="138"
          ry="36"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </g>
      <g filter="url(#nav-neon)">
        <ellipse cx="256" cy="298" rx="132" ry="34" fill="#12121a" />
        <ellipse cx="256" cy="298" rx="132" ry="34" fill="url(#nav-glow-violet)" opacity="0.35" />
        <ellipse
          cx="256"
          cy="298"
          rx="132"
          ry="34"
          fill="none"
          stroke="#c084fc"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </g>
      <g filter="url(#nav-neon)">
        <ellipse cx="256" cy="256" rx="126" ry="32" fill="#12121a" />
        <ellipse cx="256" cy="256" rx="126" ry="32" fill="url(#nav-glow-magenta)" opacity="0.35" />
        <ellipse
          cx="256"
          cy="256"
          rx="126"
          ry="32"
          fill="none"
          stroke="#ff6b9d"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </g>
      <g filter="url(#nav-neon)">
        <ellipse cx="256" cy="214" rx="120" ry="30" fill="#12121a" />
        <ellipse cx="256" cy="214" rx="120" ry="30" fill="url(#nav-glow-lime)" opacity="0.35" />
        <ellipse
          cx="256"
          cy="214"
          rx="120"
          ry="30"
          fill="none"
          stroke="#a3e635"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </g>
      <g filter="url(#nav-soft)">
        <ellipse cx="256" cy="172" rx="114" ry="28" fill="#12121a" />
        <ellipse cx="256" cy="172" rx="114" ry="28" fill="url(#nav-glow-cyan)" opacity="0.4" />
        <ellipse
          cx="256"
          cy="172"
          rx="114"
          ry="28"
          fill="none"
          stroke="#00ffcc"
          strokeWidth="2"
          opacity="0.9"
        />
      </g>

      <path
        d="M168 185 Q162 220 170 260 Q174 280 166 300"
        stroke="url(#nav-syrup)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        filter="url(#nav-neon)"
      />
      <path
        d="M338 190 Q348 230 340 265 Q336 280 342 310 Q346 330 340 345"
        stroke="url(#nav-syrup)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        filter="url(#nav-neon)"
      />
      <path
        d="M306 178 Q312 200 308 220"
        stroke="url(#nav-syrup)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        filter="url(#nav-neon)"
      />

      <g filter="url(#nav-outer)">
        <rect x="236" y="148" width="40" height="12" rx="3" fill="#12121a" />
        <rect x="236" y="148" width="40" height="12" rx="3" fill="#00ffcc" opacity="0.25" />
        <rect
          x="236"
          y="148"
          width="40"
          height="12"
          rx="3"
          fill="none"
          stroke="#00ffcc"
          strokeWidth="1.5"
          opacity="0.7"
        />
      </g>
    </svg>
  )
}

function InstallButton() {
  const { canInstall, isIOS, install } = useInstallPrompt()
  const [showIOSTip, setShowIOSTip] = useState(false)

  if (canInstall) {
    return (
      <button
        type="button"
        onClick={install}
        className="rounded-md p-1.5 text-text-muted transition-colors hover:text-neon-cyan"
        title="Install app"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12l7-7 7 7" />
          <path d="M4 20h16" />
        </svg>
      </button>
    )
  }

  if (isIOS) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowIOSTip(!showIOSTip)}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:text-neon-cyan"
          title="Install app"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7-7 7 7" />
            <path d="M4 20h16" />
          </svg>
        </button>
        {showIOSTip && (
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border-dim bg-bg-card p-3 text-xs text-text-muted shadow-lg">
            Tap the <span className="inline-block translate-y-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg></span> Share button, then <span className="text-text-primary">Add to Home Screen</span>.
          </div>
        )}
      </div>
    )
  }

  return null
}

export function Layout() {
  const { status } = useSync()

  return (
    <div className="min-h-screen bg-bg-primary pb-16 sm:pb-0">
      {/* Desktop top nav */}
      <nav className="border-b border-border-dim bg-bg-secondary">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="sm:hidden">
              <Logo size={28} />
            </span>
            <span className="hidden font-mono text-lg font-bold text-neon-cyan sm:inline">
              pancakemaker
            </span>
            <SyncIndicator status={status} />
          </div>
          <div className="flex items-center gap-1">
            <div className="hidden gap-1 sm:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-bg-card text-neon-cyan'
                        : 'text-text-secondary hover:text-text-primary'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
            <InstallButton />
            <a
              href="https://github.com/momentmaker/pancakemaker"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 rounded-md p-1.5 text-text-muted transition-colors hover:text-text-primary"
              title="View on GitHub"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border-dim bg-bg-secondary sm:hidden">
        <div className="flex justify-around py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-neon-cyan' : 'text-text-muted'
                }`
              }
            >
              <NavIcon d={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
