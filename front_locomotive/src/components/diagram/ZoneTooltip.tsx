import { type RefObject } from 'react'
import { AlertTriangle } from 'lucide-react'
import { StatusBadge } from '@/components/common/StatusBadge'
import { useDiagramData } from '@/hooks/useDiagramData'
import { useTooltipPosition } from '@/hooks/useTooltipPosition'
import { getMetricSeverity, severityToColor } from '@/utils/thresholds'
import { ZONE_BY_ID } from '@/config/diagram.config'
import type { MousePosition } from '@/types/diagram'

interface ZoneTooltipProps {
  zoneId: string
  mousePos: MousePosition | null
  containerRef: RefObject<HTMLDivElement | null>
}

export function ZoneTooltip({ zoneId, mousePos, containerRef }: ZoneTooltipProps) {
  const zone = ZONE_BY_ID[zoneId]
  const { subsystem, readings, definitions, alertCount } = useDiagramData(zone ?? null)
  const position = useTooltipPosition(mousePos, containerRef)

  if (!zone || !position) return null

  const status = subsystem?.status ?? (zone.subsystemId ? 'unknown' : 'info')

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-50 w-72 rounded-lg border border-slate-700 bg-slate-900/95 shadow-xl backdrop-blur-sm"
      style={{ top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <span className="text-sm font-semibold text-slate-100">{zone.label}</span>
        <StatusBadge status={status} />
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {/* Health score */}
        {subsystem && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Health score</span>
            <span className="font-mono font-semibold text-slate-200">
              {Math.round(subsystem.healthScore)}/100
            </span>
          </div>
        )}

        {/* Metric rows */}
        <div className="space-y-0.5 pt-0.5">
          {definitions.slice(0, 5).map((def) => {
            const reading = readings.get(def.metricId)
            const severity = reading ? getMetricSeverity(reading.value, def) : 'normal'
            return (
              <div key={def.metricId} className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">{def.label}</span>
                <span
                  className={`shrink-0 font-mono text-xs font-medium ${severityToColor(severity)}`}
                >
                  {reading !== undefined
                    ? `${reading.value.toFixed(def.precision)} ${def.unit}`
                    : '—'}
                </span>
              </div>
            )
          })}
        </div>

        {/* Alert count */}
        {alertCount > 0 && (
          <div className="flex items-center gap-1.5 border-t border-slate-800 pt-1.5 text-xs text-amber-400">
            <AlertTriangle size={11} />
            <span>{alertCount} active alert{alertCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}
