import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { TimeRangeSelector } from '@/components/charts/TimeRangeSelector'
import { ExportMenu } from '@/components/common/ExportMenu'
import { APP_CONFIG } from '@/config/app.config'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { PlaybackControls } from '@/components/replay/PlaybackControls'
import { TimelineScrubber } from '@/components/replay/TimelineScrubber'
import { ReplayMetricSelector } from '@/components/replay/ReplayMetricSelector'
import { ReplaySnapshotSummary } from '@/components/replay/ReplaySnapshotSummary'
import { ReplayChart } from '@/components/replay/ReplayChart'
import { REPLAY_SKIP_INTERVAL_MS, useReplayStore } from '@/features/replay/useReplayStore'
import { useMetricCatalog } from '@/features/telemetry/metricCatalog'
import type { Alert } from '@/types/alerts'
import type { HealthIndex, SubsystemPenalty } from '@/types/health'
import type { MetricDefinition } from '@/types/telemetry'
import type { ReplayResolution } from '@/types/replay'
import { downloadCsv } from '@/utils/exportCsv'
import { escapeHtml, printReport } from '@/utils/exportPdf'
import { formatDate } from '@/utils/formatters'

const REPLAY_WINDOW_PRESETS = ['1m', '5m', '15m'] as const

const RESOLUTION_STEP_MS: Record<Exclude<ReplayResolution, 'raw'>, number> = {
  '1s': 1_000,
  '10s': 10_000,
  '1m': 60_000,
  '5m': 300_000,
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

function getExpectedStepMs(resolution: ReplayResolution, timestamps: number[]): number {
  if (resolution !== 'raw') return RESOLUTION_STEP_MS[resolution]
  if (timestamps.length < 2) return 1_000
  const deltas: number[] = []
  for (let index = 1; index < timestamps.length; index += 1) {
    const delta = timestamps[index] - timestamps[index - 1]
    if (delta > 0) deltas.push(delta)
  }

  const inferred = median(deltas)
  if (!Number.isFinite(inferred) || inferred <= 0) return 1_000
  return Math.max(250, Math.round(inferred))
}

function clampToBounds(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value))
}

