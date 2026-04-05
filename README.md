# KTZ Digital Twin

Цифровой двойник локомотива: система мониторинга и визуализации телеметрии в реальном времени для казахстанской железной дороги. Проект включает симулятор телеметрии, диспетчерский сервис с Kafka и TimescaleDB для агрегации и воспроизведения истории, и единый React-фронтенд с ролевыми интерфейсами для машиниста, диспетчера и администратора.

## Структура репозитория

| Путь | Назначение |
| --- | --- |
| `back_locomotive/` | Бэкенд локомотива: симулятор телеметрии, генерация здоровья, алерты, сообщения, экспорт, REST/WS API |
| `back_dispatcher/` | Бэкенд диспетчера: Kafka/WS инжест, TimescaleDB для replay, dispatcher WS fan-out, rule engine, аутентификация |
| `front_locomotive/` | Единый фронтенд: дашборд оператора, диспетчерская консоль, алерты, сообщения, replay, карта, управление пользователями |
| `front_dispatcher/` | Устаревший автономный диспетчерский фронтенд, не запускается в текущем Docker-стеке |
| `docs/` | Документация: Docker, сидинг, правила здоровья, нагрузочное тестирование, архитектурные заметки |
| `scripts/` | Вспомогательные скрипты, включая запуск Docker-стека и нагрузочное тестирование |
| `shared/` | Общие ресурсы: `thresholds.json`, монтируемый в оба бэкенда |
| `map_gis/` | Опциональный Leaflet-вид для геопространственного мониторинга |
| `generate_synthetic_telemetry.py` | Расширенный генератор синтетической телеметрии |
| `generate_core_synthetic_telemetry.py` | Сокращённый генератор core-телеметрии |
| `architecture.md` | Детальное описание архитектуры и рантайм-контрактов |
| `IMPLEMENTATION_PLAN.md` | Пофазный план разработки |

## Стек технологий

| Область | Технологии |
| --- | --- |
| Фронтенд | React 19, TypeScript, Vite 8, Zustand 5, TanStack Query 5, ECharts 6, Leaflet, Tailwind CSS 4 |
| Бэкенд локомотива | FastAPI, Python 3.12, in-memory симулятор, WebSocket broadcasting, Kafka producer |
| Бэкенд диспетчера | FastAPI, Python 3.12, Kafka consumer, TimescaleDB/PostgreSQL, Alembic, Argon2, JWT |
| Потоковая обработка | Apache Kafka (KRaft mode) |
| Хранение данных | TimescaleDB |
| Развёртывание | Docker Compose, Nginx, `.env.microservices` |

## Текущая рантайм-архитектура

```text
front_locomotive --REST/WS--> back_locomotive --Kafka--> back_dispatcher --TimescaleDB
front_locomotive --Replay REST---------------> back_dispatcher
front_locomotive --Dispatcher WS-------------> back_dispatcher
```

- `back_locomotive` — симулятор телеметрии и API-поверхность оператора, Kafka producer.
- `back_dispatcher` — инжест событий из Kafka и/или WS, rule engine для здоровья и алертов, персистенция replay-истории в TimescaleDB, аутентификация и управление пользователями.
- `front_locomotive` — единая точка входа фронтенда. REST/WS к бэкенду локомотива и replay/auth/dispatcher API к бэкенду диспетчера.

Детальная документация:
- [architecture.md](./architecture.md)
- [docs/MICROSERVICES_DOCKER.md](./docs/MICROSERVICES_DOCKER.md)
- [back_dispatcher/README.md](./back_dispatcher/README.md)

## Быстрый старт

### Docker-стек (рекомендуется)

```bash
./scripts/start_microservices.sh up
```

Полезные команды:

```bash
./scripts/start_microservices.sh ps
./scripts/start_microservices.sh logs
./scripts/start_microservices.sh down
```

### URL-ы сервисов

| Сервис | URL / Порт |
| --- | --- |
| Бэкенд локомотива | `http://localhost:3001` |
| Бэкенд диспетчера | `http://localhost:3010` |
| Фронтенд | `http://localhost:5183` |
| Kafka | `localhost:9092` |
| TimescaleDB | `localhost:5433` |

### Аутентификация

Большинство эндпоинтов защищены:

- REST-запросы требуют `X-API-Key`
- WebSocket-подключения требуют `?apiKey=...` или JWT-токен `?token=...`
- `/ping` остаётся публичным

Демо-ключ в `.env.microservices`:

```text
ktz-demo-key
```

### Локальная разработка

Для запуска отдельных сервисов без Docker:

- [front_locomotive/README.md](./front_locomotive/README.md)
- [back_dispatcher/README.md](./back_dispatcher/README.md)
- [docs/MICROSERVICES_DOCKER.md](./docs/MICROSERVICES_DOCKER.md)

## API: Бэкенд локомотива (`back_locomotive`)

Публичный health check:

- `GET /ping`

Защищённые маршруты оператора:

