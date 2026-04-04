import type { WsMessage } from '@/types/websocket'
import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { useHealthStore } from '@/features/health/useHealthStore'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { useConnectionStore } from '@/features/connection/useConnectionStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { adaptDispatchChatMessage, useDispatchConsoleStore } from '@/features/dispatch-console/useDispatchConsoleStore'
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
    case 'dispatcher.snapshot': {
      const payload = msg.payload as { locomotives?: Array<Record<string, unknown>> }
      useFleetStore.getState().applyDispatcherSnapshot(
        (payload.locomotives ?? []).map((item) => ({
          locomotiveId: String(item['locomotiveId'] ?? item['locomotive_id'] ?? ''),
          wsUrl: item['wsUrl'] as string | undefined,
          connected: item['connected'] as boolean | undefined,
          lastSeenAt: (item['lastSeenAt'] ?? item['last_seen_at'] ?? null) as number | null,
          reconnectAttempt: (item['reconnectAttempt'] ?? item['reconnect_attempt'] ?? 0) as number,
          hasTelemetry: item['hasTelemetry'] as boolean | undefined,
        }))
      )
      break
    }
    case 'dispatcher.locomotive_status': {
      const payload = msg.payload as Record<string, unknown>
      useFleetStore.getState().applyConnectionStatus({
        locomotiveId: String(payload['locomotiveId'] ?? payload['locomotive_id'] ?? ''),
        wsUrl: payload['wsUrl'] as string | undefined,
        connected: payload['connected'] as boolean | undefined,
        lastSeenAt: (payload['lastSeenAt'] ?? payload['last_seen_at'] ?? null) as number | null,
        reconnectAttempt: (payload['reconnectAttempt'] ?? payload['reconnect_attempt'] ?? 0) as number,
      })
      break
    }
    case 'telemetry.frame':
      {
        const frame = adaptTelemetryFrame(msg.payload)
        useTelemetryStore.getState().applyFrame(frame)
        useFleetStore.getState().applyTelemetryFrame(frame)
      }
      break
    case 'health.update':
      {
        const index = adaptHealthIndex(msg.payload, msg.event?.locomotive_id)
        useHealthStore.getState().applyUpdate(index)
        useFleetStore.getState().applyHealthIndex(index)
      }
      break
    case 'alert.new':
      {
        const alert = adaptAlert(msg.payload, msg.event?.locomotive_id)
        useAlertStore.getState().addAlert(alert)
        const summary = useAlertStore.getState().summaryByLocomotive[alert.locomotiveId]
        useFleetStore
          .getState()
          .setAlertCount(alert.locomotiveId, summary?.totalActive ?? 0)
      }
      break
    case 'alert.update':
      {
        const alert = adaptAlert(msg.payload, msg.event?.locomotive_id)
        useAlertStore.getState().updateAlert(alert)
        const summary = useAlertStore.getState().summaryByLocomotive[alert.locomotiveId]
        useFleetStore
          .getState()
          .setAlertCount(alert.locomotiveId, summary?.totalActive ?? 0)
      }
      break
    case 'alert.resolved': {
      const p = msg.payload as {
        alertId?: string
        alert_id?: string
        resolvedAt?: number
        resolved_at?: number
        locomotiveId?: string
        locomotive_id?: string
      }
      const locomotiveId = String(p.locomotiveId ?? p.locomotive_id ?? msg.event?.locomotive_id ?? '')
      useAlertStore.getState().resolveAlert(
        locomotiveId,
        String(p.alertId ?? p.alert_id ?? ''),
        Number(p.resolvedAt ?? p.resolved_at ?? Date.now())
      )
      const summary = useAlertStore.getState().summaryByLocomotive[locomotiveId]
      useFleetStore
        .getState()
        .setAlertCount(locomotiveId, summary?.totalActive ?? 0)
      break
    }
    case 'message.new':
      useDispatchConsoleStore.getState().addChatMessage(adaptDispatchChatMessage(msg.payload, msg.event?.locomotive_id))
      useMessageStore.getState().addMessage(adaptMessage(msg.payload, msg.event?.locomotive_id))
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
