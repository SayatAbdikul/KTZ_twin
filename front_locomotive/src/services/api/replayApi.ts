import { replayApiClient } from '@/services/api/replayApiClient'
import {
  adaptReplayRange,
  adaptReplaySnapshot,
  adaptReplayTimeRange,
} from '@/services/adapters/replayAdapter'
import type { ReplayResolution, ReplayRange, ReplaySnapshot, ReplayTimeRange } from '@/types/replay'

export async function fetchReplayTimeRange(locomotiveId: string): Promise<ReplayTimeRange> {
  const response = await replayApiClient.get<unknown>(`/api/locomotives/${locomotiveId}/replay/time-range`)
  return adaptReplayTimeRange(response.data)
}

export async function fetchReplayRange(params: {
  locomotiveId: string
  from: number
  to: number
  metricIds?: string[]
  resolution: ReplayResolution
}): Promise<ReplayRange> {
  const response = await replayApiClient.get<unknown>(
    `/api/locomotives/${params.locomotiveId}/replay/range`,
    {
      params: {
        from: params.from,
        to: params.to,
        resolution: params.resolution,
        ...(params.metricIds && params.metricIds.length > 0
          ? { metricIds: params.metricIds.join(',') }
          : {}),
      },
    }
  )

  return adaptReplayRange(response.data)
}

export async function fetchReplaySnapshot(params: {
  locomotiveId: string
  timestamp: number
}): Promise<ReplaySnapshot> {
  const response = await replayApiClient.get<unknown>(
    `/api/locomotives/${params.locomotiveId}/replay/snapshot`,
    { params: { timestamp: params.timestamp } }
  )

  return adaptReplaySnapshot(response.data)
}
