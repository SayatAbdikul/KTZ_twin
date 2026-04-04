export type SubsystemStatus = 'normal' | 'degraded' | 'warning' | 'critical' | 'unknown'

export interface SubsystemHealth {
  subsystemId: string
  label: string
  healthScore: number
  status: SubsystemStatus
  activeAlertCount: number
  lastUpdated: number
}

export interface HealthIndex {
  overall: number
  timestamp: number
  subsystems: SubsystemHealth[]
}
