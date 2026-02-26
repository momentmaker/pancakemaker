import { useState, useEffect, useCallback } from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import { getExchangeRates, upsertExchangeRates } from '../db/queries.js'

const FRANKFURTER_API = 'https://api.frankfurter.dev/v1'
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000

interface FrankfurterResponse {
  base: string
  date: string
  rates: Record<string, number>
}

export function useExchangeRates(baseCurrency: string) {
  const db = useDatabase()
  const [rates, setRates] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadRates() {
      setLoading(true)
      try {
        const cached = await getExchangeRates(db, baseCurrency)
        if (cached.length > 0) {
          const map = new Map<string, number>()
          for (const r of cached) map.set(r.target_currency, r.rate)
          if (!cancelled) setRates(map)

          const fetchedDate = new Date(cached[0].date + 'T00:00:00')
          const stale = Date.now() - fetchedDate.getTime() > CACHE_DURATION_MS
          if (!stale) {
            if (!cancelled) setLoading(false)
            return
          }
        }

        const res = await fetch(`${FRANKFURTER_API}/latest?base=${baseCurrency}`)
        if (!res.ok) {
          if (!cancelled) setLoading(false)
          return
        }

        const data = (await res.json()) as FrankfurterResponse
        await upsertExchangeRates(db, baseCurrency, data.date, data.rates)

        if (!cancelled) {
          const map = new Map<string, number>()
          for (const [currency, rate] of Object.entries(data.rates)) {
            map.set(currency, rate)
          }
          setRates(map)
        }
      } catch {
        // keep any cached rates we already have
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRates()
    return () => {
      cancelled = true
    }
  }, [db, baseCurrency])

  const convert = useCallback(
    (amount: number, fromCurrency: string): number => {
      if (fromCurrency === baseCurrency) return amount
      const rate = rates.get(fromCurrency)
      if (!rate || rate === 0) return amount
      return Math.round(amount / rate)
    },
    [rates, baseCurrency],
  )

  return { rates, loading, convert }
}
