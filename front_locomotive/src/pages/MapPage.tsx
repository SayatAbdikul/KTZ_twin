import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PageContainer } from '@/components/layout/PageContainer'
import { APP_CONFIG } from '@/config/app.config'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { endpoints } from '@/services/api/endpoints'
import { adaptTelemetryFrame } from '@/services/adapters/telemetryAdapter'
import { formatTimestamp } from '@/utils/formatters'
import {
  buildRailGeometryQuery,
  FALLBACK_ROUTE,
  haversineKm,
  interpolateRouteByDistance,
  MIN_TRAIL_STEP_KM,
  OVERPASS_API,
  parseOverpassSegments,
  RAILWAY_TILE_API,
  snapToRailway,
  shouldRefreshRailGeometry,
  type Coordinate,
  type RailSegment,
} from '@/features/map/railMap'

type OverlayStatus = 'enabled' | 'disabled' | 'tile error'

interface PositionDetails {
  lat: number
  lon: number
  source: string
  distanceKm: number | null
  timestamp: number
}

interface RailState {
  segments: RailSegment[]
  fetchedCenter: Coordinate | null
  isFetching: boolean
}

function createLocomotiveIcon() {
  return L.divIcon({
    className: 'rail-map-marker-wrap',
    html: '<span class="rail-map-marker"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function formatCoordinate(value: number | null) {
  if (value === null) {
    return '-'
  }

  return value.toFixed(5)
}

function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) {
    return '-'
  }

  return `${distanceKm.toFixed(2)} km`
}

function getDistanceReading(snapshot: ReturnType<typeof useTelemetryStore.getState>['byLocomotive'][string] | undefined) {
  const reading = snapshot?.currentReadings.get('motion.distance')
  return typeof reading?.value === 'number' ? reading.value : null
}

function resolvePosition(args: {
  latitude?: number
  longitude?: number
  distanceKm: number | null
  timestamp: number | null
}): PositionDetails | null {
  if (typeof args.latitude === 'number' && typeof args.longitude === 'number') {
    return {
      lat: args.latitude,
      lon: args.longitude,
      source: 'direct telemetry coordinates',
      distanceKm: args.distanceKm,
      timestamp: args.timestamp ?? Date.now(),
    }
  }

  if (args.distanceKm === null) {
    return null
  }

  const interpolated = interpolateRouteByDistance(FALLBACK_ROUTE, args.distanceKm)
  return {
    ...interpolated,
    source: 'route interpolation from motion.distance',
    distanceKm: args.distanceKm,
    timestamp: args.timestamp ?? Date.now(),
  }
}

async function fetchBootstrapTelemetry() {
  const response = await endpoints.telemetry.current()
  return adaptTelemetryFrame(response.data)
}

