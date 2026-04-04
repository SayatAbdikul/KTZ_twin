import { ws } from 'msw'
import { APP_CONFIG } from '@/config/app.config'
import { generateTelemetryFrame } from '../data/telemetryFixtures'
import { generateHealthIndex } from '../data/healthFixtures'
import { generateRandomAlert } from '../data/alertFixtures'
import { generateDispatcherMessage } from '../data/messageFixtures'

const locomotiveWs = ws.link(APP_CONFIG.WS_URL)

let seqId = 0
function nextSeq() {
  return ++seqId
}

function send(client: { send: (data: string) => void }, type: string, payload: unknown) {
  client.send(
    JSON.stringify({
      type,
      payload,
      timestamp: Date.now(),
      sequenceId: nextSeq(),
    })
  )
}

export const wsHandlers = [
  locomotiveWs.addEventListener('connection', ({ client }) => {
    // Telemetry every 1s
    const telemetryTimer = setInterval(() => {
      send(client, 'telemetry.frame', generateTelemetryFrame())
    }, APP_CONFIG.TELEMETRY_INTERVAL_MS)

    // Health every 5s
    const healthTimer = setInterval(() => {
      send(client, 'health.update', generateHealthIndex())
    }, APP_CONFIG.HEALTH_INTERVAL_MS)

    // Random alert every 20-40s
    const alertTimer = setInterval(
      () => {
        if (Math.random() > 0.5) {
          send(client, 'alert.new', generateRandomAlert())
        }
      },
      20000 + Math.random() * 20000
    )

    // Random message every 60-120s
    const messageTimer = setInterval(
      () => {
        if (Math.random() > 0.7) {
          send(client, 'message.new', generateDispatcherMessage())
        }
      },
      60000 + Math.random() * 60000
    )

    // Heartbeat every 10s
    const heartbeatTimer = setInterval(() => {
      send(client, 'connection.heartbeat', { serverTime: Date.now() })
    }, APP_CONFIG.HEARTBEAT_INTERVAL_MS)

    // Dispatcher connected
    send(client, 'connection.status', {
      dispatcherStatus: 'connected',
    })

    client.addEventListener('close', () => {
      clearInterval(telemetryTimer)
      clearInterval(healthTimer)
      clearInterval(alertTimer)
      clearInterval(messageTimer)
      clearInterval(heartbeatTimer)
    })
  }),
]
