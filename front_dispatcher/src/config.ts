export const CONFIG = {
    WS_URL: import.meta.env.VITE_WS_URL ?? 'ws://localhost:3010/ws',
    AUTH_API_BASE_URL: import.meta.env.VITE_AUTH_API_BASE_URL ?? 'http://localhost:3010',
    RECONNECT_BASE_MS: 1000,
    RECONNECT_MAX_MS: 30000,
    SPARKLINE_WINDOW: 120,
} as const
