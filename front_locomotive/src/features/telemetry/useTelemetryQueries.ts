import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/services/api/endpoints'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { adaptTelemetryFrame } from '@/services/adapters/telemetryAdapter'
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

export function useInitialTelemetry() {
  const applyFrame = useTelemetryStore((s) => s.applyFrame)
  const applyTelemetryFrame = useFleetStore((s) => s.applyTelemetryFrame)

  return useQuery({
    queryKey: ['telemetry-initial'],
    queryFn: async () => {
      const res = await endpoints.telemetry.current()
      const frame = adaptTelemetryFrame(res.data)
      applyFrame(frame)
      applyTelemetryFrame(frame)
      return frame
    },
    staleTime: 5000,
    refetchInterval: false,
  })
}
