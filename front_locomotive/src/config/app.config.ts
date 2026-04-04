export const APP_CONFIG = {
  LOCOMOTIVE_ID: 'KTZ-2001',
  WS_URL: import.meta.env.VITE_WS_URL ?? 'ws://localhost:3010/ws',
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001',
  ENABLE_MOCKS: import.meta.env.VITE_ENABLE_MOCKS === 'true',

  // Update intervals (ms)
  TELEMETRY_INTERVAL_MS: 1000,
  HEALTH_INTERVAL_MS: 5000,
  HEARTBEAT_INTERVAL_MS: 10000,

  // Staleness threshold (ms)
  STALE_THRESHOLD_MS: 5000,

  // Sparkline buffer (last N readings at 1Hz = N seconds)
  SPARKLINE_BUFFER_SIZE: 60,

  // Chart throttle (ms between setOption calls)
  CHART_THROTTLE_MS: 1000,

  // WS reconnect
  WS_RECONNECT_BASE_MS: 1000,
  WS_RECONNECT_MAX_MS: 30000,
} as const
