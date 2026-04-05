import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { useHealthStore } from './useHealthStore'

export function useInitialHealth() {
  const applyUpdate = useHealthStore((s) => s.applyUpdate)

  return useQuery({
    queryKey: ['health-initial'],
    queryFn: async () => {
      const res = await endpoints.health.get()
      applyUpdate(res.data)
      return res.data
    },
    staleTime: 5000,
    refetchInterval: false,
  })
}