| Маршрут | Назначение |
| --- | --- |
| `GET /api/telemetry/current` | Текущий фрейм телеметрии |
| `GET /api/telemetry/metrics` | Определения метрик и пороги |
| `GET /api/telemetry/history/{metric_id}` | Короткая in-memory история метрики |
| `GET /api/health` | Текущий индекс здоровья подсистем |
| `GET /api/alerts` | Лента алертов |
| `POST /api/alerts/{alert_id}/acknowledge` | Подтверждение алерта |
| `GET /api/messages` | Лента сообщений |
| `POST /api/messages/{message_id}/read` | Отметить сообщение как прочитанное |
| `POST /api/messages/{message_id}/acknowledge` | Подтвердить сообщение |
| `GET /api/connection/status` | Статус подключения |
| `GET /api/config/thresholds` | Текущие пороговые значения |
| `PUT /api/config/thresholds` | Обновить пороги без перезапуска |
| `GET /api/export/telemetry/csv` | Экспорт телеметрии в CSV |
| `GET /api/export/alerts/csv` | Экспорт алертов в CSV |
| `GET /api/replay/snapshot` | In-memory снимок replay |

WebSocket оператора:

- `WS /ws?apiKey=...`

Типы исходящих сообщений: `telemetry.frame`, `health.update`, `alert.new`, `alert.update`, `alert.resolved`, `message.new`, `connection.heartbeat`

## API: Бэкенд диспетчера (`back_dispatcher`)

Публичный health check:

- `GET /ping`

Защищённые REST-маршруты:

| Маршрут | Назначение |
| --- | --- |
| `GET /api/health` | Здоровье сервиса, runtime-статистика, backpressure |
| `GET /api/locomotives` | Сконфигурированные локомотивы и их статус подключения |
| `GET /api/locomotives/{id}/latest-telemetry` | Последний полученный фрейм телеметрии |
| `GET /api/locomotives/{id}/chat` | История чата диспетчера |
| `GET /api/locomotives/{id}/telemetry/recent` | Недавняя персистированная телеметрия |
| `GET /api/locomotives/{id}/replay/time-range` | Временной диапазон доступных replay-данных |
| `GET /api/locomotives/{id}/replay/range` | Исторические серии с контролем разрешения |
| `GET /api/locomotives/{id}/replay/snapshot` | Полный снимок состояния на выбранный момент |
| `POST /api/auth/login` | Аутентификация |
| `POST /api/auth/refresh` | Обновление JWT-токена |
| `GET /api/auth/me` | Текущий пользователь |
| `POST /api/auth/change-password` | Смена пароля |
| `GET /api/admin/users` | Список пользователей (admin) |
| `POST /api/admin/users` | Создание пользователя (admin) |

WebSocket диспетчера:

- `WS /ws?apiKey=...`

Типы исходящих сообщений: `dispatcher.snapshot`, `dispatcher.locomotive_status`, `telemetry.frame`, `health.update`, `alert.new`, `alert.update`, `alert.resolved`, `message.new`

Входящие действия клиента: `subscribe`, `dispatcher.chat`

## Интерфейсы фронтенда

Единый UI в [front_locomotive](./front_locomotive) включает:

- Дашборд: здоровье парка, contributing factors, алерты, live-метрики, экспорт
- Телеметрия: сглаживание, live-тренды, пресеты зума, CSV-экспорт
- Алерты: лента с CSV-экспортом
- Сообщения: диспетчерские сообщения
- Схема: интерактивная SVG-схема локомотива TE33A
- Карта: Leaflet-карта Казахстана с 10 симулированными поездами на реальных ж/д путях
- Replay: воспроизведение истории из TimescaleDB с timeline, playback и snapshot
- Диспетчерская консоль: мониторинг парка и двусторонний чат
- Управление пользователями: CRUD пользователей (admin)
- Аутентификация: логин, смена пароля, JWT-сессия

## Маппинг критериев хакатона

| Критерий | Текущее покрытие |
| --- | --- |
| Визуализация реального времени (35%) | WebSocket-стриминг, health-обновления, сглаживание, тренд-графики, подсистемные виды, алерты, сообщения |
| UI/UX (30%) | 11 страниц, объяснимый health, replay UI, экспорт, карта, интерактивные графики с зумом |
| Архитектура бэкенда (25%) | FastAPI API, конфигурируемые пороги, API-key + JWT auth, Kafka инжест, TimescaleDB replay, Docker Compose |
| Качество демо (10%) | Документация, архитектурное описание, Docker one-command запуск, 10 паттернов неисправностей, CSV/PDF экспорт |

## Связанная документация

- [front_locomotive/README.md](./front_locomotive/README.md)
- [back_dispatcher/README.md](./back_dispatcher/README.md)
- [docs/MICROSERVICES_DOCKER.md](./docs/MICROSERVICES_DOCKER.md)
- [docs/HEALTH_INDEX_RULES.md](./docs/HEALTH_INDEX_RULES.md)
- [docs/STRESS_TESTING.md](./docs/STRESS_TESTING.md)
- [docs/PRESENTATION.md](./docs/PRESENTATION.md)
- [architecture.md](./architecture.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
