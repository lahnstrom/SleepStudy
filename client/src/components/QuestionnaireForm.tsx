import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'

interface QuestionnaireFormProps {
  labId: string
  participantId: number
  labDay: 1 | 2
  onSaved: () => void
}

const QUESTIONNAIRE_TYPES = [
  { type: 'kss', label: 'KSS (Karolinska Sleepiness Scale)', items: 1, scale: 9 },
  { type: 'stai_state', label: 'STAI State Anxiety', items: 20, scale: 4 },
  { type: 'stai_trait', label: 'STAI Trait Anxiety', items: 20, scale: 4 },
]

export default function QuestionnaireForm({ labId, participantId, labDay, onSaved }: QuestionnaireFormProps) {
  const [selectedType, setSelectedType] = useState('')
  const [responses, setResponses] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const qConfig = QUESTIONNAIRE_TYPES.find((q) => q.type === selectedType)

  function handleResponse(item: string, value: number) {
    setResponses((prev) => ({ ...prev, [item]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedType) return
    setSaving(true)
    setError('')
    try {
      await api(`/labs/${labId}/participants/${participantId}/questionnaires`, {
        method: 'POST',
        body: JSON.stringify({
          questionnaireType: selectedType,
          labDay,
          responses,
        }),
      })
      setSelectedType('')
      setResponses({})
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Questionnaire Type</label>
        <select className="form-input" value={selectedType} onChange={(e) => { setSelectedType(e.target.value); setResponses({}) }}>
          <option value="">Select...</option>
          {QUESTIONNAIRE_TYPES.map((q) => (
            <option key={q.type} value={q.type}>{q.label}</option>
          ))}
        </select>
      </div>

      {qConfig && (
        <form onSubmit={handleSubmit}>
          {qConfig.items === 1 ? (
            <div className="form-group">
              <label className="form-label">Score (1-{qConfig.scale})</label>
              <input
                className="form-input"
                type="number"
                min="1"
                max={qConfig.scale}
                value={responses['score'] ?? ''}
                onChange={(e) => handleResponse('score', Number(e.target.value))}
                required
                style={{ width: 80 }}
              />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
              {Array.from({ length: qConfig.items }, (_, i) => (
                <div key={i} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Item {i + 1} (1-{qConfig.scale})</label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    max={qConfig.scale}
                    value={responses[`q${i + 1}`] ?? ''}
                    onChange={(e) => handleResponse(`q${i + 1}`, Number(e.target.value))}
                    required
                    style={{ width: 60 }}
                  />
                </div>
              ))}
            </div>
          )}
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving} style={{ marginTop: '0.75rem' }}>
            {saving ? 'Saving...' : 'Submit'}
          </button>
        </form>
      )}
    </div>
  )
}
