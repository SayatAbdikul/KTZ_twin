# Архитектура KTZ Digital Twin

Документ описывает текущую систему в кодовой базе: ответственности сервисов, рантайм-топологию, HTTP- и WebSocket-контракты, телеметрический и health-контракты.

## 1. Обзор системы

Текущие сервисы (Docker Compose):

1. `kafka` — брокер сообщений (KRaft mode, без ZooKeeper)
2. `timescaledb` — хранилище временных рядов
3. `back_locomotive` — симулятор телеметрии, Kafka producer, REST/WS API
4. `back_dispatcher` — Kafka/WS инжест, rule engine, TimescaleDB, аутентификация, fan-out
5. `front_locomotive` — единый React UI (оператор, диспетчер, администратор)

Рантайм-топология:

```text
front_locomotive --REST/WS--> back_locomotive --Kafka--> back_dispatcher --TimescaleDB
front_locomotive --Replay REST---------------> back_dispatcher
front_locomotive --Dispatcher WS-------------> back_dispatcher
```

`front_dispatcher` — устаревший автономный диспетчерский фронтенд, не используется в текущем Docker-стеке.

## 2. Ответственности сервисов

### 2.1 `back_locomotive`

Путь: `back_locomotive/`

Текущие обязанности:

- Физический симулятор телеметрии (14 метрик, 5 групп, 4-фазный цикл движения)
- 10 детерминированных профилей неисправностей (KTZ-BRK-001 ... KTZ-MIX-010)
- Генерация здоровья подсистем с SubsystemPenalty и top-5 contributing factors
- Генерация алертов и сообщений
- Kafka producer с идемпотентностью и автосозданием топика
- REST API (8 роутеров, 16+ эндпоинтов)
- WebSocket broadcasting телеметрии, здоровья, алертов, сообщений, heartbeat
- Экспорт CSV телеметрии и алертов

6 фоновых задач при старте:
1. Телеметрия — каждую 1с
2. Здоровье — каждые 5с
3. Heartbeat — каждые 10с
4. Случайные алерты
5. Случайные сообщения
6. Kafka producer

### 2.2 `back_dispatcher`

Путь: `back_dispatcher/`

Текущие обязанности:

- **Двойной режим инжеста**: WebSocket, Kafka или гибридный (`INGEST_MODE=ws|kafka|hybrid`)
- **Kafka consumer**: потребление событий из Kafka с валидацией Event Envelope V1 и дедупликацией (LRU 20 000 event_ids)
- **WebSocket клиенты**: подключение к каждому локомотивному бэкенду с exponential backoff
- **Rule Engine**: вычисление здоровья 6 подсистем с временными окнами (1с/5с/30с/10мин) и 11 правил алертов
- **Backpressure fan-out**: per-client очереди, latest-wins для телеметрии, ordered delivery для алертов
- **TimescaleDB**: хранение телеметрии, health snapshots, alert events, сообщений, команд
- **Replay API**: воспроизведение с 5 уровнями resolution (raw, 1s, 10s, 1m, 5m) и snapshot на момент времени
- **JWT-аутентификация**: Argon2 хеширование, access + refresh токены, RBAC (admin/dispatcher/regular_train)
- **Управление пользователями**: CRUD через admin API, seed demo-пользователей при старте
- **Диспетчерский чат**: двусторонняя связь с машинистами, персистенция команд
- **Runtime-статистика**: метрики подключений, инжеста, broadcast, backpressure через `GET /api/health`

### 2.3 `front_locomotive`

Путь: `front_locomotive/`

Единое React-приложение (11 страниц):

