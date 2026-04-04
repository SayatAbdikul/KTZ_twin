import { setupWorker } from 'msw/browser'
import { telemetryHandlers } from './handlers/telemetryHandlers'
import { healthHandlers } from './handlers/healthHandlers'
import { alertHandlers } from './handlers/alertHandlers'
import { messageHandlers } from './handlers/messageHandlers'
import { wsHandlers } from './ws/wsMockServer'

export const worker = setupWorker(
  ...telemetryHandlers,
  ...healthHandlers,
  ...alertHandlers,
  ...messageHandlers,
  ...wsHandlers
)
