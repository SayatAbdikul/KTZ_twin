import { METRIC_DEFINITIONS } from '@/config/metrics.config'
import type { Alert } from '@/types/alerts'
import type { HealthIndex, SubsystemHealth, SubsystemPenalty, ThresholdType } from '@/types/health'
import type { ReplayResolution, ReplaySnapshot, ReplayTimeRange } from '@/types/replay'
import type { MetricDefinition, TelemetryFrame } from '@/types/telemetry'

const MOCK_LOCOMOTIVE_ID = 'KTZ-2001'
const REPLAY_END_TS = Date.now() - 30_000
const REPLAY_START_TS = REPLAY_END_TS - 60 * 60_000

const SUBSYSTEMS: Array<Pick<SubsystemHealth, 'subsystemId' | 'label'>> = [
  { subsystemId: 'engine', label: 'Engine' },
  { subsystemId: 'brakes', label: 'Brakes' },
  { subsystemId: 'electrical', label: 'Electrical' },
  { subsystemId: 'fuel', label: 'Fuel System' },
  { subsystemId: 'cooling', label: 'Cooling' },
  { subsystemId: 'pneumatic', label: 'Pneumatics' },
]

const SUBSYSTEM_METRICS: Record<string, string[]> = {
  engine: ['pressure.oil', 'thermal.oil_temp', 'thermal.exhaust_temp'],
  brakes: ['pressure.brake_main', 'pressure.brake_pipe', 'motion.speed'],
  electrical: ['electrical.traction_voltage', 'electrical.traction_current', 'electrical.battery_voltage'],
  fuel: ['fuel.level', 'fuel.consumption_rate'],
  cooling: ['thermal.coolant_temp', 'thermal.oil_temp'],
  pneumatic: ['pressure.brake_main', 'pressure.brake_pipe'],
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hashMetricId(metricId: string): number {
  return Array.from(metricId).reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0)
}

function progressAt(timestamp: number): number {
  if (REPLAY_END_TS === REPLAY_START_TS) return 0
  return clamp((timestamp - REPLAY_START_TS) / (REPLAY_END_TS - REPLAY_START_TS), 0, 1)
}

function genericValue(definition: MetricDefinition, timestamp: number): number {
  const progress = progressAt(timestamp)
  const mid = (definition.min + definition.max) / 2
  const amplitude = (definition.max - definition.min) * 0.12
  const phase = hashMetricId(definition.metricId) / 50
  const swing = Math.sin(progress * Math.PI * 8 + phase) * amplitude
  const drift = Math.cos(progress * Math.PI * 3 + phase) * amplitude * 0.35
  return clamp(mid + swing + drift, definition.min, definition.max)
}

function valueForMetric(definition: MetricDefinition, timestamp: number): number {
  const progress = progressAt(timestamp)

  switch (definition.metricId) {
    case 'motion.speed':
      return clamp(
        78 + Math.sin(progress * Math.PI * 10) * 16 + Math.cos(progress * Math.PI * 2) * 7,
        definition.min,
        definition.max
      )
    case 'fuel.level':
      return clamp(82 - progress * 68 + Math.sin(progress * Math.PI * 6) * 1.6, definition.min, definition.max)
    case 'fuel.consumption_rate':
      return clamp(
        175 + progress * 160 + Math.sin(progress * Math.PI * 10) * 35,
        definition.min,
        definition.max
      )
    case 'thermal.coolant_temp':
      return clamp(
        86 + progress * 18 + Math.sin(progress * Math.PI * 12) * 5,
        definition.min,
        definition.max
      )
    case 'thermal.oil_temp':
      return clamp(
        96 + progress * 20 + Math.cos(progress * Math.PI * 9) * 6,
        definition.min,
        definition.max
      )
    case 'pressure.brake_main':
      return clamp(
        8.4 - Math.max(0, progress - 0.55) * 7 + Math.sin(progress * Math.PI * 7) * 0.2,
        definition.min,
        definition.max
      )
    case 'pressure.brake_pipe':
      return clamp(
        5.1 - Math.max(0, progress - 0.55) * 1.4 + Math.cos(progress * Math.PI * 5) * 0.18,
        definition.min,
        definition.max
      )
    case 'pressure.oil':
      return clamp(
        4.6 - Math.max(0, progress - 0.6) * 3.1 + Math.sin(progress * Math.PI * 8) * 0.16,
        definition.min,
        definition.max
      )
    case 'electrical.traction_voltage':
      return clamp(
        2760 - progress * 220 + Math.cos(progress * Math.PI * 11) * 60,
        definition.min,
        definition.max
      )
    case 'electrical.traction_current':
      return clamp(
        820 + progress * 760 + Math.sin(progress * Math.PI * 9) * 180,
        definition.min,
        definition.max
      )
    default:
      return genericValue(definition, timestamp)
  }
}

