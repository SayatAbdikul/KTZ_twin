import { setupWorker } from 'msw/browser'
import { telemetryHandlers } from './handlers/telemetryHandlers'
import { healthHandlers } from './handlers/healthHandlers'
import { alertHandlers } from './handlers/alertHandlers'
import { exportHandlers } from './handlers/exportHandlers'
import { messageHandlers } from './handlers/messageHandlers'
import { replayHandlers } from './handlers/replayHandlers'
import { wsHandlers } from './ws/wsMockServer'

export const worker = setupWorker(
  ...telemetryHandlers,
  ...healthHandlers,
  ...alertHandlers,
  ...exportHandlers,
  ...messageHandlers,
  ...replayHandlers,
  ...wsHandlers
)
