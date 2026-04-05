import { useQuery } from '@tanstack/react-query'
import { replayApiClient } from '@/services/api/replayApiClient'
import { useFleetStore } from './useFleetStore'

interface FleetSnapshotItem {
  locomotiveId?: string
  wsUrl?: string
  connected?: boolean
  lastSeenAt?: number | null
  reconnectAttempt?: number
  hasTelemetry?: boolean
}

export function useInitialFleetSnapshot(accessToken: string | null) {
  const applyDispatcherSnapshot = useFleetStore((s) => s.applyDispatcherSnapshot)

  return useQuery({
    queryKey: ['fleet-snapshot'],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const res = await replayApiClient.get<FleetSnapshotItem[]>('/api/locomotives')
      const items = (res.data ?? []).map((item) => ({
        locomotiveId: String(item.locomotiveId ?? ''),
        wsUrl: item.wsUrl,
        connected: item.connected,
        lastSeenAt: item.lastSeenAt ?? null,
        reconnectAttempt: item.reconnectAttempt ?? 0,
        hasTelemetry: item.hasTelemetry,
      }))
      applyDispatcherSnapshot(items)
      return items
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}
