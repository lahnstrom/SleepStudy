import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'

interface SleepDataRow {
  participant_id: number
  lab_day: number
  total_sleep_min: number | null
  n1_min: number | null
  n2_min: number | null
  n3_min: number | null
  rem_min: number | null
  wake_after_sleep_onset_min: number | null
  sleep_onset_latency_min: number | null
  notes: string | null
}

interface SleepDataFormProps {
  labId: string
  participantId: number
  labDay: 1 | 2
  existing?: SleepDataRow | null
  onSaved: () => void
}

const FIELDS = [
  { key: 'totalSleepMin', label: 'Total Sleep Time (min)', dbKey: 'total_sleep_min' },
  { key: 'n1Min', label: 'N1 (min)', dbKey: 'n1_min' },
  { key: 'n2Min', label: 'N2 (min)', dbKey: 'n2_min' },
  { key: 'n3Min', label: 'N3 (min)', dbKey: 'n3_min' },
  { key: 'remMin', label: 'REM (min)', dbKey: 'rem_min' },
  { key: 'wakeAfterSleepOnsetMin', label: 'WASO (min)', dbKey: 'wake_after_sleep_onset_min' },
  { key: 'sleepOnsetLatencyMin', label: 'SOL (min)', dbKey: 'sleep_onset_latency_min' },
] as const

export default function SleepDataForm({ labId, participantId, labDay, existing, onSaved }: SleepDataFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of FIELDS) {
      const val = existing?.[f.dbKey as keyof SleepDataRow]
      init[f.key] = val != null ? String(val) : ''
    }
    init.notes = existing?.notes ?? ''
    return init
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = { labDay }
      for (const f of FIELDS) {
        body[f.key] = values[f.key] ? Number(values[f.key]) : null
      }
      body.notes = values.notes || undefined

      await api(`/labs/${labId}/participants/${participantId}/sleep-data`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
        {FIELDS.map((f) => (
          <div className="form-group" key={f.key} style={{ marginBottom: 0 }}>
            <label className="form-label">{f.label}</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              min="0"
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="form-group" style={{ marginTop: '0.75rem' }}>
        <label className="form-label">Notes</label>
        <input
          className="form-input"
          value={values.notes}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
        />
      </div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
      <button className="btn btn-primary btn-sm" type="submit" disabled={saving} style={{ marginTop: '0.5rem' }}>
        {saving ? 'Saving...' : existing ? 'Update' : 'Save'}
      </button>
    </form>
  )
}
