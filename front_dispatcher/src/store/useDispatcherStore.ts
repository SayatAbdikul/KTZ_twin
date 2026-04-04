import { create } from 'zustand'
import { CONFIG } from '../config'
import type {
    ChatMessage,
    ConnectionState,
    HealthIndex,
    LocomotiveSnapshot,
    TelemetryFrame,
} from '../types'

interface DispatcherState {
    connection: ConnectionState
    reconnectAttempt: number
    selectedLocomotiveId: string | null
    locomotives: Record<string, LocomotiveSnapshot>
    chats: Record<string, ChatMessage[]>

    setConnection: (state: ConnectionState) => void
    setReconnectAttempt: (attempt: number) => void
    setSelectedLocomotive: (locomotiveId: string) => void
    upsertTelemetry: (frame: TelemetryFrame) => void
    upsertHealth: (locomotiveId: string, health: HealthIndex) => void
    addChatMessage: (message: ChatMessage) => void
}

function getMetric(frame: TelemetryFrame, metricId: string): number {
    return frame.readings.find((r) => r.metricId === metricId)?.value ?? 0
}

function healthStatus(health: HealthIndex): LocomotiveSnapshot['status'] {
    if (health.status === 'critical') return 'critical'
    if (health.status === 'warning' || health.status === 'degraded') return 'attention'
    if (health.subsystems.some((subsystem) => subsystem.status === 'critical')) return 'critical'
    if (health.subsystems.some((subsystem) => subsystem.status === 'warning' || subsystem.status === 'degraded')) {
        return 'attention'
    }
    return 'normal'
}

export const useDispatcherStore = create<DispatcherState>((set) => ({
    connection: 'connecting',
    reconnectAttempt: 0,
    selectedLocomotiveId: null,
    locomotives: {},
    chats: {},

    setConnection: (connection) => set({ connection }),
    setReconnectAttempt: (reconnectAttempt) => set({ reconnectAttempt }),
    setSelectedLocomotive: (selectedLocomotiveId) => set({ selectedLocomotiveId }),

    upsertTelemetry: (frame) =>
        set((state) => {
            const speed = getMetric(frame, 'motion.speed')
            const fuel = getMetric(frame, 'fuel.level')
            const coolant = getMetric(frame, 'thermal.coolant_temp')
            const current = getMetric(frame, 'electrical.traction_current')

            const prev = state.locomotives[frame.locomotiveId]
            const oldSparkline = prev?.sparkline ?? []
            const nextSparkline = [
                ...oldSparkline,
                { timestamp: frame.timestamp, speed, temp: coolant },
            ].slice(-CONFIG.SPARKLINE_WINDOW)

            const updated: LocomotiveSnapshot = {
                locomotiveId: frame.locomotiveId,
                timestamp: frame.timestamp,
                speedKmh: speed,
                fuelLevel: fuel,
                coolantTemp: coolant,
                tractionCurrent: current,
                healthScore: prev?.healthScore ?? 100,
                status: prev?.status ?? 'normal',
                sparkline: nextSparkline,
            }

            const selectedLocomotiveId =
                state.selectedLocomotiveId ?? frame.locomotiveId

            return {
                locomotives: {
                    ...state.locomotives,
                    [frame.locomotiveId]: updated,
                },
                selectedLocomotiveId,
            }
        }),

    upsertHealth: (locomotiveId, health) =>
        set((state) => {
            const prev = state.locomotives[locomotiveId]
            const updated: LocomotiveSnapshot = {
                locomotiveId,
                timestamp: Math.max(prev?.timestamp ?? 0, health.timestamp),
                speedKmh: prev?.speedKmh ?? 0,
                fuelLevel: prev?.fuelLevel ?? 0,
                coolantTemp: prev?.coolantTemp ?? 0,
                tractionCurrent: prev?.tractionCurrent ?? 0,
                healthScore: health.overall,
                status: healthStatus(health),
                sparkline: prev?.sparkline ?? [],
            }

            return {
                locomotives: {
                    ...state.locomotives,
                    [locomotiveId]: updated,
                },
                selectedLocomotiveId: state.selectedLocomotiveId ?? locomotiveId,
            }
        }),

    addChatMessage: (message) =>
        set((state) => {
            const old = state.chats[message.locomotiveId] ?? []
            return {
                chats: {
                    ...state.chats,
                    [message.locomotiveId]: [...old, message],
                },
            }
        }),
}))
