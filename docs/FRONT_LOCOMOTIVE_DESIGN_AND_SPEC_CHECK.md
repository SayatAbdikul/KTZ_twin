# Front Locomotive: Design Description and Spec Check

## 1) Purpose
`front_locomotive` is a realtime operator-facing cockpit UI for one locomotive.
It combines:
- WebSocket live updates for telemetry, health, alerts, and dispatcher messages
- REST bootstrap/history endpoints
- Local client state (Zustand) for high-frequency UI rendering

## 2) Technical Stack
- React 19 + TypeScript + Vite
- Tailwind CSS v4 for styling
- Zustand for client-side stores
- TanStack Query for REST fetching/caching
- ECharts (via echarts-for-react) for charts
- React Router for page navigation
- MSW for mock mode support (`VITE_ENABLE_MOCKS=true`)

## 3) Runtime Architecture

### 3.1 App Composition
- Entry: `src/main.tsx` bootstraps mocks (optional) and mounts app.
- Providers: `src/app/providers.tsx` sets QueryClient defaults.
- Routing: `src/app/App.tsx` configures pages inside a common shell.
- Layout: `src/components/layout/AppShell.tsx` + sidebar + topbar.

### 3.2 Data Flow
1. On app mount, `useWebSocketLifecycle` connects to backend WS.
2. WS client (`src/services/websocket/wsClient.ts`) subscribes to channels.
3. Incoming events are parsed/routed in `wsMessageRouter.ts`.
4. Routed payloads are adapted (`src/services/adapters/*`) and committed to Zustand stores.
5. UI components read store slices and re-render.
6. Initial REST data is fetched via Query hooks in feature modules.

### 3.3 State Domains
- Connection store: backend/dispatcher status, heartbeat latency, reconnect attempts
- Telemetry store: latest metric readings + short sparkline buffers
- Health store: overall health index + subsystem statuses
- Alerts store: active alerts + severity summary
- Dispatcher messages store: inbox + unread counters

### 3.4 Realtime Resilience
Implemented:
- Reconnect with exponential backoff (`WS_RECONNECT_BASE_MS` → `WS_RECONNECT_MAX_MS`)
- Explicit connection status indicators in top bar
- Heartbeat latency tracking

Not implemented yet:
- Client-side deduplication
- Noise smoothing (EMA/median)
- Burst buffering strategy for x10 event storms

## 4) UI Information Design
Main pages:
- Dashboard: health gauge, subsystem bars, alert feed, key metrics, dispatcher inbox
- Telemetry: grouped metric cards by domain (motion/fuel/thermal/pressure/electrical)
- Alerts: active alert list with severity summary
- Messages: dispatcher message list + acknowledge action
- Replay: placeholder only (not yet functional)

Visual language:
- Dark industrial palette
- Dense control-panel layout
- Compact sidebar navigation with badge counters

## 5) Health Index in Current Frontend
Current frontend only renders backend-calculated health index and subsystems.
There is no client-visible formula UI yet for:
- parameter weights
- normalization rules
- alert penalties
- top-5 contributors/explainability panel

## 6) Requirement-by-Requirement Check

### 6.1 Frontend (UI/UX)
- Unified cockpit with large health widget: **PARTIAL** (Dashboard exists, health gauge visible)
- Required panels (speed/fuel/pressure-temp/electrical/alerts/trends): **PARTIAL**
  - speed/fuel/thermal/pressure/electrical and alerts are present
  - explicit trends dashboard section is limited
- Interactive charts with autoscale/tooltips/zoom last N min: **PARTIAL**
  - charts exist, but full zoom/time-window controls are not consistently exposed
- Route/track map with position/restrictions: **MISSING**
- Light/dark theme + responsive 24" and laptop: **PARTIAL**
  - responsive layout exists, no explicit theme switch
- Accessibility (contrast/font size/hints): **PARTIAL**

### 6.2 Realtime & Data
- WS/SSE 1Hz+: **DONE** (WS at 1Hz telemetry in backend)
- Buffering/smoothing/dedup/validation: **PARTIAL** (basic buffering only)
- Reconnect/backoff/no-connection indicator: **DONE**

### 6.3 Health Index
- Transparent formula with weights/penalties: **MISSING (frontend explanation)**
- Category labels (Норма/Внимание/Критично): **PARTIAL**
  - score shown; category wording may not be consistently explicit in UI
- Explainability top-5 factors: **MISSING**

### 6.4 Backend & Architecture (as visible from integration points)
- Microservice style telemetry pipeline: **PARTIAL** (modular single service)
- Event bus/queue: **PARTIAL (simulated internal broadcaster)**
- REST for history/threshold config + WS online: **PARTIAL**
  - history endpoint exists
  - threshold config API not exposed in frontend integration
- Short-term storage 24–72h: **PARTIAL** (in-memory ring buffer)
- Configurable thresholds without recompilation: **PARTIAL** (config-driven but static file)
- Logs/metrics/health-check: **PARTIAL** (health route/logging present, limited metrics)

### 6.5 Non-functional
- UI latency <500 ms in demo: **LIKELY**, not benchmarked in frontend docs
- Highload x10 without UI degradation: **NOT VERIFIED**
- Basic auth/restricted settings: **MISSING**
- OpenAPI/arch diagram: **PARTIAL** (backend likely exposes OpenAPI, no consolidated arch diagram in frontend docs)

## 7) Highest-Priority Gaps
1. Replay/history UX is placeholder only.
2. Map/track visualization is absent.
3. Health explainability (formula + top contributors) is absent.
4. Highload controls (smoothing/dedup/backpressure) are incomplete on frontend side.
5. Auth and settings access control are absent.

## 8) Suggested Roadmap
- Phase A: complete replay UI (5–15 min scrub + event markers + CSV export)
- Phase B: health explainability panel (weights, penalties, top-5 contributors)
- Phase C: route map widget with position + restriction overlays
- Phase D: robustness features (EMA/median, dedup keys, burst buffering)
- Phase E: auth + role-gated threshold/settings screens
