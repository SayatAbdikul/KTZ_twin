export const CONFIG = {
    WS_URL: import.meta.env.VITE_WS_URL ?? 'ws://localhost:3010/ws',
    API_KEY: import.meta.env.VITE_API_KEY ?? 'ktz-demo-key',
    RECONNECT_BASE_MS: 1000,
    RECONNECT_MAX_MS: 30000,
    SPARKLINE_WINDOW: 120,
} as const
