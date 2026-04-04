import { MessageSquare } from 'lucide-react'
import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { MessageCard } from '@/components/messaging/MessageCard'
import { endpoints } from '@/services/api/endpoints'
import { PageContainer } from '@/components/layout/PageContainer'

export function MessagesPage() {
  const messages = useMessageStore((s) => s.messages)
  const { markAcknowledged } = useMessageStore()

  async function handleAcknowledge(messageId: string) {
    try {
      await endpoints.messages.acknowledge(messageId)
      markAcknowledged(messageId)
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
            <MessageCard key={msg.messageId} message={msg} onAcknowledge={handleAcknowledge} />
          ))
        )}
      </div>
    </PageContainer>
  )
}
