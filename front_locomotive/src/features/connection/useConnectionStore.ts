import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ConnectionStatus } from '@/types/connection'

interface ConnectionStoreState {
  backendStatus: ConnectionStatus
  dispatcherStatus: ConnectionStatus
  wsConnected: boolean
  lastHeartbeat: number | null
  latencyMs: number | null
  reconnectAttempt: number

  setWsConnected: (connected: boolean) => void
  processHeartbeat: (serverTime: number) => void
  setBackendStatus: (status: ConnectionStatus) => void
  setDispatcherStatus: (status: ConnectionStatus) => void
  incrementReconnect: () => void
  resetReconnect: () => void
}

export const useConnectionStore = create<ConnectionStoreState>()(
  devtools(
    (set) => ({
      backendStatus: 'connecting',
      dispatcherStatus: 'disconnected',
      wsConnected: false,
      lastHeartbeat: null,
      latencyMs: null,
      reconnectAttempt: 0,

      setWsConnected: (connected) => set({ wsConnected: connected }),

      processHeartbeat: (serverTime) => {
        const now = Date.now()
        set({ lastHeartbeat: now, latencyMs: now - serverTime })
      },

      setBackendStatus: (status) => set({ backendStatus: status }),
      setDispatcherStatus: (status) => set({ dispatcherStatus: status }),
      incrementReconnect: () =>
        set((s) => ({ reconnectAttempt: s.reconnectAttempt + 1 })),
      resetReconnect: () => set({ reconnectAttempt: 0 }),
    }),
    { name: 'connection-store' }
  )
)
