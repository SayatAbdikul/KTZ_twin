import { create } from 'zustand'
import { CONFIG } from '../config'
import type {
    ChatMessage,
    ConnectionState,
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
    addChatMessage: (message: ChatMessage) => void
}

function getMetric(frame: TelemetryFrame, metricId: string): number {
    return frame.readings.find((r) => r.metricId === metricId)?.value ?? 0
}

function computeHealth(speed: number, fuel: number, coolant: number, current: number): number {
    let score = 100
    if (fuel < 25) score -= 20
    if (fuel < 12) score -= 20
    if (coolant > 95) score -= 20
    if (coolant > 105) score -= 20
    if (current > 1600) score -= 10
    if (speed > 140) score -= 10
    return Math.max(0, Math.min(100, score))
}

function healthStatus(score: number): LocomotiveSnapshot['status'] {
    if (score <= 50) return 'critical'
    if (score <= 75) return 'attention'
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
            const score = computeHealth(speed, fuel, coolant, current)

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
                healthScore: score,
                status: healthStatus(score),
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
