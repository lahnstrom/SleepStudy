import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useFetch } from '../hooks/useFetch'
import { api, ApiError } from '../lib/api'
import type { Lab } from '../lib/types'

interface UserRow {
  id: number
  email: string
  role: string
  lab_id: number | null
  lab_number: number | null
  lab_name: string | null
  created_at: string
}

interface ParticipantRow {
  id: number
  participant_code: string
  lab_id: number
  lab_number: number
  lab_name: string
  condition_order: number
  completed_sessions: number
  total_sessions: number
  created_at: string
}

export default function AdminPage() {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />

  const { data: labs, refetch: refetchLabs } = useFetch<Lab[]>('/labs')
  const { data: users, refetch: refetchUsers } = useFetch<UserRow[]>('/admin/users')
  const { data: participants } = useFetch<ParticipantRow[]>('/admin/participants')
  const { data: timingConfig, refetch: refetchTiming } = useFetch<Record<string, number>>('/config/timing')
  const { data: timingPracticeConfig, refetch: refetchTimingPractice } = useFetch<Record<string, number>>('/config/timing-practice')

  const TIMING_FIELDS = [
    { key: 'fixationVisible', label: 'Fixation Visible (ms)' },
    { key: 'fixationBlank', label: 'Fixation Blank (ms)' },
    { key: 'imageDisplay', label: 'Image Display (ms)' },
    { key: 'memoryTimeout', label: 'Memory Timeout (ms)' },
    { key: 'postMemoryGap', label: 'Post Memory Gap (ms)' },
    { key: 'ratingTimeout', label: 'Rating Timeout (ms)' },
    { key: 'interRatingGap', label: 'Inter Rating Gap (ms)' },
    { key: 'pauseDuration', label: 'Pause Duration (ms)' },
    { key: 'pauseTrialIndex', label: 'Pause Trial Index' },
  ]

  const [timingDraft, setTimingDraft] = useState<Record<string, number> | null>(null)
  const [timingPracticeDraft, setTimingPracticeDraft] = useState<Record<string, number> | null>(null)
  const [timingSaveMsg, setTimingSaveMsg] = useState('')
  const [timingPracticeSaveMsg, setTimingPracticeSaveMsg] = useState('')

  async function handleSaveTiming(e: FormEvent) {
    e.preventDefault()
    setTimingSaveMsg('')
    try {
      await api('/config/timing', { method: 'PUT', body: JSON.stringify(timingDraft ?? timingConfig) })
      setTimingSaveMsg('Saved.')
      refetchTiming()
    } catch (err: any) {
      setTimingSaveMsg(`Error: ${err.message}`)
    }
  }

  async function handleSaveTimingPractice(e: FormEvent) {
    e.preventDefault()
    setTimingPracticeSaveMsg('')
    try {
      await api('/config/timing-practice', { method: 'PUT', body: JSON.stringify(timingPracticeDraft ?? timingPracticeConfig) })
      setTimingPracticeSaveMsg('Saved.')
      refetchTimingPractice()
    } catch (err: any) {
      setTimingPracticeSaveMsg(`Error: ${err.message}`)
    }
  }

  // Create lab form
  const [labNumber, setLabNumber] = useState('')
  const [labName, setLabName] = useState('')
  const [labError, setLabError] = useState('')

  async function handleCreateLab(e: FormEvent) {
    e.preventDefault()
    setLabError('')
    try {
      await api('/labs', {
        method: 'POST',
        body: JSON.stringify({ labNumber: Number(labNumber), name: labName }),
      })
      setLabNumber('')
      setLabName('')
      refetchLabs()
    } catch (err: any) {
      setLabError(err.message)
    }
  }

  // Create user form
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userRole, setUserRole] = useState<'lab_user' | 'admin'>('lab_user')
  const [userLabId, setUserLabId] = useState('')
  const [userError, setUserError] = useState('')

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    setUserError('')
    try {
      await api('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          password: userPassword,
          role: userRole,
          labId: userRole === 'lab_user' ? Number(userLabId) : null,
        }),
      })
      setUserEmail('')
      setUserPassword('')
      setUserLabId('')
      refetchUsers()
    } catch (err: any) {
      setUserError(err.message)
    }
  }

  // Reset password
  const [resetId, setResetId] = useState<number | null>(null)
  const [resetPw, setResetPw] = useState('')

  async function handleResetPassword() {
    if (!resetId) return
    try {
      await api(`/admin/users/${resetId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: resetPw }),
      })
      setResetId(null)
      setResetPw('')
      alert('Password reset successfully')
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Admin</h1>

      {/* Labs Section */}
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Labs</h2>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <table className="table">
          <thead>
            <tr><th>Number</th><th>Name</th><th>Participants</th></tr>
          </thead>
          <tbody>
            {labs?.map((lab) => (
              <tr key={lab.id}>
                <td>{lab.lab_number}</td>
                <td>{lab.name}</td>
                <td>{lab.participant_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={handleCreateLab} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Number</label>
            <input className="form-input" type="number" value={labNumber} onChange={(e) => setLabNumber(e.target.value)} required style={{ width: 80 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label className="form-label">Name</label>
            <input className="form-input" value={labName} onChange={(e) => setLabName(e.target.value)} required />
          </div>
          <button className="btn btn-primary" type="submit">Add Lab</button>
        </form>
        {labError && <p style={{ color: 'var(--color-danger)', marginTop: '0.5rem', fontSize: '0.85rem' }}>{labError}</p>}
      </div>

      {/* Users Section */}
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Users</h2>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <table className="table">
          <thead>
            <tr><th>Email</th><th>Role</th><th>Lab</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.lab_name ? `${u.lab_number} — ${u.lab_name}` : '—'}</td>
                <td>
                  {resetId === u.id ? (
                    <span style={{ display: 'flex', gap: '0.25rem' }}>
                      <input className="form-input" type="password" placeholder="New password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} style={{ width: 140, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} />
                      <button className="btn btn-primary btn-sm" onClick={handleResetPassword}>Set</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setResetId(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => setResetId(u.id)}>Reset password</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={handleCreateUser} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Role</label>
            <select className="form-input" value={userRole} onChange={(e) => setUserRole(e.target.value as 'lab_user' | 'admin')}>
              <option value="lab_user">Lab User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {userRole === 'lab_user' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Lab</label>
              <select className="form-input" value={userLabId} onChange={(e) => setUserLabId(e.target.value)} required>
                <option value="">Select...</option>
                {labs?.map((lab) => (
                  <option key={lab.id} value={lab.id}>{lab.lab_number} — {lab.name}</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn btn-primary" type="submit">Add User</button>
        </form>
        {userError && <p style={{ color: 'var(--color-danger)', marginTop: '0.5rem', fontSize: '0.85rem' }}>{userError}</p>}
      </div>

      {/* All Participants Section */}
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>All Participants</h2>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <table className="table">
          <thead>
            <tr><th>Code</th><th>Lab</th><th>Order</th><th>Sessions</th><th>Created</th></tr>
          </thead>
          <tbody>
            {participants?.map((p) => (
              <tr key={p.id}>
                <td>{p.participant_code}</td>
                <td>{p.lab_number} — {p.lab_name}</td>
                <td>{p.condition_order === 0 ? 'Sleep first' : 'Wake first'}</td>
                <td>{p.completed_sessions} / {p.total_sessions}</td>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Timing Configuration Section */}
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Timing Configuration</h2>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Real Session</h3>
        <form onSubmit={handleSaveTiming} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem 1rem' }}>
          {TIMING_FIELDS.map((f) => (
            <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{f.label}</label>
              <input
                className="form-input"
                type="number"
                min="1"
                value={(timingDraft ?? timingConfig)?.[f.key] ?? ''}
                onChange={(e) => setTimingDraft({ ...(timingDraft ?? timingConfig ?? {}), [f.key]: Number(e.target.value) })}
              />
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className="btn btn-primary" type="submit">Save</button>
            {timingSaveMsg && <span style={{ fontSize: '0.85rem', color: timingSaveMsg.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)' }}>{timingSaveMsg}</span>}
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Practice Session</h3>
        <form onSubmit={handleSaveTimingPractice} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem 1rem' }}>
          {TIMING_FIELDS.map((f) => (
            <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{f.label}</label>
              <input
                className="form-input"
                type="number"
                min="1"
                value={(timingPracticeDraft ?? timingPracticeConfig)?.[f.key] ?? ''}
                onChange={(e) => setTimingPracticeDraft({ ...(timingPracticeDraft ?? timingPracticeConfig ?? {}), [f.key]: Number(e.target.value) })}
              />
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className="btn btn-primary" type="submit">Save</button>
            {timingPracticeSaveMsg && <span style={{ fontSize: '0.85rem', color: timingPracticeSaveMsg.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)' }}>{timingPracticeSaveMsg}</span>}
          </div>
        </form>
      </div>
    </div>
  )
}
