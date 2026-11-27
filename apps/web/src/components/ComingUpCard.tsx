import { Link } from 'react-router-dom'
import { Card } from './Card'
import { UpcomingChargeRow } from './UpcomingChargeRow'
import { useRenewalRadar } from '../hooks/useRenewalRadar'
import { useRoutePrefix } from '../demo/demo-context'
import { ANNUAL_WARNING_DAYS, selectComingUp } from '../db/renewals'

export function ComingUpCard() {
  const radar = useRenewalRadar(ANNUAL_WARNING_DAYS)
  const prefix = useRoutePrefix()
  if (!radar) return null
  const comingUp = selectComingUp(radar.upcoming)
  if (comingUp.length === 0) return null

  return (
    <Card className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold text-text-secondary">Coming Up</h2>
        <Link
          to={`${prefix}/upcoming`}
          className="font-mono text-xs text-text-muted transition-colors hover:text-neon-cyan"
        >
          See all →
        </Link>
      </div>
      <div className="flex flex-col gap-1">
        {comingUp.map((charge) => (
          <UpcomingChargeRow key={charge.seriesId} charge={charge} />
        ))}
      </div>
    </Card>
  )
}
