import type { DispatcherMessage } from '@/types/messages'

let messageCounter = 10

export const INITIAL_MESSAGES: DispatcherMessage[] = [
  {
    messageId: 'msg-001',
    locomotiveId: 'KTZ-2001',
    priority: 'high',
    type: 'recommendation',
    subject: 'Speed Restriction — Section KZ-7 to KZ-12',
    body: 'Due to ongoing maintenance works, maximum speed on section KZ-7 to KZ-12 is restricted to 60 km/h until 18:00 local time. Please acknowledge receipt.',
    senderName: 'Dispatcher Aliyev',
    sentAt: Date.now() - 25 * 60 * 1000,
  },
  {
    messageId: 'msg-002',
    locomotiveId: 'KTZ-2001',
    priority: 'normal',
    type: 'informational',
    subject: 'Scheduled Maintenance Reminder',
    body: 'Locomotive KTZ-2001 is due for Level B maintenance inspection at Almaty depot on arrival. Estimated duration: 4 hours.',
    senderName: 'Maintenance Control',
    sentAt: Date.now() - 2 * 60 * 60 * 1000,
    readAt: Date.now() - 90 * 60 * 1000,
  },
  {
    messageId: 'msg-003',
    locomotiveId: 'KTZ-2002',
    priority: 'urgent',
    type: 'directive',
    subject: 'URGENT: Track Obstruction at KM 342',
    body: 'Track obstruction reported at KM 342. Do not proceed past KM 340 until clearance is given. Emergency services are en route.',
    senderName: 'Emergency Control',
    sentAt: Date.now() - 5 * 60 * 1000,
  },
]

export function generateDispatcherMessage(locomotiveId = 'KTZ-2001'): DispatcherMessage {
  messageCounter++
  const templates: Pick<DispatcherMessage, 'priority' | 'type' | 'subject' | 'body'>[] = [
    {
      priority: 'normal',
      type: 'informational',
      subject: 'Updated Schedule',
      body: 'Your updated schedule has been posted. Please review at next station stop.',
    },
    {
      priority: 'high',
      type: 'assessment',
      subject: 'Performance Assessment',
      body: 'Fuel efficiency for current segment is 8% below target. Consider adjusting throttle management.',
    },
    {
      priority: 'normal',
      type: 'recommendation',
      subject: 'Weather Advisory',
      body: 'Heavy rain forecast for sections KZ-15 to KZ-20. Reduced visibility expected. Reduce speed accordingly.',
    },
  ]
  const template = templates[messageCounter % templates.length]
  return {
    messageId: `msg-${messageCounter}`,
    locomotiveId,
    senderName: 'Dispatcher',
    sentAt: Date.now(),
    ...template,
  }
}
