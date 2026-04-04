import { APP_CONFIG } from '@/config/app.config'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { useConnectionStore } from '@/features/connection/useConnectionStore'
import { routeWsMessage } from './wsMessageRouter'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let destroyed = false

function buildWsUrl(): string {
    const url = new URL(APP_CONFIG.WS_URL)
    const token = useAuthStore.getState().token
    if (token) {
        url.searchParams.set('token', token)
    }
    return url.toString()
}

export function connectWebSocket(): void {
    if (socket?.readyState === WebSocket.OPEN) return

    destroyed = false
    const store = useConnectionStore.getState()
    store.setBackendStatus('connecting')
    store.setWsConnected(false)

    socket = new WebSocket(buildWsUrl())

    socket.onopen = () => {
        const s = useConnectionStore.getState()
        s.setWsConnected(true)
        s.setBackendStatus('connected')
        s.resetReconnect()

        socket?.send(
            JSON.stringify({
                type: 'subscribe',
                payload: {
                    channels: ['telemetry', 'health', 'alerts', 'messages'],
                    locomotiveId: 'all',
                },
            })
        )
    }

    socket.onmessage = (event: MessageEvent<string>) => {
        routeWsMessage(event.data)
    }

    socket.onclose = () => {
        if (destroyed) return
        const s = useConnectionStore.getState()
        s.setWsConnected(false)
        s.setBackendStatus('disconnected')
        scheduleReconnect()
    }

    socket.onerror = () => {
        useConnectionStore.getState().setBackendStatus('error')
    }
}

function scheduleReconnect(): void {
    const store = useConnectionStore.getState()
    store.incrementReconnect()
    const attempt = store.reconnectAttempt
    const delay = Math.min(
        APP_CONFIG.WS_RECONNECT_BASE_MS * Math.pow(2, attempt),
        APP_CONFIG.WS_RECONNECT_MAX_MS
    )
    reconnectTimer = setTimeout(() => connectWebSocket(), delay)
}

export function disconnectWebSocket(): void {
    destroyed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socket?.close()
    socket = null
}

export function sendDispatcherChat(locomotiveId: string, body: string): void {
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(
        JSON.stringify({
            type: 'dispatcher.chat',
            payload: {
                locomotiveId,
                body,
                timestamp: Date.now(),
            },
        })
    )
}
