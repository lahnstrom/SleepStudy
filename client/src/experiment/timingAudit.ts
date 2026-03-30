import type { TrialData, TimingConfig, TimingMetadata, DurationStats } from '../lib/experimentTypes'

function computeStats(values: number[], intended: number): DurationStats {
  if (values.length === 0) return { intended, mean: 0, min: 0, max: 0, sd: 0 }

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  const sd = Math.sqrt(variance)

  return { intended, mean, min, max, sd }
}

export function computeTimingAudit(
  trials: TrialData[],
  config: TimingConfig,
  refreshRate: number
): TimingMetadata {
  const frameInterval = 1000 / refreshRate
  const imageDurations = trials.map((t) => t.imageActualMs)
  const totalDropped = trials.reduce((sum, t) => sum + t.droppedFrames, 0)

  const flaggedTrials = trials
    .filter((t) => Math.abs(t.imageActualMs - config.imageDisplay) > frameInterval)
    .map((t) => t.trialNumber)

  return {
    refreshRate,
    totalTrials: trials.length,
    droppedFrames: totalDropped,
    imageDuration: computeStats(imageDurations, config.imageDisplay),
    flaggedTrials,
  }
}

export function computePracticeMeanDeviation(
  trials: TrialData[],
  config: TimingConfig
): number {
  if (trials.length === 0) return 0
  const deviations = trials.map((t) => Math.abs(t.imageActualMs - config.imageDisplay))
  return deviations.reduce((a, b) => a + b, 0) / deviations.length
}