- **Dashboard** — здоровье парка, подсистемы, contributing factors, алерты, live-метрики, экспорт
- **Телеметрия** — карточки метрик с sparkline, EMA-сглаживание, тренд-графики с dataZoom
- **Алерты** — лента с жизненным циклом, CSV-экспорт
- **Сообщения** — диспетчерские сообщения с прочтением/подтверждением
- **Схема** — интерактивная SVG-схема TE33A с 8 зонами
- **Карта** — Leaflet + OpenRailwayMap, 10 поездов на ж/д путях Казахстана
- **Replay** — воспроизведение из TimescaleDB с timeline, playback 1x–10x, snapshot
- **Диспетчерская консоль** — мониторинг парка и двусторонний чат
- **Управление пользователями** — CRUD (admin)
- **Логин** — JWT-аутентификация
- **Смена пароля** — принудительная смена при первом входе

Конфигурация:
- `VITE_WS_URL` — WebSocket URL диспетчера
- `VITE_API_BASE_URL` — REST API бэкенда локомотива
- `VITE_REPLAY_API_BASE_URL` — REST API бэкенда диспетчера (replay)
- `VITE_AUTH_API_BASE_URL` — REST API аутентификации
- `VITE_ENABLE_MOCKS` — MSW mock mode

10 Zustand-сторов: Connection, Telemetry, Health, Alert, Message, Fleet, Replay, Settings, DispatchConsole, Auth.

## 3. Стандартный WebSocket-конверт

Используется обоими бэкендами:

```json
{
  "type": "telemetry.frame",
  "payload": {},
  "timestamp": 1710000000000,
  "sequenceId": 42
}
```

Поля:
- `type` — тип сообщения
- `payload` — тело сообщения
- `timestamp` — время отправки (epoch ms)
- `sequenceId` — монотонный счётчик на процесс

### 3.1 Event Envelope V1

Для inter-service стриминга (Kafka и WS) все конверты включают метаданные `event`:

```json
{
  "event_id": "f4f2e5d2-c0cb-4f8f-a9e8-5ccf3d2b2d8b",
  "event_type": "telemetry.frame",
  "source": "back_locomotive",
  "locomotive_id": "KTZ-2001",
  "occurred_at": 1710000000000,
  "schema_version": "1.0"
}
```

Обязательные поля:
- `event_id` — UUID для дедупликации и трейсинга
- `event_type` — логический тип (должен совпадать с `type` транспортного конверта)
- `source` — имя сервиса-продюсера
- `locomotive_id` — ключ сущности для роутинга и упорядочивания
- `occurred_at` — время создания события (epoch ms)
- `schema_version` — версия контракта, сейчас `1.0`

Правила валидации:
- Продюсер всегда эмитит `event` с `schema_version=1.0`
- Консьюмер отклоняет фреймы без `event`
- Консьюмер отклоняет неподдерживаемые `schema_version`
- Консьюмер отклоняет несовпадение `event_type` с `type`
- Консьюмер отклоняет несовпадение `locomotive_id` с целевым потоком

Валидация применяется в обоих путях — WS-инжесте и Kafka-инжесте диспетчера.

## 4. Контракты `back_locomotive`

### 4.1 HTTP-маршруты

| Маршрут | Назначение |
| --- | --- |
| `GET /ping` | Liveness check (публичный) |
| `GET /api/telemetry/current` | Текущий фрейм телеметрии |
| `GET /api/telemetry/metrics` | Определения метрик и пороги |
| `GET /api/telemetry/history/{metric_id}` | In-memory история метрики |
| `GET /api/health` | Текущий индекс здоровья подсистем |
| `GET /api/alerts` | Лента алертов |
| `POST /api/alerts/{alert_id}/acknowledge` | Подтверждение алерта |
| `GET /api/messages` | Лента сообщений |
| `POST /api/messages/{message_id}/read` | Отметить сообщение прочитанным |
| `POST /api/messages/{message_id}/acknowledge` | Подтвердить сообщение |
| `GET /api/connection/status` | Статус подключения |
| `GET /api/config/thresholds` | Текущие пороговые значения |
| `PUT /api/config/thresholds` | Обновить пороги без перезапуска |
| `GET /api/export/telemetry/csv` | Экспорт телеметрии в CSV |
| `GET /api/export/alerts/csv` | Экспорт алертов в CSV |
| `GET /api/replay/snapshot` | In-memory снимок replay |

### 4.2 WebSocket-маршрут

