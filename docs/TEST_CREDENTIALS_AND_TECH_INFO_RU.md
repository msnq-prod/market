# Stones: тестовые креды и техническая информация

Документ описывает текущее локальное окружение, seed-аккаунты, демонстрационные данные и полезные URL.

## 1. Требования окружения

- Node.js `>=22.0.0`
- npm `>=10.5.1`
- MySQL 8+
- локальная БД по умолчанию: `localhost:3307`

## 2. Минимальный `.env`

```env
PORT=3001
CLIENT_URL=http://localhost:5173
DATABASE_URL="mysql://stones:stones@localhost:3307/stones?connection_limit=20&pool_timeout=30"
ACCESS_TOKEN_SECRET="replace_with_a_long_random_access_secret"
REFRESH_TOKEN_SECRET="replace_with_a_long_random_refresh_secret"
VITE_HOST=127.0.0.1
VITE_PORT=5173
VITE_API_TARGET=http://127.0.0.1:3001
```

## 3. Локальный запуск

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

## 4. Seed-аккаунты

Пароли из `prisma/seed.ts`:

- `admin123` — только для `admin@stones.com`
- `partner123` — для остальных seeded-аккаунтов

### Staff и партнеры

| Роль | Логин | Пароль | Основное использование |
| --- | --- | --- | --- |
| `ADMIN` | `admin@stones.com` | `admin123` | `/admin/login`, полный HQ-доступ |
| `MANAGER` | `manager@stones.com` | `partner123` | `/admin/login`, HQ без очереди заказов |
| `SALES_MANAGER` | `sales@stones.com` | `partner123` | `/admin/login`, `/admin/orders` |
| `FRANCHISEE` | `yakutia.partner@stones.com` | `partner123` | `/partner/login` |
| `FRANCHISEE` | `ural.partner@stones.com` | `partner123` | `/partner/login` |
| `FRANCHISEE` | `baltic.partner@stones.com` | `partner123` | `/partner/login` |

### Покупатели

| Роль | Логин | Email | Пароль |
| --- | --- | --- | --- |
| `USER` | `anna` | `anna.smirnova@example.ru` | `partner123` |
| `USER` | `maxim` | `maxim.lebedev@example.ru` | `partner123` |
| `USER` | `olga` | `olga.kuznetsova@example.ru` | `partner123` |
| `USER` | `kirill` | `kirill.volkov@example.ru` | `partner123` |

## 5. Основные UI-маршруты

### Публичный контур

- `/`
- `/clone/:serialNumber`

### HQ

- `/admin/login`
- `/admin`
- `/admin/orders`
- `/admin/acceptance`
- `/admin/allocation`
- `/admin/warehouse`
- `/admin/locations`
- `/admin/products`
- `/admin/users`
- `/admin/clone-content`
- `/admin/video-tool/:batchId`
- `/admin/qr/print?batchId=<ID>`

### Франчайзи

- `/partner/login`
- `/partner/dashboard`
- `/partner/batches`
- `/partner/batches/new`
- `/partner/finance`

## 6. Наиболее полезные API

### Аутентификация

- `GET /healthz`
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`
- `GET /auth/me`

### Заказы покупателей

- `POST /api/orders`
- `GET /api/orders/my`
- `GET /api/orders`
- `PATCH /api/orders/:id`

### Каталог и контент

- `GET /api/locations`
- `GET /api/categories`
- `GET /api/products`
- `GET /api/languages`
- `GET /api/content/clone-page`
- `PUT /api/content/clone-page`

### Пользователи

- `GET /api/users`
- `POST /api/users`

### Сбор и партии

- `GET /api/collection-requests`
- `POST /api/collection-requests`
- `PATCH /api/collection-requests/:id`
- `DELETE /api/collection-requests/:id`
- `POST /api/collection-requests/:id/ack`
- `POST /api/collection-requests/:id/complete`
- `GET /api/batches`
- `POST /api/batches/:id/receive`
- `POST /api/batches/:id/finalize`
- `POST /api/batches/:id/media-sync`
- `GET /api/batches/:batchId/qr-pack`
- `GET /api/items/batch/:batchId`
- `GET /api/items/:itemId`
- `PATCH /api/items/:itemId`

### Приемка HQ

- `POST /api/hq/acceptance/:batchId/verify`
- `POST /api/hq/items/:itemId/accept`
- `POST /api/hq/items/:itemId/reject`
- `POST /api/hq/batches/:batchId/finish`

### Видео

- `GET /api/batches/:id/video-tool`
- `POST /api/batches/:id/video-jobs`
- `POST /api/batches/:id/video-export-sessions`
- `GET /api/batches/:id/video-export-sessions/:sessionId`
- `POST /api/batches/:id/video-export-sessions/:sessionId/files`
- `POST /api/batches/:id/video-export-sessions/:sessionId/retry-tail`
- `POST /api/batches/:id/video-export-sessions/:sessionId/cancel`

### Финансы и allocation

- `GET /api/financials/me`
- `GET /api/financials/ledger`
- `POST /api/financials/items/:itemId/allocate`

### Публичный паспорт

- `GET /api/public/items/:serialNumber`
- `GET /api/public/items/:serialNumber/qr`
- `POST /api/public/items/:serialNumber/activate`

## 7. Что создает seed

Seed создает:

- staff-аккаунты;
- партнеров;
- buyer-аккаунты;
- каталог локаций, категорий и товаров;
- партии с разными статусами;
- ledger-записи;
- демо-заказы покупателей.

### Примеры batch-данных

- `batch-yak-2026-01` — `FINISHED`
- `batch-yak-2026-02` — `TRANSIT`
- `batch-ural-2026-01` — `FINISHED`
- `batch-ural-2026-02` — `RECEIVED`
- `batch-ural-2026-03` — `TRANSIT`
- `batch-baltic-2026-01` — `FINISHED`
- `batch-baltic-2026-02` — `ERROR`

### Примеры заказов покупателей

- `order-anna-001` — `COMPLETED`
- `order-maxim-001` — `IN_PROGRESS`
- `order-olga-001` — `NEW`
- `order-kirill-001` — `CANCELLED`

## 8. Быстрые smoke-сценарии

### Проверка HQ-приемки

1. Войти как `manager@stones.com` или `admin@stones.com`.
2. Открыть `/admin/acceptance`.
3. Проверить batch в `TRANSIT` или `RECEIVED`.

### Проверка публичного паспорта

1. Войти как HQ staff.
2. Взять `serial_number` из `Warehouse`, `Acceptance` или `QR Print`.
3. Открыть `/clone/:serialNumber`.
4. Проверить `GET /api/public/items/:serialNumber/qr`.

### Проверка buyer-потока

1. Войти на витрине как `anna`.
2. Добавить товар в корзину.
3. Оформить заявку.
4. Проверить ее в `/admin/orders`.

## 9. Важные нюансы текущей реализации

- `POST /auth/register` создает только buyer-аккаунт `USER`.
- staff и franchisee-аккаунты создаются только через `POST /api/users`.
- публичная активация `Item` не меняет `Ledger` и баланс.
- UI allocation в текущем MVP использует только онлайн-сценарий.
- в seed есть `ON_CONSIGNMENT` и `OFFLINE_POINT`, поэтому эти значения могут встречаться в демо-данных даже при заблокированном новом создании через UI.
