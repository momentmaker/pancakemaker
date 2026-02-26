import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '../hooks/useAppState'
import { useDatabase } from '../db/DatabaseContext'
import { Card } from '../components/Card'
import { AmountDisplay } from '../components/AmountDisplay'
import { PancakeStack } from '../components/PancakeStack'

interface CategorySpend {
  name: string
  color: string
  amount: number
}

interface DashboardStats {
  totalExpenses: number
  totalAmount: number
  personalAmount: number
  businessAmount: number
  categoryBreakdown: CategorySpend[]
}

function getGreeting(): { line1: string; line2: string } {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12)
    return {
      line1: 'Rise & shine!',
      line2: 'Fresh pancakes on the griddle.',
    }
  if (hour >= 12 && hour < 17)
    return {
      line1: 'Afternoon check-in.',
      line2: "How's the stack looking?",
    }
  if (hour >= 17 && hour < 21)
    return {
      line1: 'Evening review time.',
      line2: "Let's see today's stack.",
    }
  return {
    line1: 'Late night pancaking?',
    line2: "We won't judge.",
  }
}

function getSpendingLevel(cents: number): { label: string; color: string } {
  const dollars = cents / 100
  if (dollars === 0) return { label: 'Your plate is clean!', color: 'text-text-muted' }
  if (dollars <= 50) return { label: 'Just a nibble', color: 'text-neon-lime' }
  if (dollars <= 200) return { label: 'Short stack', color: 'text-neon-cyan' }
  if (dollars <= 500) return { label: 'Full stack', color: 'text-neon-amber' }
  if (dollars <= 1000) return { label: 'Tall stack!', color: 'text-neon-orange' }
  return { label: 'Grand slam!', color: 'text-neon-magenta' }
}

