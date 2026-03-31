import { useEffect } from 'react'
import type { SessionType } from '../../lib/experimentTypes'

interface PracticeIntroProps {
  sessionType: SessionType
  onStart: () => void
  onSkip?: () => void
}

const isDev = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_TOOLS === '1'

export default function PracticeIntro({ sessionType, onStart, onSkip }: PracticeIntroProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === 'KeyQ') {
        e.preventDefault()
        onStart()
      }
      if (e.code === 'KeyS' && isDev && onSkip) {
        e.preventDefault()
        onSkip()
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [onStart, onSkip])

  const isTest = sessionType !== 'encoding'

  return (
    <div className="practice-screen">
      <h2>Practice</h2>
      <p>You will now see a short practice to familiarize yourself with the task.</p>
      {isTest && (
        <p>
          For each image, you will first judge whether you have seen it before
          (<strong>Old</strong>) or not (<strong>New</strong>), then rate how pleasant/unpleasant
          and calm/excited it makes you feel.
        </p>
      )}
      {!isTest && (
        <p>
          For each image, rate how pleasant/unpleasant and calm/excited it makes you feel
          using the number keys 1-9.
        </p>
      )}
      <p className="practice-hint">Experimenter: press <strong>Q</strong> to begin</p>
      {isDev && onSkip && (
        <p className="practice-hint">Press <strong>S</strong> to skip practice (dev only)</p>
      )}
    </div>
  )
}
