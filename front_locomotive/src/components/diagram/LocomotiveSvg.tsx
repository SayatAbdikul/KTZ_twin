import { useHealthStore } from '@/features/health/useHealthStore'
import { DIAGRAM_ZONES } from '@/config/diagram.config'
import { SvgZone } from './SvgZone'
import type { SubsystemStatus } from '@/types/health'

interface LocomotiveSvgProps {
  selectedZoneId: string | null
  hoveredZoneId: string | null
  onZoneHover: (zoneId: string | null, e?: React.MouseEvent<SVGGElement>) => void
  onZoneClick: (zoneId: string) => void
  onMouseLeave: () => void
}

function getZoneStatus(
  subsystemId: string | null,
  subsystems: Array<{ subsystemId: string; status: SubsystemStatus }> | undefined
): SubsystemStatus | 'none' {
  if (!subsystemId) return 'none'
  const sub = subsystems?.find((s) => s.subsystemId === subsystemId)
  return sub?.status ?? 'unknown'
}

export function LocomotiveSvg({
  selectedZoneId,
  hoveredZoneId,
  onZoneHover,
  onZoneClick,
  onMouseLeave,
}: LocomotiveSvgProps) {
  const healthIndex = useHealthStore((s) => s.healthIndex)
  const subsystems = healthIndex?.subsystems

  return (
    <svg
      viewBox="0 0 800 270"
      className="w-full h-auto"
      role="img"
      aria-label="Interactive TE33A locomotive diagram with subsystem zones"
      onMouseLeave={onMouseLeave}
    >
      {/* ── Decorative structural elements ── */}
      <g aria-hidden="true">
        {/* Locomotive body silhouette */}
        <path
          d="M22,45 L22,212 L782,212 L782,55 L566,55 L566,67 L148,67 L148,45 Z"
          fill="#141826"
          stroke="#334155"
          strokeWidth="1.5"
        />

        {/* Cab windshield */}
        <rect x="28" y="57" width="62" height="44" rx="3" fill="#1a2235" stroke="#3b4d6b" strokeWidth="1" />
        {/* Windshield divider */}
        <line x1="59" y1="57" x2="59" y2="101" stroke="#3b4d6b" strokeWidth="0.8" />

        {/* Cab side door outline */}
        <rect x="98" y="95" width="28" height="115" rx="2" fill="none" stroke="#2d3a52" strokeWidth="0.8" />

        {/* Engine grille slats on cooling section */}
        {[75, 90, 105, 120, 135, 150, 165].map((yOffset) => (
          <line
            key={yOffset}
            x1="576"
            y1={yOffset}
            x2="772"
            y2={yOffset}
            stroke="#1f2a40"
            strokeWidth="1.5"
          />
        ))}
        {/* Cooling section grill outline */}
        <rect x="568" y="68" width="208" height="140" rx="4" fill="none" stroke="#1f2a40" strokeWidth="1" />

        {/* Exhaust stack area on top of cooling section */}
        <rect x="600" y="40" width="20" height="15" rx="2" fill="#141826" stroke="#334155" strokeWidth="1" />
        <rect x="630" y="35" width="16" height="20" rx="2" fill="#141826" stroke="#334155" strokeWidth="1" />

        {/* Interior partition lines (structural) */}
        <line x1="148" y1="67" x2="148" y2="212" stroke="#252d40" strokeWidth="1" />
        <line x1="290" y1="67" x2="290" y2="212" stroke="#252d40" strokeWidth="1" />
        <line x1="414" y1="67" x2="414" y2="140" stroke="#252d40" strokeWidth="0.8" />
        <line x1="566" y1="67" x2="566" y2="212" stroke="#252d40" strokeWidth="1" />

        {/* Fuel tank horizontal separator */}
        <line x1="290" y1="140" x2="566" y2="140" stroke="#252d40" strokeWidth="0.8" />

        {/* Underframe */}
        <rect x="148" y="212" width="634" height="10" fill="#0f1120" stroke="#252d40" strokeWidth="1" />

        {/* Front bogie frame */}
        <rect x="155" y="222" width="118" height="8" rx="2" fill="#151928" stroke="#2d3a52" strokeWidth="1" />
        {/* Rear bogie frame */}
        <rect x="571" y="222" width="200" height="8" rx="2" fill="#151928" stroke="#2d3a52" strokeWidth="1" />

        {/* Axle connectors (front bogie) */}
        <line x1="185" y1="222" x2="185" y2="232" stroke="#2d3a52" strokeWidth="2" />
        <line x1="240" y1="222" x2="240" y2="232" stroke="#2d3a52" strokeWidth="2" />
        {/* Axle connectors (rear bogie) */}
        <line x1="610" y1="222" x2="610" y2="232" stroke="#2d3a52" strokeWidth="2" />
        <line x1="660" y1="222" x2="660" y2="232" stroke="#2d3a52" strokeWidth="2" />
        <line x1="733" y1="222" x2="733" y2="232" stroke="#2d3a52" strokeWidth="2" />

        {/* Wheels — front bogie (2 axles) */}
        <circle cx="185" cy="248" r="15" fill="#141826" stroke="#475569" strokeWidth="2" />
        <circle cx="185" cy="248" r="5" fill="#252d40" />
        <circle cx="240" cy="248" r="15" fill="#141826" stroke="#475569" strokeWidth="2" />
        <circle cx="240" cy="248" r="5" fill="#252d40" />

        {/* Wheels — rear bogie (3 axles) */}
        <circle cx="610" cy="248" r="15" fill="#141826" stroke="#475569" strokeWidth="2" />
        <circle cx="610" cy="248" r="5" fill="#252d40" />
        <circle cx="660" cy="248" r="15" fill="#141826" stroke="#475569" strokeWidth="2" />
        <circle cx="660" cy="248" r="5" fill="#252d40" />
        <circle cx="733" cy="248" r="15" fill="#141826" stroke="#475569" strokeWidth="2" />
        <circle cx="733" cy="248" r="5" fill="#252d40" />

        {/* Rail */}
        <line x1="10" y1="263" x2="790" y2="263" stroke="#334155" strokeWidth="2.5" />
        {/* Rail ties */}
        {[20, 80, 140, 200, 260, 320, 380, 440, 500, 560, 620, 680, 740].map((x) => (
          <rect key={x} x={x} y="261" width="25" height="5" fill="#252d40" />
        ))}

        {/* Front pilot / snowplow */}
        <polygon points="22,190 10,212 22,212" fill="#0f1120" stroke="#334155" strokeWidth="1" />
      </g>

      {/* ── Interactive zones ── */}
      {DIAGRAM_ZONES.map((zone) => (
        <SvgZone
          key={zone.zoneId}
          zone={zone}
          status={getZoneStatus(zone.subsystemId, subsystems)}
          isHovered={hoveredZoneId === zone.zoneId}
          isSelected={selectedZoneId === zone.zoneId}
          onHover={onZoneHover}
          onClick={onZoneClick}
        />
      ))}

      {/* ── Zone text labels (non-interactive overlay) ── */}
      <g aria-hidden="true" pointerEvents="none">
        {DIAGRAM_ZONES.map((zone) => (
          <text
            key={zone.zoneId}
            x={zone.labelPosition.x}
            y={zone.labelPosition.y}
            textAnchor="middle"
            fontSize="9"
            fontFamily="system-ui, sans-serif"
            letterSpacing="0.05em"
            fill={
              selectedZoneId === zone.zoneId || hoveredZoneId === zone.zoneId
                ? '#e2e8f0'
                : '#64748b'
            }
            style={{ userSelect: 'none', textTransform: 'uppercase' }}
          >
            {zone.shortLabel}
          </text>
        ))}
      </g>
    </svg>
  )
}
