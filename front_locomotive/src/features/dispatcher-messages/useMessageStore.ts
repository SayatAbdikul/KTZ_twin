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
  messagesByLocomotive: Record<string, DispatcherMessage[]>
  summaryByLocomotive: Record<string, MessageSummary>

  setMessages: (locomotiveId: string, msgs: DispatcherMessage[]) => void
  addMessage: (msg: DispatcherMessage) => void
  markRead: (locomotiveId: string, messageId: string) => void
  markAcknowledged: (locomotiveId: string, messageId: string) => void
}

export const useMessageStore = create<MessageState>()(
  devtools(
    (set) => ({
      messagesByLocomotive: {},
      summaryByLocomotive: {},

      setMessages: (locomotiveId, msgs) => {
        const sorted = [...msgs].sort((a, b) => b.sentAt - a.sentAt)
        set((state) => ({
          messagesByLocomotive: {
            ...state.messagesByLocomotive,
            [locomotiveId]: sorted,
          },
          summaryByLocomotive: {
            ...state.summaryByLocomotive,
            [locomotiveId]: computeSummary(sorted),
          },
        }))
      },

      addMessage: (msg) =>
        set((s) => {
          const previous = s.messagesByLocomotive[msg.locomotiveId] ?? []
          const updated = [msg, ...previous]
          return {
            messagesByLocomotive: {
              ...s.messagesByLocomotive,
              [msg.locomotiveId]: updated,
            },
            summaryByLocomotive: {
              ...s.summaryByLocomotive,
              [msg.locomotiveId]: computeSummary(updated),
            },
          }
        }),

      markRead: (locomotiveId, messageId) =>
        set((s) => {
          const previous = s.messagesByLocomotive[locomotiveId] ?? []
          const updated = previous.map((m) =>
            m.messageId === messageId ? { ...m, readAt: Date.now() } : m
          )
          return {
            messagesByLocomotive: {
              ...s.messagesByLocomotive,
              [locomotiveId]: updated,
            },
            summaryByLocomotive: {
              ...s.summaryByLocomotive,
              [locomotiveId]: computeSummary(updated),
            },
          }
        }),

      markAcknowledged: (locomotiveId, messageId) =>
        set((s) => {
          const previous = s.messagesByLocomotive[locomotiveId] ?? []
          const updated = previous.map((m) =>
            m.messageId === messageId
              ? { ...m, acknowledgedAt: Date.now(), readAt: m.readAt ?? Date.now() }
              : m
          )
          return {
            messagesByLocomotive: {
              ...s.messagesByLocomotive,
              [locomotiveId]: updated,
            },
            summaryByLocomotive: {
              ...s.summaryByLocomotive,
              [locomotiveId]: computeSummary(updated),
            },
          }
        }),
    }),
    { name: 'message-store' }
  )
)
