export interface TimingConfig {
  fixationVisible: number
  fixationBlank: number
  imageDisplay: number
  memoryTimeout: number
  postMemoryGap: number
  ratingTimeout: number
  interRatingGap: number
  pauseDuration: number
  pauseTrialIndex: number
}

export interface InputConfig {
  memoryOldKey: string
  memoryNewKey: string
  resumeKey: string
  ratingKeys: string[]
}

export const DEFAULT_INPUT_CONFIG: InputConfig = {
  memoryOldKey: 'KeyW',
  memoryNewKey: 'KeyP',
  resumeKey: 'KeyQ',
  ratingKeys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'],
}

export type SessionType = 'encoding' | 'test1' | 'test2'

export enum TrialPhase {
  FIXATION_VISIBLE = 'FIXATION_VISIBLE',
  FIXATION_BLANK = 'FIXATION_BLANK',
  IMAGE = 'IMAGE',
  MEMORY_JUDGMENT = 'MEMORY_JUDGMENT',
  POST_MEMORY_GAP = 'POST_MEMORY_GAP',
  VALENCE_RATING = 'VALENCE_RATING',
  INTER_RATING_GAP = 'INTER_RATING_GAP',
  AROUSAL_RATING = 'AROUSAL_RATING',
  TRIAL_COMPLETE = 'TRIAL_COMPLETE',
}

export interface ImageAssignment {
  id: number
  image_id: number
  lab_day: number
  image_role: 'encoding_test1_target' | 'encoding_test2_target' | 'test1_foil' | 'test2_foil'
  presentation_position: number
  filename: string
  emotion: 'negative' | 'neutral'
}

export interface TrialData {
  trialNumber: number
  imageId: number
  valenceRating: number | null
  arousalRating: number | null
  targetFoil: number | null
  memoryResponse: number | null
  correct: number | null
  valenceRtMs: number | null
  arousalRtMs: number | null
  memoryRtMs: number | null
  presentedAt: string
  imageActualMs: number
  imageFrameCount: number
  droppedFrames: number
}

export interface DurationStats {
  intended: number
  mean: number
  min: number
  max: number
  sd: number
}

export interface TimingMetadata {
  refreshRate: number
  totalTrials: number
  droppedFrames: number
  imageDuration: DurationStats
  flaggedTrials: number[]
}

export interface ExperimentSessionRecord {
  sessionId: string
  participantId: number
  labDay: number
  sessionType: SessionType
  status: 'in_progress' | 'completed' | 'synced' | 'abandoned'
  startedAt: string
  completedAt?: string
  currentTrialIndex: number
}

export type RunnerState =
  | 'LOADING_CONFIG'
  | 'LOADING_IMAGES'
  | 'PRACTICE_INTRO'
  | 'PRACTICE_RUNNING'
  | 'PRACTICE_COMPLETE'
  | 'REAL_RUNNING'
  | 'SESSION_COMPLETE'
  | 'SYNCING'
  | 'DONE'
  | 'ERROR'

export interface KeyEvent {
  code: string
  timestamp: number
}
