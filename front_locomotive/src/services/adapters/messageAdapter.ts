import type { DispatcherMessage } from '@/types/messages'

export function adaptMessage(raw: unknown): DispatcherMessage {
  const d = raw as Record<string, unknown>
  return {
    messageId: (d['message_id'] ?? d['messageId']) as string,
    priority: (d['priority'] ?? 'normal') as DispatcherMessage['priority'],
    type: (d['type'] ?? 'informational') as DispatcherMessage['type'],
    subject: (d['subject'] ?? '') as string,
    body: (d['body'] ?? '') as string,
    senderName: (d['sender_name'] ?? d['senderName'] ?? 'Dispatcher') as string,
    sentAt: (d['sent_at'] ?? d['sentAt'] ?? Date.now()) as number,
    readAt: d['read_at'] as number | undefined,
    acknowledgedAt: d['acknowledged_at'] as number | undefined,
    expiresAt: d['expires_at'] as number | undefined,
  }
}