function getThresholdBreach(
  definition: MetricDefinition,
  value: number
): Omit<SubsystemPenalty, 'metricId' | 'metricLabel' | 'currentValue'> | null {
  const checks: Array<{ type: ThresholdType; value: number | undefined; penaltyPoints: number }> = [
    { type: 'criticalLow', value: definition.criticalLow, penaltyPoints: 15 },
    { type: 'criticalHigh', value: definition.criticalHigh, penaltyPoints: 15 },
    { type: 'warningLow', value: definition.warningLow, penaltyPoints: 5 },
    { type: 'warningHigh', value: definition.warningHigh, penaltyPoints: 5 },
  ]

  for (const check of checks) {
    if (check.value === undefined) continue
    const breached = check.type.endsWith('Low') ? value <= check.value : value >= check.value
    if (!breached) continue

    return {
      thresholdType: check.type,
      thresholdValue: check.value,
      penaltyPoints: check.penaltyPoints,
    }
  }

  return null
}

function scoreToStatus(score: number): SubsystemHealth['status'] {
  if (score >= 85) return 'normal'
  if (score >= 70) return 'degraded'
  if (score >= 50) return 'warning'
  return 'critical'
}

function buildTelemetryFrame(timestamp: number): TelemetryFrame {
  return {
    locomotiveId: MOCK_LOCOMOTIVE_ID,
    frameId: `replay-${timestamp}`,
    timestamp,
    readings: METRIC_DEFINITIONS.map((definition) => ({
      metricId: definition.metricId,
      value: valueForMetric(definition, timestamp),
      unit: definition.unit,
      timestamp,
      quality: 'good' as const,
    })),
  }
}

function buildHealthIndex(timestamp: number): HealthIndex {
  const frame = buildTelemetryFrame(timestamp)
  const metricValues = new Map(frame.readings.map((reading) => [reading.metricId, reading.value]))
  const allPenalties: SubsystemPenalty[] = []

  const subsystems: SubsystemHealth[] = SUBSYSTEMS.map((subsystem) => {
    const penalties: SubsystemPenalty[] = []

    for (const metricId of SUBSYSTEM_METRICS[subsystem.subsystemId] ?? []) {
      const definition = METRIC_DEFINITIONS.find((metric) => metric.metricId === metricId)
      const currentValue = metricValues.get(metricId)
      if (!definition || currentValue === undefined) continue

      const breach = getThresholdBreach(definition, currentValue)
      if (!breach) continue

      penalties.push({
        metricId,
        metricLabel: definition.label,
        currentValue,
        thresholdType: breach.thresholdType,
        thresholdValue: breach.thresholdValue,
        penaltyPoints: breach.penaltyPoints,
      })
    }

    allPenalties.push(...penalties)
    const score = clamp(100 - penalties.reduce((sum, penalty) => sum + penalty.penaltyPoints, 0), 0, 100)

    return {
      subsystemId: subsystem.subsystemId,
      label: subsystem.label,
      healthScore: Math.round(score * 10) / 10,
      status: scoreToStatus(score),
      activeAlertCount: penalties.length,
      lastUpdated: timestamp,
      penalties,
    }
  })

  const overall = subsystems.reduce((sum, subsystem) => sum + subsystem.healthScore, 0) / subsystems.length

  return {
    overall: Math.round(overall * 10) / 10,
    timestamp,
    subsystems,
    topFactors: [...allPenalties]
      .sort((left, right) => right.penaltyPoints - left.penaltyPoints)
      .slice(0, 5),
  }
}