Маршрут: `WS /ws?apiKey=...`

Входящие сообщения от клиента:
- `subscribe`
- `heartbeat.ack`

Исходящие типы:
- `connection.status`
- `telemetry.frame`
- `health.update`
- `connection.heartbeat`
- `alert.new`
- `alert.update`
- `alert.resolved`
- `message.new`

### 4.3 Телеметрический контракт

Текущая форма пейлоада `telemetry.frame`:

```json
{
  "locomotiveId": "KTZ-2001",
  "frameId": "frame-123",
  "timestamp": 1710000000000,
  "readings": [
    {
      "metricId": "motion.speed",
      "value": 80,
      "unit": "km/h",
      "timestamp": 1710000000000,
      "quality": "good"
    }
  ]
}
```

14 метрик (5 групп):

| Группа | Метрики |
| --- | --- |
| motion | `speed`, `acceleration`, `distance` |
| fuel | `level`, `consumption_rate` |
| thermal | `coolant_temp`, `oil_temp`, `exhaust_temp` |
| pressure | `brake_main`, `brake_pipe`, `oil` |
| electrical | `traction_voltage`, `traction_current`, `battery_voltage` |

### 4.4 Health-контракт

Пейлоад `health.update` от `back_locomotive`:

```json
{
  "locomotiveId": "KTZ-2001",
  "overallHealth": 74,
  "timestamp": 1710000000000,
  "subsystems": [
    {
      "subsystemId": "brakes",
      "label": "Brakes",
      "healthScore": 52.0,
      "status": "warning",
      "activeAlertCount": 1,
      "lastUpdated": 1710000000000,
      "penalties": [
        {
          "metricId": "pressure.brake_pipe",
          "metricLabel": "Brake Pipe Pressure",
          "currentValue": 3.2,
          "thresholdType": "criticalLow",
          "thresholdValue": 3.5,
          "penaltyPoints": 15.0
        }
      ]
    }
  ],
  "topFactors": [...]
}
```

6 подсистем: `engine`, `brakes`, `electrical`, `fuel`, `cooling`, `pneumatic`.

Статусы: `normal` (80+), `degraded` (60–79), `warning` (40–59), `critical` (<40).

## 5. Контракты `back_dispatcher`

### 5.1 HTTP-маршруты

| Маршрут | Назначение |
| --- | --- |
| `GET /ping` | Liveness check (публичный) |
| `GET /api/health` | Здоровье сервиса, runtime-статистика, backpressure |
| `GET /api/locomotives` | Сконфигурированные локомотивы и статус подключения |
| `GET /api/locomotives/{id}/latest-telemetry` | Последний полученный фрейм телеметрии |
| `GET /api/locomotives/{id}/chat` | История чата диспетчера |
| `GET /api/locomotives/{id}/telemetry/recent` | Недавняя телеметрия из TimescaleDB |
| `GET /api/locomotives/{id}/replay/time-range` | Диапазон доступных replay-данных |
| `GET /api/locomotives/{id}/replay/range` | Исторические серии с контролем resolution |
| `GET /api/locomotives/{id}/replay/snapshot` | Полный снимок на момент времени |
| `POST /api/auth/login` | Аутентификация |
| `POST /api/auth/refresh` | Обновление JWT-токена |
| `GET /api/auth/me` | Текущий пользователь |
| `POST /api/auth/change-password` | Смена пароля |
| `POST /api/auth/logout` | Выход |
| `GET /api/admin/users` | Список пользователей (admin) |
| `POST /api/admin/users` | Создание пользователя (admin) |
| `PUT /api/admin/users/{id}` | Обновление пользователя (admin) |
| `POST /api/admin/users/{id}/reset-password` | Сброс пароля (admin) |

### 5.2 WebSocket-маршрут диспетчера

Маршрут: `WS /ws?apiKey=...` или `WS /ws?token=...`

#### Входящие сообщения

**subscribe** — подписка на данные:

```json
{ "type": "subscribe", "payload": { "locomotiveId": "KTZ-2001" } }
```