function renderPrintTable(headers: string[], rows: string[][], emptyText: string) {
  if (rows.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`
  }

  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const rowHtml = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table>`
}

function formatMetricValueForReport(
  metricId: string,
  value: number,
  definitions: MetricDefinition[]
) {
  const definition = definitions.find((item) => item.metricId === metricId)
  const precision = definition?.precision ?? 1
  const unit = definition?.unit ?? ''
  return `${value.toFixed(precision)}${unit ? ` ${unit}` : ''}`
}

function renderSubsystemRows(healthIndex: HealthIndex | null) {
  if (!healthIndex) {
    return []
  }

  return healthIndex.subsystems.map((subsystem) => [
    subsystem.label,
    subsystem.status,
    subsystem.healthScore.toFixed(0),
    String(subsystem.activeAlertCount),
  ])
}

function renderTopFactorRows(
  penalties: SubsystemPenalty[],
  definitions: MetricDefinition[]
) {
  return penalties.map((penalty) => {
    const direction = penalty.thresholdType.endsWith('High') ? 'Above' : 'Below'
    const thresholdLabel = penalty.thresholdType.startsWith('critical') ? 'Critical' : 'Warning'
    return [
      penalty.metricLabel,
      formatMetricValueForReport(penalty.metricId, penalty.currentValue, definitions),
      `${direction} ${thresholdLabel} (${formatMetricValueForReport(
        penalty.metricId,
        penalty.thresholdValue,
        definitions
      )})`,
      `-${penalty.penaltyPoints.toFixed(0)}`,
    ]
  })
}

function renderAlertRows(alerts: Alert[]) {
  return alerts.map((alert) => [
    alert.severity,
    alert.status,
    alert.title,
    alert.source,
    formatDate(alert.triggeredAt),
    alert.description,
  ])
}

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
  const [isPrinting, setIsPrinting] = useState(false)
  const [isExportingTelemetry, setIsExportingTelemetry] = useState(false)
  const [isExportingAlerts, setIsExportingAlerts] = useState(false)
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const metricDefinitions = useMetricCatalog()
  const timeRange = useReplayStore((state) => state.timeRange)
  const currentTimestamp = useReplayStore((state) => state.currentTimestamp)
  const isPlaying = useReplayStore((state) => state.isPlaying)
  const playbackSpeed = useReplayStore((state) => state.playbackSpeed)
  const visibleWindow = useReplayStore((state) => state.visibleWindow)
  const selectedMetricIds = useReplayStore((state) => state.selectedMetricIds)
  const seriesByMetric = useReplayStore((state) => state.seriesByMetric)
  const loadedWindow = useReplayStore((state) => state.loadedWindow)
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
  const canExportServiceCsv =
    selectedLocomotiveId === null || selectedLocomotiveId === APP_CONFIG.LOCOMOTIVE_ID
  const scrubberWindow = useMemo(() => {
    if (!loadedWindow) return null
    return {
      locomotiveId: timeRange?.locomotiveId ?? selectedLocomotiveId ?? '',
      earliest: loadedWindow.from,
      latest: loadedWindow.to,
    }
  }, [loadedWindow, selectedLocomotiveId, timeRange?.locomotiveId])

  const noDataRanges = useMemo(() => {
    if (!loadedWindow) return []

    const from = loadedWindow.from
    const to = loadedWindow.to
    if (to <= from) return []

    const timestampSet = new Set<number>()
    for (const metricId of selectedMetricIds) {
      const points = seriesByMetric[metricId] ?? []
      for (const point of points) {
        if (point.timestamp >= from && point.timestamp <= to) {
          timestampSet.add(point.timestamp)
        }
      }
    }

    const timestamps = Array.from(timestampSet).sort((left, right) => left - right)
    if (timestamps.length === 0) {
      return [{ from, to }]
    }

    const expectedStepMs = getExpectedStepMs(loadedWindow.resolution, timestamps)
    const gapThresholdMs = expectedStepMs * 1.8
    const halfStep = expectedStepMs / 2
    const ranges: Array<{ from: number; to: number }> = []

    const pushGap = (gapFrom: number, gapTo: number) => {
      const normalizedFrom = clampToBounds(Math.round(gapFrom), from, to)
      const normalizedTo = clampToBounds(Math.round(gapTo), from, to)
      if (normalizedTo - normalizedFrom >= Math.max(500, expectedStepMs * 0.75)) {
        ranges.push({ from: normalizedFrom, to: normalizedTo })
      }
    }

    if (timestamps[0] - from > gapThresholdMs) {
      pushGap(from, timestamps[0] - halfStep)
    }

    for (let index = 1; index < timestamps.length; index += 1) {
      const prev = timestamps[index - 1]
      const next = timestamps[index]
      if (next - prev > gapThresholdMs) {
        pushGap(prev + halfStep, next - halfStep)
      }
    }

    if (to - timestamps[timestamps.length - 1] > gapThresholdMs) {
      pushGap(timestamps[timestamps.length - 1] + halfStep, to)
    }

    return ranges
  }, [loadedWindow, selectedMetricIds, seriesByMetric])

  function handleMetricToggle(metricId: string) {
    if (!selectedLocomotiveId) return
    const nextMetricIds = selectedMetricIds.includes(metricId)
      ? selectedMetricIds.filter((id) => id !== metricId)
      : [...selectedMetricIds, metricId]

    void setSelectedMetricIds(selectedLocomotiveId, nextMetricIds)
  }

  async function handleTelemetryExport() {
    setIsExportingTelemetry(true)
    try {
      await downloadCsv({
        path: '/api/export/telemetry/csv',
        fallbackFilename: 'telemetry.csv',
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to export telemetry CSV.')
    } finally {
      setIsExportingTelemetry(false)
    }
  }

  async function handleAlertsExport() {
    setIsExportingAlerts(true)
    try {
      await downloadCsv({
        path: '/api/export/alerts/csv',
        fallbackFilename: 'alerts.csv',
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to export alerts CSV.')
    } finally {
      setIsExportingAlerts(false)
    }
  }

  async function handlePrintReplayReport() {
    setIsPrinting(true)
    try {
      const healthIndex = snapshot?.health ?? null
      const alerts = snapshot?.alerts ?? []
      const activeAlerts = alerts.filter((alert) => alert.status !== 'resolved')
      const alertSummary = activeAlerts.reduce(
        (summary, alert) => {
          if (alert.severity === 'critical') summary.criticalCount += 1
          else if (alert.severity === 'warning') summary.warningCount += 1
          else summary.infoCount += 1
          summary.totalActive += 1
          return summary
        },
        { criticalCount: 0, warningCount: 0, infoCount: 0, totalActive: 0 }
      )

      await printReport({
        title: 'KTZ Digital Twin Dashboard Report',
        subtitle: 'Replay snapshot report at the current cursor (dashboard-style format).',
        meta: [
          { label: 'Locomotive', value: selectedLocomotiveId ?? APP_CONFIG.LOCOMOTIVE_ID },
          { label: 'Replay Cursor', value: currentTimestamp ? formatDate(currentTimestamp) : 'Unavailable' },
          {
            label: 'Overall Health',
            value: healthIndex ? `${healthIndex.overall.toFixed(0)} / 100` : 'Unavailable',
          },
          { label: 'Generated At', value: formatDate(Date.now()) },
        ],
        sections: [
          {
            title: 'Subsystem Breakdown',
            html: renderPrintTable(
              ['Subsystem', 'Status', 'Health Score', 'Active Alerts'],
              renderSubsystemRows(healthIndex),
              'Health data is not currently available at this replay timestamp.'
            ),
          },
          {
            title: 'Top Contributing Factors',
            html: renderPrintTable(
              ['Metric', 'Current Value', 'Threshold Reference', 'Penalty'],
              renderTopFactorRows(healthIndex?.topFactors ?? [], metricDefinitions),
              'No active threshold penalties at this replay timestamp.'
            ),
          },
          {
            title: 'Active Alerts',
            html: `
              <div class="summary-grid">
                <div class="summary-pill severity-critical">${alertSummary.criticalCount} critical</div>
                <div class="summary-pill severity-warning">${alertSummary.warningCount} warning</div>
                <div class="summary-pill severity-info">${alertSummary.infoCount} info</div>
                <div class="summary-pill">${alertSummary.totalActive} total active</div>
              </div>
              ${renderPrintTable(
                ['Severity', 'Status', 'Title', 'Source', 'Triggered At', 'Description'],
                renderAlertRows(activeAlerts),
                'No active alerts at this replay timestamp.'
              )}
            `,
          },
        ],
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to open replay report.')
    } finally {
      setIsPrinting(false)
    }
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

        <div className="flex flex-wrap items-center gap-2">
          <TimeRangeSelector
            value={visibleWindow}
            options={[...REPLAY_WINDOW_PRESETS]}
            onChange={(preset) => {
              if (!selectedLocomotiveId) return
              void setVisibleWindow(selectedLocomotiveId, preset)
            }}
          />
          <ExportMenu
            actions={[
              {
                id: 'replay-telemetry-csv',
                label: isExportingTelemetry ? 'Exporting Telemetry...' : 'Export Telemetry CSV',
                description: canExportServiceCsv
                  ? 'Download telemetry history as CSV.'
                  : `CSV export is only available for ${APP_CONFIG.LOCOMOTIVE_ID}.`,
                disabled: isExportingTelemetry || !canExportServiceCsv,
                onSelect: handleTelemetryExport,
              },
              {
                id: 'replay-alerts-csv',
                label: isExportingAlerts ? 'Exporting Alerts...' : 'Export Alerts CSV',
                description: canExportServiceCsv
                  ? 'Download alerts history as CSV.'
                  : `CSV export is only available for ${APP_CONFIG.LOCOMOTIVE_ID}.`,
                disabled: isExportingAlerts || !canExportServiceCsv,
                onSelect: handleAlertsExport,
              },
              {
                id: 'replay-print',
                label: isPrinting ? 'Preparing Report...' : 'Print Report',
                description: 'Open a print-friendly report from current replay snapshot.',
                disabled: isPrinting,
                onSelect: handlePrintReplayReport,
              },
            ]}
          />
        </div>
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
            timeRange={scrubberWindow ?? timeRange}
            currentTimestamp={currentTimestamp}
            noDataRanges={noDataRanges}
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
