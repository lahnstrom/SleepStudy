import { useRef, useState, useCallback, useEffect } from 'react'
import { TrialEngine, type TrialEngineConfig } from '../experiment/TrialEngine'
import { TrialPhase, type TrialData } from '../lib/experimentTypes'
import { saveTrial as idbSaveTrial, updateSessionStatus } from '../lib/indexedDB'

interface EngineReactState {
  phase: TrialPhase | null
  trialIndex: number
  isPaused: boolean
  isComplete: boolean
  completedTrials: TrialData[]
}

export function useTrialEngine(sessionId: string, mode: 'practice' | 'real') {
  const engineRef = useRef<TrialEngine | null>(null)
  const [state, setState] = useState<EngineReactState>({
    phase: null,
    trialIndex: 0,
    isPaused: false,
    isComplete: false,
    completedTrials: [],
  })

  const startEngine = useCallback((config: Omit<TrialEngineConfig, 'onPhaseChange' | 'onTrialComplete' | 'onSessionComplete' | 'onPause'>) => {
    if (engineRef.current) engineRef.current.destroy()

    const engine = new TrialEngine({
      ...config,
      onPhaseChange: (phase, trialIndex) => {
        setState((prev) => ({ ...prev, phase, trialIndex }))
      },
      onTrialComplete: (trial) => {
        if (mode === 'real') {
          idbSaveTrial(sessionId, trial)
          updateSessionStatus(sessionId, 'in_progress', trial.trialNumber)
        }
        setState((prev) => ({
          ...prev,
          completedTrials: [...prev.completedTrials, trial],
        }))
      },
      onSessionComplete: (trials) => {
        setState((prev) => ({
          ...prev,
          isComplete: true,
          completedTrials: trials,
        }))
      },
      onPause: () => {
        setState((prev) => ({ ...prev, isPaused: true }))
      },
    })

    engineRef.current = engine
    engine.start()
  }, [sessionId, mode])

  const stopEngine = useCallback(() => {
    engineRef.current?.stop()
  }, [])

  const resumeFromPause = useCallback(() => {
    engineRef.current?.handleResume()
    setState((prev) => ({ ...prev, isPaused: false }))
  }, [])

  const getCurrentImage = useCallback((): HTMLImageElement | null => {
    return engineRef.current?.getCurrentImage() ?? null
  }, [])

  useEffect(() => {
    return () => { engineRef.current?.destroy() }
  }, [])

  return {
    ...state,
    startEngine,
    stopEngine,
    resumeFromPause,
    getCurrentImage,
  }
}
