import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useLab } from '../hooks/useLab'
import { useFetch } from '../hooks/useFetch'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'
import type { Lab } from '../lib/types'

export default function LabListPage() {
  const { user } = useAuth()
  const { setCurrentLabId } = useLab()
  const navigate = useNavigate()
  const { data: labs, loading, error, refetch } = useFetch<Lab[]>('/labs')

  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} onRetry={refetch} />

  function handleLabClick(lab: Lab) {
    setCurrentLabId(lab.id)
    navigate(`/labs/${lab.id}/participants`)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Labs</h1>
      </div>

      {!labs || labs.length === 0 ? (
        <div className="card empty-state">
          <p>No labs configured yet.</p>
        </div>
      ) : (
        <div className="card">
          <table className="table table-clickable">
            <thead>
              <tr>
                <th>Lab Number</th>
                <th>Name</th>
                <th>Participants</th>
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => (
                <tr key={lab.id} onClick={() => handleLabClick(lab)}>
                  <td>{lab.lab_number}</td>
                  <td>{lab.name}</td>
                  <td>{lab.participant_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
