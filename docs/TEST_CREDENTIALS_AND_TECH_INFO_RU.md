# Stones: Тестовые креды и техническая информация

## 1. Что это за файл
Этот файл нужен для быстрого старта тестирования локального окружения: вход в роли, запуск проекта, проверка БД, ключевые URL и API.

## 2. Требования окружения
- Node.js: `>=22.0.0`
- npm: `>=10.5.1`
- БД: MySQL (локально используется `127.0.0.1:3307`)
- Рабочая БД: `stones`

## 3. Переменные окружения
Текущие значения в `.env`:

```env
DATABASE_URL="mysql://root@127.0.0.1:3307/stones?connection_limit=20&pool_timeout=30"
ACCESS_TOKEN_SECRET="access_secret_123"
REFRESH_TOKEN_SECRET="refresh_secret_123"
```

## 4. Быстрый запуск
```bash
npm install
npm run db:migrate
npm run db:seed:languages
npm run db:seed
npm run dev
```

После `npm run dev`:
- Frontend (Vite): `http://localhost:5173`
- Backend (Express API): `http://localhost:3001`

## 5. Тестовые креды
Пароли из актуального `prisma/seed.ts`:
- `admin123` для `admin@stones.com`
- `partner123` для остальных seeded-пользователей

Роли и логины:

| Роль | Email | Пароль | Где использовать |
|---|---|---|---|
| ADMIN | `admin@stones.com` | `admin123` | `/admin/login`, `/admin/*`, доступ к админским API |
| MANAGER | `manager@stones.com` | `partner123` | `/admin/login`, складские/операционные сценарии |
| FRANCHISEE | `yakutia.partner@stones.com` | `partner123` | `/partner/login`, партнёрский кабинет |
| FRANCHISEE | `ural.partner@stones.com` | `partner123` | `/partner/login`, партнёрский кабинет |
| FRANCHISEE | `baltic.partner@stones.com` | `partner123` | `/partner/login`, партнёрский кабинет |
| USER | `anna.smirnova@example.ru` | `partner123` | API/данные заказов |
| USER | `maxim.lebedev@example.ru` | `partner123` | API/данные заказов |
| USER | `olga.kuznetsova@example.ru` | `partner123` | API/данные заказов |
| USER | `kirill.volkov@example.ru` | `partner123` | API/данные заказов |

## 6. Важные UI-маршруты
- Публичная витрина: `/`
- Цифровой двойник по токену: `/clone/:publicToken`
- Логин админки: `/admin/login`
- Логин партнера/персонала: `/partner/login`
- Партнёрский дашборд: `/partner/dashboard`
- Создание партии: `/partner/batches/new`
- QR центр: `/partner/qr`
- Печать QR: `/partner/qr/print?batchId=<ID>`
- Финансы партнёра: `/partner/finance`
- Админ дашборд: `/admin`
- Приемка: `/admin/acceptance`
- Аллокация: `/admin/allocation`
- Пользователи: `/admin/users`
- Редактор страницы цифрового двойника: `/admin/clone-content`

## 7. API, которые чаще всего нужны во время тестов

Аутентификация:
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/register`

Операции партнёра и HQ:
- `GET /api/batches`
- `POST /api/batches`
- `POST /api/batches/:id/send`
- `POST /api/batches/:id/receive`
- `GET /api/batches/:batchId/qr-pack`
- `POST /api/items/batch/:batchId/items`
- `GET /api/items/batch/:batchId`
- `POST /api/hq/acceptance/:batchId/verify`
- `POST /api/hq/items/:itemId/accept`
- `POST /api/hq/items/:itemId/reject`
- `POST /api/hq/batches/:batchId/finish`
- `POST /api/financials/items/:itemId/allocate`
- `GET /api/financials/me`
- `GET /api/financials/ledger`

Публичный цифровой двойник:
- `GET /api/public/items/:publicToken`
- `GET /api/public/items/:publicToken/qr`
- `POST /api/public/items/:publicToken/activate`

Каталог:
- `GET /api/locations`
- `GET /api/products`
- `GET /api/categories`
- `GET /api/languages`

## 8. Ожидаемое состояние БД после `npm run db:seed`
Сид создаёт предсказуемый набор данных:
- Локации: `5`
- Товары: `10`
- Пользователи: `9`
- Партии: `7`
- Item-позиции: `27`
- Ledger-записи: `10`
- Заказы: `4`

Ключевые статусы партий в тестовых данных:
- `batch-yak-2026-01`: `FINISHED`
- `batch-ural-2026-01`: `FINISHED`
- `batch-baltic-2026-01`: `FINISHED`
- `batch-ural-2026-02`: `RECEIVED`
- `batch-baltic-2026-02`: `ERROR`
- `batch-yak-2026-02`: `TRANSIT`
- `batch-ural-2026-03`: `DRAFT`

## 9. Проверка цифрового двойника (быстрый сценарий)
1. Войти как франчайзи: `yakutia.partner@stones.com / partner123`.
2. Открыть `/partner/qr`.
3. Выбрать партию и взять `clone_url` или `public_token`.
4. Открыть `/clone/:publicToken`.
5. Проверить QR-картинку через `GET /api/public/items/:publicToken/qr`.

## 10. Известный нюанс текущей БД
Если в локальной БД нет таблицы `content_pages`, сид не падает: блок сидирования контента цифрового двойника пропускается с предупреждением.
