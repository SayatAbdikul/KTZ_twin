import { type RefObject } from 'react'
import type { MousePosition } from '@/types/diagram'

const TOOLTIP_WIDTH = 288
const TOOLTIP_HEIGHT = 220
const CURSOR_OFFSET = 14

interface TooltipStyle {
  top: number
  left: number
}

/**
 * Converts a viewport mouse position to container-relative coordinates,
 * clamped so the tooltip stays within the container bounds.
 */
export function useTooltipPosition(
  mousePos: MousePosition | null,
  containerRef: RefObject<HTMLDivElement | null>
): TooltipStyle | null {
  if (!mousePos || !containerRef.current) return null

  const rect = containerRef.current.getBoundingClientRect()
  const relX = mousePos.x - rect.left
  const relY = mousePos.y - rect.top

  // Default: right of cursor, slightly above
  let left = relX + CURSOR_OFFSET
  let top = relY - CURSOR_OFFSET

  // Flip left if tooltip would overflow the right edge
  if (left + TOOLTIP_WIDTH > rect.width) {
    left = relX - CURSOR_OFFSET - TOOLTIP_WIDTH
  }

  // Shift up if tooltip would overflow the bottom
  if (top + TOOLTIP_HEIGHT > rect.height) {
    top = rect.height - TOOLTIP_HEIGHT
  }

  // Ensure tooltip doesn't go above the container
  if (top < 0) top = 0

  // Ensure tooltip doesn't go past left edge
  if (left < 0) left = 0

  return { top, left }
}
