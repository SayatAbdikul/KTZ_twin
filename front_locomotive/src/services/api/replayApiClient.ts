import { APP_CONFIG } from '@/config/app.config'
import { createApiClient } from './apiClient'

export const replayApiClient = createApiClient(APP_CONFIG.REPLAY_API_BASE_URL)
