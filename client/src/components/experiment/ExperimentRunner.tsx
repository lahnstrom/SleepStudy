import { useReducer, useEffect, useCallback, useRef } from 'react'
import { api, ApiError } from '../../lib/api'
import {
  type TimingConfig,
  type InputConfig,
  type ImageAssignment,
  type SessionType,
  type RunnerState,
  type TrialData,
  DEFAULT_INPUT_CONFIG,
  TrialPhase,
} from '../../lib/experimentTypes'
import { saveSession, updateSessionStatus, getTrials as idbGetTrials } from '../../lib/indexedDB'
import { detectRefreshRate } from '../../experiment/refreshRateDetector'
import { preloadImages, createPracticeImages } from '../../experiment/imagePreloader'
import { computeTimingAudit, computePracticeMeanDeviation } from '../../experiment/timingAudit'
import { useTrialEngine } from '../../hooks/useTrialEngine'
import TrialDisplay from './TrialDisplay'
import PauseScreen from './PauseScreen'
import PracticeIntro from './PracticeIntro'
import PracticeComplete from './PracticeComplete'
import SessionComplete from './SessionComplete'
import ImageLoadProgress from './ImageLoadProgress'

interface ExperimentRunnerProps {
  participantId: number
  labDay: number
  sessionType: SessionType
  maxTrials?: number // limit trial count for testing (e.g. ?trials=3)
  skipPractice?: boolean // skip practice (e.g. ?skipPractice=1)
}

interface State {
  runnerState: RunnerState
  timingConfig: TimingConfig | null
  inputConfig: InputConfig
  assignments: ImageAssignment[]
  images: Map<number, HTMLImageElement>
  practiceImages: Map<number, HTMLImageElement>
  sessionId: string
  refreshRate: number
  frameInterval: number
  loadProgress: { loaded: number; total: number }
  practiceMeanDeviation: number
  syncStatus: 'syncing' | 'synced' | 'error' | 'pending'
  error: string | null
}

type Action =
  | { type: 'SET_STATE'; runnerState: RunnerState }
  | { type: 'CONFIG_LOADED'; timingConfig: TimingConfig; inputConfig: InputConfig }
  | { type: 'ASSIGNMENTS_LOADED'; assignments: ImageAssignment[] }
  | { type: 'REFRESH_DETECTED'; refreshRate: number; frameInterval: number }
  | { type: 'SESSION_CREATED'; sessionId: string }
  | { type: 'LOAD_PROGRESS'; loaded: number; total: number }
  | { type: 'IMAGES_LOADED'; images: Map<number, HTMLImageElement> }
  | { type: 'PRACTICE_DONE'; meanDeviation: number }
  | { type: 'SYNC_STATUS'; syncStatus: State['syncStatus'] }
  | { type: 'ERROR'; error: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, runnerState: action.runnerState }
    case 'CONFIG_LOADED':
      return { ...state, timingConfig: action.timingConfig, inputConfig: action.inputConfig }
    case 'ASSIGNMENTS_LOADED':
      return { ...state, assignments: action.assignments }
    case 'REFRESH_DETECTED':
      return { ...state, refreshRate: action.refreshRate, frameInterval: action.frameInterval }
    case 'SESSION_CREATED':
      return { ...state, sessionId: action.sessionId }
    case 'LOAD_PROGRESS':
      return { ...state, loadProgress: { loaded: action.loaded, total: action.total } }
    case 'IMAGES_LOADED':
      return { ...state, images: action.images, practiceImages: createPracticeImages(6) }
    case 'PRACTICE_DONE':
      return { ...state, practiceMeanDeviation: action.meanDeviation, runnerState: 'PRACTICE_COMPLETE' }
    case 'SYNC_STATUS':
      return { ...state, syncStatus: action.syncStatus }
    case 'ERROR':
      return { ...state, error: action.error, runnerState: 'ERROR' }
    default:
      return state
  }
}

const PRACTICE_ASSIGNMENTS: ImageAssignment[] = Array.from({ length: 6 }, (_, i) => ({
  id: -(i + 1),
  image_id: -(i + 1),
  lab_day: 1,
  image_role: i < 3 ? 'encoding_test1_target' as const : 'test1_foil' as const,
  presentation_position: i + 1,
  filename: `practice_${i + 1}`,
  emotion: 'neutral' as const,
}))

