import { useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useSettingsStore } from '@/features/settings/useSettingsStore'
import { getChartTheme } from '@/utils/chartTheme'

export interface LineChartSeries {
  name: string
  data: Array<{ timestamp: number; value: number }>
  color?: string
  unit?: string
}

interface LineChartProps {
  series: LineChartSeries[]
  height?: number
  windowMs?: number | 'all'
}

function getTimeBounds(series: LineChartSeries[]) {
  let earliest: number | null = null
  let latest: number | null = null

  for (const item of series) {
    if (item.data.length === 0) continue
    const first = item.data[0]?.timestamp
    const last = item.data[item.data.length - 1]?.timestamp
    if (first !== undefined) earliest = earliest === null ? first : Math.min(earliest, first)
    if (last !== undefined) latest = latest === null ? last : Math.max(latest, last)
  }

  return { earliest, latest }
}

export function LineChart({ series, height = 200, windowMs }: LineChartProps) {
  const chartRef = useRef<ReactECharts>(null)
  const previousWindowRef = useRef<number | 'all' | undefined>(windowMs)
  const isApplyingPresetRef = useRef(false)
  const manualZoomRef = useRef(false)
  const { earliest, latest } = getTimeBounds(series)
  const theme = useSettingsStore((state) => state.theme)
  const chartTheme = getChartTheme(theme)

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const option: EChartsOption = {
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 16, bottom: 64, left: 48, right: 16 },
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
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 20,
          bottom: 4,
          borderColor: chartTheme.sliderBorder,
          fillerColor: chartTheme.sliderFiller,
          handleStyle: { color: chartTheme.sliderHandle },
          textStyle: { color: chartTheme.axisLabel, fontSize: 10 },
          brushSelect: false,
        },
      ],
      series: series.map((s) => ({
        name: s.name,
        type: 'line',
        data: s.data.map((p) => [p.timestamp, p.value]),
        symbol: 'none',
        lineStyle: { color: s.color ?? chartTheme.info, width: 2 },
        smooth: true,
      })),
    }

    const frame = requestAnimationFrame(() => {
      chart.setOption(option, { lazyUpdate: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [series, chartTheme])

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const handleDataZoom = () => {
      if (isApplyingPresetRef.current) return
      manualZoomRef.current = true
    }

    chart.on('datazoom', handleDataZoom)
    return () => {
      chart.off('datazoom', handleDataZoom)
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart || latest === null || earliest === null) return

    const windowChanged = previousWindowRef.current !== windowMs
    if (windowChanged) {
      previousWindowRef.current = windowMs
      manualZoomRef.current = false
    }

    if (windowMs === undefined) return
    if (manualZoomRef.current && !windowChanged) return

    const startValue =
      windowMs === 'all' ? earliest : Math.max(earliest, latest - windowMs)
    const endValue = latest

    isApplyingPresetRef.current = true
    chart.dispatchAction({
      type: 'dataZoom',
      dataZoomIndex: 0,
      startValue,
      endValue,
    })
    chart.dispatchAction({
      type: 'dataZoom',
      dataZoomIndex: 1,
      startValue,
      endValue,
    })

    const frame = requestAnimationFrame(() => {
      isApplyingPresetRef.current = false
    })

    return () => cancelAnimationFrame(frame)
  }, [windowMs, earliest, latest, series])

  return (
    <ReactECharts
      ref={chartRef}
      option={{}}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
