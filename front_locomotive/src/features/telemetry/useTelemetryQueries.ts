import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { useTelemetryStore } from './useTelemetryStore'

export function useMetricDefinitions() {
  const setDefinitions = useTelemetryStore((s) => s.setDefinitions)

  return useQuery({
    queryKey: ['metric-definitions'],
    queryFn: async () => {
      const res = await endpoints.telemetry.metrics()
      setDefinitions(res.data)
      return res.data
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
