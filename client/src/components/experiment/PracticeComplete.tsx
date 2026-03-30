import { useEffect } from 'react'

interface PracticeCompleteProps {
  meanDeviation: number
  onProceed: () => void
}

export default function PracticeComplete({ meanDeviation, onProceed }: PracticeCompleteProps) {
  const isWarning = meanDeviation > 20

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === 'KeyQ') {
        e.preventDefault()
        onProceed()
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [onProceed])

  return (
    <div className="practice-screen">
      <h2>Practice Complete</h2>
      <p>
        Mean timing deviation: <strong>{meanDeviation.toFixed(1)} ms</strong>
      </p>
      {isWarning && (
        <p className="practice-warning">
          Warning: timing deviation exceeds 20 ms. Consider closing other applications
          or using a different browser/computer.
        </p>
      )}
      {!isWarning && (
        <p className="practice-ok">Timing looks good.</p>
      )}
      <p className="practice-hint">Experimenter: press <strong>Q</strong> to begin the real session</p>
    </div>
  )
}
