import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from './test-db.js'
import { runMigrations } from './migrations.js'
import { seedDefaultData } from './seed.js'
import {
  createExpense,
  createTag,
  addTagToExpense,
  getCategoriesByRoute,
  getPanelsByRoute,
  softDeleteExpense,
  type ExpenseRow,
} from './queries.js'
import {
  tagExpense,
  untagExpense,
  getTagsForExpenses,
  getLenses,
  getLensExpenses,
} from './lenses.js'
import type { Database } from './interface.js'

let db: Database
let userId: string
let panelId: string
let mealsId: string
let travelId: string

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)
  const seed = await seedDefaultData(db, 'me@example.com')
  userId = seed.userId
  panelId = (await getPanelsByRoute(db, seed.personalRouteId))[0].id
  const cats = await getCategoriesByRoute(db, seed.personalRouteId)
  mealsId = cats.find((c) => c.name === 'Meals')!.id
  travelId = cats.find((c) => c.name === 'Transport')!.id
})

async function spend(amount: number, date: string, categoryId = mealsId): Promise<ExpenseRow> {
  return createExpense(db, { panelId, categoryId, amount, currency: 'USD', date })
}

describe('tagExpense', () => {
  it('reuses an existing tag regardless of case', async () => {
    // #given
    const a = await spend(1000, '2026-03-01')
    const b = await spend(2000, '2026-03-02')
    await tagExpense(db, userId, a.id, ['japan-trip'])

    // #when
    await tagExpense(db, userId, b.id, ['Japan-Trip'])

    // #then
    const tags = await db.query('SELECT * FROM tags')
    expect(tags).toHaveLength(1)
  })

  it('queues the new tag and both links for sync', async () => {
    // #given
    const a = await spend(1000, '2026-03-01')

    // #when
    await tagExpense(db, userId, a.id, ['japan-trip'])

    // #then
    const entries = await db.query<{ table_name: string; action: string }>(
      'SELECT table_name, action FROM sync_log ORDER BY id',
    )
    expect(entries.map((e) => `${e.table_name}:${e.action}`)).toEqual([
      'tags:create',
      'expense_tags:create',
    ])
  })

  it('does nothing for an expense that already has the tag', async () => {
    // #given
    const a = await spend(1000, '2026-03-01')
    await tagExpense(db, userId, a.id, ['japan-trip'])

    // #when
    await tagExpense(db, userId, a.id, ['japan-trip'])

    // #then
    const links = await db.query("SELECT * FROM sync_log WHERE table_name = 'expense_tags'")
    expect(links).toHaveLength(1)
  })
})

describe('untagExpense', () => {
  it('removes only the named tag from the expense', async () => {
    // #given
    const a = await spend(1000, '2026-03-01')
    await tagExpense(db, userId, a.id, ['japan-trip', 'work'])

    // #when
    await untagExpense(db, userId, a.id, 'japan-trip')

    // #then
    expect((await getTagsForExpenses(db, [a.id])).get(a.id)).toEqual(['work'])
  })

  it('leaves the tag on other expenses', async () => {
    // #given
    const a = await spend(1000, '2026-03-01')
    const b = await spend(2000, '2026-03-02')
    await tagExpense(db, userId, a.id, ['japan-trip'])
    await tagExpense(db, userId, b.id, ['japan-trip'])

    // #when
    await untagExpense(db, userId, a.id, 'japan-trip')

    // #then
    expect((await getLenses(db, userId)).map((l) => [l.name, l.count])).toEqual([['japan-trip', 1]])
  })

  it('removes same-named tags created on different devices', async () => {
    // #given
    const a = await spend(1000, '2026-03-01')
    const t1 = await createTag(db, userId, 'japan-trip')
    const t2 = await createTag(db, userId, 'Japan-Trip')
    await addTagToExpense(db, a.id, t1.id)
    await addTagToExpense(db, a.id, t2.id)

    // #when
    await untagExpense(db, userId, a.id, 'japan-trip')

    // #then
    expect((await getTagsForExpenses(db, [a.id])).get(a.id)).toBeUndefined()
  })

  it('queues each removed link for sync with both keys', async () => {
    // #given
    const a = await spend(1000, '2026-03-01')
    await tagExpense(db, userId, a.id, ['japan-trip'])
    const [tag] = await db.query<{ id: string }>('SELECT id FROM tags')

    // #when
    await untagExpense(db, userId, a.id, 'japan-trip')

    // #then
    const [entry] = await db.query<{ record_id: string; payload: string }>(
      "SELECT record_id, payload FROM sync_log WHERE table_name = 'expense_tags' AND action = 'delete'",
    )
    expect({ recordId: entry.record_id, payload: JSON.parse(entry.payload) }).toEqual({
      recordId: `${a.id}:${tag.id}`,
      payload: { expense_id: a.id, tag_id: tag.id },
    })
  })
})

describe('getTagsForExpenses', () => {
  it('maps each expense to its tag names', async () => {
    // #given
    const a = await spend(1000, '2026-03-01')
    const b = await spend(2000, '2026-03-02')
    await tagExpense(db, userId, a.id, ['work', 'japan-trip'])

    // #when
    const map = await getTagsForExpenses(db, [a.id, b.id])

    // #then
    expect({ a: map.get(a.id), b: map.get(b.id) }).toEqual({
      a: ['japan-trip', 'work'],
      b: undefined,
    })
  })
})

describe('getLenses', () => {
  it('totals each tag across categories and leaves out deleted expenses', async () => {
    // #given
    const ramen = await spend(1500, '2026-03-02')
    const train = await spend(8000, '2026-03-03', travelId)
    const oops = await spend(99999, '2026-03-04')
    for (const e of [ramen, train, oops]) await tagExpense(db, userId, e.id, ['japan-trip'])
    await softDeleteExpense(db, oops.id)

    // #when
    const [lens] = await getLenses(db, userId)

    // #then
    expect(lens).toEqual({
      name: 'japan-trip',
      count: 2,
      totals: [{ currency: 'USD', amount: 9500 }],
      firstDate: '2026-03-02',
      lastDate: '2026-03-03',
    })
  })

  it('merges same-named tags created on different devices', async () => {
    // #given
    const a = await spend(1000, '2026-03-01')
    const b = await spend(2000, '2026-03-02')
    const t1 = await createTag(db, userId, 'japan-trip')
    const t2 = await createTag(db, userId, 'Japan-Trip')
    await addTagToExpense(db, a.id, t1.id)
    await addTagToExpense(db, b.id, t2.id)

    // #when
    const lenses = await getLenses(db, userId)

    // #then
    expect(lenses.map((l) => [l.name, l.count])).toEqual([['japan-trip', 2]])
  })
})

describe('getLensExpenses', () => {
  it('lists the tagged expenses newest first with their category', async () => {
    // #given
    const ramen = await spend(1500, '2026-03-02')
    const train = await spend(8000, '2026-03-03', travelId)
    await spend(500, '2026-03-04')
    for (const e of [ramen, train]) await tagExpense(db, userId, e.id, ['japan-trip'])

    // #when
    const rows = await getLensExpenses(db, userId, 'Japan-Trip')

    // #then
    expect(rows.map((r) => [r.amount, r.category_name])).toEqual([
      [8000, 'Transport'],
      [1500, 'Meals'],
    ])
  })
})