export function MapPage() {
  const selectedLocomotiveId = useFleetStore((state) => state.selectedLocomotiveId)
  const selectedLocomotive = useFleetStore((state) =>
    state.selectedLocomotiveId ? state.locomotives[state.selectedLocomotiveId] ?? null : null
  )
  const telemetrySnapshot = useTelemetryStore((state) =>
    selectedLocomotiveId ? state.byLocomotive[selectedLocomotiveId] : undefined
  )
  const applyTelemetryFrame = useTelemetryStore((state) => state.applyFrame)
  const applyFleetTelemetry = useFleetStore((state) => state.applyTelemetryFrame)
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const trailRef = useRef<L.Polyline | null>(null)
  const overlayRef = useRef<L.TileLayer | null>(null)
  const trailPointsRef = useRef<Coordinate[]>([])
  const activeLocomotiveRef = useRef<string | null>(null)
  const railStateRef = useRef<RailState>({
    segments: [],
    fetchedCenter: null,
    isFetching: false,
  })
  const bootstrapAttemptedRef = useRef(false)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus>('enabled')
  const [position, setPosition] = useState<PositionDetails | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)

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

    railwayLayer.on('tileerror', () => setOverlayStatus('tile error'))
    railwayLayer.on('load', () => {
      setOverlayStatus(map.hasLayer(railwayLayer) ? 'enabled' : 'disabled')
    })

    const fallbackRouteLine = L.polyline(FALLBACK_ROUTE, {
      color: '#64748b',
      weight: 2,
      opacity: 0.55,
      dashArray: '6 6',
    }).addTo(map)

    trailRef.current = L.polyline([], {
      color: '#2563eb',
      weight: 4,
      opacity: 0.92,
    }).addTo(map)

    markerRef.current = L.marker(FALLBACK_ROUTE[0], {
      title: APP_CONFIG.LOCOMOTIVE_ID,
      icon: createLocomotiveIcon(),
    }).addTo(map)
    markerRef.current.bindPopup('Locomotive position')

    map.fitBounds(fallbackRouteLine.getBounds(), { padding: [24, 24] })

    return () => {
      railwayLayer.off()
      map.remove()
      mapRef.current = null
      overlayRef.current = null
      markerRef.current = null
      trailRef.current = null
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
      setOverlayStatus('enabled')
    } else {
      map.removeLayer(overlay)
      setOverlayStatus('disabled')
    }
  }, [overlayEnabled])

  useEffect(() => {
    if (selectedLocomotiveId || bootstrapAttemptedRef.current) {
      return
    }

    bootstrapAttemptedRef.current = true

    void fetchBootstrapTelemetry()
      .then((frame) => {
        if (!frame.locomotiveId) {
          return
        }

        applyTelemetryFrame(frame)
        applyFleetTelemetry(frame)
      })
      .catch(() => {})
  }, [applyFleetTelemetry, applyTelemetryFrame, selectedLocomotiveId])

  useEffect(() => {
    if (!selectedLocomotiveId) {
      return
    }

    const activeLocomotive = activeLocomotiveRef.current
    if (activeLocomotive === selectedLocomotiveId) {
      return
    }

    activeLocomotiveRef.current = selectedLocomotiveId
    trailPointsRef.current = []
    trailRef.current?.setLatLngs([])
    railStateRef.current = {
      segments: [],
      fetchedCenter: null,
      isFetching: false,
    }
    setPosition(null)
    setErrorText(null)

    const map = mapRef.current
    if (map) {
      map.fitBounds(L.latLngBounds(FALLBACK_ROUTE), { padding: [24, 24] })
    }
  }, [selectedLocomotiveId])

  useEffect(() => {
    const marker = markerRef.current
    const trail = trailRef.current
    const map = mapRef.current

    if (!selectedLocomotiveId || !marker || !trail || !map) {
      return
    }

    const distanceKm = getDistanceReading(telemetrySnapshot)
    const nextPosition = resolvePosition({
      latitude: selectedLocomotive?.latitude,
      longitude: selectedLocomotive?.longitude,
      distanceKm,
      timestamp: selectedLocomotive?.latestTelemetryAt ?? null,
    })

    if (!nextPosition) {
      setPosition(null)
      return
    }

    const resolvedPosition = nextPosition
    const rawPosition: Coordinate = [resolvedPosition.lat, resolvedPosition.lon]
    async function updateRailGeometryIfNeeded() {
      if (railStateRef.current.isFetching || !shouldRefreshRailGeometry(rawPosition, railStateRef.current.fetchedCenter)) {
        return
      }

      railStateRef.current.isFetching = true

      try {
        const response = await fetch(OVERPASS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({
            data: buildRailGeometryQuery(resolvedPosition.lat, resolvedPosition.lon),
          }),
        })

        if (!response.ok) {
          throw new Error(`Overpass API ${response.status}`)
        }

        const body = (await response.json()) as unknown
        railStateRef.current.segments = parseOverpassSegments(body)
        railStateRef.current.fetchedCenter = rawPosition
        setErrorText(null)
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : 'Failed to refresh railway geometry')
      } finally {
        railStateRef.current.isFetching = false
      }
    }

    void updateRailGeometryIfNeeded().then(() => {
      const snapped = snapToRailway(resolvedPosition.lat, resolvedPosition.lon, railStateRef.current.segments)
      const finalLat = snapped?.lat ?? resolvedPosition.lat
      const finalLon = snapped?.lon ?? resolvedPosition.lon
      const finalSource = snapped
        ? `${resolvedPosition.source} + rail snap (${(snapped.distanceKm * 1000).toFixed(0)} m)`
        : `${resolvedPosition.source} (unsnapped)`

      const nextCoordinate: Coordinate = [finalLat, finalLon]
      const previous = trailPointsRef.current[trailPointsRef.current.length - 1]

      if (!previous || haversineKm(previous, nextCoordinate) >= MIN_TRAIL_STEP_KM) {
        trailPointsRef.current = [...trailPointsRef.current, nextCoordinate]
        trail.setLatLngs(trailPointsRef.current)
      }

      marker.setLatLng(nextCoordinate)
      marker.setPopupContent(`${selectedLocomotiveId}<br/>${finalLat.toFixed(5)}, ${finalLon.toFixed(5)}`)
      map.panTo(nextCoordinate, { animate: true, duration: 0.8 })

      setPosition({
        ...resolvedPosition,
        lat: finalLat,
        lon: finalLon,
        source: finalSource,
      })
    })
  }, [selectedLocomotive, selectedLocomotiveId, telemetrySnapshot])

  return (
    <PageContainer className="h-full">
      <div className="grid h-full gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Railway Map</div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-100">
            {selectedLocomotiveId ?? 'Awaiting locomotive stream'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Live route context inside the operator app with OpenRailwayMap tiles and local rail snapping.
          </p>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Source</div>
              <div className="mt-2 text-sm text-slate-100">{position?.source ?? 'No coordinates available yet'}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Latitude</div>
                  <div className="mt-1 font-mono text-slate-100">{formatCoordinate(position?.lat ?? null)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Longitude</div>
                  <div className="mt-1 font-mono text-slate-100">{formatCoordinate(position?.lon ?? null)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Distance</div>
                  <div className="mt-1 text-slate-100">{formatDistance(position?.distanceKm ?? null)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Updated</div>
                  <div className="mt-1 text-slate-100">
                    {position ? formatTimestamp(position.timestamp) : 'Awaiting data'}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Railway Overlay API</div>
              <div className="mt-2 break-all font-mono text-xs text-slate-300">{RAILWAY_TILE_API}</div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Overlay status</div>
                  <div className="mt-1 text-slate-100">{overlayStatus}</div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                  <input
                    type="checkbox"
                    checked={overlayEnabled}
                    onChange={(event) => setOverlayEnabled(event.target.checked)}
                    className="h-3.5 w-3.5 accent-blue-500"
                  />
                  Overlay
                </label>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
              {errorText ?? 'Rail geometry refresh is handled on-demand as the locomotive moves across the route.'}
            </div>
          </div>
        </section>

        <section className="min-h-[520px] overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
          <div ref={mapElementRef} className="h-full min-h-[520px] w-full" />
        </section>
      </div>
    </PageContainer>
  )
}
