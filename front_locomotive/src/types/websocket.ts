export type WsMessageType =
  | 'dispatcher.snapshot'
  | 'dispatcher.locomotive_status'
  | 'telemetry.frame'
  | 'health.update'
  | 'alert.new'
  | 'alert.update'
  | 'alert.resolved'
  | 'message.new'
  | 'message.update'
  | 'connection.heartbeat'
  | 'connection.status'

export interface EventEnvelopeV1 {
  event_id: string
  event_type: string
  source: string
  locomotive_id: string
  occurred_at: number
  schema_version: '1.0'
}

export interface WsMessage<T = unknown> {
  type: WsMessageType
  payload: T
  timestamp: number
  sequenceId: number
  event?: EventEnvelopeV1
}
