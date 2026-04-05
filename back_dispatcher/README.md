# back_dispatcher

Диспетчерский бэкенд, агрегирующий потоки телеметрии от множества локомотивов, вычисляющий здоровье и алерты, сохраняющий данные в TimescaleDB и обслуживающий диспетчерские клиенты через WebSocket.

## Возможности

- **Двойной режим инжеста** — WebSocket, Kafka или гибридный (`INGEST_MODE=ws|kafka|hybrid`)
- **Kafka consumer** — потребление событий из Kafka-топика с валидацией Event Envelope V1 и дедупликацией
- **WebSocket клиенты** — подключение к каждому локомотивному бэкенду с exponential backoff реконнектом
- **Rule Engine** — вычисление здоровья 6 подсистем с временными окнами (1с/5с/30с/10мин) и 11 правил алертов
- **Backpressure fan-out** — per-client очереди, latest-wins для телеметрии, ordered delivery для алертов
- **TimescaleDB персистенция** — хранение телеметрии, health snapshots, alert events, сообщений, команд
- **Replay API** — воспроизведение истории с 5 уровнями resolution (raw, 1s, 10s, 1m, 5m) и snapshot на момент времени
- **JWT-аутентификация** — Argon2 хеширование паролей, access + refresh токены, RBAC (admin/dispatcher/regular_train)
- **Управление пользователями** — CRUD через admin API, seed demo-пользователей при старте
- **Диспетчерский чат** — двусторонняя связь с машинистами, персистенция команд
- **Runtime-статистика** — метрики подключений, инжеста, broadcast, backpressure через `GET /api/health`

## Конфигурация

Основные переменные окружения:

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `DISPATCHER_HOST` | `0.0.0.0` | Хост сервера |
| `DISPATCHER_PORT` | `3010` | Порт сервера |
| `CORS_ORIGINS` | `*` | Разрешённые CORS origins |
| `API_KEY` | — | API-ключ для защиты эндпоинтов |
| `AUTH_TOKEN_SECRET` | — | Секрет для JWT-подписи |
| `INGEST_MODE` | `hybrid` | Режим инжеста: `ws`, `kafka`, `hybrid` |
| `LOCOMOTIVE_TARGETS` | `KTZ-2001=ws://localhost:3001/ws` | Целевые локомотивы (формат: `ID=URL,ID2=URL2`) |
| `KAFKA_BOOTSTRAP_SERVERS` | `kafka:9092` | Kafka брокеры |
| `KAFKA_TOPIC_EVENTS` | `ktz-events` | Kafka топик |
| `DATABASE_URL` | — | URL подключения к TimescaleDB |
| `TELEMETRY_RETENTION_HOURS` | `24` | Время хранения телеметрии в часах |
| `THRESHOLDS_FILE` | — | Путь к `thresholds.json` |

## Запуск

### Docker (рекомендуется)

```bash
# из корня проекта
./scripts/start_microservices.sh up
```

### Локально

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 3010 --reload
```

Требуется запущенный TimescaleDB и (опционально) Kafka.

Миграции БД:

```bash
alembic -c app/alembic.ini upgrade head
```

## REST API

| Маршрут | Назначение |
| --- | --- |
| `GET /ping` | Liveness check (публичный) |
| `GET /api/health` | Здоровье сервиса, runtime-статистика, backpressure |
| `GET /api/locomotives` | Список сконфигурированных локомотивов и статус подключения |
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

## WebSocket контракт

Маршрут: `WS /ws?apiKey=...` или `WS /ws?token=...`

### Входящие сообщения от клиента

**subscribe** — подписка на данные:

```json
{ "type": "subscribe", "payload": { "locomotiveId": "KTZ-2001" } }
```

`locomotiveId` = `"all"` или `"*"` для всех, конкретный ID для одного локомотива.

**dispatcher.chat** — отправка команды:

```json
{
  "type": "dispatcher.chat",
  "payload": { "locomotiveId": "KTZ-2001", "body": "Снизьте скорость до 80" }
}
```

### Исходящие типы сообщений

- `dispatcher.snapshot` — полный снимок при подключении
- `dispatcher.locomotive_status` — изменение статуса подключения локомотива
- `telemetry.frame` — фрейм телеметрии
- `health.update` — обновление индекса здоровья
- `alert.new` / `alert.update` / `alert.resolved` — жизненный цикл алертов
- `message.new` — новое сообщение

## Структура БД (TimescaleDB)

| Таблица | Назначение |
| --- | --- |
| `telemetry_points` | Временные ряды метрик |
| `health_snapshots` | Снимки индекса здоровья |
| `alert_events` | Лог жизненного цикла алертов |
| `incoming_messages` | Сообщения от локомотивов |
| `dispatcher_commands` | Команды от диспетчера |
| `users` | Пользователи системы |
| `auth_sessions` | JWT-сессии |
| `auth_audit_events` | Audit log аутентификации |
| `application_logs` | Логи приложения |

Миграции: 5 версий Alembic в `app/alembic/versions/`.

## Ссылки

- [../README.md](../README.md)
- [../docs/MICROSERVICES_DOCKER.md](../docs/MICROSERVICES_DOCKER.md)
- [../architecture.md](../architecture.md)
