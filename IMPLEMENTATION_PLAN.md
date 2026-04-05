# План реализации — KTZ Digital Twin

## Контекст

Хакатон-проект «Цифровой двойник: визуализация телеметрии локомотива» с критериями оценки:
- **Визуализация реального времени (35%)**: стриминг, health index, фильтрация шумов, обработка спайков
- **UI/UX (30%)**: интерактивные графики, карта, replay, тема, объяснимость
- **Архитектура бэкенда (25%)**: API, конфигурируемые пороги, аутентификация, Docker, персистенция
- **Качество демо (10%)**: архитектурная диаграмма, нагрузочный сценарий, экспорт

## Текущее состояние проекта

Проект полностью реализован и работает в Docker-стеке из 5 микросервисов. Ниже — статус по каждой фазе первоначального плана.

---

## ФАЗА 1 — Визуализация реального времени (35%)

### 1.1 Клиентское сглаживание шумов — РЕАЛИЗОВАНО

- `src/utils/smoothing.ts` — EMA (Exponential Moving Average)
- `src/features/settings/useSettingsStore.ts` — Zustand-стор настроек (`smoothingEnabled`, `smoothingAlpha`)
- `useTelemetryStore.ts` — `smoothedReadings` вычисляются параллельно с raw `currentReadings`
- `DynamicMetricRenderer.tsx` — отображает smoothed или raw в зависимости от настройки
- `TopBar.tsx` — toggle сглаживания

### 1.2 Зум графиков (dataZoom) — РЕАЛИЗОВАНО

- `LineChart.tsx` — ECharts `dataZoom` (inside + slider)
- `TimeRangeSelector.tsx` — пресеты 1м/5м/15м/1ч/All
- `TelemetryPage.tsx` — интегрирован `TimeRangeSelector`

---

## ФАЗА 2 — Объяснимость здоровья (35% + 30%)

### 2.1 Health Index Explainability — РЕАЛИЗОВАНО

**Бэкенд:**
- `SubsystemPenalty` модель в `models.py`
- `penalties` на каждой подсистеме, `topFactors` на `HealthIndex`
- `health.py` — пенальти вычисляются из threshold-нарушений, сортируются, top-5 прикрепляются

**Фронтенд:**
- `SubsystemPenalty` интерфейс в `types/health.ts`
- `healthAdapter.ts` — маппинг penalty-полей
- `HealthExplainer.tsx` — «Contributing Factors» карточка с пенальти
- `DashboardPage.tsx` — интегрирован `HealthExplainer`

---

## ФАЗА 3 — Страница Replay (35% + 30%)

### 3.1 Replay / History UI — РЕАЛИЗОВАНО

**Бэкенд (back_dispatcher):**
- TimescaleDB хранение: `telemetry_points`, `health_snapshots`, `alert_events`
- `GET /api/locomotives/{id}/replay/time-range` — диапазон данных
- `GET /api/locomotives/{id}/replay/range` — серии с resolution (raw, 1s, 10s, 1m, 5m)
- `GET /api/locomotives/{id}/replay/snapshot` — полный снимок на момент времени
- `repository.py` — SQL-запросы с `time_bucket` для агрегации

**Фронтенд:**
- `useReplayStore.ts` — Zustand-стор (`isPlaying`, `playbackSpeed`, `currentTimestamp`, `timeRange`, `historicalData`)
- `PlaybackControls.tsx` — Play/Pause, 1x/2x/5x/10x, skip ±10с
- `TimelineScrubber.tsx` — полоса прокрутки
- `ReplayChart.tsx` — ECharts график с маркером текущего момента
- `ReplayMetricSelector.tsx` — выбор метрик
- `ReplaySnapshotSummary.tsx` — здоровье + алерты на момент времени
- CSV и PDF экспорт replay-данных

---

## ФАЗА 4 — Архитектура бэкенда (25%)

### 4.1 Конфигурируемые пороги — РЕАЛИЗОВАНО

- `shared/thresholds.json` — единый конфигурационный файл, монтируется в оба бэкенда
- `GET /api/config/thresholds` — текущие пороги
- `PUT /api/config/thresholds` — обновление без перезапуска
- `config.py` — загрузка из файла, hot-reload

### 4.2 Docker Compose — РЕАЛИЗОВАНО

- `docker-compose.microservices.yml` — 5 сервисов (kafka, timescaledb, back_locomotive, back_dispatcher, front_locomotive)
- `back_locomotive/Dockerfile` — Python 3.12
- `back_dispatcher/Dockerfile` — Python 3.12 + Alembic миграции
- `front_locomotive/Dockerfile` — multi-stage (Node.js → Nginx)
- `scripts/start_microservices.sh` — one-command deploy
- `.env.microservices` — централизованная конфигурация

