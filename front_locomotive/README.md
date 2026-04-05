# front_locomotive

Единое React-приложение оператора для проекта KTZ Digital Twin.

Приложение отображает дашборд состояния парка, мониторинг телеметрии в реальном времени, replay-воспроизведение истории, интерактивную SVG-схему локомотива, карту, алерты, диспетчерскую консоль и управление пользователями. Полный обзор проекта и Docker-запуск описаны в корневом [README](../README.md).

## Возможности приложения

- **Дашборд** — здоровье парка, подсистемы, contributing factors, алерты, live-метрики, экспорт CSV/PDF
- **Телеметрия** — карточки метрик с sparkline, EMA-сглаживание, тренд-графики с dataZoom, пресеты временных окон, CSV-экспорт
- **Алерты** — лента алертов с жизненным циклом (active/acknowledged/resolved), CSV-экспорт
- **Сообщения** — диспетчерские сообщения с отметкой прочтения
- **Схема** — интерактивная SVG-схема тепловоза TE33A с 8 зонами подсистем, hover-tooltip, click-детали
- **Карта** — Leaflet + OpenRailwayMap, 10 поездов на реальных ж/д путях Казахстана
- **Replay** — воспроизведение истории из TimescaleDB: timeline scrubber, playback 1x–10x, snapshot, 5 уровней resolution
- **Диспетчерская консоль** — мониторинг всех локомотивов, двусторонний чат (роли admin/dispatcher)
- **Управление пользователями** — CRUD пользователей (роль admin)
- **Аутентификация** — логин, JWT-сессия, принудительная смена пароля

## Стек

- React 19 + TypeScript + Vite 8
- Tailwind CSS 4
- Zustand 5 (10 сторов)
- TanStack Query 5
- ECharts 6 (echarts-for-react)
- Leaflet
- Lucide React (иконки)
- MSW (mock mode)

## Конфигурация

Build-time переменные окружения:

| Переменная | Назначение |
| --- | --- |
| `VITE_WS_URL` | WebSocket URL диспетчера |
| `VITE_API_BASE_URL` | REST API бэкенда локомотива |
| `VITE_REPLAY_API_BASE_URL` | REST API бэкенда диспетчера (replay) |
| `VITE_AUTH_API_BASE_URL` | REST API аутентификации |
| `VITE_ENABLE_MOCKS` | Включить MSW mock mode (`true`/`false`) |

В Docker-стеке эти значения подставляются из `.env.microservices` через `docker-compose.microservices.yml`.

## Локальный запуск

```bash
npm ci
npm run dev
```

Сборка для продакшена:

```bash
npm run build
```

Линтинг:

```bash
npm run lint
```

## Примечания

- Live REST-запросы идут к бэкенду локомотива (`back_locomotive`)
- Replay HTTP-запросы идут к бэкенду диспетчера (`back_dispatcher`)
- WebSocket подключается к диспетчерскому WS (`back_dispatcher`)
- Mock mode доступен через `VITE_ENABLE_MOCKS=true` — полный набор MSW-handlers для автономной разработки

## Ссылки

- [../README.md](../README.md)
- [../docs/MICROSERVICES_DOCKER.md](../docs/MICROSERVICES_DOCKER.md)
- [../architecture.md](../architecture.md)
