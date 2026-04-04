import { MessageSquare } from 'lucide-react'
import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { MessageCard } from '@/components/messaging/MessageCard'
import { endpoints } from '@/services/api/endpoints'
import { PageContainer } from '@/components/layout/PageContainer'
import type { DispatcherMessage } from '@/types/messages'

const EMPTY_MESSAGES: DispatcherMessage[] = []

export function MessagesPage() {
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const messagesByLocomotive = useMessageStore((s) => s.messagesByLocomotive)
  const messages = selectedLocomotiveId
    ? messagesByLocomotive[selectedLocomotiveId] ?? EMPTY_MESSAGES
    : EMPTY_MESSAGES
  const { markAcknowledged } = useMessageStore()

  async function handleAcknowledge(messageId: string, locomotiveId: string) {
    try {
      await endpoints.messages.acknowledge(messageId)
      markAcknowledged(locomotiveId, messageId)
    } catch {
      // silent
    }
  }

  return (
    <PageContainer>
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare size={18} className="text-blue-400" />
        <h1 className="text-base font-semibold text-slate-200">Dispatcher Messages</h1>
      </div>

      <div className="flex flex-col gap-2">
        {messages.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-700 text-slate-500">
            No messages
          </div>
        ) : (
          messages.map((msg) => (
            <MessageCard
              key={msg.messageId}
              message={msg}
              onAcknowledge={(messageId) => handleAcknowledge(messageId, msg.locomotiveId)}
            />
          ))
        )}
      </div>
    </PageContainer>
  )
}
