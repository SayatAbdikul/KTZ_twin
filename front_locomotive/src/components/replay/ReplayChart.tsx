import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { MetricDefinition } from '@/types/telemetry'
import type { ReplayPoint } from '@/types/replay'
import { getMetricSeverity } from '@/utils/thresholds'

interface ReplayChartProps {
  definition: MetricDefinition
  points: ReplayPoint[]
  currentTimestamp: number | null
}

function getThresholdLines(definition: MetricDefinition, currentTimestamp: number | null) {
  const lines: Array<Record<string, unknown>> = []

  if (definition.warningLow !== undefined) {
    lines.push({
      name: 'Warning Low',
      yAxis: definition.warningLow,
      lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 },
      label: { formatter: 'Warn Low', color: '#fbbf24' },
    })
  }
  if (definition.warningHigh !== undefined) {
    lines.push({
      name: 'Warning High',
      yAxis: definition.warningHigh,
      lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 },
      label: { formatter: 'Warn High', color: '#fbbf24' },
    })
  }
  if (definition.criticalLow !== undefined) {
    lines.push({
      name: 'Critical Low',
      yAxis: definition.criticalLow,
      lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
      label: { formatter: 'Critical Low', color: '#f87171' },
    })
  }
  if (definition.criticalHigh !== undefined) {
    lines.push({
      name: 'Critical High',
      yAxis: definition.criticalHigh,
      lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
      label: { formatter: 'Critical High', color: '#f87171' },
    })
  }

  if (currentTimestamp !== null) {
    lines.push({
      name: 'Current',
      xAxis: currentTimestamp,
      lineStyle: { color: '#e2e8f0', type: 'solid', width: 1 },
      label: { formatter: 'Now', color: '#e2e8f0' },
    })
  }

  return lines
}

export function ReplayChart({ definition, points, currentTimestamp }: ReplayChartProps) {
  const latestValue = points[points.length - 1]?.value
  const severity = latestValue === undefined ? 'normal' : getMetricSeverity(latestValue, definition)
  const stroke =
    severity === 'critical' ? '#f87171' : severity === 'warning' ? '#fbbf24' : '#60a5fa'
  const thresholdLines = getThresholdLines(definition, currentTimestamp)

  if (points.length === 0) {
    return (
      <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-100">{definition.label}</h2>
          <p className="text-xs text-slate-500">{definition.unit}</p>
        </div>
        <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
          No replay samples in this window
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
      backgroundColor: '#1e2130',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e2130' } },
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
            {latestValue.toFixed(definition.precision)}
          </div>
          <div className="text-xs text-slate-500">{definition.unit}</div>
        </div>
      </div>

      <ReactECharts option={option} style={{ height: 260, width: '100%' }} opts={{ renderer: 'canvas' }} />
    </article>
  )
}
