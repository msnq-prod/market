# Stones: руководство по системе

Актуально для проекта в `/Users/nikitamysnik/Desktop/progs/stones`.

## 1. Назначение

Система покрывает четыре рабочих контура:
- публичная витрина и checkout;
- HQ-админка;
- партнерский кабинет;
- публичный паспорт конкретного камня (`digital clone`).

В v1 основная модель такая:
- `Product` = товар-шаблон;
- `CollectionRequest` = заказ на сбор;
- `Batch` = партия;
- `Item` = конкретный камень/экземпляр.

## 2. Быстрый старт

```bash
npm install
npm run db:migrate
npm run db:seed:languages
npm run db:seed
npm run dev
```

По умолчанию:
- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`
- mysql: `127.0.0.1:3307`

## 3. Основные роли

- `ADMIN`, `MANAGER` — `/admin`
- `SALES_MANAGER` — `/admin/orders`
- `FRANCHISEE` — `/partner`
- `USER` — публичная витрина `/`

CRUD товаров и локаций защищен: работать с ними могут только `ADMIN` и `MANAGER`.

## 4. Публичная витрина

Пользователь видит:
- опубликованные товарные шаблоны;
- наличие, рассчитанное по `Item` со статусом `STOCK_ONLINE` и `is_sold = false`;
- кнопку покупки только если экземпляры реально есть на складе.

Checkout:
- создает site-order;
- не позволяет оформить заказ на неопубликованный шаблон;
- не позволяет оформить заказ при нулевом остатке.

## 5. Админка HQ

### 5.1 Dashboard

Показывает:
- количество локаций;
- количество товарных шаблонов;
- количество пользователей и франчайзи;
- партии в `IN_TRANSIT`;
- количество `Item` на HQ-складе.

### 5.2 Products

Экран `/admin/products` позволяет:
- создавать и редактировать товар-шаблон;
- задавать `country_code`, `location_code`, `item_code`;
- задавать описание локации и описание товара;
- публиковать или скрывать шаблон;
- создавать заказ на сбор прямо из строки товара;
- видеть связанные партии и текущий доступный остаток.

Поле количества заказа на сбор:
- только целое число;
- диапазон `1..999`.

### 5.3 Warehouse

Экран `/admin/warehouse` — обзорный центр складской логистики и заказов на сбор.

Возможности:
- видеть все `CollectionRequest`;
- удалять открытый заказ без партии;
- возвращать заказ в пул (`OPEN`);
- отменять заказ (`CANCELLED`);
- видеть партии, их статусы, media-прогресс и текущие video/job состояния;
- раскрывать партию для обзора `Item`, QR и clone-ссылок;
- контролировать общий складской остаток без дублирования приемочных операций.

### 5.4 Acceptance

Экран `/admin/acceptance` — основной рабочий центр HQ-приемки.

Основной batch-first поток:
- показывает партии в `IN_TRANSIT` и `RECEIVED`;
- позволяет принять партию в HQ (`IN_TRANSIT -> RECEIVED`);
- показывает прогресс по фото, видео и общей media-полноте;
- загружает фото по `serial_number`;
- открывает локальный монтажный инструмент `/admin/video-tool/:batchId`;
- переводит партию в `IN_STOCK` только после полной media-готовности.

Legacy-секция внутри `Acceptance`:
- сохраняет проверку по `temp_id`;
- поддерживает действия `accept/reject`;
- оставляет кнопку `Finish Batch` только для старых сценариев и e2e-совместимости.

Правило перевода в `IN_STOCK`:
- у каждого `Item` должны быть и фото, и видео;
- если для партии идет legacy video job в `QUEUED` или `PROCESSING`, перевод в `IN_STOCK` блокируется;
- если для партии есть активная local export session в `OPEN` или `UPLOADING`, перевод в `IN_STOCK` тоже блокируется.

Локальный монтаж видео:
- точка входа из `Acceptance` через кнопку `Монтаж видео`;
- экран маршрута: `/admin/video-tool/:batchId`;
- для HQ pilot нужен отдельный macOS helper `Stones Video Helper`, который скачивается прямо из экрана монтажа;
- пользователь ставит `DMG`, один раз открывает helper, дальше он живёт в menu bar и стартует при логине автоматически;
- dev fallback для локальной разработки: `npm run video-export-helper`;
- монтажер загружает один исходник локально, режет его на `000..NNN` и экспортирует только готовые финальные MP4;
- файл `000` считается внутренним вступлением и отдельно на сервер не отправляется;
- каждый итоговый ролик уходит на сервер по `Item.serial_number`;
- draft нарезки хранится локально в браузере по ключу `video-tool-draft:<batchId>`;
- при падении загрузки повторять нужно только оставшиеся `serial_number`, уже загруженные файлы не трогаются;
- export-session можно отменить вручную;
- если export-session зависла более чем на 24 часа, backend переводит ее в `ABANDONED`, а следующий запуск выполняет retry-tail.

Production helper build:
- production DMG собирается отдельно командой `STONES_HELPER_ALLOWED_ORIGIN=https://admin.example.com npm run video-export-helper:desktop:dist`;
- ссылка на production DMG попадает в web UI через `VITE_VIDEO_HELPER_DOWNLOAD_URL`.

