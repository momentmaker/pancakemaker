import { useEffect, useState, useMemo } from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import { useAppState } from '../hooks/useAppState.js'
import { useDemoContext } from './demo-context.js'
import { AmountDisplay } from '../components/AmountDisplay.js'
import { PancakeStack } from '../components/PancakeStack.js'
import { DemoShareButton } from './demo-share.js'

interface SummaryData {
  totalAmount: number
  topExpenses: { description: string; amount: number }[]
  categoryBreakdown: { name: string; color: string; amount: number }[]
}

export function DemoSummaryCard() {
  const persona = useDemoContext()
  const db = useDatabase()
  const { baseCurrency } = useAppState()
  const [data, setData] = useState<SummaryData | null>(null)

  useEffect(() => {
    async function load() {
      const currentMonth = new Date().toISOString().slice(0, 7)

      const totalRows = await db.query<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
         WHERE deleted_at IS NULL AND date LIKE ?`,
        [`${currentMonth}%`],
      )

      const topExpenses = await db.query<{ description: string; amount: number }>(
        `SELECT description, amount FROM expenses
         WHERE deleted_at IS NULL AND date LIKE ? AND description IS NOT NULL
         ORDER BY amount DESC LIMIT 3`,
        [`${currentMonth}%`],
      )

      const categories = await db.query<{ name: string; color: string; total: number }>(
        `SELECT c.name, c.color, SUM(e.amount) as total
         FROM expenses e
         JOIN categories c ON e.category_id = c.id
         WHERE e.deleted_at IS NULL AND e.date LIKE ?
         GROUP BY c.id
         ORDER BY total DESC
         LIMIT 8`,
        [`${currentMonth}%`],
      )

      setData({
        totalAmount: (totalRows[0]?.total as number) ?? 0,
        topExpenses: topExpenses.map((e) => ({
          description: e.description as string,
          amount: e.amount as number,
        })),
        categoryBreakdown: categories.map((c) => ({
          name: c.name as string,
          color: c.color as string,
          amount: c.total as number,
        })),
      })
    }
    load()
  }, [db])

  const topExpense = useMemo(() => {
    if (!data?.topExpenses.length) return { description: '', amount: 0 }
    return data.topExpenses[0]
  }, [data])

  if (!persona || !data) return null

  return (
    <div className="overflow-hidden rounded-xl border border-border-dim bg-gradient-to-br from-[#0a0a1a] via-[#12121f] to-[#0a0a1a]">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{persona.emoji}</span>
            <div>
              <h2 className="font-mono text-xl font-bold text-text-primary">{persona.name}</h2>
              <p className="text-xs italic text-text-muted">"{persona.tagline}"</p>
            </div>
          </div>
          <DemoShareButton topExpense={topExpense.description} topAmount={topExpense.amount} />
        </div>

        <div className="mt-5">
          <p className="font-mono text-xs text-text-muted">This month's damage</p>
          <div className="mt-1">
            <AmountDisplay amount={data.totalAmount} currency={baseCurrency} size="lg" />
          </div>
        </div>

        {data.topExpenses.length > 0 && (
          <div className="mt-5 flex flex-col gap-2">
            {data.topExpenses.map((expense, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm text-text-secondary">"{expense.description}"</p>
                <span className="shrink-0 font-mono text-xs text-neon-cyan">
                  ${(expense.amount / 100).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {data.categoryBreakdown.length > 0 && (
          <div className="mt-5">
            <PancakeStack layers={data.categoryBreakdown} currency={baseCurrency} />
          </div>
        )}
      </div>

      <div className="border-t border-border-dim bg-[#08080f] px-5 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-text-muted">pancakemaker.com/demo</span>
          <span className="font-mono text-[10px] font-bold text-neon-cyan">pancakemaker</span>
        </div>
      </div>
    </div>
  )
}
