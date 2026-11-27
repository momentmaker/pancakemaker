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

function todayString(): string {
  return new Date().toISOString().split('T')[0]
}

function dayBefore(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split('T')[0]
}

// Every device generates its own copies, so a copy's id must be derived from
// its series and date for a delete or edit synced from one device to land on
// the same row on another.
export async function recurringCopyId(originalId: string, date: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${originalId}:${date}`),
  )
  const hex = Array.from(new Uint8Array(digest).slice(0, 16), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '5' + hex.slice(13, 16),
    variant + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-')
}

function latestLiveOccurrence(original: ExpenseRow, copies: ExpenseRow[]): ExpenseRow {
  return copies
    .filter((c) => c.deleted_at === null)
    .reduce((latest, c) => (c.date > latest.date ? c : latest), original)
}

export async function generateRecurringExpenses(
  db: Database,
  today: string = todayString(),
): Promise<number> {
  const recurringPanels = await db.query<PanelRow>(
    'SELECT * FROM panels WHERE recurrence_type IS NOT NULL',
  )
  if (recurringPanels.length === 0) return 0

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

        // Deleted copies are included so a month the user removed counts as
        // already generated and is not recreated.
        const copies = await db.query<ExpenseRow>(
          'SELECT * FROM expenses WHERE source_expense_id = ?',
          [original.id],
        )
        const existingSet = new Set(copies.map((c) => c.date))
        const lastGenerated = copies.length > 0 ? [...existingSet].sort().pop()! : null
        const endDate = original.recurrence_end_date

        const missing = calculateMissingDates(
          recurrenceType,
          recurrenceDay,
          original.date,
          lastGenerated,
          today,
        ).filter(
          (d) => d !== original.date && !existingSet.has(d) && (endDate === null || d <= endDate),
        )
        if (missing.length === 0) continue

        const template = latestLiveOccurrence(original, copies)

        for (const date of missing) {
          const id = await recurringCopyId(original.id, date)
          const timestamp = new Date().toISOString()
          await db.execute(
            `INSERT INTO expenses (id, panel_id, category_id, amount, currency, description, date, is_recurring, recurrence_type, recurrence_day, source_expense_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
            [
              id,
              original.panel_id,
              template.category_id,
              template.amount,
              template.currency,
              template.description,
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

export interface StopRecurringResult {
  original: ExpenseRow
  deletedIds: string[]
}

export async function stopRecurringFrom(
  db: Database,
  copy: ExpenseRow,
): Promise<StopRecurringResult> {
  if (!copy.source_expense_id) {
    throw new Error(`Expense ${copy.id} is not a generated recurring copy`)
  }
  const originalId = copy.source_expense_id
  const originals = await db.query<ExpenseRow>('SELECT * FROM expenses WHERE id = ?', [originalId])
  if (!originals[0]) {
    throw new Error(`Original expense ${originalId} for recurring copy ${copy.id} not found`)
  }
  const toDelete = await db.query<{ id: string }>(
    'SELECT id FROM expenses WHERE source_expense_id = ? AND date >= ? AND deleted_at IS NULL',
    [originalId, copy.date],
  )
  const endDate = dayBefore(copy.date)
  const timestamp = new Date().toISOString()

  await db.transaction(async () => {
    await db.execute('UPDATE expenses SET recurrence_end_date = ?, updated_at = ? WHERE id = ?', [
      endDate,
      timestamp,
      originalId,
    ])
    for (const { id } of toDelete) {
      await db.execute('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        timestamp,
        timestamp,
        id,
      ])
    }
  })

  return {
    original: { ...originals[0], recurrence_end_date: endDate, updated_at: timestamp },
    deletedIds: toDelete.map((r) => r.id),
  }
}
