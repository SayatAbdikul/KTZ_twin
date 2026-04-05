import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { adaptHealthIndex } from '@/services/adapters/healthAdapter'
import { useHealthStore } from './useHealthStore'

export function useInitialHealth() {
  const applyUpdate = useHealthStore((s) => s.applyUpdate)
  const applyHealthIndex = useFleetStore((s) => s.applyHealthIndex)

  return useQuery({
    queryKey: ['health-initial'],
    queryFn: async () => {
      const res = await endpoints.health.get()
      const healthIndex = adaptHealthIndex(res.data)
      applyUpdate(healthIndex)
      applyHealthIndex(healthIndex)
      return healthIndex
    },
    staleTime: 5000,
    refetchInterval: false,
  })
}
