# front_dispatcher

Lightweight dispatcher-side frontend for remote locomotive monitoring and communication.

## Features
- Realtime WebSocket connection to backend (`VITE_WS_URL`, default `ws://localhost:3001/ws`)
- Multi-locomotive monitor model (supports many locomotive IDs in incoming telemetry)
- Priority-oriented locomotive list (critical first)
- Detail panel for selected locomotive: speed, fuel, coolant temp, traction current, mini trends
- Dispatcher chat panel per locomotive (local echo + WS send)
- Connection status indicator with reconnect/backoff support

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Notes
- Current backend simulator emits one locomotive (`KTZ-2001`), but UI store and layout support multiple IDs once backend streams them.
- Chat send uses WebSocket event `dispatcher.chat` and local message echo.
- Current backend ignores unknown client WS message types, so outbound chat is frontend-ready but not yet persisted/acknowledged server-side.
