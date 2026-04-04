import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface DispatchChatMessage {
  id: string
  locomotiveId: string
  sender: 'dispatcher' | 'regular_train'
  body: string
  sentAt: number
  delivered?: boolean
}

function sortMessages(messages: DispatchChatMessage[]) {
  return [...messages].sort((a, b) => a.sentAt - b.sentAt)
}

function dedupeMessages(messages: DispatchChatMessage[]) {
  const byId = new Map<string, DispatchChatMessage>()
  for (const message of messages) {
    byId.set(message.id, message)
  }
  return [...byId.values()]
}

interface DispatchConsoleState {
  chatsByLocomotive: Record<string, DispatchChatMessage[]>
  setChatHistory: (locomotiveId: string, messages: DispatchChatMessage[]) => void
  addChatMessage: (message: DispatchChatMessage) => void
}

export const useDispatchConsoleStore = create<DispatchConsoleState>()(
  devtools(
    (set) => ({
      chatsByLocomotive: {},

      setChatHistory: (locomotiveId, messages) =>
        set((state) => ({
          chatsByLocomotive: {
            ...state.chatsByLocomotive,
            [locomotiveId]: sortMessages(dedupeMessages(messages)),
          },
        })),

      addChatMessage: (message) =>
        set((state) => {
          const previous = state.chatsByLocomotive[message.locomotiveId] ?? []
          const withoutExisting = previous.filter((item) => item.id !== message.id)
          return {
            chatsByLocomotive: {
              ...state.chatsByLocomotive,
              [message.locomotiveId]: sortMessages([...withoutExisting, message]),
            },
          }
        }),
    }),
    { name: 'dispatch-console-store' }
  )
)

export function adaptDispatchChatMessage(raw: unknown, eventLocomotiveId?: string): DispatchChatMessage {
  const payload = raw as Record<string, unknown>
  const sender = String(payload['sender'] ?? 'regular_train')
  return {
    id: String(payload['message_id'] ?? payload['messageId'] ?? crypto.randomUUID()),
    locomotiveId: String(payload['locomotive_id'] ?? payload['locomotiveId'] ?? eventLocomotiveId ?? ''),
    sender: sender === 'dispatcher' ? 'dispatcher' : 'regular_train',
    body: String(payload['body'] ?? payload['subject'] ?? 'Incoming locomotive message'),
    sentAt: Number(payload['sent_at'] ?? payload['sentAt'] ?? Date.now()),
    delivered: typeof payload['delivered'] === 'boolean' ? (payload['delivered'] as boolean) : undefined,
  }
}
