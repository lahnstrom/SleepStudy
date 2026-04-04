import { useState, useEffect, useRef } from 'react'

interface PauseScreenProps {
  duration: number // ms
  resumeKeyLabel: string
  resumeKeyCode: string
  onResume: () => void
}

export default function PauseScreen({ duration, resumeKeyLabel, resumeKeyCode, onResume }: PauseScreenProps) {
  const [remaining, setRemaining] = useState(Math.ceil(duration / 1000))
  const countdownDone = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = Math.max(0, prev - 1)
        if (next === 0) countdownDone.current = true
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === resumeKeyCode && countdownDone.current) {
        e.preventDefault()
        onResume()
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [resumeKeyCode, onResume])

  return (
    <div className="pause-screen">
      <div className="pause-title">Break</div>
      <div className="pause-countdown">{remaining}s</div>
      <div className="pause-hint">
        {remaining > 0
          ? 'Please wait...'
          : <>Experimenter: press <strong>{resumeKeyLabel}</strong> to resume</>
        }
      </div>
    </div>
  )
}
