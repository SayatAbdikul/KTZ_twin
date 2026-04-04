import { METRIC_DEFINITIONS } from '@/config/metrics.config'
import type { HealthIndex, SubsystemHealth, SubsystemPenalty, ThresholdType } from '@/types/health'

const subsystemBase: Omit<SubsystemHealth, 'healthScore' | 'activeAlertCount' | 'lastUpdated'>[] = [
  { subsystemId: 'engine', label: 'Engine', status: 'normal' },
  { subsystemId: 'brakes', label: 'Brakes', status: 'normal' },
  { subsystemId: 'electrical', label: 'Electrical', status: 'normal' },
  { subsystemId: 'fuel', label: 'Fuel System', status: 'normal' },
  { subsystemId: 'cooling', label: 'Cooling', status: 'normal' },
  { subsystemId: 'pneumatic', label: 'Pneumatics', status: 'normal' },
]

const subsystemScores: Record<string, number> = {
  engine: 92,
  brakes: 87,
  electrical: 95,
  fuel: 84,
  cooling: 91,
  pneumatic: 88,
}

const THRESHOLD_PENALTIES = {
  warning: 5,
  critical: 15,
} as const

const MOCK_SUBSYSTEM_VALUES: Record<string, Record<string, number>> = {
  engine: {
    'thermal.oil_temp': 118,
    'pressure.oil': 1.8,
  },
  brakes: {
    'pressure.brake_main': 4.9,
    'pressure.brake_pipe': 4.3,
  },
  electrical: {
    'electrical.traction_current': 1710,
  },
  fuel: {
    'fuel.level': 9.4,
    'fuel.consumption_rate': 430,
  },
  cooling: {
    'thermal.coolant_temp': 101,
  },
  pneumatic: {
    'pressure.brake_main': 4.9,
    'pressure.brake_pipe': 4.3,
  },
}

function buildPenalty(metricId: string, currentValue: number): SubsystemPenalty | null {
  const definition = METRIC_DEFINITIONS.find((metric) => metric.metricId === metricId)
  if (!definition) return null

  const checks: Array<{ type: ThresholdType; value: number | undefined; penaltyPoints: number }> = [
    {
      type: 'criticalLow',
      value: definition.criticalLow,
      penaltyPoints: THRESHOLD_PENALTIES.critical,
    },
    {
      type: 'criticalHigh',
      value: definition.criticalHigh,
      penaltyPoints: THRESHOLD_PENALTIES.critical,
    },
    {
      type: 'warningLow',
      value: definition.warningLow,
      penaltyPoints: THRESHOLD_PENALTIES.warning,
    },
    {
      type: 'warningHigh',
      value: definition.warningHigh,
      penaltyPoints: THRESHOLD_PENALTIES.warning,
    },
  ]

  for (const check of checks) {
    if (check.value === undefined) continue
    const isLow = check.type.endsWith('Low')
    const breached = isLow ? currentValue <= check.value : currentValue >= check.value
    if (!breached) continue

    return {
      metricId,
      metricLabel: definition.label,
      currentValue,
      thresholdType: check.type,
      thresholdValue: check.value,
      penaltyPoints: check.penaltyPoints,
    }
  }

  return null
}

function getSubsystemPenalties(subsystemId: string): SubsystemPenalty[] {
  const values = MOCK_SUBSYSTEM_VALUES[subsystemId] ?? {}
  const penalties: SubsystemPenalty[] = []

  for (const [metricId, currentValue] of Object.entries(values)) {
    const penalty = buildPenalty(metricId, currentValue)
    if (penalty) penalties.push(penalty)
  }

  return penalties
}

function scoreToStatus(score: number): SubsystemHealth['status'] {
  if (score >= 80) return 'normal'
  if (score >= 60) return 'degraded'
  if (score >= 40) return 'warning'
  return 'critical'
}

export function generateHealthIndex(locomotiveId = 'KTZ-2001'): HealthIndex {
  const now = Date.now()
  const allPenalties: SubsystemPenalty[] = []

  const subsystems: SubsystemHealth[] = subsystemBase.map((base) => {
    const prev = subsystemScores[base.subsystemId] ?? 90
    const drift = (Math.random() - 0.48) * 0.5
    const score = Math.max(0, Math.min(100, prev + drift))
    subsystemScores[base.subsystemId] = score
    const penalties = getSubsystemPenalties(base.subsystemId)
    allPenalties.push(...penalties)

    return {
      ...base,
      healthScore: Math.round(score * 10) / 10,
      status: scoreToStatus(score),
      activeAlertCount: score < 70 ? Math.floor(Math.random() * 3) + 1 : 0,
      lastUpdated: now,
      penalties,
    }
  })

  const overall =
    subsystems.reduce((sum, s) => sum + s.healthScore, 0) / subsystems.length

  return {
    locomotiveId,
    overall: Math.round(overall * 10) / 10,
    timestamp: now,
    subsystems,
    topFactors: [...allPenalties]
      .sort((left, right) => right.penaltyPoints - left.penaltyPoints)
      .slice(0, 5),
  }
}
