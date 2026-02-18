# Полная инструкция по использованию системы Stones

Актуально для проекта из директории `/Users/nikitamysnik/Desktop/progs/stones`.

## 1. Назначение системы

Stones — это система для:
- публичного каталога товаров с геопривязкой (глобус, локации, товары);
- операционной работы HQ (админ-кабинет);
- работы франчайзи с партиями товаров (partner-кабинет);
- финансового учета операций по активации товаров.

Система покрывает полный цикл:
1. Франчайзи создает партию и товары.
2. HQ принимает и проверяет товары.
3. HQ распределяет товар в каналы продаж.
4. Товар активируется, проводятся финансовые операции.

## 2. Технологический стек

- Frontend: React + TypeScript + Vite + Tailwind
- Backend: Node.js + Express + TypeScript
- ORM/БД: Prisma + MySQL
- Хранение медиа: локальные файлы в `public/uploads`

## 3. Требования к окружению

- Node.js 22+ (LTS)
- npm
- MySQL 8+
- Доступ к БД, указанной в `DATABASE_URL`

## 4. Быстрый старт (локально)

### 4.1 Установить зависимости

```bash
npm install
```

### 4.2 Настроить `.env`

Минимальный пример:

```env
PORT=3001
CLIENT_URL=http://localhost:5173
DATABASE_URL="mysql://root@127.0.0.1:3307/stones?connection_limit=20&pool_timeout=30"
ACCESS_TOKEN_SECRET="change_me_access"
REFRESH_TOKEN_SECRET="change_me_refresh"
```

### 4.3 Подготовить БД

#### Вариант A: новая пустая БД

```bash
npm run db:migrate
npm run db:seed:languages
npm run db:seed
```

#### Вариант B: существующая БД без истории Prisma (clean baseline)

Использовать, если схема уже создана, но `prisma migrate status` показывает pending migration:

```bash
npx prisma migrate resolve --applied 20260206_init_mysql
npx prisma migrate status
npx prisma migrate deploy
```

После baseline можно выполнить сиды:

```bash
npm run db:seed:languages
npm run db:seed
```

## 5. Запуск системы

### 5.1 Режим разработки (frontend + backend)

```bash
npm run dev
```

Откроется:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

### 5.2 Отдельно backend

```bash
npm run server
```

### 5.3 Проверка качества

```bash
npm run lint
npm run build
```

## 6. Тестовые учетные записи

После `npm run db:seed` доступны:

- Админ:
  - email: `admin@stones.com`
  - password: `admin123`
- Франчайзи:
  - email: `partner@stones.com`
  - password: `partner123`

Рекомендуется сменить пароли и секреты сразу после первичного запуска.

## 7. Роли и доступ

- `ADMIN` / `MANAGER`
  - доступ в `/admin`
  - управление контентом, пользователями, приемкой, распределением
- `FRANCHISEE`
  - доступ в `/partner`
  - создание партий, просмотр финансов
- Публичный пользователь
  - доступ на `/`
  - просмотр локаций/товаров

Маршруты защищены UI-guard’ами:
- если staff логинится, его ведет в `/admin`;
- если франчайзи логинится, его ведет в `/partner/dashboard`.

## 8. Работа в админ-кабинете (`/admin`)

## 8.1 Dashboard

Показывает ключевые метрики:
- количество локаций;
- количество товаров;
- количество пользователей/франчайзи;
- партии в `TRANSIT`;
- товары в `STOCK_HQ`.

## 8.2 Users

Раздел позволяет:
- просматривать пользователей;
- создавать пользователя через форму (`name`, `email`, `password`, `role`);
- обновлять список кнопкой `Refresh`.

Создание пользователя вызывает `POST /auth/register`.

## 8.3 Locations

Позволяет:
- создать/редактировать/удалить локацию;
- добавить изображение;
- редактировать переводы.

## 8.4 Products

Позволяет:
- создать/редактировать/удалить товар;
- назначить локацию/категорию;
- загружать изображение;
- редактировать переводы.

## 8.5 Acceptance (приемка)

Шаги:
1. Открыть `/admin/acceptance`.
2. Выбрать партию из списка `TRANSIT` или ввести ID вручную.
3. Сканировать/ввести `temp_id`.
4. Для найденного товара нажать:
   - `Accept` -> статус товара `STOCK_HQ`
   - `Reject` -> статус товара `REJECTED`
5. После обработки всех товаров нажать `Finish Batch` (кнопка блокируется, пока есть `NEW`).

## 8.6 Allocation (распределение)

