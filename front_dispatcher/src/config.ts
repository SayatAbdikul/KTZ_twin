export const CONFIG = {
    WS_URL: import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001/ws',
    RECONNECT_BASE_MS: 1000,
    RECONNECT_MAX_MS: 30000,
    SPARKLINE_WINDOW: 120,
} as const
