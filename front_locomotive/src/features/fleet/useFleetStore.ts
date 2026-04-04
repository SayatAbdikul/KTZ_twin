import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { HealthIndex } from '@/types/health'
import type { TelemetryFrame } from '@/types/telemetry'

export interface FleetLocomotiveSummary {
  locomotiveId: string
  connected: boolean
  wsUrl?: string
  latitude?: number
  longitude?: number
  lastSeenAt: number | null
  reconnectAttempt: number
  hasTelemetry: boolean
  latestTelemetryAt: number | null
  latestHealthAt: number | null
  healthScore: number | null
  healthStatus: 'normal' | 'warning' | 'critical' | 'unknown'
  activeAlertCount: number
  speedKmh: number | null
  fuelLevel: number | null
  coolantTemp: number | null
}

interface DispatcherSnapshotLocomotive {
  locomotiveId: string
  wsUrl?: string
  connected?: boolean
  lastSeenAt?: number | null
  reconnectAttempt?: number
  hasTelemetry?: boolean
}

interface LocomotiveConnectionStatus {
  locomotiveId: string
  wsUrl?: string
  connected?: boolean
  lastSeenAt?: number | null
  reconnectAttempt?: number
}

interface FleetState {
  selectedLocomotiveId: string | null
  locomotives: Record<string, FleetLocomotiveSummary>
  applyDispatcherSnapshot: (locomotives: DispatcherSnapshotLocomotive[]) => void
  applyConnectionStatus: (status: LocomotiveConnectionStatus) => void
  applyTelemetryFrame: (frame: TelemetryFrame) => void
  applyHealthIndex: (healthIndex: HealthIndex) => void
  setAlertCount: (locomotiveId: string, activeAlertCount: number) => void
  selectLocomotive: (locomotiveId: string) => void
}

function createSummary(locomotiveId: string): FleetLocomotiveSummary {
  return {
    locomotiveId,
    connected: false,
    lastSeenAt: null,
    reconnectAttempt: 0,
    latitude: undefined,
    longitude: undefined,
    hasTelemetry: false,
    latestTelemetryAt: null,
    latestHealthAt: null,
    healthScore: null,
    healthStatus: 'unknown',
    activeAlertCount: 0,
    speedKmh: null,
    fuelLevel: null,
    coolantTemp: null,
  }
}

function getMetric(frame: TelemetryFrame, metricId: string): number | null {
  const reading = frame.readings.find((item) => item.metricId === metricId)
  return reading ? reading.value : null
}

function deriveHealthStatus(healthIndex: HealthIndex): FleetLocomotiveSummary['healthStatus'] {
  if (healthIndex.subsystems.some((subsystem) => subsystem.status === 'critical')) return 'critical'
  if (healthIndex.overall < 40) return 'critical'
  if (healthIndex.subsystems.some((subsystem) => subsystem.status === 'warning' || subsystem.status === 'degraded')) {
    return 'warning'
  }
  if (healthIndex.overall < 80) return 'warning'
  return 'normal'
}

function sortLocomotives(locomotives: Record<string, FleetLocomotiveSummary>) {
  return Object.values(locomotives).sort((a, b) => {
    const statusOrder = { critical: 0, warning: 1, normal: 2, unknown: 3 }
    const byStatus = statusOrder[a.healthStatus] - statusOrder[b.healthStatus]
    if (byStatus !== 0) return byStatus
    const byScore = (a.healthScore ?? -1) - (b.healthScore ?? -1)
    if (byScore !== 0) return byScore
    return a.locomotiveId.localeCompare(b.locomotiveId)
  })
}

export function getFleetLocomotiveOptions(locomotives: Record<string, FleetLocomotiveSummary>) {
  return sortLocomotives(locomotives).map((item) => item.locomotiveId)
}