Шаги:
1. Открыть `/admin/allocation`.
2. Выбрать товары со склада HQ (`STOCK_HQ`).
3. Назначить канал:
   - `Online Marketplace` -> `STOCK_ONLINE`
   - `Offline Consignment` + выбрать франчайзи -> `ON_CONSIGNMENT`
4. Нажать действие распределения.

Дополнительно:
- есть поиск по item id/temp_id;
- `Select Visible` и `Clear` для массовых действий.

## 9. Работа в кабинете франчайзи (`/partner`)

## 9.1 Login

Авторизация через `/partner/login`.

## 9.2 Dashboard

Показывает:
- текущий баланс;
- активные черновики (`DRAFT`);
- партии в пути (`TRANSIT`);
- завершенные партии (`FINISHED`);
- таблицу последних партий.

Есть быстрые кнопки:
- `New Batch`
- `Finances`

## 9.3 New Batch (`/partner/batches/new`)

Шаги:
1. Заполнить GPS координаты и загрузить видео.
2. Создать партию (статус `DRAFT`).
3. Добавить фото товаров.
4. Указать `temp_id` для каждого товара.
5. Отправить партию в HQ (`Send to HQ`) -> статус партии `TRANSIT`.

## 9.4 Finances (`/partner/finance`)

Показывает:
- текущий баланс;
- сводные карточки (кол-во операций, доход, расход);
- историю операций ledger;
- фильтр по типу операции;
- кнопку `Refresh`.

## 10. Публичная часть (`/`)

Возможности:
- просмотр глобуса с локациями;
- просмотр карточек товаров;
- мультиязычность (доступные языки из БД);
- базовые UI-разделы (account/cart/contacts и т.д.).

## 11. Финансовая логика (вкратце)

При активации товара (`POST /api/public/items/:publicToken/activate`):

- если товар в `ON_CONSIGNMENT`:
  - создается ledger операция `ROYALTY_CHARGE`;
  - баланс франчайзи уменьшается.
- если товар в `STOCK_ONLINE` / `SOLD_ONLINE`:
  - создается `SALES_PAYOUT`;
  - баланс франчайзи увеличивается.

## 12. Основные API (для отладки)

- Auth:
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh`
- Admin/Public data:
  - `GET /api/users`
  - `GET /api/locations`
  - `GET /api/products`
  - `GET /api/languages`
- Logistics:
  - `GET /api/batches`
  - `POST /api/batches`
  - `POST /api/batches/:id/send`
  - `POST /api/hq/acceptance/:batchId/verify`
  - `POST /api/hq/items/:itemId/accept`
  - `POST /api/hq/items/:itemId/reject`
  - `POST /api/financials/items/:itemId/allocate`
- Financials:
  - `GET /api/financials/me`
  - `GET /api/financials/ledger`
- Upload:
  - `POST /api/upload/photo`
  - `POST /api/upload/video`
  - `POST /api/upload` (совместимый endpoint)

## 13. Где хранятся данные и файлы

- Схема Prisma: `prisma/schema.prisma`
- Миграции: `prisma/migrations/`
- Сиды: `prisma/seed.ts`, `prisma/seed_languages.ts`
- Загрузки:
  - фото: `public/uploads/photos`
  - видео: `public/uploads/videos`
- Публичные изображения локаций: `public/locations`

## 14. Типовые проблемы и решения

### 14.1 `prisma migrate deploy` ругается на не пустую БД

Сделать baseline:

```bash
npx prisma migrate resolve --applied 20260206_init_mysql
npx prisma migrate status
```

### 14.2 Не удается войти

Проверить:
- правильный `DATABASE_URL`;
- что сиды выполнены (`npm run db:seed`);
- что backend запущен (`npm run server` или `npm run dev`).

### 14.3 Не загружаются изображения/видео

Проверить:
- backend на порту `3001`;
- доступность `/uploads/...`;
- что директории `public/uploads/photos` и `public/uploads/videos` существуют.

### 14.4 CORS/прокси проблемы

Проверить соответствие:
- `CLIENT_URL` в `.env`;
- proxy в `vite.config.ts` (`/api`, `/auth`, `/uploads`).

## 15. Рекомендации для продакшена

- сменить `ACCESS_TOKEN_SECRET` и `REFRESH_TOKEN_SECRET`;
- сменить дефолтные пароли;
- ограничить/закрыть `POST /auth/register` (например, только для staff);
- вынести медиа в объектное хранилище (S3/MinIO) при росте нагрузки;
- включить регулярные бэкапы БД.

---

Если нужно, можно сделать отдельную версию этого документа для конечных пользователей (без технических разделов) и отдельный runbook для DevOps.