function HeroPancake() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 512 512"
      fill="none"
      className="shrink-0"
      style={{ animation: 'float 3s ease-in-out infinite' }}
    >
      <defs>
        <linearGradient id="hero-cyan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#00ccaa" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-magenta" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6b9d" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#cc4477" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-amber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#d49a10" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-violet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#9955dd" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-lime" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3e635" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7dbb18" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-syrup" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#00ffcc" stopOpacity="0.15" />
        </linearGradient>
        <filter id="hero-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="hero-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="hero-outer" x="-50%" y="-50%" width="200%" height="200%">
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

      <g filter="url(#hero-glow)">
        <ellipse cx="256" cy="340" rx="138" ry="36" fill="#12121a" />
        <ellipse cx="256" cy="340" rx="138" ry="36" fill="url(#hero-amber)" opacity="0.35" />
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
      <g filter="url(#hero-glow)">
        <ellipse cx="256" cy="298" rx="132" ry="34" fill="#12121a" />
        <ellipse cx="256" cy="298" rx="132" ry="34" fill="url(#hero-violet)" opacity="0.35" />
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
      <g filter="url(#hero-glow)">
        <ellipse cx="256" cy="256" rx="126" ry="32" fill="#12121a" />
        <ellipse cx="256" cy="256" rx="126" ry="32" fill="url(#hero-magenta)" opacity="0.35" />
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
      <g filter="url(#hero-glow)">
        <ellipse cx="256" cy="214" rx="120" ry="30" fill="#12121a" />
        <ellipse cx="256" cy="214" rx="120" ry="30" fill="url(#hero-lime)" opacity="0.35" />
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
      <g filter="url(#hero-soft)">
        <ellipse cx="256" cy="172" rx="114" ry="28" fill="#12121a" />
        <ellipse cx="256" cy="172" rx="114" ry="28" fill="url(#hero-cyan)" opacity="0.4" />
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
        stroke="url(#hero-syrup)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        filter="url(#hero-glow)"
      />
      <path
        d="M338 190 Q348 230 340 265 Q336 280 342 310 Q346 330 340 345"
        stroke="url(#hero-syrup)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        filter="url(#hero-glow)"
      />
      <path
        d="M306 178 Q312 200 308 220"
        stroke="url(#hero-syrup)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        filter="url(#hero-glow)"
      />

      <g filter="url(#hero-outer)">
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

export function Dashboard() {
  const { userId, personalRouteId, businessRouteId, baseCurrency } = useAppState()
  const db = useDatabase()
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    async function loadStats() {
      const currentMonth = new Date().toISOString().slice(0, 7)

      const allExpenses = await db.query<{ amount: number; panel_id: string }>(
        `SELECT e.amount, e.panel_id FROM expenses e
         JOIN panels p ON e.panel_id = p.id
         WHERE e.deleted_at IS NULL AND e.date LIKE ?`,
        [`${currentMonth}%`],
      )

      const personalPanels = await db.query<{ id: string }>(
        'SELECT id FROM panels WHERE route_id = ?',
        [personalRouteId],
      )
      const businessPanels = await db.query<{ id: string }>(
        'SELECT id FROM panels WHERE route_id = ?',
        [businessRouteId],
      )
      const personalIds = new Set(personalPanels.map((p) => p.id))
      const businessIds = new Set(businessPanels.map((p) => p.id))

      let personalAmount = 0
      let businessAmount = 0
      for (const exp of allExpenses) {
        if (personalIds.has(exp.panel_id as string)) personalAmount += exp.amount as number
        if (businessIds.has(exp.panel_id as string)) businessAmount += exp.amount as number
      }

      const categoryData = await db.query<{ name: string; color: string; total: number }>(
        `SELECT c.name, c.color, SUM(e.amount) as total
         FROM expenses e
         JOIN categories c ON e.category_id = c.id
         WHERE e.deleted_at IS NULL AND e.date LIKE ?
         GROUP BY c.id
         ORDER BY total DESC
         LIMIT 10`,
        [`${currentMonth}%`],
      )

      setStats({
        totalExpenses: allExpenses.length,
        totalAmount: personalAmount + businessAmount,
        personalAmount,
        businessAmount,
        categoryBreakdown: categoryData.map((d) => ({
          name: d.name as string,
          color: d.color as string,
          amount: d.total as number,
        })),
      })
    }

    loadStats()
  }, [db, personalRouteId, businessRouteId, userId])

  const greeting = useMemo(getGreeting, [])
  const currentMonthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
  const spendingLevel = stats ? getSpendingLevel(stats.totalAmount) : null

  return (
    <div>
      {/* Hero greeting */}
      <div className="flex items-center gap-5">
        <HeroPancake />
        <div>
          <h1 className="font-mono text-2xl font-bold text-neon-cyan">{greeting.line1}</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{greeting.line2}</p>
          <p className="mt-1 font-mono text-xs text-text-muted">{currentMonthLabel}</p>
        </div>
      </div>

      {stats && (
        <>
          {/* Stat cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Card glow>
              <p className="font-mono text-xs text-text-muted">Your Stack</p>
              <div className="mt-2">
                <AmountDisplay amount={stats.totalAmount} currency={baseCurrency} size="lg" />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-xs text-text-muted">
                  {stats.totalExpenses} {stats.totalExpenses === 1 ? 'pancake' : 'pancakes'}
                </span>
                {spendingLevel && (
                  <>
                    <span className="text-text-muted">·</span>
                    <span className={`font-mono text-xs font-semibold ${spendingLevel.color}`}>
                      {spendingLevel.label}
                    </span>
                  </>
                )}
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-neon-violet" />
                <p className="font-mono text-xs text-text-muted">Personal</p>
              </div>
              <div className="mt-2">
                <AmountDisplay amount={stats.personalAmount} currency={baseCurrency} size="lg" />
              </div>
              <Link
                to="/personal"
                className="mt-2 inline-block font-mono text-[10px] text-text-muted transition-colors hover:text-neon-cyan"
              >
                View panels →
              </Link>
            </Card>
            <Card>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-neon-blue" />
                <p className="font-mono text-xs text-text-muted">Business</p>
              </div>
              <div className="mt-2">
                <AmountDisplay amount={stats.businessAmount} currency={baseCurrency} size="lg" />
              </div>
              <Link
                to="/business"
                className="mt-2 inline-block font-mono text-[10px] text-text-muted transition-colors hover:text-neon-cyan"
              >
                View panels →
              </Link>
            </Card>
          </div>

          {/* Pancake Stack visualization */}
          {stats.categoryBreakdown.length > 0 ? (
            <Card className="mt-8">
              <h2 className="mb-2 text-center font-mono text-sm font-semibold text-text-secondary">
                Pancake Stack
              </h2>
              <p className="mb-4 text-center text-xs text-text-muted">
                Your top categories this month — hover to explore
              </p>
              <PancakeStack layers={stats.categoryBreakdown} currency={baseCurrency} />
            </Card>
          ) : (
            <Card className="mt-8">
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div style={{ animation: 'float 3s ease-in-out infinite' }}>
                  <svg width="64" height="64" viewBox="0 0 512 512" fill="none" opacity="0.4">
                    <defs>
                      <filter id="empty-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>
                    <ellipse
                      cx="256"
                      cy="300"
                      rx="130"
                      ry="34"
                      fill="#12121a"
                      filter="url(#empty-glow)"
                    />
                    <ellipse
                      cx="256"
                      cy="300"
                      rx="130"
                      ry="34"
                      fill="none"
                      stroke="#555570"
                      strokeWidth="1.5"
                      strokeDasharray="8 6"
                    />
                    <ellipse
                      cx="256"
                      cy="260"
                      rx="120"
                      ry="30"
                      fill="#12121a"
                      filter="url(#empty-glow)"
                    />
                    <ellipse
                      cx="256"
                      cy="260"
                      rx="120"
                      ry="30"
                      fill="none"
                      stroke="#555570"
                      strokeWidth="1.5"
                      strokeDasharray="8 6"
                    />
                    <ellipse
                      cx="256"
                      cy="220"
                      rx="110"
                      ry="26"
                      fill="#12121a"
                      filter="url(#empty-glow)"
                    />
                    <ellipse
                      cx="256"
                      cy="220"
                      rx="110"
                      ry="26"
                      fill="none"
                      stroke="#555570"
                      strokeWidth="1.5"
                      strokeDasharray="8 6"
                    />
                  </svg>
                </div>
                <p className="mt-4 font-mono text-sm text-text-secondary">Your plate is empty!</p>
                <p className="mt-1 text-xs text-text-muted">
                  Start stacking some expenses to build your pancake.
                </p>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
