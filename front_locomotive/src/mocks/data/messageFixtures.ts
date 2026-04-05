import type { DispatcherMessage } from '@/types/messages'

let messageCounter = 10

export const INITIAL_MESSAGES: DispatcherMessage[] = [
  {
    messageId: 'msg-001',
    locomotiveId: 'KTZ-2001',
    priority: 'high',
    type: 'recommendation',
    subject: 'Ограничение скорости: участок KZ-7 - KZ-12',
    body: 'Из-за ремонтных работ максимальная скорость на участке KZ-7 - KZ-12 ограничена до 60 км/ч до 18:00 местного времени. Подтвердите получение.',
    senderName: 'Диспетчер Алиев',
    sentAt: Date.now() - 25 * 60 * 1000,
  },
  {
    messageId: 'msg-002',
    locomotiveId: 'KTZ-2001',
    priority: 'normal',
    type: 'informational',
    subject: 'Напоминание о плановом обслуживании',
    body: 'Локомотив КТЖ-2001 должен пройти обслуживание уровня B в депо Алматы по прибытии. Ориентировочная длительность: 4 часа.',
    senderName: 'Служба обслуживания',
    sentAt: Date.now() - 2 * 60 * 60 * 1000,
    readAt: Date.now() - 90 * 60 * 1000,
  },
  {
    messageId: 'msg-003',
    locomotiveId: 'KTZ-2002',
    priority: 'urgent',
    type: 'directive',
    subject: 'СРОЧНО: препятствие на пути на 342 км',
    body: 'На 342 км обнаружено препятствие на пути. Не следуйте дальше 340 км до получения разрешения. Экстренные службы уже направлены к месту.',
    senderName: 'Аварийный контроль',
    sentAt: Date.now() - 5 * 60 * 1000,
  },
]

export function generateDispatcherMessage(locomotiveId = 'KTZ-2001'): DispatcherMessage {
  messageCounter++
  const templates: Pick<DispatcherMessage, 'priority' | 'type' | 'subject' | 'body'>[] = [
    {
      priority: 'normal',
      type: 'informational',
      subject: 'Обновлённое расписание',
      body: 'Ваше обновлённое расписание опубликовано. Ознакомьтесь с ним на следующей остановке.',
    },
    {
      priority: 'high',
      type: 'assessment',
      subject: 'Оценка эффективности',
      body: 'Топливная эффективность на текущем участке на 8% ниже целевой. Рассмотрите корректировку управления тягой.',
    },
    {
      priority: 'normal',
      type: 'recommendation',
      subject: 'Погодное предупреждение',
      body: 'На участках KZ-15 - KZ-20 ожидается сильный дождь. Возможна пониженная видимость. Снизьте скорость соответственно.',
    },
  ]
  const template = templates[messageCounter % templates.length]
  return {
    messageId: `msg-${messageCounter}`,
    locomotiveId,
    senderName: 'Диспетчер',
    sentAt: Date.now(),
    ...template,
  }
}
