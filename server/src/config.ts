import 'dotenv/config'

function required(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required environment variable: ${name}`)
  return val
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  port: parseInt(process.env.PORT ?? '3000', 10),
  isProd: process.env.NODE_ENV === 'production',
  sessionCookieName: 'naps.sid',
}
