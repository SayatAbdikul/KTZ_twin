import { useMemo } from 'react'
import { METRIC_DEFINITIONS } from '@/config/metrics.config'
import { useTelemetryStore } from './useTelemetryStore'
import type { MetricDefinition } from '@/types/telemetry'

const STATIC_METRIC_BY_ID = new Map(METRIC_DEFINITIONS.map((metric) => [metric.metricId, metric]))

export function resolveMetricDefinitions(runtimeDefinitions?: MetricDefinition[]): MetricDefinition[] {
  if (!runtimeDefinitions || runtimeDefinitions.length === 0) {
    return METRIC_DEFINITIONS
  }

  const resolved = new Map<string, MetricDefinition>()

  for (const metric of runtimeDefinitions) {
    const fallback = STATIC_METRIC_BY_ID.get(metric.metricId)
    resolved.set(metric.metricId, fallback ? { ...fallback, ...metric } : metric)
  }

  for (const metric of METRIC_DEFINITIONS) {
    if (!resolved.has(metric.metricId)) {
      resolved.set(metric.metricId, metric)
    }
  }

  return Array.from(resolved.values()).sort((left, right) => {
    if (left.group !== right.group) {
      return left.group.localeCompare(right.group)
    }
    return left.displayOrder - right.displayOrder
  })
}

export function resolveMetricDefinition(
  metricId: string,
  runtimeDefinitions?: MetricDefinition[]
): MetricDefinition | undefined {
  return resolveMetricDefinitions(runtimeDefinitions).find((metric) => metric.metricId === metricId)
}

export function useMetricCatalog(): MetricDefinition[] {
  const runtimeDefinitions = useTelemetryStore((state) => state.metricDefinitions)
  return useMemo(() => resolveMetricDefinitions(runtimeDefinitions), [runtimeDefinitions])
}