function buildAlerts(timestamp: number): Alert[] {
  const frame = buildTelemetryFrame(timestamp)
  const metricValues = new Map(frame.readings.map((reading) => [reading.metricId, reading.value]))

  const candidateDefinitions = METRIC_DEFINITIONS.filter((definition) =>
    ['thermal.coolant_temp', 'fuel.level', 'electrical.traction_current', 'pressure.brake_main'].includes(
      definition.metricId
    )
  )

  return candidateDefinitions
    .flatMap((definition) => {
      const currentValue = metricValues.get(definition.metricId)
      if (currentValue === undefined) return []

      const breach = getThresholdBreach(definition, currentValue)
      if (!breach) return []

      const severity = breach.penaltyPoints >= 15 ? 'critical' : 'warning'
      return [
        {
          alertId: `replay-${definition.metricId}`,
          severity,
          status: 'active',
          source: definition.group,
          title: `${definition.label} threshold breached`,
          description: `${definition.label} is currently at ${currentValue.toFixed(definition.precision)} ${definition.unit}.`,
          recommendedAction:
            severity === 'critical'
              ? 'Reduce load and inspect the affected subsystem before continuing at full power.'
              : 'Monitor the trend and prepare a maintenance follow-up if the value continues drifting.',
          triggeredAt: timestamp,
          relatedMetricIds: [definition.metricId],
        } satisfies Alert,
      ]
    })
    .slice(0, 4)
}

function stepMsForResolution(resolution: ReplayResolution): number {
  switch (resolution) {
    case 'raw':
    case '1s':
      return 1_000
    case '10s':
      return 10_000
    case '1m':
      return 60_000
    case '5m':
      return 300_000
  }
}

export function generateReplayTimeRange(): ReplayTimeRange {
  return {
    locomotiveId: MOCK_LOCOMOTIVE_ID,
    earliest: REPLAY_START_TS,
    latest: REPLAY_END_TS,
  }
}

export function generateReplayRange(params: {
  from: number
  to: number
  metricIds?: string[]
  resolution: ReplayResolution
}) {
  const from = clamp(Math.min(params.from, params.to), REPLAY_START_TS, REPLAY_END_TS)
  const to = clamp(Math.max(params.from, params.to), REPLAY_START_TS, REPLAY_END_TS)
  const metricIds = params.metricIds && params.metricIds.length > 0
    ? params.metricIds
    : METRIC_DEFINITIONS.filter((metric) => metric.sparklineEnabled).map((metric) => metric.metricId)
  const stepMs = stepMsForResolution(params.resolution)

  const byMetric = Object.fromEntries(
    metricIds.map((metricId) => {
      const definition = METRIC_DEFINITIONS.find((metric) => metric.metricId === metricId)
      if (!definition) return [metricId, []]

      const points: Array<{ timestamp: number; value: number }> = []
      for (let timestamp = from; timestamp <= to; timestamp += stepMs) {
        points.push({
          timestamp,
          value: valueForMetric(definition, timestamp),
        })
      }

      if (points.length === 0 || points[points.length - 1]?.timestamp !== to) {
        points.push({
          timestamp: to,
          value: valueForMetric(definition, to),
        })
      }

      return [metricId, points]
    })
  )

  return {
    locomotiveId: MOCK_LOCOMOTIVE_ID,
    from,
    to,
    resolution: params.resolution,
    byMetric,
  }
}

export function generateReplaySnapshot(timestamp: number): ReplaySnapshot {
  const clampedTimestamp = clamp(timestamp, REPLAY_START_TS, REPLAY_END_TS)

  return {
    locomotiveId: MOCK_LOCOMOTIVE_ID,
    timestamp: clampedTimestamp,
    telemetry: buildTelemetryFrame(clampedTimestamp),
    health: buildHealthIndex(clampedTimestamp),
    alerts: buildAlerts(clampedTimestamp),
  }
}