`locomotiveId` = `"all"` или `"*"` для всех, конкретный ID для одного локомотива.

**dispatcher.chat** — отправка команды:

```json
{
  "type": "dispatcher.chat",
  "payload": {
    "locomotiveId": "KTZ-2001",
    "body": "Снизьте скорость до 80 км/ч"
  }
}
```

Поведение:
- Диспетчер сохраняет сообщение в базу данных и in-memory историю
- Пытается переслать на WebSocket соответствующего локомотива
- Бродкастит `message.new` подписчикам

#### Исходящие типы

- `dispatcher.snapshot` — полный снимок при подключении
- `dispatcher.locomotive_status` — изменение статуса подключения
- `telemetry.frame` — фрейм телеметрии
- `health.update` — обновление здоровья (вычисляется rule engine)
- `alert.new` / `alert.update` / `alert.resolved` — жизненный цикл алертов
- `message.new` — новое сообщение

### 5.3 Rule Engine

Файл: `back_dispatcher/app/health_engine.py`

Логика:
1. Принимает `telemetry.frame`
2. Конвертирует `readings[]` в карту метрик
3. Хранит роллинг-историю в памяти
4. Вычисляет здоровье по 4 доменам:
   - Тормоза (вес 0.40)
   - Термика (вес 0.25)
   - Трансмиссия (вес 0.20)
   - Неисправности (вес 0.15)
5. Генерирует алерты по 11 правилам с temporal windows (1с/5с/30с/10мин)

### 5.4 Backpressure fan-out

Реализация в `back_dispatcher/app/ws_server.py`:

- Per-client очереди с asyncio
- Телеметрия: latest-wins / coalesced delivery
- Алерты и статусы: ordered, non-lossy
- Мониторинг глубины очередей и dropped-сообщений
- Статистика через `GET /api/health` → `runtimeStats`

### 5.5 Структура БД (TimescaleDB)

| Таблица | Назначение |
| --- | --- |
| `telemetry_points` | Временные ряды метрик (hypertable) |
| `health_snapshots` | Снимки индекса здоровья |
| `alert_events` | Лог жизненного цикла алертов |
| `incoming_messages` | Сообщения от локомотивов |
| `dispatcher_commands` | Команды от диспетчера |
| `users` | Пользователи системы |
| `auth_sessions` | JWT-сессии |
| `auth_audit_events` | Audit log аутентификации |
| `application_logs` | Логи приложения |

Миграции: 5 версий Alembic в `back_dispatcher/app/alembic/versions/`.

Retention: контролируется через `TELEMETRY_RETENTION_HOURS` (рекомендуется 24–72).

## 6. Фронтенд-контракты

### 6.1 Потребляемые WS-типы

Определены в `front_locomotive/src/types/websocket.ts`:

- `telemetry.frame`
- `health.update`
- `alert.new`
- `alert.update`
- `alert.resolved`
- `message.new`
- `connection.heartbeat`
- `connection.status`
- `dispatcher.snapshot`
- `dispatcher.locomotive_status`

### 6.2 Поток данных фронтенда

1. `useWebSocketLifecycle` подключается к WS диспетчера
2. `wsClient.ts` подписывается на каналы
3. Входящие события маршрутизируются через `wsMessageRouter.ts`
4. Пейлоады адаптируются через 5 адаптеров (`services/adapters/*`) и записываются в Zustand-сторы
5. UI-компоненты читают сторы и ре-рендерятся
6. REST-данные загружаются через TanStack Query хуки

### 6.3 Особенности UI

- Dashboard и Diagram используют `health.update` subsystem IDs для цветовой кодировки зон
- Панель деталей фильтрует алерты по `alert.source === zone.subsystemId`
- EMA-сглаживание устраняет визуальное дрожание (toggle в TopBar)
- Sparkline и trend-буферы для высокочастотного рендеринга
- Тёмная и светлая темы

## 7. Kafka-контракт

