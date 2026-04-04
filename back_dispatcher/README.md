# back_dispatcher

Dispatcher backend that connects to multiple locomotive backends over WebSocket, aggregates telemetry streams, and serves dispatcher clients over a single WebSocket endpoint.

## Features
- Connects to multiple locomotive WS endpoints with reconnect/backoff
- Broadcasts realtime `telemetry.frame` events to dispatcher clients
- Relays incoming locomotive messages as `message.new`
- Supports outbound dispatcher chat (`dispatcher.chat`) to a selected locomotive
- REST status endpoints for health and locomotive connection state

## Configuration
Environment variables:
- `DISPATCHER_HOST` (default: `0.0.0.0`)
- `DISPATCHER_PORT` (default: `3010`)
- `CORS_ORIGINS` (default: `*`)
- `LOCOMOTIVE_TARGETS` (default: `KTZ-2001=ws://localhost:3001/ws`)
- `RECONNECT_BASE_S` (default: `1`)
- `RECONNECT_MAX_S` (default: `30`)
- `PING_INTERVAL_S` (default: `20`)

`LOCOMOTIVE_TARGETS` format:
`LOCO_ID=ws://host:port/ws,LOCO_ID_2=ws://host:port/ws`

Example:
`LOCOMOTIVE_TARGETS=KTZ-2001=ws://localhost:3001/ws,KTZ-2002=ws://localhost:3002/ws`

## Run
```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 3010 --reload
```

## APIs
- `GET /ping`
- `GET /api/health`
- `GET /api/locomotives`
- `GET /api/locomotives/{locomotive_id}/latest-telemetry`
- `GET /api/locomotives/{locomotive_id}/chat`
- `WS  /ws` dispatcher clients

## Dispatcher WS contract
Incoming from dispatcher client:
```json
{
  "type": "dispatcher.chat",
  "payload": {
    "locomotiveId": "KTZ-2001",
    "body": "Reduce speed to 80"
  }
}
```

Outgoing to dispatcher client examples:
- `telemetry.frame`
- `message.new`
- `dispatcher.snapshot`
- `dispatcher.locomotive_status`
- `locomotive.event`
