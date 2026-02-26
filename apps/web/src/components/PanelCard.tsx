import { useNavigate } from 'react-router-dom'
import { Card } from './Card'
import { AmountDisplay } from './AmountDisplay'

interface PanelCardProps {
  id: string
  name: string
  currency: string
  expenseCount: number
  total: number
  routeType: 'personal' | 'business'
  isDefault?: boolean
  isArchived?: boolean
  recurrenceType?: string | null
}

export function PanelCard({
  id,
  name,
  currency,
  expenseCount,
  total,
  routeType,
  isDefault = false,
  isArchived = false,
  recurrenceType,
}: PanelCardProps) {
  const navigate = useNavigate()

  return (
    <Card
      onClick={() => navigate(`/${routeType}/panel/${id}`)}
      className={isArchived ? 'opacity-50' : ''}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-text-primary">{name}</h3>
          {isDefault && (
            <span className="rounded bg-neon-cyan/15 px-1.5 py-0.5 text-[10px] font-medium text-neon-cyan">
              Default
            </span>
          )}
          {recurrenceType && (
            <span className="rounded bg-neon-violet/15 px-1.5 py-0.5 text-[10px] font-medium text-neon-violet">
              {recurrenceType === 'monthly' ? 'Monthly' : 'Annual'}
            </span>
          )}
          {isArchived && (
            <span className="rounded bg-text-muted/15 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
              Archived
            </span>
          )}
        </div>
        <span className="rounded bg-bg-elevated px-2 py-0.5 font-mono text-xs text-text-secondary">
          {currency}
        </span>
      </div>
      <div className="mt-1">
        <p className="text-xs text-text-muted">
          {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
        </p>
      </div>
      <div className="mt-3">
        <AmountDisplay amount={total} currency={currency} size="lg" />
      </div>
    </Card>
  )
}
