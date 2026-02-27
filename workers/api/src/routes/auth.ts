import { Hono } from 'hono'
import type { AppEnv } from '../types.js'
import { createToken } from '../lib/jwt.js'
import { sendEmail } from '../lib/resend.js'
import { DEFAULT_CURRENCY } from '@pancakemaker/shared'

const TOKEN_EXPIRY_MINUTES = 15

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
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000)

  await db
    .prepare(
      'INSERT INTO auth_tokens (id, email, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(tokenId, email, token, expiresAt.toISOString(), now.toISOString())
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
    .first<{ id: string; email: string; expires_at: string; used_at: string | null }>()

  if (!row) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  if (row.used_at) {
    return c.json({ error: 'Token already used' }, 401)
  }

  if (new Date(row.expires_at) < new Date()) {
    return c.json({ error: 'Token expired' }, 401)
  }

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

  const jwt = await createToken(user.id, c.env.JWT_SECRET)

  return c.json({
    token: jwt,
    user: { id: user.id, email: user.email, baseCurrency: user.base_currency },
  })
})
