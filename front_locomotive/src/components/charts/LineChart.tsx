import { useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

export interface LineChartSeries {
  name: string
  data: Array<{ timestamp: number; value: number }>
  color?: string
  unit?: string
}

interface LineChartProps {
  series: LineChartSeries[]
  height?: number
}

export function LineChart({ series, height = 200 }: LineChartProps) {
  const chartRef = useRef<ReactECharts>(null)

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const option: EChartsOption = {
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 16, bottom: 40, left: 48, right: 16 },
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
      },
      series: series.map((s) => ({
        name: s.name,
        type: 'line',
        data: s.data.map((p) => [p.timestamp, p.value]),
        symbol: 'none',
        lineStyle: { color: s.color ?? '#60a5fa', width: 2 },
        smooth: true,
      })),
    }

    const frame = requestAnimationFrame(() => {
      chart.setOption(option, { lazyUpdate: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [series])

  return (
    <ReactECharts
      ref={chartRef}
      option={{}}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
