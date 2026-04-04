import type { Alert } from '@/types/alerts'
import type { HealthIndex } from '@/types/health'
import type { TelemetryFrame } from '@/types/telemetry'
import type { TimeRangePreset } from '@/components/charts/TimeRangeSelector'

export type ReplayResolution = 'raw' | '1s' | '10s' | '1m' | '5m'
export type PlaybackSpeed = 1 | 2 | 5 | 10
export type ReplayVisibleWindow = TimeRangePreset

export interface ReplayPoint {
  timestamp: number
  value: number
}

export interface ReplayTimeRange {
  locomotiveId: string
  earliest: number | null
  latest: number | null
}

export interface ReplayRange {
  locomotiveId: string
  from: number
  to: number
  resolution: ReplayResolution
  byMetric: Record<string, ReplayPoint[]>
}

export interface ReplaySnapshot {
  locomotiveId: string
  timestamp: number
  telemetry: TelemetryFrame | null
  health: HealthIndex | null
  alerts: Alert[]
}

export interface ReplayLoadedWindow {
  from: number
  to: number
  resolution: ReplayResolution
}
