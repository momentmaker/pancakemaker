export type Bindings = {
  DB: D1Database
  RESEND_API_KEY: string
  JWT_SECRET: string
  APP_URL: string
  ENVIRONMENT: string
}

export type Variables = {
  userId: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
