# Архитектура ZAGARAMI

Документ описывает фактическую архитектуру текущего репозитория, а не целевую модель "на будущее".

## 1. Общая схема

ZAGARAMI состоит из четырех основных частей:

1. SPA-клиент на React.
2. Express API.
3. MySQL + Prisma.
4. Отдельный worker для обработки batch-видео.

В development:

- frontend поднимается Vite;
- backend поднимается `tsx server/index.ts`;
- клиент ходит в API через `VITE_API_TARGET`.

В production:

- клиент собирается в `dist/`;
- Express раздает API, статические uploads и собранный SPA;
- отдельный процесс `video-processor` обрабатывает задания по видео;
- в production compose трафик идет через Caddy.

## 2. Frontend

### Основные контуры

- публичная витрина: `src/App.tsx`, `src/components/*`
- HQ: `src/admin/*`
- франчайзи: `src/partner/*`
- публичный цифровой паспорт: `src/public/*`

### Ключевые маршруты

- `/` — витрина
- `/clone/:serialNumber` — публичный цифровой паспорт
- `/admin/login`
- `/admin/photo-tool/:batchId`
- `/admin/video-tool/:batchId`
- `/admin/qr/print`
- `/admin/*`
- `/partner/login`
- `/partner/dashboard`
- `/partner/batches`
- `/partner/batches/new`
- `/partner/finance`

### Frontend state

- глобальное клиентское состояние витрины хранится в Zustand: `src/store.ts`
- access token хранится в `localStorage`, а refresh-session хранится в `HttpOnly` cookie и обновляется через `authFetch`
- routing основан на `react-router-dom`

## 3. Backend

### Основной entrypoint

- `server/index.ts`

Он отвечает за:

- настройку `helmet`, `cors`, `express.json()`
- `/healthz`
- раздачу `public/uploads` и `public/locations`
- регистрацию route-модулей
- часть CRUD-эндпоинтов напрямую в самом `index.ts`
- SPA fallback для production-сборки

### Route-модули

- `server/routes/auth.ts` — buyer login/register + refresh + logout + me
- `server/routes/orders.ts` — заявки покупателей
- `server/routes/collectionRequests.ts` — задачи на сбор
- `server/routes/batches.ts` — партии, photo-tool, QR-pack, receive, finalize, video workflows
- `server/routes/items.ts` — staff/item detail и support-only patch
- `server/routes/hq.ts` — verify / accept / reject / legacy finish
- `server/routes/financials.ts` — профиль, ledger, allocation
- `server/routes/public.ts` — публичный паспорт, QR, activation
- `server/routes/content.ts` — тексты страницы цифрового паспорта
- `server/routes/upload.ts` — загрузка файлов

### Важная особенность текущей реализации

В проекте нет единого backend service layer для всех модулей.

Сейчас используется смешанный подход:

- значительная часть ORM-логики находится прямо в роутерах;
- часть общей логики вынесена в `server/utils/*` и `server/services/*`;
- для видео есть отдельные service-модули.

Это важно учитывать при планировании дальнейшего рефакторинга и при описании системы заказчику.

## 4. База данных

### Технология

- Prisma ORM
- MySQL как целевая БД

### Источник истины

- `prisma/schema.prisma`

### Главные группы сущностей

Каталог:
- `Language`
- `Category`
- `CategoryTranslation`
- `Location`
- `LocationTranslation`
- `Product`
- `ProductTranslation`

Пользователи и доступ:
- `User`
- `Role`

Продажи:
- `Order`
- `OrderItem`
- `OrderStatus`

Операционный контур:
- `CollectionRequest`
- `CollectionWorkflowStatus`
- `Batch`
- `BatchStatus`
- `Item`
- `ItemStatus`
- `SalesChannel`

Финансы и аудит:
- `Ledger`
- `LedgerOperation`
- `AuditLog`

Контент:
- `ContentPage`

Видео:
- `VideoProcessingJob`
- `VideoProcessingJobStatus`
- `BatchVideoExportSession`
- `BatchVideoExportStatus`

