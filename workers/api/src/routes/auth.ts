import { Hono } from 'hono'
import type { AppEnv } from '../types.js'
import { createToken } from '../lib/jwt.js'
import { sendEmail } from '../lib/resend.js'
import { DEFAULT_CURRENCY } from '@pancakemaker/shared'

const TOKEN_EXPIRY_MINUTES = 15

interface AuthTokenRow {
  id: string
  email: string
  expires_at: string
  used_at: string | null
}

async function completeVerification(
  db: D1Database,
  row: AuthTokenRow,
  jwtSecret: string,
): Promise<{ token: string; user: { id: string; email: string; baseCurrency: string } }> {
  await db
    .prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), row.id)
    .run()

  let user = await db
    .prepare('SELECT id, email, base_currency FROM users WHERE email = ?')
    .bind(row.email)
    .first<{ id: string; email: string; base_currency: string }>()

  if (!user) {
    const userId = crypto.randomUUID()
    const now = new Date().toISOString()
    await db
      .prepare(
        'INSERT INTO users (id, email, base_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(userId, row.email, DEFAULT_CURRENCY, now, now)
      .run()
    user = { id: userId, email: row.email, base_currency: DEFAULT_CURRENCY }
  }

  const jwt = await createToken(user.id, jwtSecret)

  return {
    token: jwt,
    user: { id: user.id, email: user.email, baseCurrency: user.base_currency },
  }
}

function validateTokenRow(
  row: AuthTokenRow | null,
): { valid: false; error: string; status: 401 } | { valid: true; row: AuthTokenRow } {
  if (!row) {
    return { valid: false, error: 'Invalid token', status: 401 }
  }
  if (row.used_at) {
    return { valid: false, error: 'Token already used', status: 401 }
  }
  if (new Date(row.expires_at) < new Date()) {
    return { valid: false, error: 'Token expired', status: 401 }
  }
  return { valid: true, row }
}

export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/magic-link', async (c) => {
  const body = await c.req.json<{ email?: string }>()
  const email = body.email?.trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Valid email is required' }, 400)
  }

  const db = c.env.DB
  const tokenId = crypto.randomUUID()
  const token = crypto.randomUUID()
  const code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000)

  await db
    .prepare(
      'INSERT INTO auth_tokens (id, email, token, code, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(tokenId, email, token, code, expiresAt.toISOString(), now.toISOString())
    .run()

  const verifyUrl = `${c.env.APP_URL}/auth/verify?token=${token}`

  await sendEmail({
    apiKey: c.env.RESEND_API_KEY,
    to: email,
    subject: 'Sign in to Pancakemaker',
    html: `
      <div style="font-family: monospace; background: #0a0a0f; color: #e8e8f0; padding: 40px; text-align: center;">
        <h1 style="color: #00ffcc;">Pancakemaker</h1>
        <p>Click below to sign in:</p>
        <a href="${verifyUrl}" style="display: inline-block; margin: 20px 0; padding: 12px 32px; background: #00ffcc; color: #0a0a0f; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Sign In
        </a>
        <div style="margin: 24px 0; padding: 16px; background: #12121a; border-radius: 8px;">
          <p style="color: #8888aa; font-size: 12px; margin: 0 0 8px 0;">Or enter this code in the app:</p>
          <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #00ffcc; margin: 0;">${code}</p>
        </div>
        <p style="color: #8888aa; font-size: 12px;">This link expires in ${TOKEN_EXPIRY_MINUTES} minutes.</p>
      </div>
    `,
  })

  return c.json({ ok: true })
})

authRoutes.post('/verify', async (c) => {
  const body = await c.req.json<{ token?: string }>()
  const token = body.token
  if (!token) {
    return c.json({ error: 'Token is required' }, 400)
  }

  const db = c.env.DB
  const row = await db
    .prepare('SELECT id, email, expires_at, used_at FROM auth_tokens WHERE token = ?')
    .bind(token)
    .first<AuthTokenRow>()

  const validation = validateTokenRow(row)
  if (!validation.valid) {
    return c.json({ error: validation.error }, validation.status)
  }

  const result = await completeVerification(db, validation.row, c.env.JWT_SECRET)
  return c.json(result)
})

authRoutes.post('/verify-code', async (c) => {
  const body = await c.req.json<{ email?: string; code?: string }>()
  const email = body.email?.trim().toLowerCase()
  const code = body.code?.trim()

  if (!email || !code) {
    return c.json({ error: 'Email and code are required' }, 400)
  }

  const db = c.env.DB
  const row = await db
    .prepare(
      'SELECT id, email, expires_at, used_at FROM auth_tokens WHERE email = ? AND code = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1',
    )
    .bind(email, code)
    .first<AuthTokenRow>()

  const validation = validateTokenRow(row)
  if (!validation.valid) {
    return c.json({ error: validation.error }, validation.status)
  }

  const result = await completeVerification(db, validation.row, c.env.JWT_SECRET)
  return c.json(result)
})
