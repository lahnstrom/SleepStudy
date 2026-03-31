import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useLab } from '../hooks/useLab'
import { useFetch } from '../hooks/useFetch'
import { downloadFile } from '../lib/api'
import type { Lab } from '../lib/types'

export default function DataExportPage() {
  const { user } = useAuth()
  const { currentLabId } = useLab()
  const isAdmin = user?.role === 'admin'
  const { data: labs } = useFetch<Lab[]>(isAdmin ? '/labs' : null)

  const [selectedLabId, setSelectedLabId] = useState<string>('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  async function handleExport() {
    setError('')
    setDownloading(true)
    try {
      const labId = isAdmin ? selectedLabId : currentLabId
      const query = labId ? `?labId=${labId}` : ''
      const filename = labId
        ? `naps_lab_${labId}.csv`
        : 'naps_all_data.csv'
      await downloadFile(`/export/csv${query}`, filename)
    } catch (err: any) {
      setError(err.message || 'Export failed')
    } finally {
      setDownloading(false)
    }
  }

  async function handleExportAll() {
    setError('')
    setDownloading(true)
    try {
      await downloadFile('/export/csv', 'naps_all_data.csv')
    } catch (err: any) {
      setError(err.message || 'Export failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Data Export</h1>
      </div>

      <div className="card" style={{ maxWidth: 500 }}>
        <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Export completed trial data as CSV. The file includes all trials with ratings,
          reaction times, and participant demographics.
        </p>

        {isAdmin && (
          <div className="form-group">
            <label className="form-label">Select Lab</label>
            <select
              className="form-input"
              value={selectedLabId}
              onChange={(e) => setSelectedLabId(e.target.value)}
            >
              <option value="">All labs</option>
              {labs?.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  Lab {lab.lab_number} — {lab.name} ({lab.participant_count} participants)
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="error-message" style={{ marginBottom: '1rem' }}>
            <p>{error}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={handleExport} disabled={downloading}>
            {downloading ? 'Exporting...' : isAdmin && !selectedLabId ? 'Export All Data' : 'Export Lab Data'}
          </button>
          {isAdmin && selectedLabId && (
            <button className="btn btn-outline" onClick={handleExportAll} disabled={downloading}>
              Export All Labs
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
