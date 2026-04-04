import type { HealthIndex, SubsystemHealth } from '@/types/health'

function adaptSubsystem(raw: Record<string, unknown>): SubsystemHealth {
  return {
    subsystemId: (raw['subsystem_id'] ?? raw['subsystemId']) as string,
    label: (raw['label'] ?? '') as string,
    healthScore: (raw['health_score'] ?? raw['healthScore'] ?? 100) as number,
    status: (raw['status'] ?? 'unknown') as SubsystemHealth['status'],
    activeAlertCount: (raw['active_alert_count'] ?? raw['activeAlertCount'] ?? 0) as number,
    lastUpdated: (raw['last_updated'] ?? raw['lastUpdated'] ?? Date.now()) as number,
  }
}

export function adaptHealthIndex(raw: unknown): HealthIndex {
  const d = raw as Record<string, unknown>
  return {
    overall: (d['overall'] ?? 100) as number,
    timestamp: (d['timestamp'] ?? Date.now()) as number,
    subsystems: ((d['subsystems'] ?? []) as Record<string, unknown>[]).map(adaptSubsystem),
  }
}
