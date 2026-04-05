import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { adaptAlert } from '@/services/adapters/alertAdapter'
import { useAlertStore } from './useAlertStore'

export function useInitialAlerts() {
  const setAlerts = useAlertStore((s) => s.setAlerts)
  const setAlertCount = useFleetStore((s) => s.setAlertCount)

  return useQuery({
    queryKey: ['alerts-initial'],
    queryFn: async () => {
      const res = await endpoints.alerts.list({ status: 'active' })
      const alerts = res.data.map((alert) => adaptAlert(alert))
      const grouped = new Map<string, typeof res.data>()
      for (const alert of alerts) {
        const locomotiveId = alert.locomotiveId || 'KTZ-2001'
        const existing = grouped.get(locomotiveId) ?? []
        grouped.set(locomotiveId, [...existing, { ...alert, locomotiveId }])
      }
      for (const [locomotiveId, alerts] of grouped) {
        setAlerts(locomotiveId, alerts)
        setAlertCount(
          locomotiveId,
          alerts.filter((alert) => alert.status !== 'resolved').length
        )
      }
      return alerts
    },
    staleTime: 10000,
    refetchInterval: false,
  })
}
