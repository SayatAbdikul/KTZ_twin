import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { METRIC_DEFINITIONS } from '@/config/metrics.config'
import { fetchReplayRange, fetchReplaySnapshot, fetchReplayTimeRange } from '@/services/api/replayApi'
import type {
  PlaybackSpeed,
  ReplayLoadedWindow,
  ReplayResolution,
  ReplaySnapshot,
  ReplayTimeRange,
  ReplayVisibleWindow,
} from '@/types/replay'
import type { TimeRangePreset } from '@/components/charts/TimeRangeSelector'

const WINDOW_MS_BY_PRESET: Record<Exclude<TimeRangePreset, 'all'>, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
}

const DEFAULT_SELECTED_METRICS = METRIC_DEFINITIONS.filter((metric) => metric.sparklineEnabled).map(
  (metric) => metric.metricId
)
const SNAPSHOT_DEBOUNCE_MS = 150
const SKIP_INTERVAL_MS = 10_000

let snapshotRefreshTimer: ReturnType<typeof setTimeout> | null = null

function clampTimestamp(timestamp: number, timeRange: ReplayTimeRange | null): number {
  if (!timeRange || timeRange.earliest === null || timeRange.latest === null) {
    return timestamp
  }

  return Math.min(timeRange.latest, Math.max(timeRange.earliest, timestamp))
}

function getSpanMs(timeRange: ReplayTimeRange | null): number {
  if (!timeRange || timeRange.earliest === null || timeRange.latest === null) return 0
  return Math.max(0, timeRange.latest - timeRange.earliest)
}

function getVisibleWindowMs(
  preset: ReplayVisibleWindow,
  timeRange: ReplayTimeRange | null
): number | 'all' {
  if (preset === 'all') return 'all'

  const availableSpan = getSpanMs(timeRange)
  if (availableSpan <= 0) return WINDOW_MS_BY_PRESET[preset]
  return Math.min(WINDOW_MS_BY_PRESET[preset], availableSpan)
}

function getResolutionForWindow(
  preset: ReplayVisibleWindow,
  timeRange: ReplayTimeRange | null
): ReplayResolution {
  const windowMs = getVisibleWindowMs(preset, timeRange)
  const span = windowMs === 'all' ? getSpanMs(timeRange) : windowMs

  if (span <= 15 * 60_000) return 'raw'
  if (span <= 2 * 60 * 60_000) return '1s'
  if (span <= 12 * 60 * 60_000) return '10s'
  if (span <= 48 * 60 * 60_000) return '1m'
  return '5m'
}

function getWindowBounds(
  timestamp: number,
  preset: ReplayVisibleWindow,
  timeRange: ReplayTimeRange | null
): { from: number; to: number } {
  if (!timeRange || timeRange.earliest === null || timeRange.latest === null) {
    return { from: timestamp, to: timestamp }
  }

  if (preset === 'all') {
    return { from: timeRange.earliest, to: timeRange.latest }
  }

  const duration = getVisibleWindowMs(preset, timeRange)
  const span = duration === 'all' ? getSpanMs(timeRange) : duration
  const halfWindow = span / 2

  let from = Math.max(timeRange.earliest, Math.round(timestamp - halfWindow))
  let to = Math.min(timeRange.latest, Math.round(timestamp + halfWindow))

  const covered = to - from
  if (covered < span) {
    const missing = span - covered
    if (from === timeRange.earliest) {
      to = Math.min(timeRange.latest, to + missing)
    } else if (to === timeRange.latest) {
      from = Math.max(timeRange.earliest, from - missing)
    }
  }

  return { from, to }
}

async function loadReplayWindow(
  locomotiveId: string,
  timeRange: ReplayTimeRange | null,
  currentTimestamp: number,
  visibleWindow: ReplayVisibleWindow,
  selectedMetricIds: string[],
  set: (partial: Partial<ReplayState>) => void
): Promise<void> {
  const bounds = getWindowBounds(currentTimestamp, visibleWindow, timeRange)
  const resolution = getResolutionForWindow(visibleWindow, timeRange)

  if (selectedMetricIds.length === 0) {
    set({
      seriesByMetric: {},
      loadedWindow: { ...bounds, resolution },
      loadedMetricIds: [],
      isLoadingWindow: false,
      error: null,
    })
    return
  }

  set({ isLoadingWindow: true, error: null })

  try {
    const range = await fetchReplayRange({
      locomotiveId,
      from: bounds.from,
      to: bounds.to,
      metricIds: selectedMetricIds,
      resolution,
    })

    set({
      seriesByMetric: range.byMetric,
      loadedWindow: {
        from: range.from,
        to: range.to,
        resolution: range.resolution,
      },
      loadedMetricIds: [...selectedMetricIds],
      isLoadingWindow: false,
      error: null,
    })
  } catch (error) {
    set({
      isLoadingWindow: false,
      error: error instanceof Error ? error.message : 'Failed to load replay range',
    })
  }
}

