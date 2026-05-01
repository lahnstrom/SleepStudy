import { useEffect } from 'react'

interface PracticeCompleteProps {
  onProceed: () => void
}

export default function PracticeComplete({ onProceed }: PracticeCompleteProps) {
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
      <p className="practice-hint">Press <strong>Q</strong> to begin</p>
    </div>
  )
}
