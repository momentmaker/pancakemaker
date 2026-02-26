import { useNavigate } from 'react-router-dom'
import { Card } from './Card'
import { AmountDisplay } from './AmountDisplay'

interface CategoryCardProps {
  id: string
  name: string
  color: string
  total: number
  count: number
  currency: string
  routeType: 'personal' | 'business'
}

export function CategoryCard({
  id,
  name,
  color,
  total,
  count,
  currency,
  routeType,
}: CategoryCardProps) {
  const navigate = useNavigate()

  return (
    <Card onClick={() => navigate(`/${routeType}/category/${id}`)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="font-medium text-text-primary">{name}</h3>
        </div>
        <span className="text-xs text-text-muted">
          {count} {count === 1 ? 'expense' : 'expenses'}
        </span>
      </div>
      <div className="mt-4">
        <AmountDisplay amount={total} currency={currency} size="lg" />
      </div>
    </Card>
  )
}
