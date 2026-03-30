import 'express-session'

declare module 'express-session' {
  interface SessionData {
    userId: number
    email: string
    role: 'lab_user' | 'admin'
    labId: number | null
  }
}
