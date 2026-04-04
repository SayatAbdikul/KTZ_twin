import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { useAlertStore } from './useAlertStore'

export function useInitialAlerts() {
  const setAlerts = useAlertStore((s) => s.setAlerts)

  return useQuery({
    queryKey: ['alerts-initial'],
    queryFn: async () => {
      const res = await endpoints.alerts.list({ status: 'active' })
      setAlerts(res.data)
      return res.data
    },
    staleTime: 10000,
    refetchInterval: false,
  })
}