export default function ExperimentRunner({ participantId, labDay, sessionType, maxTrials, skipPractice }: ExperimentRunnerProps) {
  const [state, dispatch] = useReducer(reducer, {
    runnerState: 'LOADING_CONFIG',
    timingConfig: null,
    inputConfig: DEFAULT_INPUT_CONFIG,
    assignments: [],
    images: new Map(),
    practiceImages: new Map(),
    sessionId: '',
    refreshRate: 60,
    frameInterval: 16.67,
    loadProgress: { loaded: 0, total: 0 },
    practiceMeanDeviation: 0,
    syncStatus: 'pending',
    error: null,
  })

  const initDone = useRef(false)

  const practiceEngine = useTrialEngine('practice', 'practice')
  const realEngine = useTrialEngine(state.sessionId || 'pending', 'real')

  // Initialization: load config, assignments, detect refresh, create session, preload images
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    async function init() {
      try {
        // 1. Fetch configs
        const [timingConfig, inputConfig] = await Promise.all([
          api<TimingConfig>('/config/timing'),
          api<InputConfig>('/config/input').catch(() => DEFAULT_INPUT_CONFIG),
        ])
        dispatch({ type: 'CONFIG_LOADED', timingConfig, inputConfig })

        // 2. Fetch assignments
        const assignments = await api<ImageAssignment[]>(
          `/participants/${participantId}/assignments?labDay=${labDay}&sessionType=${sessionType}`
        )
        const trimmed = maxTrials ? assignments.slice(0, maxTrials) : assignments
        dispatch({ type: 'ASSIGNMENTS_LOADED', assignments: trimmed })

        // 3. Detect refresh rate
        const { refreshRate, frameInterval } = await detectRefreshRate()
        dispatch({ type: 'REFRESH_DETECTED', refreshRate, frameInterval })

        // 4. Create session (server returns existing session if already created)
        const proposedId = crypto.randomUUID()
        let sessionId: string
        try {
          const session = await api<{ id: string }>('/sessions', {
            method: 'POST',
            body: JSON.stringify({ sessionId: proposedId, participantId, labDay, sessionType }),
          })
          sessionId = session.id
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            // Session already exists — this shouldn't happen with ON CONFLICT DO UPDATE
            // but handle it gracefully by using the proposed ID
            sessionId = proposedId
          } else {
            throw err
          }
        }
        dispatch({ type: 'SESSION_CREATED', sessionId })

        // Save to IndexedDB
        await saveSession({
          sessionId,
          participantId,
          labDay,
          sessionType,
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          currentTrialIndex: 0,
        })

        // 5. Preload images
        dispatch({ type: 'SET_STATE', runnerState: 'LOADING_IMAGES' })
        const images = await preloadImages(trimmed, (loaded, total) => {
          dispatch({ type: 'LOAD_PROGRESS', loaded, total })
        })
        dispatch({ type: 'IMAGES_LOADED', images })

        // 6. Ready for practice
        dispatch({ type: 'SET_STATE', runnerState: skipPractice ? 'PRACTICE_COMPLETE' : 'PRACTICE_INTRO' })
      } catch (err: any) {
        dispatch({ type: 'ERROR', error: err.message || 'Initialization failed' })
      }
    }

    init()
  }, [participantId, labDay, sessionType])

  // Start practice
  const startPractice = useCallback(() => {
    if (!state.timingConfig) return
    dispatch({ type: 'SET_STATE', runnerState: 'PRACTICE_RUNNING' })
    practiceEngine.startEngine({
      sessionType,
      timingConfig: state.timingConfig,
      inputConfig: state.inputConfig,
      assignments: PRACTICE_ASSIGNMENTS,
      images: state.practiceImages,
      frameInterval: state.frameInterval,
      mode: 'practice',
    })
  }, [state.timingConfig, state.inputConfig, state.practiceImages, state.frameInterval, sessionType, practiceEngine])

  // Practice complete → compute QA
  useEffect(() => {
    if (practiceEngine.isComplete && state.runnerState === 'PRACTICE_RUNNING' && state.timingConfig) {
      const meanDev = computePracticeMeanDeviation(practiceEngine.completedTrials, state.timingConfig)
      dispatch({ type: 'PRACTICE_DONE', meanDeviation: meanDev })
    }
  }, [practiceEngine.isComplete, state.runnerState, state.timingConfig, practiceEngine.completedTrials])

  // Start real session
  const startReal = useCallback(() => {
    if (!state.timingConfig) return
    dispatch({ type: 'SET_STATE', runnerState: 'REAL_RUNNING' })
    realEngine.startEngine({
      sessionType,
      timingConfig: state.timingConfig,
      inputConfig: state.inputConfig,
      assignments: state.assignments,
      images: state.images,
      frameInterval: state.frameInterval,
      mode: 'real',
    })
  }, [state.timingConfig, state.inputConfig, state.assignments, state.images, state.frameInterval, sessionType, realEngine])

  // Start short demo session (3 trials, skip practice)
  const startShortSession = useCallback(() => {
    if (!state.timingConfig) return
    const shortAssignments = state.assignments.slice(0, 3)
    dispatch({ type: 'SET_STATE', runnerState: 'REAL_RUNNING' })
    realEngine.startEngine({
      sessionType,
      timingConfig: state.timingConfig,
      inputConfig: state.inputConfig,
      assignments: shortAssignments,
      images: state.images,
      frameInterval: state.frameInterval,
      mode: 'real',
    })
  }, [state.timingConfig, state.inputConfig, state.assignments, state.images, state.frameInterval, sessionType, realEngine])

  // Real session complete → sync
  useEffect(() => {
    if (!realEngine.isComplete || state.runnerState !== 'REAL_RUNNING') return
    dispatch({ type: 'SET_STATE', runnerState: 'SYNCING' })
    dispatch({ type: 'SYNC_STATUS', syncStatus: 'syncing' })

    async function sync() {
      try {
        // Use trials from React state (more reliable than IndexedDB
        // since the sessionId in the hook closure may have been 'pending')
        const trials = realEngine.completedTrials
        const trialPayload = trials.map((t) => ({
          trialNumber: t.trialNumber,
          imageId: t.imageId,
          valenceRating: t.valenceRating,
          arousalRating: t.arousalRating,
          targetFoil: t.targetFoil,
          memoryResponse: t.memoryResponse,
          correct: t.correct,
          valenceRtMs: t.valenceRtMs,
          arousalRtMs: t.arousalRtMs,
          memoryRtMs: t.memoryRtMs,
          presentedAt: t.presentedAt,
          imageActualMs: t.imageActualMs,
          imageFrameCount: t.imageFrameCount,
          droppedFrames: t.droppedFrames,
        }))

        await api(`/sessions/${state.sessionId}/trials`, {
          method: 'POST',
          body: JSON.stringify({ trials: trialPayload }),
        })

        // Complete session with timing metadata
        const timingMetadata = state.timingConfig
          ? computeTimingAudit(trials, state.timingConfig, state.refreshRate)
          : {}

        await api(`/sessions/${state.sessionId}/complete`, {
          method: 'PATCH',
          body: JSON.stringify({ timingMetadata }),
        })

        await updateSessionStatus(state.sessionId, 'synced', trials.length)
        dispatch({ type: 'SYNC_STATUS', syncStatus: 'synced' })
      } catch (err) {
        console.error('Sync failed:', err)
        dispatch({ type: 'SYNC_STATUS', syncStatus: 'error' })
      }
      dispatch({ type: 'SET_STATE', runnerState: 'DONE' })
    }

    sync()
  }, [realEngine.isComplete, realEngine.completedTrials, state.runnerState, state.sessionId, state.timingConfig, state.refreshRate])

  // Determine which engine is active
  const activeEngine = state.runnerState === 'PRACTICE_RUNNING' ? practiceEngine : realEngine
  const activeAssignments = state.runnerState === 'PRACTICE_RUNNING' ? PRACTICE_ASSIGNMENTS : state.assignments

  // Render
  switch (state.runnerState) {
    case 'LOADING_CONFIG':
      return <div className="experiment-text">Loading configuration...</div>

    case 'LOADING_IMAGES':
      return <ImageLoadProgress loaded={state.loadProgress.loaded} total={state.loadProgress.total} />

    case 'PRACTICE_INTRO':
      return <PracticeIntro sessionType={sessionType} onStart={startPractice} onSkip={startReal} onShortSession={startShortSession} />

    case 'PRACTICE_RUNNING':
      if (practiceEngine.isPaused && state.timingConfig) {
        return (
          <PauseScreen
            duration={state.timingConfig.pauseDuration}
            resumeKeyLabel={state.inputConfig.resumeKey.replace('Key', '')}
            resumeKeyCode={state.inputConfig.resumeKey}
            onResume={practiceEngine.resumeFromPause}
          />
        )
      }
      if (practiceEngine.phase !== null) {
        return (
          <TrialDisplay
            phase={practiceEngine.phase}
            currentImage={practiceEngine.getCurrentImage()}
            inputConfig={state.inputConfig}
            trialIndex={practiceEngine.trialIndex}
            totalTrials={PRACTICE_ASSIGNMENTS.length}
          />
        )
      }
      return <div className="experiment-blank" />

    case 'PRACTICE_COMPLETE':
      return <PracticeComplete meanDeviation={state.practiceMeanDeviation} onProceed={startReal} />

    case 'REAL_RUNNING':
      if (realEngine.isPaused && state.timingConfig) {
        return (
          <PauseScreen
            duration={state.timingConfig.pauseDuration}
            resumeKeyLabel={state.inputConfig.resumeKey.replace('Key', '')}
            resumeKeyCode={state.inputConfig.resumeKey}
            onResume={realEngine.resumeFromPause}
          />
        )
      }
      if (realEngine.phase !== null) {
        return (
          <TrialDisplay
            phase={realEngine.phase}
            currentImage={realEngine.getCurrentImage()}
            inputConfig={state.inputConfig}
            trialIndex={realEngine.trialIndex}
            totalTrials={activeAssignments.length}
          />
        )
      }
      return <div className="experiment-blank" />

    case 'SESSION_COMPLETE':
    case 'SYNCING':
    case 'DONE':
      return <SessionComplete syncStatus={state.syncStatus} />

    case 'ERROR':
      return (
        <div className="experiment-text">
          <h2>Error</h2>
          <p>{state.error}</p>
        </div>
      )
  }
}