### 5.5 Allocation

Экран `/admin/allocation` работает с `Item` в статусе `STOCK_HQ`.

Поддерживаются каналы:
- `MARKETPLACE` -> `STOCK_ONLINE`
- `OFFLINE_POINT` -> `ON_CONSIGNMENT`

### 5.6 Orders

Экран `/admin/orders` обслуживает интернет-заказы:
- поиск;
- редактирование контактных данных;
- `internal_note`;
- переходы `NEW -> IN_PROGRESS -> COMPLETED`;
- отмена `NEW|IN_PROGRESS -> CANCELLED`.

## 6. Партнерский кабинет

### 6.1 Dashboard

Экран `/partner/dashboard` показывает:
- баланс;
- открытые заказы на сбор;
- заказы в работе;
- последние партии;
- счетчики партий в `IN_TRANSIT`, `RECEIVED`, `IN_STOCK`.

Партнер может:
- принять заказ из общего пула;
- перейти к выполнению принятого заказа.

### 6.2 Выполнение заказа на сбор

Экран `/partner/batches/new` теперь работает не как ручной `New Batch`, а как выполнение принятого `CollectionRequest`.

Партнер:
- выбирает заказ в статусе `IN_PROGRESS`;
- вводит координаты;
- вводит дату и время сбора;
- загружает видео;
- подтверждает выполнение.

Система автоматически:
- создает `Batch`;
- создает все `Item`;
- генерирует `serial_number`, `item_seq`, `public_token`;
- переводит заказ и партию в `IN_TRANSIT`.

### 6.3 Batches

Экран `/partner/batches` показывает:
- партии партнера;
- статусы `IN_PROGRESS`, `IN_TRANSIT`, `RECEIVED`, `IN_STOCK`, `CANCELLED`;
- число проданных и непроданных позиций;
- экспорт CSV по партиям.

### 6.4 QR Center

Экран `/partner/qr` позволяет:
- выбрать партию;
- получить `clone_url` и `qr_url` по каждому `Item`;
- печатать выбранные или все QR;
- экспортировать CSV.

### 6.5 Finance

Экран `/partner/finance` показывает:
- баланс;
- историю ledger;
- фильтры по операциям.

## 7. Digital Clone

Страница паспорта конкретного экземпляра:

- URL: `/clone/:publicToken`
- API: `GET /api/public/items/:publicToken`
- QR PNG: `GET /api/public/items/:publicToken/qr`

Паспорт показывает:
- серийный номер;
- фото и видео конкретного `Item`;
- статус продажи;
- дату и время сбора;
- данные связанного `Product`;
- данные локации.

## 8. Ключевые API

Аутентификация:
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

Шаблоны и каталог:
- `GET /api/locations`
- `GET /api/categories`
- `GET /api/products` — staff only
- `POST /api/products` — staff only
- `PUT /api/products/:id` — staff only
- `PATCH /api/products/:id/publish` — staff only

Заказы на сбор:
- `GET /api/collection-requests`
- `POST /api/collection-requests`
- `PATCH /api/collection-requests/:id`
- `DELETE /api/collection-requests/:id`
- `POST /api/collection-requests/:id/ack`
- `POST /api/collection-requests/:id/complete`

Партии:
- `GET /api/batches`
- `GET /api/batches/:id/video-tool`
- `POST /api/batches/:id/video-export-sessions`
- `GET /api/batches/:id/video-export-sessions/:sessionId`
- `POST /api/batches/:id/video-export-sessions/:sessionId/files`
- `POST /api/batches/:id/video-jobs`
- `POST /api/batches/:id/receive`
- `POST /api/batches/:id/media-sync`
- `POST /api/batches/:id/finalize`
- `GET /api/batches/:batchId/qr-pack`

Legacy-совместимость:
- `POST /api/batches`
- `POST /api/batches/:id/send`
- `POST /api/items/batch/:batchId/items`
- `POST /api/hq/acceptance/:batchId/verify`
- `POST /api/hq/items/:itemId/accept`
- `POST /api/hq/items/:itemId/reject`
- `POST /api/hq/batches/:batchId/finish`

Публичный паспорт:
- `GET /api/public/items/:publicToken`
- `GET /api/public/items/:publicToken/qr`
- `POST /api/public/items/:publicToken/activate`

## 9. Проверка после изменений

Минимальный набор:

```bash
npm run db:seed
npm run lint
npm run build
```

Для полного регресса:

```bash
npm run test:e2e
```

## 10. Практический сценарий v1

1. Админ создает товар-шаблон в `/admin/products`.
2. Админ публикует шаблон переключателем.
3. Админ создает заказ на сбор из строки шаблона.
4. Партнер принимает заказ в `/partner/dashboard`.
5. Партнер выполняет заказ в `/partner/batches/new`.
6. Система создает партию и камни, генерирует серийники и QR.
7. HQ открывает `/admin/acceptance`, принимает партию, загружает фото по `serial_number` и запускает локальный видео-инструмент для партии.
8. HQ переводит партию в `IN_STOCK`.
9. Публичная карточка шаблона начинает показывать актуальный остаток.
10. Покупатель получает QR и открывает паспорт своего конкретного `Item`.

---
Актуально на 06.04.2026
