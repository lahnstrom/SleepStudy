import type { Request, Response } from 'express'
import { pool } from '../db.js'

export async function getParticipantLabId(participantId: number): Promise<number | null> {
  const result = await pool.query('SELECT lab_id FROM participants WHERE id = $1', [participantId])
  return result.rows[0]?.lab_id ?? null
}

export async function getSessionLabId(sessionId: string): Promise<number | null> {
  const result = await pool.query(
    'SELECT p.lab_id FROM sessions s JOIN participants p ON p.id = s.participant_id WHERE s.id = $1',
    [sessionId]
  )
  return result.rows[0]?.lab_id ?? null
}

export async function checkLabAccess(req: Request, res: Response, labId: number | null): Promise<boolean> {
  if (labId === null) {
    res.status(404).json({ error: 'Not found' })
    return false
  }
  if (req.session.role === 'admin') return true
  if (req.session.labId !== labId) {
    res.status(403).json({ error: 'Access denied' })
    return false
  }
  return true
}
