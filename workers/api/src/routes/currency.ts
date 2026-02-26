import { Hono } from 'hono'
import type { AppEnv } from '../types.js'
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '@pancakemaker/shared'

const FRANKFURTER_API = 'https://api.frankfurter.dev/v1'

interface FrankfurterResponse {
  base: string
  date: string
  rates: Record<string, number>
}

export const currencyRoutes = new Hono<AppEnv>()

currencyRoutes.get('/rates', async (c) => {
  const base = (c.req.query('base') ?? DEFAULT_CURRENCY).toUpperCase()

  if (!SUPPORTED_CURRENCIES.includes(base as (typeof SUPPORTED_CURRENCIES)[number])) {
    return c.json({ error: `Unsupported currency: ${base}` }, 400)
  }

  const db = c.env.DB
  const today = new Date().toISOString().slice(0, 10)

  const cached = await db
    .prepare('SELECT target_currency, rate FROM exchange_rates WHERE base_currency = ? AND date = ?')
    .bind(base, today)
    .all<{ target_currency: string; rate: number }>()

  if (cached.results.length > 0) {
    const rates: Record<string, number> = {}
    for (const row of cached.results) {
      rates[row.target_currency] = row.rate
    }
    return c.json({ base, date: today, rates, cached: true })
  }

  try {
    const res = await fetch(`${FRANKFURTER_API}/latest?base=${base}`)
    if (!res.ok) {
      return c.json({ error: 'Failed to fetch exchange rates' }, 502)
    }

    const data = (await res.json()) as FrankfurterResponse
    const now = new Date().toISOString()

    const statements = Object.entries(data.rates).map(([currency, rate]) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO exchange_rates (id, base_currency, target_currency, rate, date, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(`${base}-${currency}-${data.date}`, base, currency, rate, data.date, now),
    )

    if (statements.length > 0) {
      await db.batch(statements)
    }

    return c.json({ base, date: data.date, rates: data.rates, cached: false })
  } catch (err) {
    const stale = await db
      .prepare(
        'SELECT target_currency, rate, date FROM exchange_rates WHERE base_currency = ? ORDER BY date DESC LIMIT 50',
      )
      .bind(base)
      .all<{ target_currency: string; rate: number; date: string }>()

    if (stale.results.length > 0) {
      const rates: Record<string, number> = {}
      for (const row of stale.results) {
        rates[row.target_currency] = row.rate
      }
      return c.json({ base, date: stale.results[0].date, rates, cached: true, stale: true })
    }

    return c.json(
      { error: 'Exchange rate service unavailable', detail: String(err) },
      503,
    )
  }
})
