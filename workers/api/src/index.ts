import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './types.js'
import { authRoutes } from './routes/auth.js'
import { syncRoutes } from './routes/sync.js'
import { currencyRoutes } from './routes/currency.js'

const app = new Hono<AppEnv>()

app.use(
  '/*',
  cors({
    origin: (origin, c) => {
      const appUrl = c.env?.APP_URL || 'http://localhost:5173'
      if (
        origin === appUrl ||
        origin === 'http://localhost:5173' ||
        origin === 'http://localhost:5174'
      ) {
        return origin
      }
      return appUrl
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/auth', authRoutes)
app.route('/sync', syncRoutes)
app.route('/currency', currencyRoutes)

export type { AppEnv }
export default app
