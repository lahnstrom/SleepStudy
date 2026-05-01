import {
  TrialPhase,
  type SessionType,
  type TimingConfig,
  type InputConfig,
  type ImageAssignment,
  type TrialData,
  type KeyEvent,
} from '../lib/experimentTypes'

const ENCODING_PHASES: TrialPhase[] = [
  TrialPhase.FIXATION_VISIBLE,
  TrialPhase.FIXATION_BLANK,
  TrialPhase.IMAGE,
  TrialPhase.VALENCE_RATING,
  TrialPhase.INTER_RATING_GAP,
  TrialPhase.AROUSAL_RATING,
  TrialPhase.TRIAL_COMPLETE,
]

const TEST_PHASES: TrialPhase[] = [
  TrialPhase.FIXATION_VISIBLE,
  TrialPhase.FIXATION_BLANK,
  TrialPhase.IMAGE,
  TrialPhase.MEMORY_JUDGMENT,
  TrialPhase.POST_MEMORY_GAP,
  TrialPhase.VALENCE_RATING,
  TrialPhase.INTER_RATING_GAP,
  TrialPhase.AROUSAL_RATING,
  TrialPhase.TRIAL_COMPLETE,
]

export interface TrialEngineConfig {
  sessionType: SessionType
  timingConfig: TimingConfig
  inputConfig: InputConfig
  assignments: ImageAssignment[]
  images: Map<number, HTMLImageElement>
  frameInterval: number
  mode: 'practice' | 'real'
  onPhaseChange: (phase: TrialPhase, trialIndex: number) => void
  onTrialComplete: (trial: TrialData) => void
  onSessionComplete: (trials: TrialData[]) => void
  onPause: () => void
  onRatingUpdate?: (phase: TrialPhase, value: number) => void
}

export class TrialEngine {
  private config: TrialEngineConfig
  private phases: TrialPhase[]

  // State
  private currentTrialIndex = 0
  private currentPhaseIndex = 0
  private phaseStartTime = 0
  private imageOnsetTime = 0
  private imageFrameCount = 0
  private trialDroppedFrames = 0
  private lastFrameTime = 0
  private rafId = 0
  private running = false
  private isPaused = false

  // Per-trial accumulator
  private valenceRating: number | null = null
  private arousalRating: number | null = null
  private targetFoil: number | null = null
  private memoryResponse: number | null = null
  private correct: number | null = null
  private valenceRtMs: number | null = null
  private arousalRtMs: number | null = null
  private memoryRtMs: number | null = null
  private presentedAt = ''
  private imageActualMs = 0

  // Key buffer
  private keyBuffer: KeyEvent[] = []
  private keyHandler: (e: KeyboardEvent) => void

  // Completed trials
  private allTrials: TrialData[] = []

  constructor(config: TrialEngineConfig) {
    this.config = config
    this.phases = config.sessionType === 'encoding' ? ENCODING_PHASES : TEST_PHASES

    this.keyHandler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      this.keyBuffer.push({ code: e.code, timestamp: performance.now() })
    }

