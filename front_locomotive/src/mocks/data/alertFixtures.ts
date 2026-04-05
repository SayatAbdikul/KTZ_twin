import type { Alert } from '@/types/alerts'

let alertCounter = 100

const ALERT_TEMPLATES: Omit<Alert, 'alertId' | 'triggeredAt' | 'status' | 'locomotiveId'>[] = [
  {
    severity: 'critical',
    source: 'engine',
    title: 'Высокая температура охлаждающей жидкости двигателя',
    description: 'Температура охлаждающей жидкости превысила критический порог 105°C.',
    recommendedAction: 'Снизьте тягу и контролируйте температуру. Подготовьтесь к экстренной остановке, если температура продолжит расти.',
    relatedMetricIds: ['thermal.coolant_temp'],
  },
  {
    severity: 'warning',
    source: 'brakes',
    title: 'Низкое давление в тормозной магистрали',
    description: 'Давление в тормозной магистрали опустилось ниже предупредительного порога.',
    recommendedAction: 'Проверьте тормозную магистраль на утечки. Сообщите в обслуживание на следующей остановке.',
    relatedMetricIds: ['pressure.brake_pipe'],
  },
  {
    severity: 'warning',
    source: 'fuel',
    title: 'Уровень топлива ниже 20%',
    description: 'Остаток топлива составляет 18,3%. Запланируйте дозаправку.',
    recommendedAction: 'Свяжитесь с диспетчером, чтобы согласовать дозаправку. Следуйте до ближайшей запланированной точки заправки.',
    relatedMetricIds: ['fuel.level'],
  },
  {
    severity: 'info',
    source: 'electrical',
    title: 'Колебание тягового напряжения',
    description: 'В тяговой системе зафиксировано незначительное колебание напряжения. Значение остаётся в допустимых пределах.',
    relatedMetricIds: ['electrical.traction_voltage'],
  },
  {
    severity: 'critical',
    source: 'pneumatic',
    title: 'Критическое давление в главном резервуаре',
    description: 'Давление в главном тормозном резервуаре критически низкое: 4,8 бар.',
    recommendedAction: 'Требуются немедленные действия. Примените экстренное торможение и остановите поезд.',
    relatedMetricIds: ['pressure.brake_main'],
  },
]

export const INITIAL_ALERTS: Alert[] = [
  {
    alertId: 'alert-001',
    locomotiveId: 'KTZ-2001',
    severity: 'warning',
    status: 'active',
    source: 'fuel',
    title: 'Уровень топлива ниже 20%',
    description: 'Остаток топлива составляет 18,3%. Запланируйте дозаправку.',
    recommendedAction: 'Свяжитесь с диспетчером, чтобы согласовать дозаправку.',
    triggeredAt: Date.now() - 12 * 60 * 1000,
    relatedMetricIds: ['fuel.level'],
  },
  {
    alertId: 'alert-002',
    locomotiveId: 'KTZ-2001',
    severity: 'info',
    status: 'acknowledged',
    source: 'electrical',
    title: 'Колебание тягового напряжения',
    description: 'В тяговой системе зафиксировано незначительное колебание напряжения.',
    triggeredAt: Date.now() - 35 * 60 * 1000,
    acknowledgedAt: Date.now() - 30 * 60 * 1000,
    acknowledgedBy: 'Машинист',
    relatedMetricIds: ['electrical.traction_voltage'],
  },
]

export function generateRandomAlert(locomotiveId = 'KTZ-2001'): Alert {
  alertCounter++
  const template = ALERT_TEMPLATES[Math.floor(Math.random() * ALERT_TEMPLATES.length)]
  return {
    ...template,
    alertId: `alert-${alertCounter}`,
    locomotiveId,
    status: 'active',
    triggeredAt: Date.now(),
  }
}
