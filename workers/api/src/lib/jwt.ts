import { sign } from 'hono/jwt'

const TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60

export async function createToken(userId: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    {
      sub: userId,
      iat: now,
      exp: now + TOKEN_EXPIRY_SECONDS,
    },
    secret,
  )
}
