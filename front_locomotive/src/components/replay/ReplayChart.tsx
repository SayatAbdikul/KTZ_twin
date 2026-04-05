import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { MetricDefinition } from '@/types/telemetry'
import type { ReplayPoint } from '@/types/replay'
import { getMetricSeverity } from '@/utils/thresholds'
import { useSettingsStore } from '@/features/settings/useSettingsStore'
import { getChartTheme } from '@/utils/chartTheme'

interface ReplayChartProps {
  definition: MetricDefinition
  points: ReplayPoint[]
  currentTimestamp: number | null
}

function getValueAtTimestamp(points: ReplayPoint[], currentTimestamp: number | null): number | undefined {
  if (points.length === 0) return undefined
  if (currentTimestamp === null) return points[points.length - 1]?.value

  // Find the latest sample at or before the replay cursor so the header tracks playback.
  let left = 0
  let right = points.length - 1
  let matchIndex = -1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const midTimestamp = points[mid]?.timestamp ?? 0

    if (midTimestamp <= currentTimestamp) {
      matchIndex = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  if (matchIndex >= 0) return points[matchIndex]?.value
  return points[0]?.value
}

function getThresholdLines(
  definition: MetricDefinition,
  currentTimestamp: number | null,
  chartTheme: ReturnType<typeof getChartTheme>
) {
  const lines: Array<Record<string, unknown>> = []

  if (definition.warningLow !== undefined) {
    lines.push({
      name: 'Нижнее предупреждение',
      yAxis: definition.warningLow,
      lineStyle: { color: chartTheme.warning, type: 'dashed', width: 1 },
      label: { formatter: 'Пред. мин.', color: chartTheme.warning },
    })
  }
  if (definition.warningHigh !== undefined) {
    lines.push({
      name: 'Верхнее предупреждение',
      yAxis: definition.warningHigh,
      lineStyle: { color: chartTheme.warning, type: 'dashed', width: 1 },
      label: { formatter: 'Пред. макс.', color: chartTheme.warning },
    })
  }
  if (definition.criticalLow !== undefined) {
    lines.push({
      name: 'Нижний критический порог',
      yAxis: definition.criticalLow,
      lineStyle: { color: chartTheme.critical, type: 'dashed', width: 1 },
      label: { formatter: 'Крит. мин.', color: chartTheme.critical },
    })
  }
  if (definition.criticalHigh !== undefined) {
    lines.push({
      name: 'Верхний критический порог',
      yAxis: definition.criticalHigh,
      lineStyle: { color: chartTheme.critical, type: 'dashed', width: 1 },
      label: { formatter: 'Крит. макс.', color: chartTheme.critical },
    })
  }

  if (currentTimestamp !== null) {
    lines.push({
      name: 'Текущий момент',
      xAxis: currentTimestamp,
      lineStyle: { color: chartTheme.currentMarker, type: 'solid', width: 1 },
      label: { formatter: 'Сейчас', color: chartTheme.currentMarker },
    })
  }

  return lines
}

export function ReplayChart({ definition, points, currentTimestamp }: ReplayChartProps) {
  const theme = useSettingsStore((state) => state.theme)
  const chartTheme = getChartTheme(theme)
  const currentValue = getValueAtTimestamp(points, currentTimestamp)
  const severity = currentValue === undefined ? 'normal' : getMetricSeverity(currentValue, definition)
  const stroke =
    severity === 'critical'
      ? chartTheme.critical
      : severity === 'warning'
        ? chartTheme.warning
        : chartTheme.info
  const thresholdLines = getThresholdLines(definition, currentTimestamp, chartTheme)

  if (points.length === 0) {
    return (
      <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-100">{definition.label}</h2>
          <p className="text-xs text-slate-500">{definition.unit}</p>
        </div>
        <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
          В этом окне нет точек воспроизведения
        </div>
      </article>
    )
  }

  const option: EChartsOption = {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 18, right: 18, bottom: 36, left: 52 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartTheme.tooltipBackground,
      borderColor: chartTheme.tooltipBorder,
      textStyle: { color: chartTheme.text, fontSize: 11 },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: chartTheme.axis } },
      axisLabel: { color: chartTheme.axisLabel, fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: chartTheme.axisLabel, fontSize: 10 },
      splitLine: { lineStyle: { color: chartTheme.splitLine } },
      min: definition.min,
      max: definition.max,
    },
    series: [
      {
        name: definition.label,
        type: 'line',
        symbol: 'none',
        smooth: false,
        data: points.map((point) => [point.timestamp, point.value]),
        lineStyle: { color: stroke, width: 2 },
        areaStyle: { color: `${stroke}22` },
        markLine: {
          symbol: ['none', 'none'],
          animation: false,
          label: { show: true, position: 'insideEndTop', fontSize: 10 },
          data: thresholdLines,
        },
      },
    ],
  }

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{definition.label}</h2>
          <p className="text-xs text-slate-500">{definition.unit}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-semibold text-slate-100">
            {(currentValue ?? points[points.length - 1]?.value ?? 0).toFixed(definition.precision)}
          </div>
          <div className="text-xs text-slate-500">{definition.unit}</div>
        </div>
      </div>

      <ReactECharts option={option} style={{ height: 260, width: '100%' }} opts={{ renderer: 'canvas' }} />
    </article>
  )
}
