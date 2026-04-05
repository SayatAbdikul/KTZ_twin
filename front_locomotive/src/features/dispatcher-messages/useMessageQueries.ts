import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { adaptMessage } from '@/services/adapters/messageAdapter'
import { useMessageStore } from './useMessageStore'

export function useInitialMessages() {
  const setMessages = useMessageStore((s) => s.setMessages)

  return useQuery({
    queryKey: ['messages-initial'],
    queryFn: async () => {
      const res = await endpoints.messages.list()
      const messages = res.data.map((message) => adaptMessage(message))
      const grouped = new Map<string, typeof res.data>()
      for (const message of messages) {
        const locomotiveId = message.locomotiveId || 'KTZ-2001'
        const existing = grouped.get(locomotiveId) ?? []
        grouped.set(locomotiveId, [...existing, { ...message, locomotiveId }])
      }
      for (const [locomotiveId, messages] of grouped) {
        setMessages(locomotiveId, messages)
      }
      return messages
    },
    staleTime: 30000,
    refetchInterval: false,
  })
}
