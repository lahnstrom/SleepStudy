import { useParams, Link } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'
import StatusBadge from '../components/StatusBadge'
import type { ParticipantDetail, Session } from '../lib/types'

const SESSION_TYPES = ['encoding', 'test1', 'test2'] as const
const SESSION_LABELS: Record<string, string> = {
  encoding: 'Encoding',
  test1: 'Test 1',
  test2: 'Test 2',
}

function getSessionForCell(sessions: Session[], labDay: number, sessionType: string): Session | undefined {
  return sessions.find((s) => s.labDay === labDay && s.sessionType === sessionType)
}

function getSessionStatus(session: Session | undefined) {
  if (!session) return 'not-started' as const
  if (session.completedAt) return 'complete' as const
  return 'in-progress' as const
}

export default function ParticipantDetailPage() {
  const { labId, id } = useParams<{ labId: string; id: string }>()
  const { data: participant, loading, error, refetch } = useFetch<ParticipantDetail>(
    labId && id ? `/labs/${labId}/participants/${id}` : null
  )

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} onRetry={refetch} />
  if (!participant) return <ErrorMessage message="Participant not found" />

  const conditionForDay = (day: number) => {
    if (participant.condition_order === 0) return day === 1 ? 'Sleep' : 'Wake'
    return day === 1 ? 'Wake' : 'Sleep'
  }

  return (
    <div>
      <div className="page-header">
        <h1>Participant {participant.participant_code}</h1>
        <Link to={`/labs/${labId}/participants`} className="btn btn-outline">
          Back to list
        </Link>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="info-grid">
          <div className="info-item">
            <label>Code</label>
            <span>{participant.participant_code}</span>
          </div>
          <div className="info-item">
            <label>Condition Order</label>
            <span>{participant.condition_order === 0 ? 'Sleep first' : 'Wake first'}</span>
          </div>
          <div className="info-item">
            <label>Age</label>
            <span>{participant.age ?? '—'}</span>
          </div>
          <div className="info-item">
            <label>Gender</label>
            <span>{participant.gender ?? '—'}</span>
          </div>
          <div className="info-item">
            <label>Language</label>
            <span>{participant.language.toUpperCase()}</span>
          </div>
          <div className="info-item">
            <label>Created</label>
            <span>{new Date(participant.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Sessions</h2>

      <div className="session-grid">
        <div className="session-grid-header" />
        {SESSION_TYPES.map((type) => (
          <div key={type} className="session-grid-header">
            {SESSION_LABELS[type]}
          </div>
        ))}

        {[1, 2].map((day) => (
          <>
            <div key={`label-${day}`} className="session-grid-label">
              Day {day} — {conditionForDay(day)}
            </div>
            {SESSION_TYPES.map((type) => {
              const session = getSessionForCell(participant.sessions, day, type)
              const status = getSessionStatus(session)
              return (
                <div key={`${day}-${type}`} className="session-grid-cell">
                  <StatusBadge status={status} />
                  {session?.completedAt && (
                    <div className="completed-at">
                      {new Date(session.completedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}
