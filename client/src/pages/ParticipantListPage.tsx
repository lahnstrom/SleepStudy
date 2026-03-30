import { useParams, useNavigate, Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useLab } from '../hooks/useLab'
import { useFetch } from '../hooks/useFetch'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'
import type { Participant } from '../lib/types'

export default function ParticipantListPage() {
  const { labId } = useParams<{ labId: string }>()
  const navigate = useNavigate()
  const { setCurrentLabId } = useLab()
  const { data: participants, loading, error, refetch } = useFetch<Participant[]>(
    labId ? `/labs/${labId}/participants` : null
  )

  useEffect(() => {
    if (labId) setCurrentLabId(Number(labId))
  }, [labId, setCurrentLabId])

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} onRetry={refetch} />

  return (
    <div>
      <div className="page-header">
        <h1>Participants</h1>
        <Link to={`/labs/${labId}/participants/new`} className="btn btn-primary">
          Add Participant
        </Link>
      </div>

      {!participants || participants.length === 0 ? (
        <div className="card empty-state">
          <p>No participants yet.</p>
          <p><Link to={`/labs/${labId}/participants/new`}>Add the first participant</Link></p>
        </div>
      ) : (
        <div className="card">
          <table className="table table-clickable">
            <thead>
              <tr>
                <th>Code</th>
                <th>Condition Order</th>
                <th>Age</th>
                <th>Language</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/labs/${labId}/participants/${p.id}`)}>
                  <td>{p.participant_code}</td>
                  <td>{p.condition_order === 0 ? 'Sleep first' : 'Wake first'}</td>
                  <td>{p.age ?? '—'}</td>
                  <td>{p.language.toUpperCase()}</td>
                  <td>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
