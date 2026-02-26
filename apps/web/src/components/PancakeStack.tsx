import { useState, useMemo } from 'react'

interface PancakeLayer {
  name: string
  color: string
  amount: number
}

interface PancakeStackProps {
  layers: PancakeLayer[]
  currency: string
}

const CENTER_X = 200
const MAX_RX = 145
const MIN_RX = 65
const RY = 28
const LAYER_SPACING = 42
const PADDING_TOP = 70
const PADDING_BOTTOM = 50

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export function PancakeStack({ layers, currency }: PancakeStackProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const sorted = useMemo(() => [...layers].sort((a, b) => b.amount - a.amount), [layers])

  const maxAmount = sorted[0]?.amount ?? 1
  const totalHeight = PADDING_TOP + sorted.length * LAYER_SPACING + PADDING_BOTTOM

  const pancakes = useMemo(() => {
    return sorted.map((layer, i) => {
      const proportion = layer.amount / maxAmount
      const rx = MIN_RX + (MAX_RX - MIN_RX) * proportion
      const y = totalHeight - PADDING_BOTTOM - i * LAYER_SPACING
      return { ...layer, rx, y, i }
    })
  }, [sorted, maxAmount, totalHeight])

  const topPancake = pancakes[pancakes.length - 1]

  return (
    <svg
      viewBox={`0 0 400 ${totalHeight}`}
      className="mx-auto w-full max-w-sm"
      role="img"
      aria-label="Pancake stack showing category spending"
    >
      <defs>
        <filter id="ps-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="ps-outer" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="blur" />
          <feFlood floodColor="#00ffcc" floodOpacity="0.2" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="ps-syrup" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4A030" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#8B6914" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Plate shadow */}
      <ellipse
        cx={CENTER_X}
        cy={totalHeight - PADDING_BOTTOM + 20}
        rx={160}
        ry={18}
        fill="#00ffcc"
        opacity="0.04"
      />
      <ellipse
        cx={CENTER_X}
        cy={totalHeight - PADDING_BOTTOM + 16}
        rx={140}
        ry={12}
        fill="#00ffcc"
        opacity="0.06"
      />

      {/* Syrup drips */}
      {pancakes.length > 2 && (
        <g filter="url(#ps-glow)" opacity="0.5">
          <path
            d={`M${CENTER_X - pancakes[pancakes.length - 1].rx + 15} ${topPancake.y} Q${CENTER_X - pancakes[pancakes.length - 1].rx + 5} ${topPancake.y + 50} ${CENTER_X - pancakes[Math.floor(pancakes.length / 2)].rx + 10} ${pancakes[Math.floor(pancakes.length / 2)].y}`}
            stroke="url(#ps-syrup)"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M${CENTER_X + pancakes[pancakes.length - 1].rx - 12} ${topPancake.y + 5} Q${CENTER_X + pancakes[pancakes.length - 1].rx + 2} ${topPancake.y + 60} ${CENTER_X + pancakes[0].rx - 8} ${pancakes[0].y - 10}`}
            stroke="url(#ps-syrup)"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )}

      {/* Pancake layers — bottom to top */}
      {pancakes.map((p) => {
        const isHovered = hoveredIndex === p.i
        const fillOpacity = isHovered ? 0.55 : 0.35
        const strokeOpacity = isHovered ? 1 : 0.7
        const strokeWidth = isHovered ? 2.5 : 1.5

        return (
          <g
            key={p.name}
            filter="url(#ps-glow)"
            onMouseEnter={() => setHoveredIndex(p.i)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{ cursor: 'pointer' }}
          >
            {/* Pancake body */}
            <ellipse cx={CENTER_X} cy={p.y} rx={p.rx} ry={RY} fill="#12121a" />
            <ellipse
              cx={CENTER_X}
              cy={p.y}
              rx={p.rx}
              ry={RY}
              fill={p.color}
              opacity={fillOpacity}
            />
            <ellipse
              cx={CENTER_X}
              cy={p.y}
              rx={p.rx}
              ry={RY}
              fill="none"
              stroke={p.color}
              strokeWidth={strokeWidth}
              opacity={strokeOpacity}
            />

            {/* Category label on pancake */}
            <text
              x={CENTER_X}
              y={p.y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={p.color}
              fontSize="11"
              fontFamily="'JetBrains Mono', monospace"
              fontWeight="600"
              opacity={isHovered ? 1 : 0.8}
            >
              {p.name.length > 14 ? p.name.slice(0, 12) + '..' : p.name}
            </text>
          </g>
        )
      })}

      {/* Butter pat on top */}
      {topPancake && (
        <g filter="url(#ps-outer)">
          <rect
            x={CENTER_X - 16}
            y={topPancake.y - RY - 10}
            width={32}
            height={10}
            rx={3}
            fill="#12121a"
          />
          <rect
            x={CENTER_X - 16}
            y={topPancake.y - RY - 10}
            width={32}
            height={10}
            rx={3}
            fill="#fbbf24"
            opacity="0.3"
          />
          <rect
            x={CENTER_X - 16}
            y={topPancake.y - RY - 10}
            width={32}
            height={10}
            rx={3}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.5"
            opacity="0.7"
          />
        </g>
      )}

      {/* Hover tooltip */}
      {hoveredIndex !== null &&
        pancakes[hoveredIndex] &&
        (() => {
          const p = pancakes.find((pk) => pk.i === hoveredIndex)!
          const tooltipY = p.y - RY - 22
          const text = `${p.name}: ${formatAmount(p.amount, currency)}`
          const textWidth = text.length * 7.5
          const boxWidth = textWidth + 20
          return (
            <g>
              <rect
                x={CENTER_X - boxWidth / 2}
                y={tooltipY - 14}
                width={boxWidth}
                height={24}
                rx={6}
                fill="#1a1a2e"
                stroke={p.color}
                strokeWidth="1"
                opacity="0.95"
              />
              <text
                x={CENTER_X}
                y={tooltipY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#e8e8f0"
                fontSize="11"
                fontFamily="'JetBrains Mono', monospace"
              >
                {text}
              </text>
            </g>
          )
        })()}
    </svg>
  )
}