async function loadReplaySnapshot(
  locomotiveId: string,
  timestamp: number,
  set: (partial: Partial<ReplayState>) => void
): Promise<void> {
  set({ isLoadingSnapshot: true, error: null })

  try {
    const snapshot = await fetchReplaySnapshot({
      locomotiveId,
      timestamp,
    })
    set({
      snapshot,
      isLoadingSnapshot: false,
      error: null,
    })
  } catch (error) {
    set({
      isLoadingSnapshot: false,
      error: error instanceof Error ? error.message : 'Failed to load replay snapshot',
    })
  }
}

interface ReplayState {
  timeRange: ReplayTimeRange | null
  currentTimestamp: number | null
  isPlaying: boolean
  playbackSpeed: PlaybackSpeed
  visibleWindow: ReplayVisibleWindow
  selectedMetricIds: string[]
  seriesByMetric: Record<string, Array<{ timestamp: number; value: number }>>
  loadedWindow: ReplayLoadedWindow | null
  loadedMetricIds: string[]
  snapshot: ReplaySnapshot | null
  isLoading: boolean
  isLoadingWindow: boolean
  isLoadingSnapshot: boolean
  error: string | null
  initializedForLocomotiveId: string | null

  initialize: (locomotiveId: string) => Promise<void>
  seekTo: (locomotiveId: string, timestamp: number) => Promise<void>
  skipBy: (locomotiveId: string, deltaMs: number) => Promise<void>
  togglePlayback: () => void
  setPlaybackSpeed: (speed: PlaybackSpeed) => void
  setVisibleWindow: (locomotiveId: string, preset: ReplayVisibleWindow) => Promise<void>
  setSelectedMetricIds: (locomotiveId: string, metricIds: string[]) => Promise<void>
  ensureWindowForTimestamp: (locomotiveId: string, timestamp: number) => Promise<void>
  refreshSnapshotNow: (locomotiveId: string, timestamp: number) => Promise<void>
  scheduleSnapshotRefresh: (locomotiveId: string, timestamp: number) => void
  tickPlayback: (locomotiveId: string) => Promise<void>
}

