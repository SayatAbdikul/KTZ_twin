import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
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
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const smoothingEnabled = useSettingsStore((s) => s.smoothingEnabled)
  const telemetry = useTelemetryStore((s) =>
    selectedLocomotiveId ? s.byLocomotive[selectedLocomotiveId] : undefined
  )
  const rawReading = telemetry?.currentReadings.get(definition.metricId)
  const smoothedReading = telemetry?.smoothedReadings.get(definition.metricId)
  const rawBuffer = telemetry?.sparklineBuffers.get(definition.metricId)
  const smoothedBuffer = telemetry?.smoothedSparklineBuffers.get(definition.metricId)

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
