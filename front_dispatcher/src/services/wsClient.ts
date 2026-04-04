import { CONFIG } from '../config'
import { useAuthStore } from '../store/useAuthStore'
import { useDispatcherStore } from '../store/useDispatcherStore'
import type { ChatMessage, HealthIndex, HealthSubsystem, TelemetryFrame, WsEnvelope } from '../types'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let manualClose = false

function buildWsUrl(): string {
    const url = new URL(CONFIG.WS_URL)
    const accessToken = useAuthStore.getState().accessToken
    if (accessToken) {
        url.searchParams.set('token', accessToken)
    }
    return url.toString()
}

function adaptTelemetryFrame(raw: unknown): TelemetryFrame {
    const data = raw as Record<string, unknown>
    return {
        locomotiveId: String(data['locomotive_id'] ?? data['locomotiveId'] ?? 'unknown'),
        frameId: String(data['frame_id'] ?? data['frameId'] ?? ''),
        timestamp: Number(data['timestamp'] ?? Date.now()),
        readings: ((data['readings'] ?? []) as Array<Record<string, unknown>>).map((r) => ({
            metricId: String(r['metric_id'] ?? r['metricId'] ?? ''),
            value: Number(r['value'] ?? 0),
            unit: String(r['unit'] ?? ''),
            timestamp: Number(r['timestamp'] ?? Date.now()),
            quality: (String(r['quality'] ?? 'good') as 'good' | 'suspect' | 'bad' | 'stale'),
        })),
    }
}

function scheduleReconnect(): void {
    if (!useAuthStore.getState().accessToken) {
        return
    }
    const store = useDispatcherStore.getState()
    const attempt = store.reconnectAttempt + 1
    store.setReconnectAttempt(attempt)
    const delay = Math.min(
        CONFIG.RECONNECT_BASE_MS * Math.pow(2, attempt),
        CONFIG.RECONNECT_MAX_MS
    )
    reconnectTimer = setTimeout(() => connectWs(), delay)
}

function adaptHealthIndex(raw: unknown): HealthIndex {
    const data = raw as Record<string, unknown>
    return {
        overall: Number(data['overall'] ?? 100),
        status: (data['status'] as HealthIndex['status']) ?? undefined,
        timestamp: Number(data['timestamp'] ?? Date.now()),
        subsystems: ((data['subsystems'] ?? []) as Array<Record<string, unknown>>).map((subsystem) => ({
            subsystemId: String(subsystem['subsystem_id'] ?? subsystem['subsystemId'] ?? ''),
            label: String(subsystem['label'] ?? ''),
            healthScore: Number(subsystem['health_score'] ?? subsystem['healthScore'] ?? 100),
            status: (String(subsystem['status'] ?? 'unknown') as HealthSubsystem['status']),
            activeAlertCount: Number(subsystem['active_alert_count'] ?? subsystem['activeAlertCount'] ?? 0),
            lastUpdated: Number(subsystem['last_updated'] ?? subsystem['lastUpdated'] ?? Date.now()),
        })),
    }
}

export function connectWs(): void {
    if (socket?.readyState === WebSocket.OPEN) return

    if (!useAuthStore.getState().accessToken) {
        useDispatcherStore.getState().setConnection('disconnected')
        return
    }

    manualClose = false
    const store = useDispatcherStore.getState()
    store.setConnection('connecting')

    socket = new WebSocket(buildWsUrl())

    socket.onopen = () => {
        const s = useDispatcherStore.getState()
        s.setConnection('connected')
        s.setReconnectAttempt(0)
        socket?.send(JSON.stringify({ type: 'subscribe', payload: { channels: ['telemetry', 'health', 'messages'] } }))
    }

    socket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data) as WsEnvelope
            if (msg.type === 'telemetry.frame') {
                useDispatcherStore.getState().upsertTelemetry(adaptTelemetryFrame(msg.payload))
            }
            if (msg.type === 'health.update') {
                const locomotiveId = String(
                    msg.event?.locomotive_id
                        ?? (msg.payload as Record<string, unknown>)?.['locomotive_id']
                        ?? (msg.payload as Record<string, unknown>)?.['locomotiveId']
                        ?? 'KTZ-2001'
                )
                useDispatcherStore.getState().upsertHealth(locomotiveId, adaptHealthIndex(msg.payload))
            }
            if (msg.type === 'message.new') {
                const payload = msg.payload as Record<string, unknown>
                const locomotiveId = String(payload['locomotive_id'] ?? payload['locomotiveId'] ?? 'KTZ-2001')
                const sender = String(payload['sender'] ?? 'regular_train')
                const incoming: ChatMessage = {
                    id: String(payload['message_id'] ?? crypto.randomUUID()),
                    locomotiveId,
                    sender: sender === 'dispatcher' ? 'dispatcher' : 'regular_train',
                    body: String(payload['body'] ?? payload['subject'] ?? 'Incoming operation message'),
                    sentAt: Number(payload['sent_at'] ?? msg.timestamp ?? Date.now()),
                    delivered: typeof payload['delivered'] === 'boolean' ? (payload['delivered'] as boolean) : undefined,
                }
                useDispatcherStore.getState().addChatMessage(incoming)
            }
        } catch {
            // Ignore malformed frames.
        }
    }

    socket.onclose = (event) => {
        if (manualClose) return
        if (event.code === 1008) {
            useDispatcherStore.getState().reset()
            useAuthStore.getState().clearSession()
            disconnectWs()
            return
        }
        useDispatcherStore.getState().setConnection('disconnected')
        scheduleReconnect()
    }

    socket.onerror = () => {
        useDispatcherStore.getState().setConnection('error')
    }
}

export function disconnectWs(): void {
    manualClose = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socket?.close()
    socket = null
}

export function sendChat(locomotiveId: string, body: string, messageId: string): void {
    const message = {
        type: 'dispatcher.chat',
        payload: {
            locomotiveId,
            messageId,
            body,
            sentAt: Date.now(),
        },
    }

    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message))
    }
}
