import type { WsMessage } from '@/types/websocket'
import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { useHealthStore } from '@/features/health/useHealthStore'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { useConnectionStore } from '@/features/connection/useConnectionStore'
import { adaptTelemetryFrame } from '@/services/adapters/telemetryAdapter'
import { adaptAlert } from '@/services/adapters/alertAdapter'
import { adaptHealthIndex } from '@/services/adapters/healthAdapter'
import { adaptMessage } from '@/services/adapters/messageAdapter'

export function routeWsMessage(raw: string): void {
  let msg: WsMessage
  try {
    msg = JSON.parse(raw) as WsMessage
  } catch {
    console.warn('[WS] Failed to parse message:', raw)
    return
  }

  switch (msg.type) {
    case 'telemetry.frame':
      useTelemetryStore.getState().applyFrame(adaptTelemetryFrame(msg.payload))
      break
    case 'health.update':
      useHealthStore.getState().applyUpdate(adaptHealthIndex(msg.payload))
      break
    case 'alert.new':
      useAlertStore.getState().addAlert(adaptAlert(msg.payload))
      break
    case 'alert.update':
      useAlertStore.getState().updateAlert(adaptAlert(msg.payload))
      break
    case 'alert.resolved': {
      const p = msg.payload as { alertId: string; resolvedAt: number }
      useAlertStore.getState().resolveAlert(p.alertId, p.resolvedAt)
      break
    }
    case 'message.new':
      useMessageStore.getState().addMessage(adaptMessage(msg.payload))
      break
    case 'connection.heartbeat': {
      const p = msg.payload as { serverTime: number }
      useConnectionStore.getState().processHeartbeat(p.serverTime)
      break
    }
    case 'connection.status': {
      const p = msg.payload as { dispatcherStatus: string }
      useConnectionStore.getState().setDispatcherStatus(p.dispatcherStatus as import('@/types/connection').ConnectionStatus)
      break
    }
    default:
      break
  }
}