export const useFleetStore = create<FleetState>()(
  devtools(
    (set) => ({
      selectedLocomotiveId: null,
      locomotives: {},

      applyDispatcherSnapshot: (locomotiveSnapshots) =>
        set((state) => {
          const locomotives = { ...state.locomotives }
          for (const snapshot of locomotiveSnapshots) {
            const previous = locomotives[snapshot.locomotiveId] ?? createSummary(snapshot.locomotiveId)
            locomotives[snapshot.locomotiveId] = {
              ...previous,
              wsUrl: snapshot.wsUrl ?? previous.wsUrl,
              connected: snapshot.connected ?? previous.connected,
              lastSeenAt: snapshot.lastSeenAt ?? previous.lastSeenAt,
              reconnectAttempt: snapshot.reconnectAttempt ?? previous.reconnectAttempt,
              hasTelemetry: snapshot.hasTelemetry ?? previous.hasTelemetry,
            }
          }

          const locomotiveIds = getFleetLocomotiveOptions(locomotives)
          return {
            locomotives,
            selectedLocomotiveId: state.selectedLocomotiveId ?? locomotiveIds[0] ?? null,
          }
        }),

      applyConnectionStatus: (status) =>
        set((state) => {
          const previous = state.locomotives[status.locomotiveId] ?? createSummary(status.locomotiveId)
          const locomotives = {
            ...state.locomotives,
            [status.locomotiveId]: {
              ...previous,
              wsUrl: status.wsUrl ?? previous.wsUrl,
              connected: status.connected ?? previous.connected,
              lastSeenAt: status.lastSeenAt ?? previous.lastSeenAt,
              reconnectAttempt: status.reconnectAttempt ?? previous.reconnectAttempt,
            },
          }

          return {
            locomotives,
            selectedLocomotiveId: state.selectedLocomotiveId ?? status.locomotiveId,
          }
        }),

      applyTelemetryFrame: (frame) =>
        set((state) => {
          const previous = state.locomotives[frame.locomotiveId] ?? createSummary(frame.locomotiveId)
          const locomotives = {
            ...state.locomotives,
            [frame.locomotiveId]: {
              ...previous,
              hasTelemetry: true,
              latestTelemetryAt: frame.timestamp,
              latitude: frame.latitude ?? previous.latitude,
              longitude: frame.longitude ?? previous.longitude,
              speedKmh: getMetric(frame, 'motion.speed'),
              fuelLevel: getMetric(frame, 'fuel.level'),
              coolantTemp: getMetric(frame, 'thermal.coolant_temp'),
            },
          }

          return {
            locomotives,
            selectedLocomotiveId: state.selectedLocomotiveId ?? frame.locomotiveId,
          }
        }),

      applyHealthIndex: (healthIndex) =>
        set((state) => {
          const previous = state.locomotives[healthIndex.locomotiveId] ?? createSummary(healthIndex.locomotiveId)
          const locomotives = {
            ...state.locomotives,
            [healthIndex.locomotiveId]: {
              ...previous,
              latestHealthAt: healthIndex.timestamp,
              healthScore: healthIndex.overall,
              healthStatus: deriveHealthStatus(healthIndex),
              activeAlertCount: healthIndex.subsystems.reduce(
                (sum, subsystem) => sum + subsystem.activeAlertCount,
                0
              ),
            },
          }

          return {
            locomotives,
            selectedLocomotiveId: state.selectedLocomotiveId ?? healthIndex.locomotiveId,
          }
        }),

      setAlertCount: (locomotiveId, activeAlertCount) =>
        set((state) => {
          const previous = state.locomotives[locomotiveId] ?? createSummary(locomotiveId)
          return {
            locomotives: {
              ...state.locomotives,
              [locomotiveId]: {
                ...previous,
                activeAlertCount,
              },
            },
            selectedLocomotiveId: state.selectedLocomotiveId ?? locomotiveId,
          }
        }),

      selectLocomotive: (selectedLocomotiveId) => set({ selectedLocomotiveId }),
    }),
    { name: 'fleet-store' }
  )
)
