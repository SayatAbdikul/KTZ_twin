import { useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface SparklineProps {
  data: Array<{ timestamp: number; value: number }>
  color?: string
  height?: number
}

export function Sparkline({ data, color = '#60a5fa', height = 32 }: SparklineProps) {
  const chartRef = useRef<ReactECharts>(null)

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const option: EChartsOption = {
      animation: false,
      grid: { top: 2, bottom: 2, left: 0, right: 0 },
      xAxis: { type: 'time', show: false },
      yAxis: { type: 'value', show: false },
      series: [
        {
          type: 'line',
          data: data.map((p) => [p.timestamp, p.value]),
          symbol: 'none',
          lineStyle: { color, width: 1.5 },
          areaStyle: { color, opacity: 0.1 },
          smooth: true,
        },
      ],
    }

    const frame = requestAnimationFrame(() => {
      chart.setOption(option, { lazyUpdate: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [data, color])

  if (data.length < 2) return null

  return (
    <ReactECharts
      ref={chartRef}
      option={{}}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
