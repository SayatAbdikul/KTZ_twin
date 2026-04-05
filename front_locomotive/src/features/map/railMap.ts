export type Coordinate = [number, number]
export type RailSegment = [Coordinate, Coordinate]
export type Bounds = [Coordinate, Coordinate]

export const RAILWAY_TILE_API = 'https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'
export const OVERPASS_API = 'https://overpass-api.de/api/interpreter'
export const RAIL_FETCH_RADIUS_M = 4000
export const RAIL_REFRESH_DISTANCE_KM = 5
export const MIN_TRAIL_STEP_KM = 0.03

// Approximate national map extent for Kazakhstan.
export const KAZAKHSTAN_BOUNDS: Bounds = [
  [40.4, 46.4],
  [55.6, 87.8],
]

// Simplified Almaty -> Astana route to provide spatial context when only distance telemetry is available.
export const FALLBACK_ROUTE: Coordinate[] = [
  [43.2389, 76.8897],
  [44.85, 75.22],
  [46.85, 74.99],
  [49.81, 73.09],
  [51.1694, 71.4491],
]

export interface SnappedCoordinate {
  lat: number
  lon: number
  distanceKm: number
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}

export function haversineKm(a: Coordinate, b: Coordinate) {
  const earthRadiusKm = 6371
  const dLat = toRadians(b[0] - a[0])
  const dLon = toRadians(b[1] - a[1])
  const lat1 = toRadians(a[0])
  const lat2 = toRadians(b[0])

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h))
}

function toXYKm(lat: number, lon: number, refLat: number) {
  const kx = 111.32 * Math.cos(toRadians(refLat))
  const ky = 110.574
  return { x: lon * kx, y: lat * ky }
}

function nearestPointOnSegment(point: Coordinate, a: Coordinate, b: Coordinate): SnappedCoordinate {
  const refLat = (a[0] + b[0] + point[0]) / 3
  const p = toXYKm(point[0], point[1], refLat)
  const p1 = toXYKm(a[0], a[1], refLat)
  const p2 = toXYKm(b[0], b[1], refLat)

  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    return { lat: a[0], lon: a[1], distanceKm: haversineKm(point, a) }
  }

  const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq))
  const lat = a[0] + (b[0] - a[0]) * t
  const lon = a[1] + (b[1] - a[1]) * t

  return { lat, lon, distanceKm: haversineKm(point, [lat, lon]) }
}

export function snapToRailway(lat: number, lon: number, segments: RailSegment[]) {
  if (segments.length === 0) {
    return null
  }

  const point: Coordinate = [lat, lon]
  let best: SnappedCoordinate | null = null

  for (const segment of segments) {
    const candidate = nearestPointOnSegment(point, segment[0], segment[1])
    if (!best || candidate.distanceKm < best.distanceKm) {
      best = candidate
    }
  }

  return best
}

export function shouldRefreshRailGeometry(position: Coordinate, fetchedCenter: Coordinate | null) {
  if (!fetchedCenter) {
    return true
  }

  return haversineKm(position, fetchedCenter) > RAIL_REFRESH_DISTANCE_KM
}

export function parseOverpassSegments(data: unknown): RailSegment[] {
  const record = data as { elements?: Array<{ type?: string; geometry?: Array<{ lat: number; lon: number }> }> }
  const segments: RailSegment[] = []

  for (const element of record.elements ?? []) {
    if (element.type !== 'way' || !Array.isArray(element.geometry) || element.geometry.length < 2) {
      continue
    }

    for (let index = 0; index < element.geometry.length - 1; index += 1) {
      const a = element.geometry[index]
      const b = element.geometry[index + 1]
      segments.push([
        [a.lat, a.lon],
        [b.lat, b.lon],
      ])
    }
  }

  return segments
}

export function interpolateRouteByDistance(route: Coordinate[], distanceKm: number) {
  let remaining = Math.max(0, distanceKm)

  for (let index = 0; index < route.length - 1; index += 1) {
    const a = route[index]
    const b = route[index + 1]
    const segmentKm = haversineKm(a, b)

    if (remaining <= segmentKm) {
      const t = segmentKm === 0 ? 0 : remaining / segmentKm
      return {
        lat: a[0] + (b[0] - a[0]) * t,
        lon: a[1] + (b[1] - a[1]) * t,
      }
    }

    remaining -= segmentKm
  }

  const last = route[route.length - 1]
  return { lat: last[0], lon: last[1] }
}

export function getRouteLengthKm(route: Coordinate[]) {
  let total = 0

  for (let index = 0; index < route.length - 1; index += 1) {
    total += haversineKm(route[index], route[index + 1])
  }

  return total
}

export function sampleRoute(route: Coordinate[], stepKm: number) {
  const totalLengthKm = getRouteLengthKm(route)
  const samples: Coordinate[] = []

  if (totalLengthKm === 0) {
    return route.length > 0 ? [route[0]] : []
  }

  for (let distanceKm = 0; distanceKm < totalLengthKm; distanceKm += stepKm) {
    const point = interpolateRouteByDistance(route, distanceKm)
    samples.push([point.lat, point.lon])
  }

  samples.push(route[route.length - 1])
  return samples
}

export function buildRailAlignedRoute(route: Coordinate[], segments: RailSegment[], stepKm: number) {
  if (segments.length === 0) {
    return route
  }

  const snappedRoute: Coordinate[] = []

  for (const sample of sampleRoute(route, stepKm)) {
    const snapped = snapToRailway(sample[0], sample[1], segments)
    if (!snapped || snapped.distanceKm > stepKm) {
      continue
    }

    const nextPoint: Coordinate = [snapped.lat, snapped.lon]
    const previousPoint = snappedRoute[snappedRoute.length - 1]

    if (!previousPoint || haversineKm(previousPoint, nextPoint) >= Math.min(stepKm * 0.35, 4)) {
      snappedRoute.push(nextPoint)
    }
  }

  return snappedRoute.length >= 2 ? snappedRoute : route
}

export function buildRailGeometryQuery(lat: number, lon: number) {
  return `
[out:json][timeout:25];
(
  way["railway"~"rail|light_rail|narrow_gauge|subway|tram"](around:${RAIL_FETCH_RADIUS_M},${lat},${lon});
);
out geom;
`.trim()
}
