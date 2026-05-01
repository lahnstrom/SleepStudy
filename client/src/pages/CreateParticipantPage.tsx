import { useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import type { Participant } from '../lib/types'

export default function CreateParticipantPage() {
  const { labId } = useParams<{ labId: string }>()
  const navigate = useNavigate()

  const [participantCode, setParticipantCode] = useState('')
  const [conditionOrder, setConditionOrder] = useState<string>('0')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [language, setLanguage] = useState('en')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!participantCode.trim()) {
      setError('Participant code is required')
      return
    }

    setSubmitting(true)
    try {
      const participant = await api<Participant>(`/labs/${labId}/participants`, {
        method: 'POST',
        body: JSON.stringify({
          participantCode: participantCode.trim(),
          conditionOrder: Number(conditionOrder),
          age: age ? Number(age) : undefined,
          gender: gender || undefined,
          language,
        }),
      })
      navigate(`/labs/${labId}/participants/${participant.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('A participant with this code already exists in this lab')
      } else if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to create participant')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Add Participant</h1>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        {error && <div className="error-message" style={{ marginBottom: '1rem' }}><p>{error}</p></div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="code">Participant Code</label>
            <input
              id="code"
              className="form-input"
              value={participantCode}
              onChange={(e) => setParticipantCode(e.target.value)}
              placeholder="e.g. P001"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="order">Condition Order</label>
            <select
              id="order"
              className="form-input"
              value={conditionOrder}
              onChange={(e) => setConditionOrder(e.target.value)}
            >
              <option value="0">Sleep first</option>
              <option value="1">Wake first</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="age">Age (optional)</label>
            <input
              id="age"
              className="form-input"
              type="number"
              min="18"
              max="55"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="gender">Gender (optional)</label>
            <select
              id="gender"
              className="form-input"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">— (prefer not to say)</option>
              <option value="Man">Man</option>
              <option value="Kvinna">Kvinna</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="language">Language</label>
            <select
              id="language"
              className="form-input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="sv">Swedish</option>
              <option value="de">German</option>
              <option value="hu">Hungarian</option>
              <option value="af">Afrikaans</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Participant'}
            </button>
            <Link to={`/labs/${labId}/participants`} className="btn btn-outline">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
