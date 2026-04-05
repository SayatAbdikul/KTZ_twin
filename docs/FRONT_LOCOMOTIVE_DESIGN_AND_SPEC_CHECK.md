# Фронтенд локомотива: описание и проверка спецификации

## 1. Назначение

`front_locomotive` — единый UI реального времени для оператора локомотива, диспетчера и администратора.

Совмещает:
- WebSocket live-обновления для телеметрии, здоровья, алертов и сообщений
- REST-запросы для bootstrapping, истории, replay, аутентификации и управления пользователями
- Клиентский стейт (Zustand) для высокочастотного рендеринга UI

## 2. Стек технологий

- React 19 + TypeScript + Vite 8
- Tailwind CSS v4
- Zustand 5 — 10 клиентских сторов
- TanStack Query 5 — REST кэширование
- ECharts 6 (echarts-for-react) — графики и gauge
- Leaflet — карта
- React Router — навигация
- Lucide React — иконки
- MSW — mock mode (`VITE_ENABLE_MOCKS=true`)

## 3. Рантайм-архитектура

### 3.1 Композиция приложения

- Entry: `src/main.tsx` — bootstrap mocks (опционально) и mount
- Providers: `src/app/providers.tsx` — QueryClient
- Routing: `src/app/App.tsx` — страницы внутри AppShell
- Layout: `src/components/layout/AppShell.tsx` + Sidebar + TopBar

### 3.2 Поток данных

1. При монтировании `useWebSocketLifecycle` подключается к WS диспетчера
2. WS-клиент (`wsClient.ts`) подписывается на каналы
3. Входящие события маршрутизируются в `wsMessageRouter.ts`
4. Пейлоады адаптируются через 5 адаптеров (`services/adapters/*`) и записываются в Zustand-сторы
5. UI-компоненты читают сторы и ре-рендерятся
6. REST-данные загружаются через TanStack Query хуки

### 3.3 Домены стейта

| Стор | Назначение |
| --- | --- |
| `useConnectionStore` | Статус WS, heartbeat latency, реконнект |
| `useTelemetryStore` | Текущие и сглаженные показания, sparkline + trend буферы |
| `useHealthStore` | Индекс здоровья по локомотивам |
| `useAlertStore` | Жизненный цикл алертов, severity summary |
| `useMessageStore` | Диспетчерские сообщения, непрочитанные |
| `useFleetStore` | Реестр локомотивов, сводки |
| `useReplayStore` | Состояние воспроизведения истории |
| `useSettingsStore` | Настройки (сглаживание, alpha) |
| `useDispatchConsoleStore` | Чат-история диспетчерской консоли |
| `useAuthStore` | Сессия, токены, роль |

### 3.4 Устойчивость соединения

- Реконнект с exponential backoff
- Индикатор статуса соединения в TopBar
- Heartbeat latency tracking
- EMA-сглаживание для устранения визуального дрожания
- Автоотключение при невалидном токене (WS код 1008)

## 4. Страницы UI

### Dashboard (Панель состояния парка)
- Fleet Health Cards — здоровье, скорость, топливо, алерты для каждого локомотива
- Health Gauge — анимированный ECharts gauge (0–100)
- Subsystem Bars — индексы 6 подсистем
- Health Explainer — Top-5 Contributing Factors
- Alert Feed — последние алерты
- Live Metrics — карточки метрик по группам
- Dispatcher Inbox — сообщения
- Export Menu — CSV телеметрии, CSV алертов, PDF-отчёт

### Телеметрия
- DynamicMetricRenderer с sparkline
- EMA-сглаживание (toggle в TopBar)
- LineChart с dataZoom (inside + slider)
- TimeRangeSelector — пресеты 1м/5м/15м/1ч/All
- CSV-экспорт

### Схема локомотива (Diagram)
- Интерактивная SVG-схема TE33A с 8 зонами
- Hover — tooltip с метриками и статусом
- Click — детальная боковая панель
- Цветовая кодировка по health status
- Escape — закрытие панели

### Карта (Map)
- Leaflet + OpenStreetMap + OpenRailwayMap
- 10 поездов с уникальными цветами
- Rail-aligned routing через Overpass API
- Trail полилинии, popup, боковая панель

### Алерты (Alerts)
- Жизненный цикл: active → acknowledged → resolved
- Severity: critical/warning/info
- CSV-экспорт

### Сообщения (Messages)
- Диспетчерские сообщения
- Прочтение / подтверждение
- Badge непрочитанных в sidebar

### Replay (История)
- TimelineScrubber — полоса прокрутки
- PlaybackControls — Play/Pause, 1x/2x/5x/10x, skip ±10с
- ReplayChart с маркером текущего момента
- ReplayMetricSelector — выбор метрик
- ReplaySnapshotSummary — здоровье + алерты на момент времени
- Resolution: raw, 1s, 10s, 1m, 5m
- CSV и PDF экспорт

### Диспетчерская консоль
- Список локомотивов с телеметрией
- Двусторонний чат
- Загрузка истории чата
- Роли: admin, dispatcher

### Управление пользователями
- CRUD пользователей (admin)
- Роли: admin, dispatcher, regular_train
- Привязка к locomotive_id
- Деактивация/активация

### Аутентификация
- Login Page
- Change Password Page (принудительная смена при первом входе)
- JWT access + refresh (httpOnly cookie)

## 5. Проверка требований

### Визуализация реального времени (35%)
- WS/SSE 1Hz: **Реализовано** — WebSocket 1 Hz телеметрия + 5с health
- Буферизация/сглаживание: **Реализовано** — EMA сглаживание, sparkline + trend буферы
- Reconnect/индикатор: **Реализовано** — exponential backoff, ConnectionIndicator

### UI/UX (30%)
- Единый дашборд с health: **Реализовано** — Fleet Health Cards + HealthGauge
- Интерактивные графики: **Реализовано** — ECharts dataZoom, TimeRangeSelector
- Карта: **Реализовано** — Leaflet + OpenRailwayMap + rail alignment
- Тема: **Реализовано** — ThemeToggle (тёмная/светлая)
- Replay: **Реализовано** — полная страница с TimescaleDB

### Health Index (35%)
- Формула с весами/штрафами: **Реализовано** — backend + frontend explainability
- Метки категорий: **Реализовано** — normal/degraded/warning/critical
- Top-5 contributing factors: **Реализовано** — HealthExplainer с штрафами

### Архитектура бэкенда (25%)
- Микросервисная архитектура: **Реализовано** — 5 Docker-сервисов
- Event bus: **Реализовано** — Kafka
- REST + WS: **Реализовано** — 25+ REST + 2 WS
- Конфигурируемые пороги: **Реализовано** — `PUT /api/config/thresholds`
- Аутентификация: **Реализовано** — JWT + Argon2 + RBAC

### Качество демо (10%)
- Экспорт: **Реализовано** — CSV + PDF
- Архитектурная документация: **Реализовано** — architecture.md, docs/
- Docker: **Реализовано** — one-command deploy
