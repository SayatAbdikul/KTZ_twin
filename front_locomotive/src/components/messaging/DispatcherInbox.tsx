import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { endpoints } from '@/services/api/endpoints'
import { MessageCard } from './MessageCard'
import { SectionHeader } from '@/components/common/SectionHeader'
import { ROUTES } from '@/config/routes'
import type { DispatcherMessage, MessageSummary } from '@/types/messages'

interface DispatcherInboxProps {
  maxVisible?: number
}

const EMPTY_MESSAGES: DispatcherMessage[] = []
const EMPTY_MESSAGE_SUMMARY: MessageSummary = {
  totalUnread: 0,
  urgentUnread: 0,
}

export function DispatcherInbox({ maxVisible = 3 }: DispatcherInboxProps) {
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const messagesByLocomotive = useMessageStore((s) => s.messagesByLocomotive)
  const summaryByLocomotive = useMessageStore((s) => s.summaryByLocomotive)
  const allMessages = selectedLocomotiveId
    ? messagesByLocomotive[selectedLocomotiveId] ?? EMPTY_MESSAGES
    : EMPTY_MESSAGES
  const messages = allMessages.slice(0, maxVisible)
  const summary = selectedLocomotiveId
    ? summaryByLocomotive[selectedLocomotiveId] ?? EMPTY_MESSAGE_SUMMARY
    : EMPTY_MESSAGE_SUMMARY
  const markAcknowledged = useMessageStore((s) => s.markAcknowledged)

  async function handleAcknowledge(messageId: string, locomotiveId: string) {
    try {
      await endpoints.messages.acknowledge(messageId)
      markAcknowledged(locomotiveId, messageId)
    } catch {
      // Silent failure — optimistic update is fine for MVP
    }
  }

  return (
    <div className="flex flex-col">
      <SectionHeader
        title="Диспетчер"
        viewAllTo={ROUTES.MESSAGES}
        count={summary.totalUnread > 0 ? summary.totalUnread : undefined}
      />

      {messages.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
          Сообщений нет
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((msg) => (
            <MessageCard
              key={msg.messageId}
              message={msg}
              onAcknowledge={(messageId) => handleAcknowledge(messageId, msg.locomotiveId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
