import { useState } from 'react'
import { AmountDisplay } from './AmountDisplay'

interface SparkBarsProps {
  data: { label: string; value: number }[]
  color: string
  currency: string
  highlightLast?: boolean
}

const BAR_HEIGHT = 48
const MIN_BAR_HEIGHT = 2

export function SparkBars({ data, color, currency, highlightLast = true }: SparkBarsProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)
  const dense = data.length > 12

  return (
    <div
      className={`flex min-w-0 items-end ${dense ? 'gap-px sm:gap-1' : 'gap-1.5'}`}
    >
      {data.map((d, i) => {
        const isLast = highlightLast && i === data.length - 1
        const barH =
          d.value > 0 ? Math.max((d.value / max) * BAR_HEIGHT, MIN_BAR_HEIGHT) : MIN_BAR_HEIGHT
        const opacity = isLast ? 0.8 : 0.4

        return (
          <div
            key={d.label}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-1"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {hoveredIndex === i && (
              <div
                className="absolute -top-7 z-10 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px]"
                style={{ backgroundColor: `${color}30`, color }}
              >
                <AmountDisplay amount={d.value} currency={currency} size="sm" />
              </div>
            )}
            <div
              className="w-full rounded-sm transition-all duration-150"
              style={{
                height: `${barH}px`,
                backgroundColor: color,
                opacity,
              }}
            />
            <span
              className={`truncate text-[10px] text-text-muted ${dense ? 'hidden sm:inline' : ''}`}
            >
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
