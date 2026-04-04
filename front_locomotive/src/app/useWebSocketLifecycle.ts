import { useEffect } from 'react'
import { connectWebSocket, disconnectWebSocket } from '@/services/websocket/wsClient'

export function useWebSocketLifecycle() {
  useEffect(() => {
    connectWebSocket()
    return () => disconnectWebSocket()
  }, [])
}
