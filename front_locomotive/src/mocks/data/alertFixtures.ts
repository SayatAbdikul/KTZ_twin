import type { Alert } from '@/types/alerts'

let alertCounter = 100

const ALERT_TEMPLATES: Omit<Alert, 'alertId' | 'triggeredAt' | 'status'>[] = [
  {
    severity: 'critical',
    source: 'engine',
    title: 'Engine Coolant Temperature High',
    description: 'Coolant temperature exceeded critical threshold of 105°C.',
    recommendedAction: 'Reduce throttle and monitor temperature. Prepare for emergency stop if temperature continues rising.',
    relatedMetricIds: ['thermal.coolant_temp'],
  },
  {
    severity: 'warning',
    source: 'brakes',
    title: 'Brake Pipe Pressure Low',
    description: 'Brake pipe pressure has dropped below warning threshold.',
    recommendedAction: 'Inspect brake pipe for leaks. Notify maintenance at next stop.',
    relatedMetricIds: ['pressure.brake_pipe'],
  },
  {
    severity: 'warning',
    source: 'fuel',
    title: 'Fuel Level Below 20%',
    description: 'Remaining fuel is at 18.3%. Plan for refueling stop.',
    recommendedAction: 'Contact dispatch to schedule refueling. Continue to next designated fuel point.',
    relatedMetricIds: ['fuel.level'],
  },
  {
    severity: 'info',
    source: 'electrical',
    title: 'Traction Voltage Fluctuation',
    description: 'Minor voltage fluctuation detected in traction system. Within acceptable range.',
    relatedMetricIds: ['electrical.traction_voltage'],
  },
  {
    severity: 'critical',
    source: 'pneumatic',
    title: 'Main Reservoir Pressure Critical',
    description: 'Main brake reservoir pressure is critically low at 4.8 bar.',
    recommendedAction: 'Immediate action required. Apply emergency brake and stop train.',
    relatedMetricIds: ['pressure.brake_main'],
  },
]

export const INITIAL_ALERTS: Alert[] = [
  {
    alertId: 'alert-001',
    severity: 'warning',
    status: 'active',
    source: 'fuel',
    title: 'Fuel Level Below 20%',
    description: 'Remaining fuel is at 18.3%. Plan for refueling stop.',
    recommendedAction: 'Contact dispatch to schedule refueling.',
    triggeredAt: Date.now() - 12 * 60 * 1000,
    relatedMetricIds: ['fuel.level'],
  },
  {
    alertId: 'alert-002',
    severity: 'info',
    status: 'acknowledged',
    source: 'electrical',
    title: 'Traction Voltage Fluctuation',
    description: 'Minor voltage fluctuation detected in traction system.',
    triggeredAt: Date.now() - 35 * 60 * 1000,
    acknowledgedAt: Date.now() - 30 * 60 * 1000,
    acknowledgedBy: 'Operator',
    relatedMetricIds: ['electrical.traction_voltage'],
  },
]

export function generateRandomAlert(): Alert {
  alertCounter++
  const template = ALERT_TEMPLATES[Math.floor(Math.random() * ALERT_TEMPLATES.length)]
  return {
    ...template,
    alertId: `alert-${alertCounter}`,
    status: 'active',
    triggeredAt: Date.now(),
  }
}
