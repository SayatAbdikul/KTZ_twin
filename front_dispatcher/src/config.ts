export const CONFIG = {
    WS_URL: import.meta.env.VITE_WS_URL ?? 'ws://localhost:3010/ws',
    AUTH_API_BASE_URL: import.meta.env.VITE_AUTH_API_BASE_URL ?? 'http://localhost:3010',
    AUTH_REQUEST_TIMEOUT_MS: Number(import.meta.env.VITE_AUTH_REQUEST_TIMEOUT_MS ?? 20000),
    BOOTSTRAP_REFRESH_TIMEOUT_MS: Number(import.meta.env.VITE_BOOTSTRAP_REFRESH_TIMEOUT_MS ?? 25000),
    RECONNECT_BASE_MS: 1000,
    RECONNECT_MAX_MS: 30000,
    SPARKLINE_WINDOW: 120,
} as const
