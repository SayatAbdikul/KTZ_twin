import { ws } from 'msw'
import { APP_CONFIG } from '@/config/app.config'
import { generateTelemetryFrame } from '../data/telemetryFixtures'
import { generateHealthIndex } from '../data/healthFixtures'
import { generateRandomAlert } from '../data/alertFixtures'
import { generateDispatcherMessage } from '../data/messageFixtures'

const locomotiveWs = ws.link(APP_CONFIG.WS_URL)
const MOCK_LOCOMOTIVE_IDS = ['KTZ-2001', 'KTZ-2002', 'KTZ-3107']

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
      for (const locomotiveId of MOCK_LOCOMOTIVE_IDS) {
        send(client, 'telemetry.frame', generateTelemetryFrame(locomotiveId))
      }
    }, APP_CONFIG.TELEMETRY_INTERVAL_MS)

    // Health every 5s
    const healthTimer = setInterval(() => {
      for (const locomotiveId of MOCK_LOCOMOTIVE_IDS) {
        send(client, 'health.update', generateHealthIndex(locomotiveId))
      }
    }, APP_CONFIG.HEALTH_INTERVAL_MS)

    // Random alert every 20-40s
    const alertTimer = setInterval(
      () => {
        if (Math.random() > 0.5) {
          const locomotiveId = MOCK_LOCOMOTIVE_IDS[Math.floor(Math.random() * MOCK_LOCOMOTIVE_IDS.length)]
          send(client, 'alert.new', generateRandomAlert(locomotiveId))
        }
      },
      20000 + Math.random() * 20000
    )

    // Random message every 60-120s
    const messageTimer = setInterval(
      () => {
        if (Math.random() > 0.7) {
          const locomotiveId = MOCK_LOCOMOTIVE_IDS[Math.floor(Math.random() * MOCK_LOCOMOTIVE_IDS.length)]
          send(client, 'message.new', generateDispatcherMessage(locomotiveId))
        }
      },
      60000 + Math.random() * 60000
    )

    // Heartbeat every 10s
    const heartbeatTimer = setInterval(() => {
      send(client, 'connection.heartbeat', { serverTime: Date.now() })
    }, APP_CONFIG.HEARTBEAT_INTERVAL_MS)

    // Dispatcher connected
    send(client, 'dispatcher.snapshot', {
      locomotives: MOCK_LOCOMOTIVE_IDS.map((locomotiveId, index) => ({
        locomotiveId,
        connected: true,
        hasTelemetry: true,
        lastSeenAt: Date.now() - index * 5000,
        reconnectAttempt: 0,
        wsUrl: `ws://mock/${locomotiveId}`,
      })),
    })
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
