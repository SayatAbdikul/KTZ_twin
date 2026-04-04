import type { TelemetryFrame, MetricHistory } from '@/types/telemetry'
import { METRIC_DEFINITIONS } from '@/config/metrics.config'

let frameCounter = 0
const startValues: Record<string, number> = {
  'motion.speed': 80,
  'motion.acceleration': 0.2,
  'motion.distance': 1250.5,
  'fuel.level': 72.4,
  'fuel.consumption_rate': 180,
  'thermal.coolant_temp': 88,
  'thermal.oil_temp': 95,
  'thermal.exhaust_temp': 420,
  'pressure.brake_main': 8.5,
  'pressure.brake_pipe': 5.0,
  'pressure.oil': 4.5,
  'electrical.traction_voltage': 2750,
  'electrical.traction_current': 850,
  'electrical.battery_voltage': 108,
}

const currentValues: Record<string, number> = { ...startValues }

// Simulate realistic value drift
function nextValue(metricId: string, def: { min: number; max: number }): number {
  const prev = currentValues[metricId] ?? (def.min + def.max) / 2
  const range = def.max - def.min
  const delta = (Math.random() - 0.48) * range * 0.01
  const next = Math.max(def.min, Math.min(def.max, prev + delta))
  currentValues[metricId] = next
  return next
}

export function generateTelemetryFrame(locomotiveId = 'KTZ-2001'): TelemetryFrame {
  frameCounter++
  const ts = Date.now()

  return {
    locomotiveId,
    frameId: `${locomotiveId}-frame-${frameCounter}`,
    timestamp: ts,
    readings: METRIC_DEFINITIONS.map((def) => ({
      metricId: def.metricId,
      value: nextValue(def.metricId, def),
      unit: def.unit,
      timestamp: ts,
      quality: 'good' as const,
    })),
  }
}

export function generateMetricHistory(
  metricId: string,
  from: number,
  to: number,
  resolution: string
): MetricHistory {
  const resolutionMs: Record<string, number> = {
    raw: 1000,
    '1s': 1000,
    '10s': 10000,
    '1m': 60000,
    '5m': 300000,
  }
  const interval = resolutionMs[resolution] ?? 10000
  const def = METRIC_DEFINITIONS.find((d) => d.metricId === metricId)
  const mid = def ? (def.min + def.max) / 2 : 50
  const amplitude = def ? (def.max - def.min) * 0.1 : 10

  const points: Array<{ timestamp: number; value: number }> = []
  for (let t = from; t <= to; t += interval) {
    const phase = (t - from) / (to - from)
    const sine = Math.sin(phase * Math.PI * 6)
    const noise = (Math.random() - 0.5) * amplitude * 0.2
    points.push({ timestamp: t, value: mid + sine * amplitude * 0.5 + noise })
  }

  return {
    metricId,
    points,
    from,
    to,
    resolution: resolution as MetricHistory['resolution'],
  }
}
