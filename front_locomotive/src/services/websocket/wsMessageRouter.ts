import type { WsMessage } from '@/types/websocket'
import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { useHealthStore } from '@/features/health/useHealthStore'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { useConnectionStore } from '@/features/connection/useConnectionStore'
import { APP_CONFIG } from '@/config/app.config'
import { adaptTelemetryFrame } from '@/services/adapters/telemetryAdapter'
import { adaptAlert } from '@/services/adapters/alertAdapter'
import { adaptHealthIndex } from '@/services/adapters/healthAdapter'
import { adaptMessage } from '@/services/adapters/messageAdapter'

function belongsToConfiguredLocomotive(payload: unknown): boolean {
  const data = payload as Record<string, unknown>
  const locomotiveId = data['locomotive_id'] ?? data['locomotiveId']
  if (!locomotiveId) return true
  return String(locomotiveId) === APP_CONFIG.LOCOMOTIVE_ID
}

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
      if (belongsToConfiguredLocomotive(msg.payload)) {
        useTelemetryStore.getState().applyFrame(adaptTelemetryFrame(msg.payload))
      }
      break
    case 'health.update':
      if (belongsToConfiguredLocomotive(msg.payload)) {
        useHealthStore.getState().applyUpdate(adaptHealthIndex(msg.payload))
      }
      break
    case 'alert.new':
      if (belongsToConfiguredLocomotive(msg.payload)) {
        useAlertStore.getState().addAlert(adaptAlert(msg.payload))
      }
      break
    case 'alert.update':
      if (belongsToConfiguredLocomotive(msg.payload)) {
        useAlertStore.getState().updateAlert(adaptAlert(msg.payload))
      }
      break
    case 'alert.resolved': {
      if (belongsToConfiguredLocomotive(msg.payload)) {
        const p = msg.payload as { alertId?: string; alert_id?: string; resolvedAt?: number; resolved_at?: number }
        useAlertStore.getState().resolveAlert(
          String(p.alertId ?? p.alert_id ?? ''),
          Number(p.resolvedAt ?? p.resolved_at ?? Date.now())
        )
      }
      break
    }
    case 'message.new':
      if (belongsToConfiguredLocomotive(msg.payload)) {
        useMessageStore.getState().addMessage(adaptMessage(msg.payload))
      }
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
