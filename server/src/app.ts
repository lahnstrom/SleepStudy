import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import cors from 'cors'
import { pool } from './db.js'
import { config } from './config.js'
import { errorHandler } from './middleware/errorHandler.js'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import configRoutes from './routes/config.js'
import labRoutes from './routes/labs.js'
import participantRoutes from './routes/participants.js'
import sessionRoutes from './routes/sessions.js'
import trialRoutes from './routes/trials.js'
import assignmentRoutes from './routes/assignments.js'
import './types.js'

const PgStore = connectPgSimple(session)

export const app = express()

app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}))

app.use(express.json())

app.use(session({
  store: new PgStore({
    pool,
    tableName: 'session',
  }),
  name: config.sessionCookieName,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}))

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/config', configRoutes)
app.use('/api/labs', labRoutes)
app.use('/api/labs', participantRoutes)
app.use('/api/sessions', sessionRoutes)
app.use('/api/sessions', trialRoutes)
app.use('/api/participants', assignmentRoutes)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)