### 4.3 Аутентификация — РЕАЛИЗОВАНО

- JWT access + refresh токены (httpOnly cookie для refresh)
- Argon2 хеширование паролей
- RBAC: admin, dispatcher, regular_train
- WS auth: `?apiKey=...` или `?token=...`
- REST auth: `X-API-Key` заголовок или Bearer JWT
- Принудительная смена пароля при первом входе
- Admin: управление пользователями, сброс паролей
- Audit log аутентификации в TimescaleDB
- Seed demo-пользователей при старте

### 4.4 Backpressure fan-out диспетчера — РЕАЛИЗОВАНО

- Per-client asyncio-очереди в `ws_server.py`
- Телеметрия: latest-wins / coalesced delivery
- Алерты/сообщения: ordered, non-lossy
- Мониторинг глубины очередей и drop-метрик
- Runtime-статистика через `GET /api/health` → `runtimeStats`

### 4.5 Kafka интеграция — РЕАЛИЗОВАНО

- `back_locomotive/app/broker.py` — Kafka producer с идемпотентностью
- `back_dispatcher/app/kafka_consumer.py` — Consumer с валидацией Event Envelope V1
- Дедупликация через LRU (20 000 event_ids)
- Мониторинг consumer lag
- `INGEST_MODE=ws|kafka|hybrid`
- Партицирование по `locomotive_id`, 100 партиций

### 4.6 TimescaleDB — РЕАЛИЗОВАНО

- 9 таблиц (telemetry_points, health_snapshots, alert_events, incoming_messages, dispatcher_commands, users, auth_sessions, auth_audit_events, application_logs)
- Alembic миграции (5 версий)
- Retention через `TELEMETRY_RETENTION_HOURS`
- Replay API с 5 уровнями resolution

---

## ФАЗА 5 — Экспорт (10% + 30%)

### 5.1 Экспорт CSV + PDF — РЕАЛИЗОВАНО

**Бэкенд:**
- `GET /api/export/telemetry/csv` — StreamingResponse CSV
- `GET /api/export/alerts/csv` — экспорт алертов

**Фронтенд:**
- `exportCsv.ts` — клиентский CSV из sparkline-буферов
- `exportPdf.ts` — HTML → `window.print()` для PDF
- `ExportMenu.tsx` — dropdown «Export CSV» / «Print Report»
- Интегрирован в Dashboard, Telemetry, Alerts, Replay страницы

---

## ФАЗА 6 — Документация и качество демо (10%)

### 6.1 Документация — РЕАЛИЗОВАНО

- `README.md` — обзор проекта, стек, API, быстрый старт
- `architecture.md` — детальная архитектура и контракты
- `front_locomotive/README.md` — фронтенд-документация
- `back_dispatcher/README.md` — диспетчер-документация
- `docs/MICROSERVICES_DOCKER.md` — Docker-стек
- `docs/PRESENTATION.md` — презентация для жюри
- `docs/HEALTH_INDEX_RULES.md` — правила здоровья
- `docs/STRESS_TESTING.md` — методология нагрузочного тестирования
- `docs/TELEMETRY_SEEDING_DOCS.md` — документация генератора телеметрии
- `docs/CORE_TELEMETRY_SEEDING_DOCS.md` — документация core-генератора
- `docs/TARGET_TELEMETRY_ARCHITECTURE.md` — целевая архитектура для 1мс телеметрии

---

## Дополнительные реализованные возможности

Помимо первоначального плана, реализовано:

| Возможность | Описание |
| --- | --- |
| 10 паттернов неисправностей | KTZ-BRK-001 (тормоза) ... KTZ-MIX-010 (комбинированная), детерминированные профили |
| Карта Казахстана | Leaflet + OpenRailwayMap, 10 поездов, rail-aligned routing через Overpass API |
| SVG-схема TE33A | 8 интерактивных зон подсистем, hover-tooltip, click-детали |
| Диспетчерская консоль | Мониторинг парка, двусторонний чат, загрузка истории |
| Тёмная/светлая тема | ThemeToggle, адаптация всех компонентов |
| MSW mock mode | Полный набор mock-handlers для автономной фронтенд-разработки |

## Верификация

Запуск полного стека:

```bash
./scripts/start_microservices.sh up
```

Открыть `http://localhost:5183` — фронтенд.

Все критерии хакатона покрыты реализованной функциональностью.