    this.tick = this.tick.bind(this)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.currentTrialIndex = 0
    this.allTrials = []
    this.startTrial()
    document.addEventListener('keydown', this.keyHandler, true)
    this.lastFrameTime = performance.now()
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
    document.removeEventListener('keydown', this.keyHandler, true)
  }

  destroy(): void {
    this.stop()
  }

  handleResume(): void {
    if (!this.isPaused) return
    this.isPaused = false
    this.startTrial()
  }

  getCurrentImage(): HTMLImageElement | null {
    const assignment = this.config.assignments[this.currentTrialIndex]
    if (!assignment) return null
    return this.config.images.get(assignment.image_id) ?? null
  }

  getCurrentTrialIndex(): number {
    return this.currentTrialIndex
  }

  private startTrial(): void {
    this.currentPhaseIndex = 0
    this.valenceRating = null
    this.arousalRating = null
    this.targetFoil = null
    this.memoryResponse = null
    this.correct = null
    this.valenceRtMs = null
    this.arousalRtMs = null
    this.memoryRtMs = null
    this.presentedAt = ''
    this.imageActualMs = 0
    this.imageOnsetTime = 0
    this.imageFrameCount = 0
    this.trialDroppedFrames = 0
    this.keyBuffer = []

    const assignment = this.config.assignments[this.currentTrialIndex]
    if (assignment) {
      this.targetFoil = assignment.image_role.endsWith('_foil') ? 1 : 0
    }

    this.phaseStartTime = performance.now()
    this.config.onPhaseChange(this.currentPhase(), this.currentTrialIndex)
  }

  private currentPhase(): TrialPhase {
    return this.phases[this.currentPhaseIndex]
  }

  private phaseDuration(phase: TrialPhase): number {
    const tc = this.config.timingConfig
    switch (phase) {
      case TrialPhase.FIXATION_VISIBLE: return tc.fixationVisible
      case TrialPhase.FIXATION_BLANK: return tc.fixationBlank
      case TrialPhase.IMAGE: return tc.imageDisplay
      case TrialPhase.MEMORY_JUDGMENT: return tc.memoryTimeout
      case TrialPhase.POST_MEMORY_GAP: return tc.postMemoryGap
      case TrialPhase.VALENCE_RATING: return tc.ratingTimeout
      case TrialPhase.INTER_RATING_GAP: return tc.interRatingGap
      case TrialPhase.AROUSAL_RATING: return tc.ratingTimeout
      case TrialPhase.TRIAL_COMPLETE: return 0
    }
  }

  private tick(timestamp: number): void {
    if (!this.running) return

    const delta = timestamp - this.lastFrameTime
    this.lastFrameTime = timestamp

    if (this.isPaused) {
      this.rafId = requestAnimationFrame(this.tick)
      return
    }

    const phase = this.currentPhase()
    const elapsed = timestamp - this.phaseStartTime

    // Dropped frame detection during IMAGE
    if (phase === TrialPhase.IMAGE && delta > 1.5 * this.config.frameInterval) {
      this.trialDroppedFrames++
    }

    // Count image frames
    if (phase === TrialPhase.IMAGE) {
      this.imageFrameCount++
    }

    // Process key buffer for response phases
    if (phase === TrialPhase.VALENCE_RATING || phase === TrialPhase.AROUSAL_RATING || phase === TrialPhase.MEMORY_JUDGMENT) {
      const validKey = this.consumeValidKey(phase)
      if (validKey) {
        this.recordResponse(phase, validKey)
        this.advancePhase(timestamp)
        this.rafId = requestAnimationFrame(this.tick)
        return
      }
    }

    // Check timed phase completion
    if (phase !== TrialPhase.TRIAL_COMPLETE && elapsed >= this.phaseDuration(phase)) {
      if (phase === TrialPhase.IMAGE) {
        this.imageActualMs = timestamp - this.imageOnsetTime
      }
      this.advancePhase(timestamp)
    }

    this.rafId = requestAnimationFrame(this.tick)
  }

  private consumeValidKey(phase: TrialPhase): KeyEvent | null {
    const ic = this.config.inputConfig
    for (let i = 0; i < this.keyBuffer.length; i++) {
      const key = this.keyBuffer[i]
      let valid = false

      if (phase === TrialPhase.VALENCE_RATING || phase === TrialPhase.AROUSAL_RATING) {
        valid = ic.ratingKeys.includes(key.code)
      } else if (phase === TrialPhase.MEMORY_JUDGMENT) {
        valid = key.code === ic.memoryOldKey || key.code === ic.memoryNewKey
      }

      if (valid) {
        this.keyBuffer.splice(0, i + 1) // consume up to and including this key
        return key
      }
    }
    this.keyBuffer = [] // clear invalid keys
    return null
  }

  private recordResponse(phase: TrialPhase, key: KeyEvent): void {
    const rt = Math.round(key.timestamp - this.phaseStartTime)
    const ic = this.config.inputConfig

    if (phase === TrialPhase.VALENCE_RATING) {
      const index = ic.ratingKeys.indexOf(key.code)
      this.valenceRating = index + 1
      this.valenceRtMs = rt
      this.config.onRatingUpdate?.(phase, this.valenceRating)
    } else if (phase === TrialPhase.AROUSAL_RATING) {
      const index = ic.ratingKeys.indexOf(key.code)
      this.arousalRating = index + 1
      this.arousalRtMs = rt
      this.config.onRatingUpdate?.(phase, this.arousalRating)
    } else if (phase === TrialPhase.MEMORY_JUDGMENT) {
      this.memoryResponse = key.code === ic.memoryOldKey ? 0 : 1
      this.memoryRtMs = rt
      // Compute correctness: target(0)+Old(0)=correct, foil(1)+New(1)=correct
      if (this.targetFoil !== null) {
        this.correct = (this.memoryResponse === 0 && this.targetFoil === 0) ||
                       (this.memoryResponse === 1 && this.targetFoil === 1) ? 1 : 0
      }
    }
  }

  private advancePhase(timestamp: number): void {
    this.currentPhaseIndex++

    if (this.currentPhaseIndex >= this.phases.length || this.currentPhase() === TrialPhase.TRIAL_COMPLETE) {
      this.completeTrial()
      return
    }

    const nextPhase = this.currentPhase()
    this.phaseStartTime = timestamp

    if (
      nextPhase === TrialPhase.VALENCE_RATING ||
      nextPhase === TrialPhase.AROUSAL_RATING ||
      nextPhase === TrialPhase.MEMORY_JUDGMENT
    ) {
      this.keyBuffer = []
    }

    if (nextPhase === TrialPhase.IMAGE) {
      this.imageOnsetTime = timestamp
      this.presentedAt = new Date(performance.timeOrigin + timestamp).toISOString()
      this.imageFrameCount = 0
      this.trialDroppedFrames = 0
    }

    this.config.onPhaseChange(nextPhase, this.currentTrialIndex)
  }

  private completeTrial(): void {
    const assignment = this.config.assignments[this.currentTrialIndex]

    const trial: TrialData = {
      trialNumber: this.currentTrialIndex + 1,
      imageId: assignment?.image_id ?? 0,
      valenceRating: this.valenceRating,
      arousalRating: this.arousalRating,
      targetFoil: this.config.sessionType === 'encoding' ? null : this.targetFoil,
      memoryResponse: this.config.sessionType === 'encoding' ? null : this.memoryResponse,
      correct: this.config.sessionType === 'encoding' ? null : this.correct,
      valenceRtMs: this.valenceRtMs,
      arousalRtMs: this.arousalRtMs,
      memoryRtMs: this.config.sessionType === 'encoding' ? null : this.memoryRtMs,
      presentedAt: this.presentedAt,
      imageActualMs: this.imageActualMs,
      imageFrameCount: this.imageFrameCount,
      droppedFrames: this.trialDroppedFrames,
    }

    this.allTrials.push(trial)
    this.config.onTrialComplete(trial)

    this.currentTrialIndex++

    // Check for pause after pauseTrialIndex
    if (this.currentTrialIndex === this.config.timingConfig.pauseTrialIndex &&
        this.currentTrialIndex < this.config.assignments.length) {
      this.isPaused = true
      this.config.onPause()
      return
    }

    // Check for session complete
    if (this.currentTrialIndex >= this.config.assignments.length) {
      this.stop()
      this.config.onSessionComplete(this.allTrials)
      return
    }

    this.startTrial()
  }
}
