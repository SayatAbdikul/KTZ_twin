import { useEffect, useMemo } from 'react'
import { History } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { TimeRangeSelector } from '@/components/charts/TimeRangeSelector'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { PlaybackControls } from '@/components/replay/PlaybackControls'
import { TimelineScrubber } from '@/components/replay/TimelineScrubber'
import { ReplayMetricSelector } from '@/components/replay/ReplayMetricSelector'
import { ReplaySnapshotSummary } from '@/components/replay/ReplaySnapshotSummary'
import { ReplayChart } from '@/components/replay/ReplayChart'
import { REPLAY_SKIP_INTERVAL_MS, useReplayStore } from '@/features/replay/useReplayStore'
import { useMetricCatalog } from '@/features/telemetry/metricCatalog'
import type { MetricDefinition } from '@/types/telemetry'

function formatRangeLabel(earliest: number | null, latest: number | null): string {
  if (earliest === null || latest === null) return 'No replay history available yet'

  const formatter = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${formatter.format(earliest)} - ${formatter.format(latest)}`
}

export function ReplayPage() {
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const metricDefinitions = useMetricCatalog()
  const timeRange = useReplayStore((state) => state.timeRange)
  const currentTimestamp = useReplayStore((state) => state.currentTimestamp)
  const isPlaying = useReplayStore((state) => state.isPlaying)
  const playbackSpeed = useReplayStore((state) => state.playbackSpeed)
  const visibleWindow = useReplayStore((state) => state.visibleWindow)
  const selectedMetricIds = useReplayStore((state) => state.selectedMetricIds)
  const seriesByMetric = useReplayStore((state) => state.seriesByMetric)
  const snapshot = useReplayStore((state) => state.snapshot)
  const isLoading = useReplayStore((state) => state.isLoading)
  const isLoadingWindow = useReplayStore((state) => state.isLoadingWindow)
  const error = useReplayStore((state) => state.error)
  const initialize = useReplayStore((state) => state.initialize)
  const seekTo = useReplayStore((state) => state.seekTo)
  const skipBy = useReplayStore((state) => state.skipBy)
  const togglePlayback = useReplayStore((state) => state.togglePlayback)
  const setPlaybackSpeed = useReplayStore((state) => state.setPlaybackSpeed)
  const setVisibleWindow = useReplayStore((state) => state.setVisibleWindow)
  const setSelectedMetricIds = useReplayStore((state) => state.setSelectedMetricIds)
  const tickPlayback = useReplayStore((state) => state.tickPlayback)

  useEffect(() => {
    if (!selectedLocomotiveId) return
    void initialize(selectedLocomotiveId)
  }, [initialize, selectedLocomotiveId])

  useEffect(() => {
    if (!isPlaying || !selectedLocomotiveId) return

    const timer = window.setInterval(() => {
      void tickPlayback(selectedLocomotiveId)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isPlaying, selectedLocomotiveId, tickPlayback])

  const selectedDefinitions = useMemo(
    () =>
      selectedMetricIds
        .map((metricId) => metricDefinitions.find((metric) => metric.metricId === metricId))
        .filter((metric): metric is MetricDefinition => metric !== undefined),
    [metricDefinitions, selectedMetricIds]
  )

  const hasReplayData = timeRange?.earliest !== null && timeRange?.latest !== null

  function handleMetricToggle(metricId: string) {
    if (!selectedLocomotiveId) return
    const nextMetricIds = selectedMetricIds.includes(metricId)
      ? selectedMetricIds.filter((id) => id !== metricId)
      : [...selectedMetricIds, metricId]

    void setSelectedMetricIds(selectedLocomotiveId, nextMetricIds)
  }

  return (
    <PageContainer className="space-y-4">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-2">
          <History size={18} className="text-slate-400" />
          <div>
            <h1 className="text-base font-semibold text-slate-200">History & Replay</h1>
            <p className="text-sm text-slate-500">
              {selectedLocomotiveId
                ? `${selectedLocomotiveId} · ${formatRangeLabel(timeRange?.earliest ?? null, timeRange?.latest ?? null)}`
                : 'Select a locomotive to inspect replay history'}
            </p>
          </div>
        </div>

        <TimeRangeSelector
          value={visibleWindow}
          onChange={(preset) => {
            if (!selectedLocomotiveId) return
            void setVisibleWindow(selectedLocomotiveId, preset)
          }}
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <PlaybackControls
            currentTimestamp={currentTimestamp}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            disabled={!selectedLocomotiveId || !hasReplayData || isLoading}
            onTogglePlayback={togglePlayback}
            onPlaybackSpeedChange={setPlaybackSpeed}
            onSkipBackward={() => {
              if (!selectedLocomotiveId) return
              void skipBy(selectedLocomotiveId, -REPLAY_SKIP_INTERVAL_MS)
            }}
            onSkipForward={() => {
              if (!selectedLocomotiveId) return
              void skipBy(selectedLocomotiveId, REPLAY_SKIP_INTERVAL_MS)
            }}
          />

          <TimelineScrubber
            timeRange={timeRange}
            currentTimestamp={currentTimestamp}
            disabled={!selectedLocomotiveId || !hasReplayData || isLoading}
            onSeek={(timestamp) => {
              if (!selectedLocomotiveId) return
              void seekTo(selectedLocomotiveId, timestamp)
            }}
          />

          {hasReplayData ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Replay charts</p>
                  <h2 className="text-sm font-semibold text-slate-100">
                    {isLoadingWindow ? 'Refreshing replay window…' : 'Historical trends'}
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  {selectedDefinitions.length} metric{selectedDefinitions.length === 1 ? '' : 's'} selected
                </span>
              </div>

              {selectedDefinitions.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {selectedDefinitions.map((definition) => (
                    <ReplayChart
                      key={definition.metricId}
                      definition={definition}
                      points={seriesByMetric[definition.metricId] ?? []}
                      currentTimestamp={currentTimestamp}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 text-sm text-slate-500">
                  Select at least one metric to render replay charts.
                </div>
              )}
            </section>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 text-sm text-slate-500">
              {isLoading ? 'Loading replay history…' : 'Replay history will appear once dispatcher telemetry is stored.'}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ReplayMetricSelector
            definitions={metricDefinitions}
            selectedMetricIds={selectedMetricIds}
            onToggleMetric={handleMetricToggle}
          />
          <ReplaySnapshotSummary snapshot={snapshot} />
        </div>
      </div>
    </PageContainer>
  )
}
