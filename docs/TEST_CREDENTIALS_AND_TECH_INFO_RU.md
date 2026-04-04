# Stones: тестовые креды и техническая информация

## 1. Быстрый запуск

```bash
npm install
npm run db:migrate
npm run db:seed:languages
npm run db:seed
npm run dev
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
| FRANCHISEE | `ural.partner@stones.com` | `partner123` | `/partner/login`, партнерский кабинет |
| FRANCHISEE | `baltic.partner@stones.com` | `partner123` | `/partner/login`, партнерский кабинет |
| USER | `anna` | `partner123` | публичная витрина, checkout, история |
| USER | `maxim` | `partner123` | публичная витрина, checkout, история |
| USER | `olga` | `partner123` | публичная витрина, checkout, история |
| USER | `kirill` | `partner123` | публичная витрина, checkout, история |

## 3. Ключевые UI-маршруты

- Витрина: `/`
- Паспорт камня: `/clone/:publicToken`
- Админ-логин: `/admin/login`
- Партнер-логин: `/partner/login`
- Dashboard HQ: `/admin`
- Товары HQ: `/admin/products`
- Склад HQ: `/admin/warehouse`
- Приемка legacy: `/admin/acceptance`
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

Сид создает:
- локации: `5`
- товары-шаблоны: `10`
- пользователи: `10`
- заказы на сбор: `8`
- партии: `6`
- item-позиции: `24`
- ledger-записи: `10`
- site-orders: `4`

Ключевые заказы на сбор:
- `req-yak-2026-01`: `IN_STOCK`
- `req-yak-2026-02`: `IN_TRANSIT`
- `req-ural-2026-01`: `IN_STOCK`
- `req-ural-2026-02`: `RECEIVED`
- `req-ural-open`: `OPEN`
- `req-baltic-in-progress`: `IN_PROGRESS`
- `req-kola-cancelled`: `CANCELLED`

Ключевые партии:
- `batch-yak-2026-01`: `IN_STOCK`
- `batch-yak-2026-02`: `IN_TRANSIT`
- `batch-ural-2026-01`: `IN_STOCK`
- `batch-ural-2026-02`: `RECEIVED`
- `batch-baltic-2026-01`: `IN_STOCK`
- `batch-baltic-2026-02`: `CANCELLED`

Опубликованные шаблоны:
- `prod-yak-001`
- `prod-ural-001`
- `prod-baltic-001`

У этих шаблонов есть реальные складские экземпляры для публичной витрины и checkout/regression.

## 6. Быстрый smoke сценарий v1

1. Войти как `admin@stones.com / admin123`.
2. Открыть `/admin/products` и проверить опубликованные шаблоны и остатки.
3. Перейти в `/admin/warehouse` и убедиться, что есть:
   - открытый заказ `req-ural-open`;
   - заказ `req-baltic-in-progress`;
   - полученная партия `batch-ural-2026-02`.
4. Войти как `yakutia.partner@stones.com / partner123`.
5. Открыть `/partner/dashboard` и проверить свои заказы и партии.
6. Открыть `/partner/qr`, выбрать партию и получить `clone_url`.
7. Открыть `/clone/:publicToken` и проверить паспорт конкретного `Item`.

## 7. Важные замечания

- Цифровой двойник привязан к `Item`, а не к `Product`.
- Публичная доступность зависит и от `is_published`, и от реального остатка `Item`.
- Переход партии в `IN_STOCK` через новый workflow требует media для каждого `Item`.
- Legacy-роуты сохранены специально для QR- и acceptance-regression.

---
Актуально на 04.04.2026
