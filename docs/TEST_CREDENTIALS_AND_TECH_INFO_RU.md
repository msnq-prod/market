# Stones: тестовые креды и техническая информация

## 1. Быстрый запуск

```bash
npm install
npm run db:migrate
npm run db:seed:languages
npm run db:seed
npm run dev
```

Desktop helper для HQ pilot:
- основной пользовательский путь: открыть `/admin/video-tool/:batchId`, нажать `Скачать Stones Video Helper`, установить `DMG` и один раз открыть приложение;
- после первого запуска helper работает в фоне и стартует при логине автоматически.

Dev fallback без Electron:

```bash
npm run video-export-helper
```

Production DMG build:

```bash
STONES_HELPER_ALLOWED_ORIGIN=https://admin.example.com npm run video-export-helper:desktop:dist
```

После запуска:
- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`
- mysql: `127.0.0.1:3307`

## 2. Тестовые креды

Пароли из актуального `prisma/seed.ts`:
- `admin123` для `admin@stones.com`
- `partner123` для остальных seeded-пользователей

| Роль | Логин / Email | Пароль | Где использовать |
|---|---|---|---|
| ADMIN | `admin@stones.com` | `admin123` | `/admin/login`, все HQ-операции |
| MANAGER | `manager@stones.com` | `partner123` | `/admin/login`, товары, локации, склад |
| SALES_MANAGER | `sales@stones.com` | `partner123` | `/admin/login`, `/admin/orders` |
| FRANCHISEE | `yakutia.partner@stones.com` | `partner123` | `/partner/login`, партнерский кабинет |
| USER | `user` | `partner123` | публичная витрина, checkout, история |

## 3. Ключевые UI-маршруты

- Витрина: `/`
- Паспорт камня: `/clone/:publicToken`
- Админ-логин: `/admin/login`
- Партнер-логин: `/partner/login`
- Dashboard HQ: `/admin`
- Товары HQ: `/admin/products`
- Склад HQ: `/admin/warehouse`
- HQ монтаж видео: `/admin/video-tool/:batchId`
- Приемка HQ: `/admin/acceptance`
- Аллокация: `/admin/allocation`
- Заказы сайта: `/admin/orders`
- Партнерский дашборд: `/partner/dashboard`
- Выполнение заказа на сбор: `/partner/batches/new`
- Партии партнера: `/partner/batches`
- QR центр: `/partner/qr`
- Печать QR: `/partner/qr/print?batchId=<ID>`

## 4. Основные API для ручной проверки

Аутентификация:
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

Новый v1 flow:
- `GET /api/collection-requests`
- `POST /api/collection-requests`
- `PATCH /api/collection-requests/:id`
- `DELETE /api/collection-requests/:id`
- `POST /api/collection-requests/:id/ack`
- `POST /api/collection-requests/:id/complete`
- `GET /api/batches/:id/video-tool`
- `POST /api/batches/:id/video-export-sessions`
- `GET /api/batches/:id/video-export-sessions/:sessionId`
- `POST /api/batches/:id/video-export-sessions/:sessionId/retry-tail`
- `POST /api/batches/:id/video-export-sessions/:sessionId/cancel`
- `POST /api/batches/:id/video-export-sessions/:sessionId/files`
- `POST /api/batches/:id/receive`
- `POST /api/batches/:id/media-sync`
- `POST /api/batches/:id/finalize`

QR и clone:
- `GET /api/batches/:batchId/qr-pack`
- `GET /api/items/batch/:batchId`
- `GET /api/public/items/:publicToken`
- `GET /api/public/items/:publicToken/qr`

Legacy-совместимость:
- `POST /api/batches`
- `POST /api/batches/:id/send`
- `POST /api/items/batch/:batchId/items`
- `POST /api/hq/acceptance/:batchId/verify`
- `POST /api/hq/items/:itemId/accept`
- `POST /api/hq/items/:itemId/reject`
- `POST /api/hq/batches/:batchId/finish`

## 5. Ожидаемое состояние БД после `npm run db:seed`

Seed теперь оставляет только базовое пустое состояние для ручного старта:
- пользователи: `5`
- локации: `0`
- товары-шаблоны: `0`
- заказы на сбор: `0`
- партии: `0`
- item-позиции: `0`
- ledger-записи: `0`
- site-orders: `0`

В базе остаются только:
- языки интерфейса;
- контент страницы цифрового двойника (`content_pages.clone_page`, если таблица уже промигрирована);
- по одному пользователю на каждую роль: `ADMIN`, `MANAGER`, `SALES_MANAGER`, `FRANCHISEE`, `USER`.

## 6. Быстрый smoke сценарий v1

1. Войти как `admin@stones.com / admin123`.
2. Открыть `/admin/products` и убедиться, что список пуст.
3. Перейти в `/admin/warehouse` и проверить, что нет заказов на сбор и партий.
4. Войти как `yakutia.partner@stones.com / partner123`.
5. Открыть `/partner/dashboard` и убедиться, что кабинет стартует без активных заказов и партий.
6. Открыть `/partner/qr` и проверить пустое состояние без доступных batch.
7. При необходимости создать тестовые сущности вручную через UI/API или временные e2e-фикстуры.

## 7. Важные замечания

- Цифровой двойник привязан к `Item`, а не к `Product`.
- Публичная доступность зависит и от `is_published`, и от реального остатка `Item`.
- Переход партии в `IN_STOCK` через новый workflow требует media для каждого `Item`.
- Для локального HQ-монтажа нужен отдельный localhost helper; в pilot он поставляется как macOS menu bar app с bundled `ffmpeg` и `ffprobe`.
- Для production web UI ссылка на DMG задаётся через `VITE_VIDEO_HELPER_DOWNLOAD_URL`.
- Legacy-роуты сохранены специально для QR- и acceptance-regression.

---
Актуально на 07.04.2026
