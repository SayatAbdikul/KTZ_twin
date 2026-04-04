import type { HealthIndex, SubsystemHealth } from '@/types/health'

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

function scoreToStatus(score: number): SubsystemHealth['status'] {
  if (score >= 80) return 'normal'
  if (score >= 60) return 'degraded'
  if (score >= 40) return 'warning'
  return 'critical'
}

export function generateHealthIndex(): HealthIndex {
  const now = Date.now()

  const subsystems: SubsystemHealth[] = subsystemBase.map((base) => {
    const prev = subsystemScores[base.subsystemId] ?? 90
    const drift = (Math.random() - 0.48) * 0.5
    const score = Math.max(0, Math.min(100, prev + drift))
    subsystemScores[base.subsystemId] = score

    return {
      ...base,
      healthScore: Math.round(score * 10) / 10,
      status: scoreToStatus(score),
      activeAlertCount: score < 70 ? Math.floor(Math.random() * 3) + 1 : 0,
      lastUpdated: now,
    }
  })

  const overall =
    subsystems.reduce((sum, s) => sum + s.healthScore, 0) / subsystems.length

  return {
    overall: Math.round(overall * 10) / 10,
    timestamp: now,
    subsystems,
  }
}
