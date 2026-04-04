import { adaptAlert } from '@/services/adapters/alertAdapter'
import { adaptHealthIndex } from '@/services/adapters/healthAdapter'
import { adaptTelemetryFrame } from '@/services/adapters/telemetryAdapter'
import type { ReplayPoint, ReplayRange, ReplaySnapshot, ReplayTimeRange } from '@/types/replay'

function adaptPoint(raw: Record<string, unknown>): ReplayPoint {
  return {
    timestamp: Number(raw['timestamp'] ?? Date.now()),
    value: Number(raw['value'] ?? 0),
  }
}

export function adaptReplayTimeRange(raw: unknown): ReplayTimeRange {
  const data = raw as Record<string, unknown>
  const earliest = data['earliest']
  const latest = data['latest']

  return {
    locomotiveId: String(data['locomotiveId'] ?? data['locomotive_id'] ?? ''),
    earliest: earliest == null ? null : Number(earliest),
    latest: latest == null ? null : Number(latest),
  }
}

export function adaptReplayRange(raw: unknown): ReplayRange {
  const data = raw as Record<string, unknown>
  const byMetricRaw = (data['byMetric'] ?? data['by_metric'] ?? {}) as Record<
    string,
    Record<string, unknown>[]
  >

  const byMetric = Object.fromEntries(
    Object.entries(byMetricRaw).map(([metricId, points]) => [
      metricId,
      points.map((point) => adaptPoint(point)),
    ])
  )

  return {
    locomotiveId: String(data['locomotiveId'] ?? data['locomotive_id'] ?? ''),
    from: Number(data['from'] ?? 0),
    to: Number(data['to'] ?? 0),
    resolution: String(data['resolution'] ?? 'raw') as ReplayRange['resolution'],
    byMetric,
  }
}

export function adaptReplaySnapshot(raw: unknown): ReplaySnapshot {
  const data = raw as Record<string, unknown>
  const telemetryRaw = data['telemetry']
  const healthRaw = data['health']
  const alertsRaw = (data['alerts'] ?? []) as Record<string, unknown>[]

  return {
    locomotiveId: String(data['locomotiveId'] ?? data['locomotive_id'] ?? ''),
    timestamp: Number(data['timestamp'] ?? Date.now()),
    telemetry: telemetryRaw ? adaptTelemetryFrame(telemetryRaw) : null,
    health: healthRaw ? adaptHealthIndex(healthRaw) : null,
    alerts: alertsRaw.map((alert) => adaptAlert(alert)),
  }
}
