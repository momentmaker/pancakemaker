import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './types.js'
import { authRoutes } from './routes/auth.js'
import { syncRoutes } from './routes/sync.js'
import { currencyRoutes } from './routes/currency.js'

const app = new Hono<AppEnv>()

app.use('/*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/auth', authRoutes)
app.route('/sync', syncRoutes)
app.route('/currency', currencyRoutes)

export type { AppEnv }
export default app
