import { useHealthStore } from '@/features/health/useHealthStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { useMetricCatalog } from '@/features/telemetry/metricCatalog'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import type { DiagramZone } from '@/types/diagram'
import type { SubsystemHealth } from '@/types/health'
import type { MetricDefinition, MetricReading } from '@/types/telemetry'
import type { Alert } from '@/types/alerts'

interface DiagramData {
  subsystem: SubsystemHealth | null
  readings: Map<string, MetricReading>
  definitions: MetricDefinition[]
  sparklineBuffers: Map<string, Array<{ timestamp: number; value: number }>>
  alerts: Alert[]
  alertCount: number
}

const EMPTY: DiagramData = {
  subsystem: null,
  readings: new Map(),
  definitions: [],
  sparklineBuffers: new Map(),
  alerts: [],
  alertCount: 0,
}

/**
 * Returns live data scoped to a single diagram zone.
 *
 * Follows the established Zustand pattern: selectors return stable store
 * references, all filtering happens in the render body (not inside selectors).
 */
export function useDiagramData(zone: DiagramZone | null): DiagramData {
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const healthIndex = useHealthStore((s) =>
    selectedLocomotiveId ? s.byLocomotive[selectedLocomotiveId] ?? null : null
  )
  const telemetry = useTelemetryStore((s) =>
    selectedLocomotiveId ? s.byLocomotive[selectedLocomotiveId] : undefined
  )
  const alertsByLocomotive = useAlertStore((s) => s.alertsByLocomotive)
  const allAlerts = selectedLocomotiveId
    ? alertsByLocomotive[selectedLocomotiveId] ?? EMPTY.alerts
    : EMPTY.alerts
  const metricDefinitions = useMetricCatalog()

  if (!zone) return EMPTY

  // All filtering in render body
  const subsystem =
    zone.subsystemId !== null
      ? (healthIndex?.subsystems.find((s) => s.subsystemId === zone.subsystemId) ?? null)
      : null

  const definitions = metricDefinitions.filter((d) => zone.metricIds.includes(d.metricId))

  const alerts = allAlerts.filter(
    (a) => a.source === zone.subsystemId && a.status !== 'resolved'
  )

  return {
    subsystem,
    readings: telemetry?.currentReadings ?? EMPTY.readings,
    definitions,
    sparklineBuffers: telemetry?.sparklineBuffers ?? EMPTY.sparklineBuffers,
    alerts,
    alertCount: alerts.length,
  }
}
