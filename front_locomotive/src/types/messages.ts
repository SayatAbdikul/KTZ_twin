export type MessagePriority = 'urgent' | 'high' | 'normal' | 'low'
export type MessageType = 'assessment' | 'recommendation' | 'directive' | 'informational'

export interface MessageAttachment {
  name: string
  type: string
  url: string
}

export interface DispatcherMessage {
  messageId: string
  locomotiveId: string
  priority: MessagePriority
  type: MessageType
  subject: string
  body: string
  senderName: string
  sentAt: number
  readAt?: number
  acknowledgedAt?: number
  expiresAt?: number
  attachments?: MessageAttachment[]
}

export interface MessageSummary {
  totalUnread: number
  urgentUnread: number
}
