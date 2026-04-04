import type { Alert } from '@/types/alerts'

export function adaptAlert(raw: unknown, eventLocomotiveId?: string): Alert {
  const d = raw as Record<string, unknown>
  return {
    alertId: (d['alert_id'] ?? d['alertId']) as string,
    locomotiveId: String(d['locomotive_id'] ?? d['locomotiveId'] ?? eventLocomotiveId ?? ''),
    severity: d['severity'] as Alert['severity'],
    status: (d['status'] ?? 'active') as Alert['status'],
    source: (d['source'] ?? '') as string,
    title: (d['title'] ?? '') as string,
    description: (d['description'] ?? '') as string,
    recommendedAction: d['recommended_action'] as string | undefined,
    triggeredAt: (d['triggered_at'] ?? d['triggeredAt'] ?? Date.now()) as number,
    acknowledgedAt: d['acknowledged_at'] as number | undefined,
    acknowledgedBy: d['acknowledged_by'] as string | undefined,
    resolvedAt: d['resolved_at'] as number | undefined,
    relatedMetricIds: ((d['related_metric_ids'] ?? d['relatedMetricIds'] ?? []) as string[]),
  }
}
