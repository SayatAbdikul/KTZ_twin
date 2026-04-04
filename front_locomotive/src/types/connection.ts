export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface ConnectionState {
  backendStatus: ConnectionStatus
  dispatcherStatus: ConnectionStatus
  wsConnected: boolean
  lastHeartbeat: number | null
  latencyMs: number | null
  reconnectAttempt: number
}
