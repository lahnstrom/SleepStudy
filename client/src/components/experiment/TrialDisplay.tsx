import { TrialPhase, type InputConfig } from '../../lib/experimentTypes'
import FixationCross from './FixationCross'
import ImageDisplay from './ImageDisplay'
import RatingScale from './RatingScale'
import MemoryJudgment from './MemoryJudgment'

interface TrialDisplayProps {
  phase: TrialPhase
  currentImage: HTMLImageElement | null
  inputConfig: InputConfig
  trialIndex: number
  totalTrials: number
  selectedRating?: number | null
}

export default function TrialDisplay({ phase, currentImage, inputConfig, trialIndex, totalTrials, selectedRating }: TrialDisplayProps) {
  switch (phase) {
    case TrialPhase.FIXATION_VISIBLE:
      return <FixationCross visible />

    case TrialPhase.FIXATION_BLANK:
    case TrialPhase.POST_MEMORY_GAP:
    case TrialPhase.INTER_RATING_GAP:
      return <div className="experiment-blank" />

    case TrialPhase.IMAGE:
      return <ImageDisplay image={currentImage} />

    case TrialPhase.MEMORY_JUDGMENT:
      return <MemoryJudgment inputConfig={inputConfig} />

    case TrialPhase.VALENCE_RATING:
      return <RatingScale type="valence" selected={selectedRating} />

    case TrialPhase.AROUSAL_RATING:
      return <RatingScale type="arousal" selected={selectedRating} />

    case TrialPhase.TRIAL_COMPLETE:
      return (
        <div className="trial-counter">
          {trialIndex + 1} / {totalTrials}
        </div>
      )

    default:
      return <div className="experiment-blank" />
  }
}