export const useReplayStore = create<ReplayState>()(
  devtools(
    (set, get) => ({
      timeRange: null,
      currentTimestamp: null,
      isPlaying: false,
      playbackSpeed: 1,
      visibleWindow: '15m',
      selectedMetricIds: DEFAULT_SELECTED_METRICS,
      seriesByMetric: {},
      loadedWindow: null,
      loadedMetricIds: [],
      snapshot: null,
      isLoading: false,
      isLoadingWindow: false,
      isLoadingSnapshot: false,
      error: null,
      initializedForLocomotiveId: null,

      initialize: async (locomotiveId) => {
        const existing = get()
        if (existing.initializedForLocomotiveId === locomotiveId && existing.timeRange) {
          return
        }

        set({
          isLoading: true,
          error: null,
          isPlaying: false,
          visibleWindow: '15m',
          selectedMetricIds: DEFAULT_SELECTED_METRICS,
        })

        try {
          const timeRange = await fetchReplayTimeRange(locomotiveId)
          const latest = timeRange.latest

          if (latest === null || timeRange.earliest === null) {
            set({
              timeRange,
              currentTimestamp: null,
              seriesByMetric: {},
              loadedWindow: null,
              loadedMetricIds: [],
              snapshot: null,
              initializedForLocomotiveId: locomotiveId,
              isLoading: false,
            })
            return
          }

          set({
            timeRange,
            currentTimestamp: latest,
            selectedMetricIds: DEFAULT_SELECTED_METRICS,
            initializedForLocomotiveId: locomotiveId,
          })

          await Promise.all([
            loadReplayWindow(
              locomotiveId,
              timeRange,
              latest,
              '15m',
              DEFAULT_SELECTED_METRICS,
              set
            ),
            loadReplaySnapshot(locomotiveId, latest, set),
          ])

          set({ isLoading: false })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to initialize replay',
          })
        }
      },

      seekTo: async (locomotiveId, timestamp) => {
        const state = get()
        if (!state.timeRange) return

        const nextTimestamp = clampTimestamp(timestamp, state.timeRange)
        set({ currentTimestamp: nextTimestamp })
        await get().ensureWindowForTimestamp(locomotiveId, nextTimestamp)
        get().scheduleSnapshotRefresh(locomotiveId, nextTimestamp)
      },

      skipBy: async (locomotiveId, deltaMs) => {
        const currentTimestamp = get().currentTimestamp
        if (currentTimestamp === null) return
        await get().seekTo(locomotiveId, currentTimestamp + deltaMs)
      },

      togglePlayback: () => {
        const state = get()
        const latest = state.timeRange?.latest
        const currentTimestamp = state.currentTimestamp

        if (
          !state.isPlaying &&
          latest !== null &&
          latest !== undefined &&
          currentTimestamp !== null &&
          currentTimestamp >= latest
        ) {
          set({ isPlaying: false })
          return
        }

        set({ isPlaying: !state.isPlaying })
      },

      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

      setVisibleWindow: async (locomotiveId, preset) => {
        set({ visibleWindow: preset })
        const state = get()
        if (state.currentTimestamp === null || !state.timeRange) return
        await loadReplayWindow(
          locomotiveId,
          state.timeRange,
          state.currentTimestamp,
          preset,
          state.selectedMetricIds,
          set
        )
      },

      setSelectedMetricIds: async (locomotiveId, metricIds) => {
        set({ selectedMetricIds: metricIds })
        const state = get()
        if (state.currentTimestamp === null || !state.timeRange) return
        await loadReplayWindow(
          locomotiveId,
          state.timeRange,
          state.currentTimestamp,
          state.visibleWindow,
          metricIds,
          set
        )
      },

      ensureWindowForTimestamp: async (locomotiveId, timestamp) => {
        const state = get()
        if (!state.timeRange) return

        const nextBounds = getWindowBounds(timestamp, state.visibleWindow, state.timeRange)
        const nextResolution = getResolutionForWindow(state.visibleWindow, state.timeRange)
        const metricSelectionChanged =
          state.loadedMetricIds.length !== state.selectedMetricIds.length ||
          state.loadedMetricIds.some((metricId, index) => metricId !== state.selectedMetricIds[index])
        const needsReload =
          state.loadedWindow === null ||
          state.loadedWindow.resolution !== nextResolution ||
          state.loadedWindow.from > timestamp ||
          state.loadedWindow.to < timestamp ||
          state.loadedWindow.from !== nextBounds.from ||
          state.loadedWindow.to !== nextBounds.to ||
          metricSelectionChanged

        if (!needsReload) return

        await loadReplayWindow(
          locomotiveId,
          state.timeRange,
          timestamp,
          state.visibleWindow,
          state.selectedMetricIds,
          set
        )
      },

      refreshSnapshotNow: async (locomotiveId, timestamp) => {
        await loadReplaySnapshot(locomotiveId, timestamp, set)
      },

      scheduleSnapshotRefresh: (locomotiveId, timestamp) => {
        if (snapshotRefreshTimer) clearTimeout(snapshotRefreshTimer)
        snapshotRefreshTimer = setTimeout(() => {
          void get().refreshSnapshotNow(locomotiveId, timestamp)
        }, SNAPSHOT_DEBOUNCE_MS)
      },

      tickPlayback: async (locomotiveId) => {
        const state = get()
        if (!state.isPlaying || state.currentTimestamp === null || !state.timeRange) return

        const nextTimestamp = clampTimestamp(
          state.currentTimestamp + state.playbackSpeed * 1_000,
          state.timeRange
        )

        set({
          currentTimestamp: nextTimestamp,
          isPlaying: state.timeRange.latest !== null ? nextTimestamp < state.timeRange.latest : false,
        })

        await get().ensureWindowForTimestamp(locomotiveId, nextTimestamp)
        get().scheduleSnapshotRefresh(locomotiveId, nextTimestamp)
      },
    }),
    { name: 'replay-store' }
  )
)

export const REPLAY_SKIP_INTERVAL_MS = SKIP_INTERVAL_MS
