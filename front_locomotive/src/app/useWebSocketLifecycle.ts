import { useEffect } from 'react'
import { connectWebSocket, disconnectWebSocket } from '@/services/websocket/wsClient'

export function useWebSocketLifecycle(accessToken: string | null) {
  useEffect(() => {
    if (!accessToken) {
      disconnectWebSocket()
      return
    }
    connectWebSocket()
    return () => disconnectWebSocket()
  }, [accessToken])
}
