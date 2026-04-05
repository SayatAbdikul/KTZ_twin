import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { useAlertStore } from './useAlertStore'

export function useInitialAlerts() {
  const setAlerts = useAlertStore((s) => s.setAlerts)

  return useQuery({
    queryKey: ['alerts-initial'],
    queryFn: async () => {
      const res = await endpoints.alerts.list({ status: 'active' })
      const grouped = new Map<string, typeof res.data>()
      for (const alert of res.data) {
        const locomotiveId = alert.locomotiveId || 'KTZ-2001'
        const existing = grouped.get(locomotiveId) ?? []
        grouped.set(locomotiveId, [...existing, { ...alert, locomotiveId }])
      }
      for (const [locomotiveId, alerts] of grouped) {
        setAlerts(locomotiveId, alerts)
      }
      return res.data
    },
    staleTime: 10000,
    refetchInterval: false,
  })
}