- Топик: `ktz-events` (конфигурируется через `KAFKA_TOPIC_EVENTS`)
- Ключ партиции: `locomotive_id`
- Партиций по умолчанию: `100`
- Producer: `back_locomotive` с идемпотентностью (`enable.idempotence=true`)
- Consumer: `back_dispatcher` с валидацией Event Envelope V1 и мониторингом лага

Kafka может увеличивать количество партиций, но не может уменьшать.

## 8. Docker / Compose

Файл: `docker-compose.microservices.yml`
Конфигурация: `.env.microservices`
Скрипт: `scripts/start_microservices.sh`

5 сервисов:
- `kafka` — Apache Kafka (KRaft mode)
- `timescaledb` — TimescaleDB/PostgreSQL
- `back_locomotive` — Python 3.12 / FastAPI
- `back_dispatcher` — Python 3.12 / FastAPI (зависит от kafka, timescaledb)
- `front_locomotive` — Nginx (multi-stage build: Node.js → Nginx)

Порты: kafka `9092`, timescaledb `5433`, back_locomotive `3001`, back_dispatcher `3010`, front_locomotive `5183`.

`shared/thresholds.json` монтируется как volume в оба бэкенда для единой конфигурации порогов.

## 9. Телеметрические контракты

### 9.1 Текущий live-контракт

Текущий рантайм использует симуляторный фрейм из `back_locomotive` с 14 метриками в UI-ориентированном формате (`metricId`, `value`, `unit`, `quality`).

Поток:
```text
back_locomotive simulator → telemetry.frame → Kafka → back_dispatcher → frontends
```

### 9.2 Целевой raw-контракт

Целевая raw-телеметрия описана в:
- `docs/CORE_TELEMETRY_SEEDING_DOCS.md`
- `docs/HEALTH_INDEX_RULES.md`

Сокращённый набор сигналов: `speed_kmh`, `adhesion_coeff`, `traction_current_a`, `brake_pipe_pressure_bar`, `brake_cylinder_pressure_bar`, `traction_motor_temp_c`, `bearing_temp_c`, `fault_code`, `catenary_voltage_kv`, `transformer_temp_c`, `fuel_level_l`, `fuel_rate_lph`, `oil_pressure_bar`, `coolant_temp_c`.

Текущий симулятор эмитит UI-метрики, не raw-контракт. Маппинг между raw-сигналами и UI-метриками реализуется в rule engine диспетчера.

## 10. Индекс ключевых файлов

| Файл | Назначение |
| --- | --- |
| `back_locomotive/app/main.py` | Точка входа, 6 фоновых задач, 8 роутеров |
| `back_locomotive/app/simulator/telemetry.py` | Физический симулятор, 10 FaultPatternProfiles |
| `back_locomotive/app/simulator/health.py` | Health engine с SubsystemPenalty |
| `back_locomotive/app/broker.py` | Kafka producer |
| `back_locomotive/app/ws/broadcaster.py` | WS broadcasting |
| `back_dispatcher/app/main.py` | Точка входа, dual ingest, JWT WS auth |
| `back_dispatcher/app/health_engine.py` | Rule engine, 4 домена, 11 правил алертов |
| `back_dispatcher/app/kafka_consumer.py` | Kafka consumer, валидация, дедупликация |
| `back_dispatcher/app/ws_server.py` | Backpressure fan-out |
| `back_dispatcher/app/repository.py` | TimescaleDB, replay queries, resolution buckets |
| `back_dispatcher/app/auth.py` | JWT + Argon2, RBAC, audit |
| `front_locomotive/src/services/websocket/wsClient.ts` | WS-клиент с auto-reconnect |
| `front_locomotive/src/services/websocket/wsMessageRouter.ts` | Роутер 10 типов событий |
| `front_locomotive/src/features/telemetry/useTelemetryStore.ts` | Стор телеметрии с smoothed readings |
| `front_locomotive/src/config/diagram.config.ts` | 8 SVG-зон схемы TE33A |
| `front_locomotive/src/config/metrics.config.ts` | 14 определений метрик с порогами |
