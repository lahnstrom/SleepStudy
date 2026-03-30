import { useNavigate } from 'react-router-dom'

interface SessionCompleteProps {
  syncStatus: 'syncing' | 'synced' | 'error' | 'pending'
}

export default function SessionComplete({ syncStatus }: SessionCompleteProps) {
  const navigate = useNavigate()

  return (
    <div className="practice-screen">
      <h2>Session Complete</h2>
      <p>Thank you! This session is finished.</p>
      <div className="sync-status">
        {syncStatus === 'syncing' && <p>Uploading data...</p>}
        {syncStatus === 'synced' && <p className="practice-ok">Data saved successfully.</p>}
        {syncStatus === 'error' && <p className="practice-warning">Upload failed. Data is saved locally and will retry.</p>}
        {syncStatus === 'pending' && <p>Waiting to upload...</p>}
      </div>
      {(syncStatus === 'synced' || syncStatus === 'error') && (
        <button
          className="btn btn-primary"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
            navigate('/dashboard')
          }}
        >
          Return to Dashboard
        </button>
      )}
    </div>
  )
}
