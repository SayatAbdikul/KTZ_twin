import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PageContainer } from '@/components/layout/PageContainer'
import { formatTimestamp } from '@/utils/formatters'
import {
  buildRailAlignedRoute,
  buildRailGeometryQuery,
  FALLBACK_ROUTE,
  getRouteLengthKm,
  haversineKm,
  interpolateRouteByDistance,
  KAZAKHSTAN_BOUNDS,
  MIN_TRAIL_STEP_KM,
  OVERPASS_API,
  parseOverpassSegments,
  RAILWAY_TILE_API,
  sampleRoute,
  snapToRailway,
  type Coordinate,
  type RailSegment,
} from '@/features/map/railMap'

interface PositionDetails {
  lat: number
  lon: number
  source: string
  distanceKm: number
  timestamp: number
}

interface SimulatedTrain {
  id: string
  label: string
  color: string
  baseSpeedKmh: number
  speedKmh: number
  distanceKm: number
  waveOffset: number
  position: PositionDetails
  trail: Coordinate[]
}

interface RailState {
  segments: RailSegment[]
  isFetching: boolean
}

const SIMULATION_TICK_MS = 1000
const ROUTE_FETCH_SAMPLE_STEP_KM = 40
const ROUTE_ALIGNMENT_STEP_KM = 8
const TRAIL_POINT_LIMIT = 180
const MAX_RAIL_SNAP_DISTANCE_KM = 6
const DEFAULT_ROUTE_LENGTH_KM = getRouteLengthKm(FALLBACK_ROUTE)
const TRAIN_SPACING_KM = DEFAULT_ROUTE_LENGTH_KM / 10
const TRAIN_COLORS = [
  '#38bdf8',
  '#22c55e',
  '#f59e0b',
  '#f97316',
  '#e879f9',
  '#fb7185',
  '#facc15',
  '#2dd4bf',
  '#a78bfa',
  '#60a5fa',
]

