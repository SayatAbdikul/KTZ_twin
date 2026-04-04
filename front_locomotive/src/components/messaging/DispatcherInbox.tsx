import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { endpoints } from '@/services/api/endpoints'
import { MessageCard } from './MessageCard'
import { SectionHeader } from '@/components/common/SectionHeader'
import { ROUTES } from '@/config/routes'

interface DispatcherInboxProps {
  maxVisible?: number
}

export function DispatcherInbox({ maxVisible = 3 }: DispatcherInboxProps) {
  // Select raw array (stable ref), slice in render body to avoid new-array-per-render loop
  const allMessages = useMessageStore((s) => s.messages)
  const messages = allMessages.slice(0, maxVisible)
  const summary = useMessageStore((s) => s.summary)
  const markAcknowledged = useMessageStore((s) => s.markAcknowledged)

  async function handleAcknowledge(messageId: string) {
    try {
      await endpoints.messages.acknowledge(messageId)
      markAcknowledged(messageId)
    } catch {
      // Silent failure — optimistic update is fine for MVP
    }
  }

  return (
    <div className="flex flex-col">
      <SectionHeader
        title="Dispatcher"
        viewAllTo={ROUTES.MESSAGES}
        count={summary.totalUnread > 0 ? summary.totalUnread : undefined}
      />

      {messages.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
          No messages
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((msg) => (
            <MessageCard key={msg.messageId} message={msg} onAcknowledge={handleAcknowledge} />
          ))}
        </div>
      )}
    </div>
  )
}
