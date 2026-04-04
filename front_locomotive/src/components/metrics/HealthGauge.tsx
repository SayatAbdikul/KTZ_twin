import { useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface HealthGaugeProps {
  score: number
  size?: number
}

function scoreToColor(score: number): string {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}

function scoreToLabel(score: number): string {
  if (score >= 80) return 'NORMAL'
  if (score >= 60) return 'DEGRADED'
  if (score >= 40) return 'WARNING'
  return 'CRITICAL'
}

export function HealthGauge({ score, size = 200 }: HealthGaugeProps) {
  const chartRef = useRef<ReactECharts>(null)
  const color = scoreToColor(score)
  const label = scoreToLabel(score)

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const option: EChartsOption = {
      animation: true,
      animationDuration: 500,
      series: [
        {
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          radius: '88%',
          pointer: { show: false },
          progress: {
            show: true,
            width: 12,
            itemStyle: { color },
          },
          axisLine: {
            lineStyle: { width: 12, color: [[1, '#1e2130']] },
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            valueAnimation: true,
            fontSize: 32,
            fontWeight: 700,
            color: '#e2e8f0',
            fontFamily: 'ui-monospace, monospace',
            offsetCenter: [0, '-5%'],
            formatter: '{value}',
          },
          title: {
            offsetCenter: [0, '30%'],
            fontSize: 11,
            color,
            fontWeight: 600,
            fontFamily: 'system-ui',
          },
          data: [{ value: score, name: label }],
        },
      ],
    }

    const frame = requestAnimationFrame(() => {
      chart.setOption(option, { lazyUpdate: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [score, color, label])

  return (
    <ReactECharts
      ref={chartRef}
      option={{}}
      style={{ height: size, width: size }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
