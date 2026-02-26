import type { Database } from './interface.js'
import type { ExpenseRow, PanelRow } from './queries.js'

export function calculateMissingDates(
  recurrenceType: 'monthly' | 'annual',
  recurrenceDay: number,
  startDate: string,
  lastGenerated: string | null,
  today: string,
): string[] {
  const dates: string[] = []
  const todayDate = new Date(today + 'T00:00:00Z')

  const cursor = lastGenerated
    ? new Date(lastGenerated + 'T00:00:00Z')
    : new Date(startDate + 'T00:00:00Z')

  if (!lastGenerated) {
    const startD = new Date(startDate + 'T00:00:00Z')
    if (startD <= todayDate) {
      dates.push(startDate)
    }
  }

  while (true) {
    let next: Date
    if (recurrenceType === 'monthly') {
      next = new Date(cursor)
      next.setUTCMonth(next.getUTCMonth() + 1)
      next.setUTCDate(recurrenceDay)
    } else {
      next = new Date(cursor)
      next.setUTCFullYear(next.getUTCFullYear() + 1)
      next.setUTCMonth(new Date(startDate + 'T00:00:00Z').getUTCMonth())
      next.setUTCDate(recurrenceDay)
    }

    if (next > todayDate) break

    const dateStr = next.toISOString().split('T')[0]
    dates.push(dateStr)
    cursor.setTime(next.getTime())
  }

  return dates
}

export async function generateRecurringExpenses(db: Database): Promise<number> {
  const recurringPanels = await db.query<PanelRow>(
    'SELECT * FROM panels WHERE recurrence_type IS NOT NULL',
  )
  if (recurringPanels.length === 0) return 0

  const today = new Date().toISOString().split('T')[0]
  let generated = 0

  await db.transaction(async () => {
    for (const panel of recurringPanels) {
      const recurrenceType = panel.recurrence_type as 'monthly' | 'annual'

      const originals = await db.query<ExpenseRow>(
        'SELECT * FROM expenses WHERE panel_id = ? AND source_expense_id IS NULL AND deleted_at IS NULL',
        [panel.id],
      )

      for (const original of originals) {
        const recurrenceDay =
          original.recurrence_day ?? new Date(original.date + 'T00:00:00Z').getUTCDate()

        const existingDates = await db.query<{ date: string }>(
          'SELECT date FROM expenses WHERE source_expense_id = ? AND deleted_at IS NULL',
          [original.id],
        )
        const existingSet = new Set(existingDates.map((r) => r.date))

        const lastGenerated =
          existingDates.length > 0
            ? existingDates
                .map((r) => r.date)
                .sort()
                .pop()!
            : null

        const missing = calculateMissingDates(
          recurrenceType,
          recurrenceDay,
          original.date,
          lastGenerated,
          today,
        ).filter((d) => d !== original.date && !existingSet.has(d))

        for (const date of missing) {
          const id = crypto.randomUUID()
          const timestamp = new Date().toISOString()
          await db.execute(
            `INSERT INTO expenses (id, panel_id, category_id, amount, currency, description, date, is_recurring, recurrence_type, recurrence_day, source_expense_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
            [
              id,
              original.panel_id,
              original.category_id,
              original.amount,
              original.currency,
              original.description,
              date,
              recurrenceType,
              recurrenceDay,
              original.id,
              timestamp,
              timestamp,
            ],
          )
          generated++
        }
      }
    }
  })

  return generated
}
