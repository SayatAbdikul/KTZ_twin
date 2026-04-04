export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertStatus = 'active' | 'acknowledged' | 'resolved'

export interface Alert {
  alertId: string
  severity: AlertSeverity
  status: AlertStatus
  source: string
  title: string
  description: string
  recommendedAction?: string
  triggeredAt: number
  acknowledgedAt?: number
  acknowledgedBy?: string
  resolvedAt?: number
  relatedMetricIds: string[]
}

export interface AlertSummary {
  criticalCount: number
  warningCount: number
  infoCount: number
  totalActive: number
}
