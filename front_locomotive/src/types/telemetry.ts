export interface MetricReading {
  metricId: string
  value: number
  unit: string
  timestamp: number
  quality: 'good' | 'suspect' | 'bad' | 'stale'
}

export interface MetricDefinition {
  metricId: string
  label: string
  unit: string
  group: MetricGroup
  precision: number
  min: number
  max: number
  warningLow?: number
  warningHigh?: number
  criticalLow?: number
  criticalHigh?: number
  sparklineEnabled: boolean
  displayOrder: number
}

export type MetricGroup = 'motion' | 'fuel' | 'thermal' | 'pressure' | 'electrical'

export interface TelemetryFrame {
  locomotiveId: string
  frameId: string
  timestamp: number
  readings: MetricReading[]
}

export interface MetricHistory {
  metricId: string
  points: Array<{ timestamp: number; value: number }>
  from: number
  to: number
  resolution: 'raw' | '1s' | '10s' | '1m' | '5m'
}
