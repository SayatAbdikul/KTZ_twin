import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { APP_CONFIG } from '@/config/app.config'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { useTelemetryStore } from './useTelemetryStore'

export function useMetricDefinitions() {
  const setDefinitions = useTelemetryStore((s) => s.setDefinitions)
  const user = useAuthStore((s) => s.user)
  const skipRemoteMetricBootstrap =
    user?.role === 'regular_train' &&
    Boolean(user.locomotiveId) &&
    user.locomotiveId !== APP_CONFIG.LOCOMOTIVE_ID

  return useQuery({
    queryKey: ['metric-definitions'],
    enabled: !skipRemoteMetricBootstrap,
    queryFn: async () => {
      const res = await endpoints.telemetry.metrics()
      setDefinitions(res.data)
      return res.data
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
