import type { Database } from './interface.js'
import { createExpense, logSyncEntry, type CreateExpenseInput, type ExpenseRow } from './queries.js'
import { tagExpense } from './lenses.js'
import { splitTags } from '../lib/keyboard/capture.js'

// The one path for a brand-new expense: `+tags` in the note become tags, and
// everything written is queued for sync.
export async function saveNewExpense(
  db: Database,
  userId: string,
  input: CreateExpenseInput,
): Promise<ExpenseRow> {
  const { text, tags } = splitTags(input.description ?? '')
  const expense = await createExpense(db, { ...input, description: text || undefined })
  await logSyncEntry(
    db,
    userId,
    'expenses',
    expense.id,
    'create',
    expense as unknown as Record<string, unknown>,
  )
  if (tags.length > 0) await tagExpense(db, userId, expense.id, tags)
  return expense
}