function createLocomotiveIcon(label: string, color: string) {
  return L.divIcon({
    className: 'rail-map-marker-wrap',
    html: `<span class="rail-map-train-icon" style="--train-color: ${color}"><span class="rail-map-train-label">${label}</span></span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function formatCoordinate(value: number) {
  return value.toFixed(5)
}

function formatDistance(distanceKm: number) {
  return `${distanceKm.toFixed(1)} km`
}

function formatSpeed(speedKmh: number) {
  return `${speedKmh.toFixed(0)} km/h`
}

function buildPopupContent(train: SimulatedTrain) {
  return [
    `<strong>${train.id}</strong>`,
    `${formatSpeed(train.speedKmh)}`,
    `${formatCoordinate(train.position.lat)}, ${formatCoordinate(train.position.lon)}`,
  ].join('<br/>')
}

function resolveSimulatedPosition(
  distanceKm: number,
  timestamp: number,
  route: Coordinate[],
  routeLengthKm: number,
  source: string
): PositionDetails {
  const normalizedDistanceKm = routeLengthKm > 0 ? distanceKm % routeLengthKm : 0
  const interpolated = interpolateRouteByDistance(route, normalizedDistanceKm)

  return {
    lat: interpolated.lat,
    lon: interpolated.lon,
    source,
    distanceKm: normalizedDistanceKm,
    timestamp,
  }
}

function snapPositionToRail(position: PositionDetails, segments: RailSegment[]) {
  const snapped = snapToRailway(position.lat, position.lon, segments)

  if (!snapped || snapped.distanceKm > MAX_RAIL_SNAP_DISTANCE_KM) {
    return position
  }

  return {
    ...position,
    lat: snapped.lat,
    lon: snapped.lon,
    source: `${position.source} + rail snap (${(snapped.distanceKm * 1000).toFixed(0)} m)`,
  }
}

function createInitialTrains(timestamp: number): SimulatedTrain[] {
  return Array.from({ length: 10 }, (_, index) => {
    const distanceKm = TRAIN_SPACING_KM * index
    const position = resolveSimulatedPosition(
      distanceKm,
      timestamp,
      FALLBACK_ROUTE,
      DEFAULT_ROUTE_LENGTH_KM,
      'corridor fallback path'
    )
    const label = `${index + 1}`

    return {
      id: `KTZ-${2101 + index}`,
      label,
      color: TRAIN_COLORS[index % TRAIN_COLORS.length],
      baseSpeedKmh: 68 + index * 1.5,
      speedKmh: 68 + index * 1.5,
      distanceKm,
      waveOffset: index * 0.8,
      position,
      trail: [[position.lat, position.lon]],
    }
  })
}

export function MapPage() {
  const initialTimestamp = useRef(Date.now())
  const [trains, setTrains] = useState<SimulatedTrain[]>(() => createInitialTrains(initialTimestamp.current))
  const [selectedTrainId, setSelectedTrainId] = useState<string>('KTZ-2101')
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.TileLayer | null>(null)
  const markerRef = useRef<Map<string, L.Marker>>(new Map())
  const trailRef = useRef<Map<string, L.Polyline>>(new Map())
  const simulationRouteRef = useRef<Coordinate[]>(FALLBACK_ROUTE)
  const simulationRouteLengthRef = useRef(DEFAULT_ROUTE_LENGTH_KM)
  const simulationRouteSourceRef = useRef('corridor fallback path')
  const railStateRef = useRef<RailState>({
    segments: [],
    isFetching: false,
  })

  const selectedTrain = trains.find((train) => train.id === selectedTrainId) ?? trains[0] ?? null
  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return
    }

    const map = L.map(mapElementRef.current, {
      zoomControl: true,
      attributionControl: true,
    })
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const railwayLayer = L.tileLayer(RAILWAY_TILE_API, {
      maxZoom: 18,
      opacity: 0.9,
      attribution: '&copy; OpenRailwayMap contributors',
    }).addTo(map)
    overlayRef.current = railwayLayer

    map.fitBounds(KAZAKHSTAN_BOUNDS, { padding: [24, 24] })

    return () => {
      railwayLayer.off()
      for (const marker of markerRef.current.values()) {
        marker.remove()
      }
      for (const trail of trailRef.current.values()) {
        trail.remove()
      }
      markerRef.current.clear()
      trailRef.current.clear()
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const overlay = overlayRef.current

    if (!map || !overlay) {
      return
    }

    if (overlayEnabled) {
      overlay.addTo(map)
    } else {
      map.removeLayer(overlay)
    }
  }, [overlayEnabled])

  useEffect(() => {
    async function preloadRailGeometry() {
      if (railStateRef.current.isFetching) {
        return
      }

      railStateRef.current.isFetching = true

      try {
        const routeSamples = sampleRoute(FALLBACK_ROUTE, ROUTE_FETCH_SAMPLE_STEP_KM)
        const results = await Promise.allSettled(
          routeSamples.map(async ([lat, lon]) => {
            const response = await fetch(OVERPASS_API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
              body: new URLSearchParams({
                data: buildRailGeometryQuery(lat, lon),
              }),
            })

            if (!response.ok) {
              throw new Error(`Overpass API ${response.status}`)
            }

            const payload = (await response.json()) as unknown
            return parseOverpassSegments(payload)
          })
        )

        const segments = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
        railStateRef.current.segments = segments

        if (segments.length === 0) {
          return
        }

        const alignedRoute = buildRailAlignedRoute(FALLBACK_ROUTE, segments, ROUTE_ALIGNMENT_STEP_KM)
        const previousRouteLengthKm = simulationRouteLengthRef.current
        const alignedRouteLengthKm = getRouteLengthKm(alignedRoute)

        simulationRouteRef.current = alignedRoute
        simulationRouteLengthRef.current = alignedRouteLengthKm
        simulationRouteSourceRef.current =
          alignedRoute !== FALLBACK_ROUTE ? 'rail-aligned simulation path' : 'corridor fallback path'

        setTrains((current) =>
          current.map((train) => {
            const routeProgress = previousRouteLengthKm > 0 ? train.distanceKm / previousRouteLengthKm : 0
            const distanceKm = alignedRouteLengthKm * routeProgress
            const position = snapPositionToRail(
              resolveSimulatedPosition(
                distanceKm,
                train.position.timestamp,
                simulationRouteRef.current,
                simulationRouteLengthRef.current,
                simulationRouteSourceRef.current
              ),
              segments
            )
            return {
              ...train,
              distanceKm,
              position,
              trail: [[position.lat, position.lon]],
            }
          })
        )
      } catch {
      } finally {
        railStateRef.current.isFetching = false
      }
    }

    void preloadRailGeometry()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setTrains((current) =>
        current.map((train, index) => {
          const oscillation = Math.sin(now / 22000 + train.waveOffset) * 6
          const speedKmh = Math.max(35, train.baseSpeedKmh + oscillation)
          const nextDistanceKm =
            simulationRouteLengthRef.current > 0
              ? (train.distanceKm + (speedKmh * SIMULATION_TICK_MS) / 3_600_000) % simulationRouteLengthRef.current
              : 0
          const nextPosition = snapPositionToRail(
            resolveSimulatedPosition(
              nextDistanceKm,
              now,
              simulationRouteRef.current,
              simulationRouteLengthRef.current,
              simulationRouteSourceRef.current
            ),
            railStateRef.current.segments
          )
          const nextCoordinate: Coordinate = [nextPosition.lat, nextPosition.lon]
          const previousCoordinate = train.trail[train.trail.length - 1]
          const nextTrail =
            !previousCoordinate || haversineKm(previousCoordinate, nextCoordinate) >= MIN_TRAIL_STEP_KM
              ? [...train.trail, nextCoordinate].slice(-TRAIL_POINT_LIMIT)
              : train.trail

          return {
            ...train,
            speedKmh,
            distanceKm: nextDistanceKm,
            position: nextPosition,
            trail: nextTrail,
            label: `${index + 1}`,
          }
        })
      )
    }, SIMULATION_TICK_MS)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    for (const train of trains) {
      let trail = trailRef.current.get(train.id)
      if (!trail) {
        trail = L.polyline(train.trail, {
          color: train.color,
          weight: 3,
          opacity: 0.75,
        }).addTo(map)
        trailRef.current.set(train.id, trail)
      } else {
        trail.setLatLngs(train.trail)
      }

      let marker = markerRef.current.get(train.id)
      if (!marker) {
        marker = L.marker([train.position.lat, train.position.lon], {
          title: train.id,
          icon: createLocomotiveIcon(train.label, train.color),
        }).addTo(map)
        marker.on('click', () => setSelectedTrainId(train.id))
        marker.bindPopup(buildPopupContent(train))
        markerRef.current.set(train.id, marker)
      } else {
        marker.setLatLng([train.position.lat, train.position.lon])
        marker.setPopupContent(buildPopupContent(train))
      }
    }
  }, [trains])

  useEffect(() => {
    if (!selectedTrain) {
      return
    }

    const map = mapRef.current
    const marker = markerRef.current.get(selectedTrain.id)

    if (!map || !marker) {
      return
    }

    map.panTo([selectedTrain.position.lat, selectedTrain.position.lon], { animate: true, duration: 0.8 })
    marker.openPopup()
  }, [selectedTrainId, selectedTrain])

  return (
    <PageContainer className="h-full">
      <div className="grid h-full gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Симуляция парка</div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-100">10 поездов на железнодорожной карте</h1>
          <div className="mt-4 flex items-center justify-end">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
              <input
                type="checkbox"
                checked={overlayEnabled}
                onChange={(event) => setOverlayEnabled(event.target.checked)}
                className="h-3.5 w-3.5 accent-blue-500"
              />
              Слой путей
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Выбранный поезд</div>
            {selectedTrain ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-100">{selectedTrain.id}</div>
                    <div className="text-sm text-slate-400">{selectedTrain.position.source}</div>
                  </div>
                  <div
                    className="h-4 w-4 rounded-full border border-white/40"
                    style={{ backgroundColor: selectedTrain.color }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Широта</div>
                    <div className="mt-1 font-mono text-slate-100">{formatCoordinate(selectedTrain.position.lat)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Долгота</div>
                    <div className="mt-1 font-mono text-slate-100">{formatCoordinate(selectedTrain.position.lon)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Скорость</div>
                    <div className="mt-1 text-slate-100">{formatSpeed(selectedTrain.speedKmh)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Дистанция</div>
                    <div className="mt-1 text-slate-100">{formatDistance(selectedTrain.distanceKm)}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Обновлено</div>
                    <div className="mt-1 text-slate-100">{formatTimestamp(selectedTrain.position.timestamp)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-400">Данные симуляции инициализируются.</div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {trains.map((train) => {
              const isSelected = train.id === selectedTrain?.id
              return (
                <button
                  key={train.id}
                  type="button"
                  onClick={() => setSelectedTrainId(train.id)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-slate-500 bg-slate-800/90'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 text-xs font-semibold text-slate-950"
                      style={{ backgroundColor: train.color }}
                    >
                      {train.label}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{train.id}</div>
                      <div className="text-xs text-slate-400">{formatDistance(train.distanceKm)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-slate-100">{formatSpeed(train.speedKmh)}</div>
                    <div className="text-xs text-slate-400">{formatTimestamp(train.position.timestamp)}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="min-h-[520px] overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
          <div ref={mapElementRef} className="h-full min-h-[520px] w-full" />
        </section>
      </div>
    </PageContainer>
  )
}
