export interface MetricReading {
    metricId: string
    value: number
    unit: string
    timestamp: number
    quality: 'good' | 'suspect' | 'bad' | 'stale'
}

export interface TelemetryFrame {
    locomotiveId: string
    frameId: string
    timestamp: number
    readings: MetricReading[]
}

export interface LocomotiveSnapshot {
    locomotiveId: string
    timestamp: number
    speedKmh: number
    fuelLevel: number
    coolantTemp: number
    tractionCurrent: number
    healthScore: number
    status: 'normal' | 'attention' | 'critical'
    sparkline: Array<{ timestamp: number; speed: number; temp: number }>
}

export interface ChatMessage {
    id: string
    locomotiveId: string
    sender: 'dispatcher' | 'locomotive'
    body: string
    sentAt: number
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface WsEnvelope<T = unknown> {
    type: string
    payload: T
    timestamp: number
    sequenceId: number
}
