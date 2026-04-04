import { useState, useRef, useCallback, useEffect } from 'react'
import { useInitialHealth } from '@/features/health/useHealthQueries'
import { useInitialAlerts } from '@/features/alerts/useAlertQueries'
import { useMetricDefinitions } from '@/features/telemetry/useTelemetryQueries'
import { PageContainer } from '@/components/layout/PageContainer'
import { LocomotiveSvg } from '@/components/diagram/LocomotiveSvg'
import { ZoneTooltip } from '@/components/diagram/ZoneTooltip'
import { DetailPanel } from '@/components/diagram/DetailPanel'
import { DiagramLegend } from '@/components/diagram/DiagramLegend'
import type { MousePosition } from '@/types/diagram'

export function DiagramPage() {
  useInitialHealth()
  useInitialAlerts()
  useMetricDefinitions()

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState<MousePosition | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleZoneClick = useCallback((zoneId: string) => {
    setSelectedZoneId((prev) => (prev === zoneId ? null : zoneId))
  }, [])

  const handleZoneHover = useCallback(
    (zoneId: string | null, e?: React.MouseEvent<SVGGElement>) => {
      setHoveredZoneId(zoneId)
      if (e) setMousePos({ x: e.clientX, y: e.clientY })
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredZoneId(null)
    setMousePos(null)
  }, [])

  // Escape key closes detail panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedZoneId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <PageContainer>
      <div className="flex h-full flex-col gap-3">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-slate-200">Locomotive Diagram</h1>
            <p className="text-xs text-slate-500">
              Hover over a subsystem zone to preview live data · Click to open details
            </p>
          </div>
          <DiagramLegend />
        </div>

        {/* Main content: SVG left, detail panel right */}
        <div className="flex min-h-0 flex-1 gap-3">
          {/* SVG container */}
          <div
            ref={containerRef}
            className="relative min-w-0 flex-1 self-start rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <LocomotiveSvg
              selectedZoneId={selectedZoneId}
              hoveredZoneId={hoveredZoneId}
              onZoneHover={handleZoneHover}
              onZoneClick={handleZoneClick}
              onMouseLeave={handleMouseLeave}
            />

            {/* Hover tooltip */}
            {hoveredZoneId && (
              <ZoneTooltip
                zoneId={hoveredZoneId}
                mousePos={mousePos}
                containerRef={containerRef}
              />
            )}
          </div>

          {/* Detail panel */}
          <div className="w-80 shrink-0">
            <DetailPanel
              selectedZoneId={selectedZoneId}
              onClose={() => setSelectedZoneId(null)}
            />
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
