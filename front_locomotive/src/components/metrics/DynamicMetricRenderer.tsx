import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { useSettingsStore } from '@/features/settings/useSettingsStore'
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
  const smoothingEnabled = useSettingsStore((s) => s.smoothingEnabled)
  const rawReading = useTelemetryStore((s) => s.currentReadings.get(definition.metricId))
  const smoothedReading = useTelemetryStore((s) => s.smoothedReadings.get(definition.metricId))
  const rawBuffer = useTelemetryStore((s) => s.sparklineBuffers.get(definition.metricId))
  const smoothedBuffer = useTelemetryStore((s) =>
    s.smoothedSparklineBuffers.get(definition.metricId)
  )

  const reading = smoothingEnabled ? smoothedReading ?? rawReading : rawReading
  const buffer =
    smoothingEnabled ? smoothedBuffer ?? rawBuffer ?? EMPTY_BUFFER : rawBuffer ?? EMPTY_BUFFER

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
