export type WsMessageType =
  | 'telemetry.frame'
  | 'health.update'
  | 'alert.new'
  | 'alert.update'
  | 'alert.resolved'
  | 'message.new'
  | 'message.update'
  | 'connection.heartbeat'
  | 'connection.status'

export interface WsMessage<T = unknown> {
  type: WsMessageType
  payload: T
  timestamp: number
  sequenceId: number
}