## 5. Аутентификация и доступ

### Механика

- access token — JWT с коротким TTL, refresh-session — server-side запись в `auth_sessions`, привязанная к `HttpOnly` cookie
- защищенные запросы используют `Authorization: Bearer <token>`
- middleware: `authenticateToken`, `requireRole`

### Роли

- `USER`
- `ADMIN`
- `MANAGER`
- `SALES_MANAGER`
- `FRANCHISEE`

### Практические ограничения

- `SALES_MANAGER` в UI ограничен разделом `/admin/orders`
- `MANAGER` не работает с очередью заказов сайта
- ручное редактирование `Item` доступно только `ADMIN`

## 6. Медиа и файлы

### Что хранится локально

- HQ-фото item: `public/uploads/photos`
- generic/source video uploads: `public/uploads/videos`
- legacy generated videos: `public/uploads/videos/generated`
- финальные export-flow ролики: `public/uploads/videos/exports`
- изображения локаций: `public/locations`
- staging и служебные каталоги: `storage/uploads/staging`, `storage/video-jobs`, `storage/video-export`

### Публичные URL

- uploaded media раздаются через `/uploads/*`, но inline разрешен только для безопасных raster/video extension; неизвестные типы отдаются как download с `nosniff`
- изображения локаций раздаются через `/locations/*`
- QR генерируется на лету через `/api/public/items/:serialNumber/qr`

## 7. Фото- и видео-контур

### HQ Photo Tool

- маршрут: `/admin/photo-tool/:batchId`
- backend: `GET /api/batches/:id/photo-tool`, `POST /api/batches/:id/photo-tool/apply`
- инструмент работает только для batch в `RECEIVED`
- сохранение идет по полному manifest и контролируется через `photo_state_token`
- итог сохраняется в `Item.item_photo_url`

В проекте есть два разных сценария работы с видео:

1. server-side processing через `server/videoProcessor.ts`
2. локальный export-flow через HQ Video Tool и desktop helper

### Backend video processing

- задания создаются через `/api/batches/:id/video-jobs`
- worker читает задания из БД
- результат может обновлять `item_video_url`

### Локальный export-flow

- HQ открывает `/admin/video-tool/:batchId`
- браузер проверяет локальный helper и его `protocol_version`
- создается `BatchVideoExportSession`
- локальный helper рендерит ролики по item
- незавершенная session может быть продолжена через retry-tail для отсутствующих файлов
- готовые `.mp4` дозагружаются обратно в backend

## 8. Публичный цифровой паспорт

Источник данных:

- `Item`
- связанный `Batch`
- связанный `Product`
- `ContentPage` с ключом `clone_page`

Паспорт доступен только если:

- item имеет актуальный `serial_number`
- batch находится в `RECEIVED` или `FINISHED`
- item не находится в `REJECTED`

Media в паспорте собираются так:

- фото: сначала `item.item_photo_url`, потом fallback на `item.photo_url`
- видео: `item.item_video_url`

## 9. Docker и deployment topology

### Local compose

- `db`
- `app`
- `video-processor`

### Production compose

- `caddy`
- `db`
- `app`
- `video-processor`

## 10. Тестирование

- lint: `npm run lint`
- type/build: `npm run build`
- e2e: `npm run test:e2e`

Playwright-конфиг:

- тесты: `tests/e2e`
- отдельный dev server для e2e поднимается через `npm run dev:e2e`

## 11. Ограничения текущей архитектуры

- часть бизнес-логики и CRUD находится в роутерах, а не в выделенном domain/service слое;
- часть старых сценариев все еще видна в модели данных и seed, хотя в UI уже недоступна;
- checkout пока работает как заявка, а не как полноценная платежная воронка;
- финансовый расчет не запускается автоматически из публичной активации;
- есть смешение operational batch-flow и legacy HQ-route flow (`server/routes/hq.ts` и `server/routes/batches.ts`).
