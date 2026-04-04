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

export type HealthSubsystemStatus = 'normal' | 'degraded' | 'warning' | 'critical' | 'unknown'

export interface HealthSubsystem {
    subsystemId: string
    label: string
    healthScore: number
    status: HealthSubsystemStatus
    activeAlertCount: number
    lastUpdated: number
}

export interface HealthIndex {
    overall: number
    status?: HealthSubsystemStatus
    timestamp: number
    subsystems: HealthSubsystem[]
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

export interface EventEnvelopeV1 {
    event_id: string
    event_type: string
    source: string
    locomotive_id: string
    occurred_at: number
    schema_version: '1.0'
}

export interface WsEnvelope<T = unknown> {
    type: string
    payload: T
    timestamp: number
    sequenceId: number
    event?: EventEnvelopeV1
}

export type UserRole = 'admin' | 'dispatcher' | 'regular_train'
export type UserStatus = 'active' | 'disabled'

export interface AuthUser {
    id: number
    role: UserRole
    username?: string | null
    displayName?: string | null
    locomotiveId?: string | null
    status?: UserStatus | null
    mustChangePassword?: boolean
}

export interface AuthSessionResponse {
    accessToken: string
    user: AuthUser
    mustChangePassword: boolean
}
