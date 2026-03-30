import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useLab } from '../hooks/useLab'
import { useFetch } from '../hooks/useFetch'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'
import type { Lab, Participant } from '../lib/types'

export default function DashboardPage() {
  const { user } = useAuth()
  const { currentLabId } = useLab()

  const labPath = currentLabId ? `/labs/${currentLabId}` : null
  const participantsPath = currentLabId ? `/labs/${currentLabId}/participants` : null

  const { data: lab, loading: labLoading, error: labError } = useFetch<Lab>(labPath)
  const { data: participants, loading: partLoading } = useFetch<Participant[]>(participantsPath)

  if (user?.role === 'admin' && !currentLabId) {
    return (
      <div>
        <h1 style={{ marginBottom: '1rem' }}>Dashboard</h1>
        <div className="card empty-state">
          <p>Select a lab to view its dashboard.</p>
          <p><Link to="/labs">View all labs</Link></p>
        </div>
      </div>
    )
  }

  if (labLoading || partLoading) return <LoadingSpinner />
  if (labError) return <ErrorMessage message={labError} />

  const totalParticipants = lab?.participant_count ?? 0
  const sessionsCompleted = participants
    ? participants.length // placeholder — detail page shows actual session status
    : 0

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>{lab?.name ?? 'Dashboard'}</h1>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-value">{totalParticipants}</div>
          <div className="stat-label">Participants</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{sessionsCompleted}</div>
          <div className="stat-label">Registered</div>
        </div>
      </div>

      {currentLabId && (
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to={`/labs/${currentLabId}/participants`} className="btn btn-primary">
            View Participants
          </Link>
          <Link to={`/labs/${currentLabId}/participants/new`} className="btn btn-outline">
            Add Participant
          </Link>
        </div>
      )}
    </div>
  )
}
