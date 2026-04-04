import { useState, useRef, useCallback, useEffect } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { LocomotiveSvg } from '@/components/diagram/LocomotiveSvg'
import { ZoneTooltip } from '@/components/diagram/ZoneTooltip'
import { DetailPanel } from '@/components/diagram/DetailPanel'
import { DiagramLegend } from '@/components/diagram/DiagramLegend'
import type { MousePosition } from '@/types/diagram'

export function DiagramPage() {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState<MousePosition | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleZoneClick = useCallback((zoneId: string) => {
    setSelectedZoneId((prev) => (prev === zoneId ? null : zoneId))
  }, [])

  const handleZoneHover = useCallback((zoneId: string | null, position?: MousePosition) => {
    setHoveredZoneId(zoneId)
    setMousePos(position ?? null)
  }, [])

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
    <PageContainer className="bg-[radial-gradient(circle_at_top,_rgba(14,116,144,0.14),_transparent_30%),linear-gradient(180deg,#020617_0%,#0f172a_55%,#020617_100%)]">
      <div className="flex h-full flex-col gap-4">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-sky-300/70">
              Locomotive view
            </p>
            <h1 className="mt-2 text-lg font-semibold text-slate-100">M62 3D subsystem blueprint</h1>
            <p className="mt-1 text-xs text-slate-400">
              Real model view with subsystem overlays, live telemetry hover cards, and pinned detail state
            </p>
          </div>
          <DiagramLegend />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_360px]">
          <div
            ref={containerRef}
            className="relative min-w-0 overflow-hidden rounded-[32px] border border-sky-500/15 bg-slate-950/55 p-3 shadow-[0_20px_80px_rgba(2,6,23,0.45)]"
          >
            <LocomotiveSvg
              selectedZoneId={selectedZoneId}
              hoveredZoneId={hoveredZoneId}
              onZoneHover={handleZoneHover}
              onZoneClick={handleZoneClick}
              onMouseLeave={handleMouseLeave}
            />

            {hoveredZoneId && (
              <ZoneTooltip
                zoneId={hoveredZoneId}
                mousePos={mousePos}
                containerRef={containerRef}
              />
            )}
          </div>

          <div className="min-h-0 xl:w-[360px] xl:shrink-0">
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
