import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { DispatcherMessage, MessageSummary } from '@/types/messages'

function computeSummary(messages: DispatcherMessage[]): MessageSummary {
  const unread = messages.filter((m) => !m.readAt)
  return {
    totalUnread: unread.length,
    urgentUnread: unread.filter((m) => m.priority === 'urgent').length,
  }
}

interface MessageState {
  messages: DispatcherMessage[]
  summary: MessageSummary

  setMessages: (msgs: DispatcherMessage[]) => void
  addMessage: (msg: DispatcherMessage) => void
  markRead: (messageId: string) => void
  markAcknowledged: (messageId: string) => void
}

export const useMessageStore = create<MessageState>()(
  devtools(
    (set) => ({
      messages: [],
      summary: { totalUnread: 0, urgentUnread: 0 },

      setMessages: (msgs) => {
        const sorted = [...msgs].sort((a, b) => b.sentAt - a.sentAt)
        set({ messages: sorted, summary: computeSummary(sorted) })
      },

      addMessage: (msg) =>
        set((s) => {
          const updated = [msg, ...s.messages]
          return { messages: updated, summary: computeSummary(updated) }
        }),

      markRead: (messageId) =>
        set((s) => {
          const updated = s.messages.map((m) =>
            m.messageId === messageId ? { ...m, readAt: Date.now() } : m
          )
          return { messages: updated, summary: computeSummary(updated) }
        }),

      markAcknowledged: (messageId) =>
        set((s) => {
          const updated = s.messages.map((m) =>
            m.messageId === messageId
              ? { ...m, acknowledgedAt: Date.now(), readAt: m.readAt ?? Date.now() }
              : m
          )
          return { messages: updated, summary: computeSummary(updated) }
        }),
    }),
    { name: 'message-store' }
  )
)
