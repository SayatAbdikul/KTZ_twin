import type { HealthIndex, SubsystemHealth, SubsystemPenalty, ThresholdType } from '@/types/health'

function adaptPenalty(raw: Record<string, unknown>): SubsystemPenalty {
  return {
    metricId: (raw['metric_id'] ?? raw['metricId'] ?? '') as string,
    metricLabel: (raw['metric_label'] ?? raw['metricLabel'] ?? '') as string,
    currentValue: (raw['current_value'] ?? raw['currentValue'] ?? 0) as number,
    thresholdType: (raw['threshold_type'] ?? raw['thresholdType'] ?? 'warningHigh') as ThresholdType,
    thresholdValue: (raw['threshold_value'] ?? raw['thresholdValue'] ?? 0) as number,
    penaltyPoints: (raw['penalty_points'] ?? raw['penaltyPoints'] ?? 0) as number,
  }
}

function adaptSubsystem(raw: Record<string, unknown>): SubsystemHealth {
  return {
    subsystemId: (raw['subsystem_id'] ?? raw['subsystemId']) as string,
    label: (raw['label'] ?? '') as string,
    healthScore: (raw['health_score'] ?? raw['healthScore'] ?? 100) as number,
    status: (raw['status'] ?? 'unknown') as SubsystemHealth['status'],
    activeAlertCount: (raw['active_alert_count'] ?? raw['activeAlertCount'] ?? 0) as number,
    lastUpdated: (raw['last_updated'] ?? raw['lastUpdated'] ?? Date.now()) as number,
    penalties: ((raw['penalties'] ?? []) as Record<string, unknown>[]).map(adaptPenalty),
  }
}

export function adaptHealthIndex(raw: unknown): HealthIndex {
  const d = raw as Record<string, unknown>
  return {
    overall: (d['overall'] ?? 100) as number,
    timestamp: (d['timestamp'] ?? Date.now()) as number,
    subsystems: ((d['subsystems'] ?? []) as Record<string, unknown>[]).map(adaptSubsystem),
    topFactors: ((d['top_factors'] ?? d['topFactors'] ?? []) as Record<string, unknown>[]).map(
      adaptPenalty
    ),
  }
}
