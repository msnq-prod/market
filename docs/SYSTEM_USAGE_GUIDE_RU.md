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
DATABASE_URL="mysql://stones:stones@localhost:3307/stones?connection_limit=20&pool_timeout=30"
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

Если в проекте уже собран `dist/`, Express также раздает production-фронтенд и SPA-маршруты с того же origin.

### 5.3 Проверка качества

```bash
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

## 6. Тестовые учетные записи

После `npm run db:seed` доступны:

- Админ:
  - email: `admin@stones.com`
  - password: `admin123`
- Менеджер продаж:
  - email: `sales@stones.com`
  - password: `partner123`
- Франчайзи:
  - email: `yakutia.partner@stones.com`
  - password: `partner123`
- Публичный покупатель:
  - login: `anna`
  - password: `partner123`

Рекомендуется сменить пароли и секреты сразу после первичного запуска.

## 7. Роли и доступ

- `ADMIN` / `MANAGER`
  - доступ в `/admin`
  - управление контентом, пользователями, приемкой, распределением
- `SALES_MANAGER`
  - доступ в `/admin/orders`
  - обработка интернет-заказов и смена их статусов
- `FRANCHISEE`
  - доступ в `/partner`
  - создание партий, просмотр финансов
- Публичный пользователь
  - доступ на `/`
  - просмотр локаций/товаров, регистрация по `username + password`, оформление заказа

Маршруты защищены UI-guard’ами:
- если staff логинится, его ведет в `/admin`;
- если франчайзи логинится, его ведет в `/partner/dashboard`.
- для входа в админку доступен отдельный маршрут `/admin/login`.

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
- создавать staff/partner-аккаунты через форму (`name`, `email`, `password`, `role`);
- обновлять список кнопкой `Refresh`.

Создание пользователя вызывает защищённый `POST /api/users`.

## 8.3 Orders

Раздел `/admin/orders` показывает интернет-заказы с сайта.

Возможности:
- серверный поиск по `order id`, `user.name`, `user.username`, `contact_phone`, `contact_email`, `delivery_address`;
- фильтры `Активные`, `Новые`, `В работе`, `Закрытые`;
- master-detail интерфейс: слева список заявок, справа рабочая карточка выбранного заказа;
- просмотр и редактирование контактов, адреса доставки, комментария клиента и `internal_note`;
- внутренние заметки менеджера не отдаются покупателю в `GET /api/orders/my`;
- клиентские поля заказа доступны для редактирования только пока заказ не закрыт;
- переходы статусов:
  - `NEW -> IN_PROGRESS`
  - `IN_PROGRESS -> COMPLETED`
  - `NEW|IN_PROGRESS -> CANCELLED`

## 8.4 Locations

Позволяет:
- создать/редактировать/удалить локацию;
- добавить изображение;
- редактировать переводы.

## 8.5 Products

Позволяет:
- создать/редактировать/удалить товар;
- назначить локацию/категорию;
- загружать изображение;
- задавать ссылки Wildberries и Ozon для карточки товара;
- редактировать переводы.

## 8.6 Acceptance (приемка)

Шаги:
1. Открыть `/admin/acceptance`.
2. Выбрать партию из списка `TRANSIT` или ввести ID вручную.
3. Сканировать/ввести `temp_id`.
4. Для найденного товара нажать:
   - `Accept` -> статус товара `STOCK_HQ`
   - `Reject` -> статус товара `REJECTED`
5. После обработки всех товаров нажать `Finish Batch` (кнопка блокируется, пока есть `NEW`).

## 8.7 Allocation (распределение)

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

## 9.5 QR-пакеты (`/partner/qr`)

Операционный центр для массовой выдачи QR:
1. Выбор партии.
2. Отметка позиций чекбоксами.
3. Массовые действия:
   - `Печать выбранных`;
   - `Печать всей партии`;
   - `CSV выбранных`.
4. Быстрые действия по строке:
   - `Копировать ссылку клона`;
   - `Открыть клон`;
   - `Показать QR`.

CSV формат:
- `batch_id,temp_id,public_token,status,clone_url,qr_url,photo_url,created_at`
- UTF-8 с BOM.

## 9.6 Печатный режим (`/partner/qr/print`)

- источник данных: `GET /api/batches/:batchId/qr-pack`;
- макет: 8 карточек на A4;
- карточка: QR, `temp_id`, короткий token, короткая clone-ссылка, превью фото;
- поддерживается browser print-to-PDF.

## 10. Публичная часть (`/`)

Возможности:
- просмотр глобуса с локациями;
- просмотр карточек товаров;
- мультиязычность (доступные языки из БД);
- корзина и checkout;
- регистрация/вход покупателя через логин и пароль;
- кнопка Telegram-авторизации как заглушка;
- история заказов в личном кабинете;
- базовые UI-разделы (account/cart/contacts и т.д.).

Checkout flow:
1. Покупатель добавляет товар в корзину.
2. В корзине он либо входит, либо регистрирует аккаунт через `POST /auth/register`.
3. После авторизации заполняет адрес доставки, телефон, email и комментарий.
4. Кнопка оплаты пока работает как заглушка и создаёт заявку через `POST /api/orders`.
5. Заявка появляется в `/admin/orders` у `ADMIN` и `SALES_MANAGER`.

## 11. Финансовая логика (вкратце)

Публичная активация (`POST /api/public/items/:publicToken/activate`) больше не проводит финансовые операции.

- endpoint только фиксирует факт активации для товаров в `ON_CONSIGNMENT`, `STOCK_ONLINE` или `SOLD_ONLINE`;
- повторный вызов остается идемпотентным и возвращает сообщение `Item already activated`;
- финансовое списание/начисление должно выполняться только в защищенном staff-сценарии.

## 12. Основные API (для отладки)

- Auth:
  - `GET /healthz`
  - `GET /auth/me`
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh`
- Admin/Public data:
  - `GET /api/users`
  - `POST /api/users`
  - `GET /api/locations`
  - `POST|PUT|DELETE /api/locations` (`ADMIN` / `MANAGER`)
  - `GET /api/products`
  - `POST|PUT|DELETE /api/products` (`ADMIN` / `MANAGER`)
  - `GET /api/languages`
- Orders:
  - `POST /api/orders`
  - `GET /api/orders/my` (`internal_note` скрыт)
  - `GET /api/orders` (`q`, `status`)
  - `PATCH /api/orders/:id` (`status`, `delivery_address`, `contact_phone`, `contact_email`, `comment`, `internal_note`)
- Logistics:
  - `GET /api/batches`
  - `POST /api/batches`
  - `GET /api/batches/:batchId/qr-pack`
  - `POST /api/batches/:id/send`
  - `GET /api/items/batch/:batchId` (включает `clone_url`, `qr_url`)
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

- задать обязательные `ACCESS_TOKEN_SECRET` и `REFRESH_TOKEN_SECRET` с длинными случайными значениями;
- сменить дефолтные пароли;
- добавить rate limit/anti-bruteforce на `POST /auth/register` и `POST /auth/login`;
- вынести медиа в объектное хранилище (S3/MinIO) при росте нагрузки;
- включить регулярные бэкапы БД.

---

Если нужно, можно сделать отдельную версию этого документа для конечных пользователей (без технических разделов) и отдельный runbook для DevOps.
