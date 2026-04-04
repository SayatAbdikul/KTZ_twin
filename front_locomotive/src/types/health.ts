export type SubsystemStatus = 'normal' | 'degraded' | 'warning' | 'critical' | 'unknown'
export type ThresholdType = 'warningLow' | 'warningHigh' | 'criticalLow' | 'criticalHigh'

export interface SubsystemPenalty {
  metricId: string
  metricLabel: string
  currentValue: number
  thresholdType: ThresholdType
  thresholdValue: number
  penaltyPoints: number
}

export interface SubsystemHealth {
  subsystemId: string
  label: string
  healthScore: number
  status: SubsystemStatus
  activeAlertCount: number
  lastUpdated: number
  penalties?: SubsystemPenalty[]
}

export interface HealthIndex {
  locomotiveId: string
  overall: number
  timestamp: number
  subsystems: SubsystemHealth[]
  topFactors?: SubsystemPenalty[]
}
