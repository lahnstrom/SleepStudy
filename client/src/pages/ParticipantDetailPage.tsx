import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { downloadFile } from '../lib/api'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'
import StatusBadge from '../components/StatusBadge'
import SleepDataForm from '../components/SleepDataForm'
import QuestionnaireForm from '../components/QuestionnaireForm'
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

function canLaunch(sessions: Session[], day: number, type: string): boolean {
  const session = sessions.find((s) => s.labDay === day && s.sessionType === type)
  if (session?.completedAt) return false // already done
  if (type === 'encoding') return true
  if (type === 'test1') {
    const enc = sessions.find((s) => s.labDay === day && s.sessionType === 'encoding')
    return !!enc?.completedAt
  }
  if (type === 'test2') {
    const t1 = sessions.find((s) => s.labDay === day && s.sessionType === 'test1')
    return !!t1?.completedAt
  }
  return false
}

export default function ParticipantDetailPage() {
  const { labId, id } = useParams<{ labId: string; id: string }>()
  const navigate = useNavigate()
  const { data: participant, loading, error, refetch } = useFetch<ParticipantDetail>(
    labId && id ? `/labs/${labId}/participants/${id}` : null
  )
  const { data: sleepData, refetch: refetchSleep } = useFetch<any[]>(
    labId && id ? `/labs/${labId}/participants/${id}/sleep-data` : null
  )
  const { data: questionnaires, refetch: refetchQ } = useFetch<any[]>(
    labId && id ? `/labs/${labId}/participants/${id}/questionnaires` : null
  )

  const [showSleepForm, setShowSleepForm] = useState<1 | 2 | null>(null)
  const [showQForm, setShowQForm] = useState<1 | 2 | null>(null)

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} onRetry={refetch} />
  const [downloading, setDownloading] = useState(false)

  if (!participant) return <ErrorMessage message="Participant not found" />

  async function handleDownloadCsv() {
    if (!participant) return
    setDownloading(true)
    try {
      await downloadFile(
        `/export/csv?participantId=${participant.id}`,
        `naps_${participant.participant_code}.csv`
      )
    } catch {
      alert('No completed trial data to export')
    } finally {
      setDownloading(false)
    }
  }

  const conditionForDay = (day: number) => {
    if (participant.condition_order === 0) return day === 1 ? 'Sleep' : 'Wake'
    return day === 1 ? 'Wake' : 'Sleep'
  }

  return (
    <div>
      <div className="page-header">
        <h1>Participant {participant.participant_code}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={handleDownloadCsv} disabled={downloading}>
            {downloading ? 'Exporting...' : 'Download CSV'}
          </button>
          <Link to={`/labs/${labId}/participants`} className="btn btn-outline">
            Back to list
          </Link>
        </div>
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
              const launchable = canLaunch(participant.sessions, day, type)
              return (
                <div key={`${day}-${type}`} className="session-grid-cell">
                  <StatusBadge status={status} />
                  {session?.completedAt && (
                    <div className="completed-at">
                      {new Date(session.completedAt).toLocaleString()}
                    </div>
                  )}
                  {launchable && (
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: '0.5rem' }}
                      onClick={() => navigate(`/experiment/${participant.id}/${day}/${type}`)}
                    >
                      Launch
                    </button>
                  )}
                </div>
              )
            })}
          </>
        ))}
      </div>

      {/* Sleep Data */}
      <h2 style={{ fontSize: '1.1rem', margin: '1.5rem 0 0.75rem' }}>Sleep Data</h2>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        {[1, 2].map((day) => {
          const existing = sleepData?.find((s: any) => s.lab_day === day)
          return (
            <div key={day} style={{ marginBottom: day === 1 ? '1rem' : 0 }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                Day {day} — {conditionForDay(day)}
                {existing && <span className="badge badge-complete" style={{ marginLeft: '0.5rem' }}>Entered</span>}
              </h3>
              {showSleepForm === day || existing ? (
                <SleepDataForm
                  labId={labId!}
                  participantId={participant.id}
                  labDay={day as 1 | 2}
                  existing={existing}
                  onSaved={() => { refetchSleep(); setShowSleepForm(null) }}
                />
              ) : (
                <button className="btn btn-outline btn-sm" onClick={() => setShowSleepForm(day as 1 | 2)}>
                  Enter sleep data
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Questionnaires */}
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Questionnaires</h2>
      <div className="card">
        {questionnaires && questionnaires.length > 0 && (
          <table className="table" style={{ marginBottom: '1rem' }}>
            <thead>
              <tr><th>Type</th><th>Day</th><th>Completed</th></tr>
            </thead>
            <tbody>
              {questionnaires.map((q: any) => (
                <tr key={q.id}>
                  <td>{q.questionnaire_type.toUpperCase()}</td>
                  <td>{q.lab_day ?? '—'}</td>
                  <td>{new Date(q.completed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {[1, 2].map((day) => (
          <div key={day} style={{ marginBottom: '0.75rem' }}>
            {showQForm === day ? (
              <>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Day {day} — Add Questionnaire</h3>
                <QuestionnaireForm
                  labId={labId!}
                  participantId={participant.id}
                  labDay={day as 1 | 2}
                  onSaved={() => { refetchQ(); setShowQForm(null) }}
                />
              </>
            ) : (
              <button className="btn btn-outline btn-sm" onClick={() => setShowQForm(day as 1 | 2)}>
                Add questionnaire — Day {day}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
