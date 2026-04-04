import type { DiagramZone } from '@/types/diagram'
import type { SubsystemStatus } from '@/types/health'

type ZoneStatus = SubsystemStatus | 'none'

interface SvgZoneProps {
  zone: DiagramZone
  status: ZoneStatus
  isHovered: boolean
  isSelected: boolean
  onHover: (zoneId: string | null, e?: React.MouseEvent<SVGGElement>) => void
  onClick: (zoneId: string) => void
}

function getFill(status: ZoneStatus, isHovered: boolean): string {
  const extra = isHovered ? 0.15 : 0
  switch (status) {
    case 'normal':
      return `rgba(16,185,129,${0.22 + extra})`   // emerald
    case 'degraded':
      return `rgba(245,158,11,${0.22 + extra})`   // amber
    case 'warning':
      return `rgba(245,158,11,${0.30 + extra})`   // amber, brighter
    case 'critical':
      return `rgba(239,68,68,${0.32 + extra})`    // red
    case 'unknown':
      return `rgba(100,116,139,${0.16 + extra})`  // slate
    case 'none':
    default:
      return `rgba(59,130,246,${0.14 + extra})`   // blue (cab / no-subsystem)
  }
}

function getStroke(status: ZoneStatus, isSelected: boolean): string {
  if (isSelected) {
    switch (status) {
      case 'normal':   return 'rgba(16,185,129,0.8)'
      case 'degraded':
      case 'warning':  return 'rgba(245,158,11,0.8)'
      case 'critical': return 'rgba(239,68,68,0.8)'
      case 'none':     return 'rgba(59,130,246,0.8)'
      default:         return 'rgba(100,116,139,0.6)'
    }
  }
  switch (status) {
    case 'normal':   return 'rgba(16,185,129,0.45)'
    case 'degraded':
    case 'warning':  return 'rgba(245,158,11,0.45)'
    case 'critical': return 'rgba(239,68,68,0.5)'
    case 'none':     return 'rgba(59,130,246,0.35)'
    default:         return 'rgba(100,116,139,0.3)'
  }
}

export function SvgZone({
  zone,
  status,
  isHovered,
  isSelected,
  onHover,
  onClick,
}: SvgZoneProps) {
  const fill = getFill(status, isHovered)
  const stroke = getStroke(status, isSelected)
  const strokeWidth = isSelected ? 2 : 1
  const strokeDasharray = isSelected ? '6 3' : undefined
  const shapeProps = { fill, stroke, strokeWidth, strokeDasharray }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={zone.label}
      aria-pressed={isSelected}
      style={{ cursor: 'pointer', outline: 'none' }}
      onClick={() => onClick(zone.zoneId)}
      onMouseEnter={(e) => onHover(zone.zoneId, e)}
      onMouseMove={(e) => onHover(zone.zoneId, e)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(zone.zoneId)}
      onBlur={() => onHover(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(zone.zoneId)
        }
      }}
    >
      {zone.shape.type === 'rect' ? (
        <rect
          x={zone.shape.x}
          y={zone.shape.y}
          width={zone.shape.w}
          height={zone.shape.h}
          rx={zone.shape.rx ?? 5}
          {...shapeProps}
        />
      ) : (
        <path d={zone.shape.d} {...shapeProps} />
      )}
    </g>
  )
}
