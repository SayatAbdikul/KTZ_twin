# Docker Microservices стек

Стек развёртывает полную микросервисную систему:

- **kafka** — брокер сообщений для межсервисного стриминга событий (KRaft mode, без ZooKeeper)
- **timescaledb** — хранилище данных для replay-телеметрии, health snapshots, алертов, аутентификации
- **back_locomotive** — генерация синтетической телеметрии, публикация в Kafka, WebSocket broadcasting для фронтенда
- **back_dispatcher** — потребление из Kafka/WS, rule engine здоровья и алертов, replay API, аутентификация, fan-out
- **front_locomotive** — единый браузерный UI для оператора, диспетчера и администратора

## Файлы

- Compose-файл: `docker-compose.microservices.yml`
- Скрипт запуска: `scripts/start_microservices.sh`
- Переменные окружения: `.env.microservices`

## Использование

Запуск полного стека:

```bash
./scripts/start_microservices.sh up
```

Просмотр логов:

```bash
./scripts/start_microservices.sh logs
```

Остановка:

```bash
./scripts/start_microservices.sh down
```

Статус:

```bash
./scripts/start_microservices.sh ps
```

## Порты

| Сервис | Порт |
| --- | --- |
| kafka | `9092` (внешний: из `.env.microservices`) |
| timescaledb | `5433` |
| back_locomotive | `3001` |
| back_dispatcher | `3010` |
| front_locomotive | `5183` |

## Конфигурация

Скрипт запуска передаёт `.env.microservices` в Docker Compose.

Основные настройки:

- Порты и CORS origins бэкендов
- `INGEST_MODE` — режим инжеста диспетчера (`ws`, `kafka`, `hybrid`)
- Kafka: bootstrap servers, топик, партиции, replication factor
- TimescaleDB: `DATABASE_URL`, credentials
- `TELEMETRY_RETENTION_HOURS` — время хранения телеметрии
- `RECENT_TELEMETRY_MAX_MINUTES` — максимум минут для recent API
- Аутентификация: `API_KEY`, `AUTH_TOKEN_SECRET`, TTL токенов, demo-пользователи
- `PATTERN_FLEET_ENABLED` — включение 10 паттернов неисправностей
- Фронтенд: build-time API/WS endpoints (`VITE_*`)

## Слой данных диспетчера

Диспетчер сохраняет в TimescaleDB:

| Таблица | Назначение |
| --- | --- |
| `telemetry_points` | Временные ряды всех метрик |
| `health_snapshots` | Снимки индекса здоровья |
| `alert_events` | Полный лог жизненного цикла алертов |
| `incoming_messages` | Сообщения от локомотивов |
| `dispatcher_commands` | Команды диспетчера |
| `users` | Пользователи |
| `auth_sessions` | JWT-сессии |

Retention контролируется через `TELEMETRY_RETENTION_HOURS` (рекомендуется 24–72).

API недавней телеметрии:

- `GET /api/locomotives/{id}/telemetry/recent?minutes=5`
- `GET /api/locomotives/{id}/telemetry/recent?minutes=15&metricId=motion.speed`

Параметр `minutes` ограничен `RECENT_TELEMETRY_MAX_MINUTES` (по умолчанию 15).

Миграции Alembic в `back_dispatcher/app/alembic`. Запуск миграций:

```bash
alembic -c app/alembic.ini upgrade head
```

## Kafka партицирование

- Ключ партиции: `locomotive_id`
- Партиций по умолчанию: `100`

Это сохраняет порядок потока одного локомотива внутри одной партиции, распределяя ~1700 ожидаемых потоков по 100 партициям (~17 потоков на партицию).

Kafka может увеличивать количество партиций, но не может уменьшать. Если топик уже создан с большим количеством партиций, изменение env не уменьшит их.

## Примечания

- Фронтенд собирается в статические файлы и раздаётся через Nginx
- WebSocket/API-key подставляются при сборке образа
- Межсервисный трафик идёт через Docker-сеть
- `shared/thresholds.json` монтируется как volume в оба бэкенда — единая конфигурация порогов

## Event Envelope V1

Все WS-конверты включают метаданные `event` для валидации producer/consumer:

```json
{
  "event_id": "uuid",
  "event_type": "telemetry.frame",
  "source": "back_locomotive",
  "locomotive_id": "KTZ-2001",
  "occurred_at": 1710000000000,
  "schema_version": "1.0"
}
```

Диспетчер валидирует входящие конверты в WS и Kafka путях и отклоняет фреймы, если:

- отсутствует `event`
- `schema_version` не `1.0`
- `event_type` не совпадает с транспортным `type`
- `locomotive_id` не совпадает с целевым потоком
