import { useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import { METRIC_GROUPS } from '@/config/metrics.config'
import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { useMetricCatalog } from '@/features/telemetry/metricCatalog'
import { useSettingsStore } from '@/features/settings/useSettingsStore'
import { DynamicMetricRenderer } from '@/components/metrics/DynamicMetricRenderer'
import { LineChart } from '@/components/charts/LineChart'
import { TimeRangeSelector, type TimeRangePreset } from '@/components/charts/TimeRangeSelector'
import { ExportMenu } from '@/components/common/ExportMenu'
import { SectionHeader } from '@/components/common/SectionHeader'
import { ValueDisplay } from '@/components/common/ValueDisplay'
import { PageContainer } from '@/components/layout/PageContainer'
import { downloadCsv } from '@/utils/exportCsv'
import { getMetricSeverity } from '@/utils/thresholds'
import type { MetricDefinition, MetricGroup } from '@/types/telemetry'

const ALL_GROUPS: MetricGroup[] = ['motion', 'fuel', 'thermal', 'pressure', 'electrical']
const TREND_METRIC_IDS = [
  'motion.speed',
  'fuel.level',
  'thermal.coolant_temp',
  'electrical.traction_current',
] as const
const PRESET_WINDOW_MS: Record<Exclude<TimeRangePreset, 'all'>, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
}
const EMPTY_BUFFER: Array<{ timestamp: number; value: number }> = []

function LiveTrendCard({
  definition,
  windowMs,
}: {
  definition: MetricDefinition
  windowMs: number | 'all'
}) {
  const smoothingEnabled = useSettingsStore((s) => s.smoothingEnabled)
  const currentReadings = useTelemetryStore((s) => s.currentReadings)
  const smoothedReadings = useTelemetryStore((s) => s.smoothedReadings)
  const trendBuffers = useTelemetryStore((s) => s.trendBuffers)
  const smoothedTrendBuffers = useTelemetryStore((s) => s.smoothedTrendBuffers)

  const reading = smoothingEnabled
    ? smoothedReadings.get(definition.metricId) ?? currentReadings.get(definition.metricId)
    : currentReadings.get(definition.metricId)
  const data = smoothingEnabled
    ? smoothedTrendBuffers.get(definition.metricId) ?? trendBuffers.get(definition.metricId) ?? EMPTY_BUFFER
    : trendBuffers.get(definition.metricId) ?? EMPTY_BUFFER

  const severity = reading ? getMetricSeverity(reading.value, definition) : 'normal'
  const color =
    severity === 'critical' ? '#f87171' : severity === 'warning' ? '#fbbf24' : '#60a5fa'

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">{definition.label}</h2>
          <p className="text-xs text-slate-500">{definition.unit}</p>
        </div>
        <ValueDisplay
          value={reading?.value}
          unit={definition.unit}
          precision={definition.precision}
          timestamp={reading?.timestamp}
          className="justify-end"
          valueClassName="text-xl"
        />
      </div>

      {data.length > 1 ? (
        <LineChart
          series={[
            {
              name: definition.label,
              data,
              color,
              unit: definition.unit,
            },
          ]}
          height={220}
          windowMs={windowMs}
        />
      ) : (
        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
          Waiting for live telemetry
        </div>
      )}
    </article>
  )
}

export function TelemetryPage() {
  const [preset, setPreset] = useState<TimeRangePreset>('5m')
  const [isExporting, setIsExporting] = useState(false)
  const metricDefinitions = useMetricCatalog()
  const windowMs = useMemo<number | 'all'>(
    () => (preset === 'all' ? 'all' : PRESET_WINDOW_MS[preset]),
    [preset]
  )
  const trendDefinitions = useMemo(
    () =>
      TREND_METRIC_IDS.map((metricId) =>
        metricDefinitions.find((definition) => definition.metricId === metricId)
      ).filter((definition): definition is MetricDefinition => definition !== undefined),
    [metricDefinitions]
  )

  async function handleTelemetryExport() {
    setIsExporting(true)
    try {
      await downloadCsv({
        path: '/api/export/telemetry/csv',
        fallbackFilename: 'telemetry.csv',
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to export telemetry CSV.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <PageContainer>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-blue-400" />
          <h1 className="text-base font-semibold text-slate-200">Telemetry</h1>
        </div>
        <ExportMenu
          actions={[
            {
              id: 'telemetry-csv',
              label: isExporting ? 'Exporting CSV...' : 'Export CSV',
              description: 'Download the raw live telemetry history buffer as CSV.',
              disabled: isExporting,
              onSelect: handleTelemetryExport,
            },
          ]}
        />
      </div>

      <section className="mb-6">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Live Trends
          </h2>
          <TimeRangeSelector value={preset} onChange={setPreset} />
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {trendDefinitions.map((definition) => (
            <LiveTrendCard key={definition.metricId} definition={definition} windowMs={windowMs} />
          ))}
        </div>
      </section>

      {ALL_GROUPS.map((group) => {
        const defs = metricDefinitions.filter((d) => d.group === group).sort(
          (a, b) => a.displayOrder - b.displayOrder
        )
        return (
          <div key={group} className="mb-6">
            <SectionHeader title={METRIC_GROUPS[group] ?? group} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {defs.map((def) => (
                <DynamicMetricRenderer key={def.metricId} definition={def} />
              ))}
            </div>
          </div>
        )
      })}
    </PageContainer>
  )
}
