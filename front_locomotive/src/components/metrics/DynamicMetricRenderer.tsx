import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { MetricCard } from '@/components/common/MetricCard'
import { Sparkline } from '@/components/charts/Sparkline'
import { getMetricSeverity } from '@/utils/thresholds'
import type { MetricDefinition } from '@/types/telemetry'

// Stable empty array — prevents infinite re-render when buffer is empty
const EMPTY_BUFFER: Array<{ timestamp: number; value: number }> = []

interface DynamicMetricRendererProps {
  definition: MetricDefinition
}

export function DynamicMetricRenderer({ definition }: DynamicMetricRendererProps) {
  const reading = useTelemetryStore((s) => s.currentReadings.get(definition.metricId))
  // Return undefined (not []) from selector — undefined === undefined avoids re-render loop
  const bufferData = useTelemetryStore((s) => s.sparklineBuffers.get(definition.metricId))
  const buffer = bufferData ?? EMPTY_BUFFER

  const severity = reading ? getMetricSeverity(reading.value, definition) : 'normal'
  const sparklineColor = severity === 'critical' ? '#f87171' : severity === 'warning' ? '#fbbf24' : '#60a5fa'

  return (
    <MetricCard
      definition={definition}
      reading={reading}
      sparkline={
        definition.sparklineEnabled && buffer.length > 2 ? (
          <Sparkline data={buffer} color={sparklineColor} height={28} />
        ) : undefined
      }
    />
  )
}
