import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { useMessageStore } from './useMessageStore'

export function useInitialMessages() {
  const setMessages = useMessageStore((s) => s.setMessages)

  return useQuery({
    queryKey: ['messages-initial'],
    queryFn: async () => {
      const res = await endpoints.messages.list()
      setMessages(res.data)
      return res.data
    },
    staleTime: 30000,
    refetchInterval: false,
  })
}
