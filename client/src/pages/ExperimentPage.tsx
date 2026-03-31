import { useParams, useSearchParams, Navigate } from 'react-router-dom'
import type { SessionType } from '../lib/experimentTypes'
import FullscreenWrapper from '../components/experiment/FullscreenWrapper'
import ExperimentRunner from '../components/experiment/ExperimentRunner'

const VALID_SESSION_TYPES = ['encoding', 'test1', 'test2']

export default function ExperimentPage() {
  const { participantId, labDay, sessionType } = useParams<{
    participantId: string
    labDay: string
    sessionType: string
  }>()

  const [searchParams] = useSearchParams()
  const pid = Number(participantId)
  const day = Number(labDay)
  const maxTrials = searchParams.get('trials') ? Number(searchParams.get('trials')) : undefined

  if (
    isNaN(pid) || isNaN(day) ||
    day < 1 || day > 2 ||
    !sessionType || !VALID_SESSION_TYPES.includes(sessionType)
  ) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <FullscreenWrapper>
      <ExperimentRunner
        participantId={pid}
        labDay={day}
        sessionType={sessionType as SessionType}
        maxTrials={maxTrials}
      />
    </FullscreenWrapper>
  )
}
