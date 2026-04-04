export interface ZoneShapeRect {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
  rx?: number
}

export interface ZoneShapePath {
  type: 'path'
  d: string
}

export type ZoneShape = ZoneShapeRect | ZoneShapePath

export interface DiagramZone {
  zoneId: string
  label: string
  shortLabel: string
  subsystemId: string | null
  metricIds: string[]
  shape: ZoneShape
  labelPosition: { x: number; y: number }
}

export interface MousePosition {
  x: number
  y: number
}
