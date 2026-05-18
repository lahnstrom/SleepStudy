import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'

interface Session {
  id: string
  labDay: number
  sessionType: string
  condition: string
  completedAt: string | null
}

interface Participant {
  id: number
  participant_code: string
  condition_order: number
  sessions: Session[]
}

const SESSION_TYPES = ['encoding', 'test1', 'test2'] as const
const SESSION_LABELS: Record<string, string> = { encoding: 'Encoding', test1: 'Test 1', test2: 'Test 2' }

function canLaunch(sessions: Session[], day: number, type: string): boolean {
  const session = sessions.find((s) => s.labDay === day && s.sessionType === type)
  if (session?.completedAt) return false
  if (type === 'encoding') return true
  if (type === 'test1') return !!sessions.find((s) => s.labDay === day && s.sessionType === 'encoding')?.completedAt
  if (type === 'test2') return !!sessions.find((s) => s.labDay === day && s.sessionType === 'test1')?.completedAt
  return false
}

function conditionForDay(conditionOrder: number, day: number): string {
  if (conditionOrder === 0) return day === 1 ? 'Sleep' : 'Wake'
  return day === 1 ? 'Wake' : 'Sleep'
}

export default function PilotPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [participant, setParticipant] = useState<Participant | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = code.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const p = await api<Participant>('/pilot/participants', {
        method: 'POST',
        body: JSON.stringify({ pilotCode: trimmed }),
      })
      setParticipant(p)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRefresh() {
    if (!participant) return
    try {
      const p = await api<Participant>(`/pilot/participants/${participant.id}`)
      setParticipant(p)
    } catch { /* ignore */ }
  }

  if (!participant) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ maxWidth: 440, width: '100%', padding: '2rem', background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>NAPS Pilot</h1>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            This is the neutral-image pilot version of the NAPS sleep and memory experiment.
            Enter a pilot code to begin or resume your session.
          </p>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                Pilot code
              </label>
              <input
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '1rem', boxSizing: 'border-box' }}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. lab-pilot-01"
                autoFocus
                required
              />
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              style={{ width: '100%', padding: '0.7rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '1rem', cursor: 'pointer', fontWeight: 500 }}
            >
              {submitting ? 'Loading...' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '1.3rem', marginBottom: '0.2rem' }}>Pilot: {participant.participant_code}</h1>
              <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>Neutral-only experiment — all sessions shown below</p>
            </div>
            <button
              onClick={handleRefresh}
              style={{ padding: '0.4rem 0.9rem', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Refresh
            </button>
          </div>
        </div>

        {[1, 2].map((day) => (
          <div key={day} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '1.5rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#374151' }}>
              Day {day} — {conditionForDay(participant.condition_order, day)}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {SESSION_TYPES.map((type) => {
                const session = participant.sessions.find((s) => s.labDay === day && s.sessionType === type)
                const done = !!session?.completedAt
                const launchable = canLaunch(participant.sessions, day, type)
                return (
                  <div key={type} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.9rem', textAlign: 'center' }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.5rem' }}>{SESSION_LABELS[type]}</div>
                    {done && <div style={{ color: '#16a34a', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Completed</div>}
                    {!done && !launchable && <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Locked</div>}
                    {launchable && (
                      <button
                        onClick={() => navigate(`/pilot-experiment/${participant.id}/${day}/${type}`)}
                        style={{ padding: '0.4rem 0.9rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
                      >
                        Start
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={() => setParticipant(null)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
          >
            Use a different code
          </button>
        </div>
      </div>
    </div>
  )
}
