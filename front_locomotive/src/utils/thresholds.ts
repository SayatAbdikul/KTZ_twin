import type { MetricDefinition } from '@/types/telemetry'
import type { AlertSeverity } from '@/types/alerts'
import type { SubsystemStatus } from '@/types/health'

export type SeverityLevel = 'critical' | 'warning' | 'normal'

export function getMetricSeverity(
  value: number,
  def: MetricDefinition
): SeverityLevel {
  if (
    (def.criticalLow !== undefined && value <= def.criticalLow) ||
    (def.criticalHigh !== undefined && value >= def.criticalHigh)
  ) {
    return 'critical'
  }
  if (
    (def.warningLow !== undefined && value <= def.warningLow) ||
    (def.warningHigh !== undefined && value >= def.warningHigh)
  ) {
    return 'warning'
  }
  return 'normal'
}

export function severityToColor(severity: SeverityLevel | AlertSeverity | SubsystemStatus): string {
  switch (severity) {
    case 'critical': return 'text-red-400'
    case 'warning': return 'text-amber-400'
    case 'normal':
    case 'info': return 'text-emerald-400'
    case 'degraded': return 'text-amber-400'
    case 'unknown': return 'text-slate-400'
    default: return 'text-slate-300'
  }
}

export function severityToBg(severity: SeverityLevel | AlertSeverity): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 border-red-500/50 text-red-300'
    case 'warning': return 'bg-amber-500/20 border-amber-500/50 text-amber-300'
    case 'normal':
    case 'info': return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
    default: return 'bg-slate-500/20 border-slate-500/50 text-slate-300'
  }
}

export function subsystemStatusColor(status: SubsystemStatus): string {
  switch (status) {
    case 'normal': return 'bg-emerald-500'
    case 'degraded': return 'bg-amber-500'
    case 'warning': return 'bg-amber-500'
    case 'critical': return 'bg-red-500'
    default: return 'bg-slate-500'
  }
}
