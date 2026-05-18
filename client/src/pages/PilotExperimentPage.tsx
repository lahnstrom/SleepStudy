import { useParams } from 'react-router-dom'
import ExperimentRunner from '../components/experiment/ExperimentRunner'
import FullscreenWrapper from '../components/experiment/FullscreenWrapper'
import type { SessionType } from '../lib/experimentTypes'

export default function PilotExperimentPage() {
  const { participantId, labDay, sessionType } = useParams<{
    participantId: string
    labDay: string
    sessionType: string
  }>()

  const participantIdNum = Number(participantId)
  const labDayNum = Number(labDay)

  if (!participantId || !labDay || !sessionType || isNaN(participantIdNum) || isNaN(labDayNum)) {
    return <div style={{ background: '#1a1a1a', color: '#fff', textAlign: 'center', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Invalid session parameters</div>
  }

  if (!['encoding', 'test1', 'test2'].includes(sessionType)) {
    return <div style={{ background: '#1a1a1a', color: '#fff', textAlign: 'center', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Invalid session type</div>
  }

  return (
    <FullscreenWrapper>
      <ExperimentRunner
        participantId={participantIdNum}
        labDay={labDayNum}
        sessionType={sessionType as SessionType}
        apiPrefix="/pilot"
      />
    </FullscreenWrapper>
  )
}
