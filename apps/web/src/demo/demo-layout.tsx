import { Outlet, NavLink, useParams, useNavigate, useMatch } from 'react-router-dom'
import { DemoAppProvider } from './demo-provider.js'
import { useDemoContext } from './demo-context.js'
import { DemoSummaryCard } from './demo-summary-card.js'
import { PERSONA_LIST } from './demo-personas.js'

const NAV_ICON_PATHS = {
  dashboard:
    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4',
  personal: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  business:
    'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6M8 6H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2',
} as const

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

function DemoNavBar() {
  const { persona } = useParams<{ persona: string }>()
  const prefix = `/demo/${persona}`

  const navItems = [
    { to: prefix, label: 'Dashboard', icon: NAV_ICON_PATHS.dashboard, end: true },
    { to: `${prefix}/personal`, label: 'Personal', icon: NAV_ICON_PATHS.personal, end: false },
    { to: `${prefix}/business`, label: 'Business', icon: NAV_ICON_PATHS.business, end: false },
  ]

  return (
    <>
      <nav className="border-b border-border-dim bg-bg-secondary">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-bold text-neon-cyan sm:inline">
              pancakemaker
            </span>
            <span className="rounded bg-neon-magenta/15 px-2 py-0.5 text-[10px] font-medium text-neon-magenta">
              DEMO
            </span>
          </div>
          <div className="hidden gap-1 sm:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
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
        </div>
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border-dim bg-bg-secondary sm:hidden">
        <div className="flex justify-around py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
    </>
  )
}

function PersonaSwitcher() {
  const navigate = useNavigate()
  const { persona: currentSlug } = useParams<{ persona: string }>()

  return (
    <div className="flex gap-2 overflow-x-auto py-1">
      {PERSONA_LIST.map((p) => {
        const isActive = p.slug === currentSlug
        return (
          <button
            key={p.slug}
            onClick={() => navigate(`/demo/${p.slug}`)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-neon-cyan/15 text-neon-cyan'
                : 'bg-bg-card text-text-muted hover:text-text-primary'
            }`}
          >
            {p.emoji} {p.name}
          </button>
        )
      })}
    </div>
  )
}

function DemoBanner() {
  const persona = useDemoContext()
  if (!persona) return null

  return (
    <div className="rounded-lg border border-border-dim bg-bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{persona.emoji}</span>
          <div>
            <h2 className="font-mono text-lg font-bold text-text-primary">{persona.name}</h2>
            <p className="text-xs italic text-text-muted">"{persona.tagline}"</p>
          </div>
        </div>
        <a
          href="/"
          className="hidden rounded-md border border-neon-cyan/30 px-3 py-1.5 text-xs font-medium text-neon-cyan transition-colors hover:bg-neon-cyan/10 sm:inline-block"
        >
          Try it free
        </a>
      </div>
      <div className="mt-3">
        <PersonaSwitcher />
      </div>
    </div>
  )
}

function DemoContent() {
  const isDashboard = useMatch('/demo/:persona')

  return (
    <div className="min-h-screen bg-bg-primary pb-16 sm:pb-0">
      <DemoNavBar />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <DemoBanner />
        </div>
        {isDashboard && (
          <div className="mb-6">
            <DemoSummaryCard />
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}

export function DemoLayout() {
  const { persona } = useParams<{ persona: string }>()

  if (!persona) return null

  return (
    <DemoAppProvider personaSlug={persona}>
      <DemoContent />
    </DemoAppProvider>
  )
}
