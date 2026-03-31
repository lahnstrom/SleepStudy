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
import imageRoutes from './routes/images.js'
import exportRoutes from './routes/export.js'
import sleepDataRoutes from './routes/sleepData.js'
import questionnaireRoutes from './routes/questionnaires.js'
import './types.js'

const PgStore = connectPgSimple(session)

export const app = express()

// Trust nginx reverse proxy (needed for secure cookies over HTTPS)
app.set('trust proxy', 1)

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
app.use('/api/images', imageRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/labs', sleepDataRoutes)
app.use('/api/labs', questionnaireRoutes)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)
