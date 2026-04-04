import type { TelemetryFrame, MetricReading } from '@/types/telemetry'

function adaptReading(raw: Record<string, unknown>): MetricReading {
  return {
    metricId: (raw['metric_id'] ?? raw['metricId']) as string,
    value: raw['value'] as number,
    unit: (raw['unit'] ?? '') as string,
    timestamp: (raw['timestamp'] ?? Date.now()) as number,
    quality: ((raw['quality'] ?? 'good') as MetricReading['quality']),
  }
}

export function adaptTelemetryFrame(raw: unknown): TelemetryFrame {
  const data = raw as Record<string, unknown>
  return {
    locomotiveId: (data['locomotive_id'] ?? data['locomotiveId'] ?? '') as string,
    frameId: (data['frame_id'] ?? data['frameId'] ?? '') as string,
    timestamp: (data['timestamp'] ?? Date.now()) as number,
    latitude: typeof data['latitude'] === 'number' ? (data['latitude'] as number) : undefined,
    longitude: typeof data['longitude'] === 'number' ? (data['longitude'] as number) : undefined,
    readings: ((data['readings'] ?? []) as Record<string, unknown>[]).map(adaptReading),
  }
}
