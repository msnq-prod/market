# AGENTS.md

## 1. Назначение
Этот файл задает единые правила работы ИИ-агентов в репозитории `stones`.

Цель агента:
- вносить точечные, проверяемые изменения;
- не ломать бизнес-логику трекинга партий и цифровых двойников;
- оставлять проект в рабочем состоянии после каждого изменения.

## 2. Технологический стек
- Frontend: React 19 + TypeScript + Vite + Tailwind + Zustand + R3F.
- Backend: Node.js + Express 5 + TypeScript (`tsx`).
- ORM/DB: Prisma + MySQL.
- Тесты: Playwright (e2e).

Ключевые файлы конфигурации:
- `package.json`
- `prisma/schema.prisma`
- `prisma/migrations/*`
- `.env`
- `.env.example`
- `server/index.ts`
- `playwright.config.ts`
- `vite.config.ts`

## 3. Быстрый старт для агента
Требования:
- Node.js 22+
- npm 10+
- MySQL на `127.0.0.1:3307` или корректный `DATABASE_URL`

Локальный запуск:
1. Установить зависимости: `npm install`
2. Создать env-файл: `cp .env.example .env`
3. Заполнить обязательные секреты: `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `TELEGRAM_TOKEN_ENCRYPTION_KEY`
4. Применить миграции: `npm run db:migrate`
5. Заполнить данные: `npm run db:seed:languages && npm run db:seed`
6. Запуск dev-режима: `npm run dev`

Порты по умолчанию:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- MySQL: `127.0.0.1:3307`

E2E-окружение:
- запуск: `npm run dev:e2e`
- frontend: `http://127.0.0.1:5273`
- backend healthcheck: `http://127.0.0.1:3101/healthz`

## 4. Структура проекта
- `src/` — клиентское приложение.
  - `src/admin/` — интерфейсы HQ (админ/менеджер).
  - `src/partner/` — интерфейсы франчайзи.
  - `src/public/` — публичная страница цифрового двойника.
- `server/` — Express API, middleware, services, utils и worker entrypoints.
  - `server/routes/*` — route-модули API.
  - `server/services/*` — вынесенная backend-логика.
  - `server/videoProcessor.ts` — worker обработки batch-видео.
  - `server/telegramWorker.ts` — worker Telegram-уведомлений.
- `prisma/` — схема, миграции, seed.
- `tests/e2e/` — Playwright e2e.
- `docs/` — документация продукта и эксплуатации.
- `scripts/ops/` — production deploy / backup / restore.
- `video-export-helper/` — локальный desktop helper для HQ Video Tool.
- `docker-compose.yml`, `docker-compose.prod.yml` — local/prod compose topology.

## 5. Бизнес-домен (обязательно учитывать)

### 5.1 Роли
- `ADMIN`
- `MANAGER`
- `SALES_MANAGER`
- `FRANCHISEE`
- `USER`

### 5.2 Статусы заказов покупателей (`OrderStatus`)
`NEW`, `IN_PROGRESS`, `PACKED`, `SHIPPED`, `RECEIVED`, `RETURN_REQUESTED`, `RETURN_IN_TRANSIT`, `RETURNED`, `CANCELLED`.

Основной прямой путь:
`NEW -> IN_PROGRESS -> PACKED -> SHIPPED -> RECEIVED`.

Возвратный путь:
`SHIPPED -> RETURN_REQUESTED -> RETURN_IN_TRANSIT -> RETURNED`.

### 5.3 Статусы задач на сбор (`CollectionWorkflowStatus`)
`OPEN`, `IN_PROGRESS`, `IN_TRANSIT`, `RECEIVED`, `IN_STOCK`, `CANCELLED`.

Основной путь:
`OPEN -> IN_PROGRESS -> IN_TRANSIT -> RECEIVED -> IN_STOCK`.

### 5.4 Статусы партии (`BatchStatus`)
`DRAFT`, `TRANSIT`, `RECEIVED`, `ERROR`, `FINISHED`.

Основной рабочий путь:
`TRANSIT -> RECEIVED -> FINISHED`.

### 5.5 Статусы item (`ItemStatus`)
`NEW`, `REJECTED`, `STOCK_HQ`, `STOCK_ONLINE`, `ON_CONSIGNMENT`, `SOLD_ONLINE`, `ACTIVATED`.

### 5.6 Цифровой двойник
Важно: цифровой двойник привязан к **Item** и `Item.serial_number`, не к Product.
- Публичный URL: `/clone/:serialNumber`
- QR PNG: `/api/public/items/:serialNumber/qr`
- API карточки: `/api/public/items/:serialNumber`
- Публичная активация: `POST /api/public/items/:serialNumber/activate`

Паспорт доступен только если:
- `serial_number` не является legacy token;
- связанная batch находится в `RECEIVED` или `FINISHED`;
- item не в `REJECTED`;
- связанные `Batch`, `Product`, `Location` не скрыты через `deleted_at`.

## 6. Источники истины
- Схема БД: `prisma/schema.prisma`.
- Миграции: `prisma/migrations/*`.
- Изменения схемы: только через `prisma migrate`.
- Базовые тестовые данные: `prisma/seed.ts`, `prisma/seed_languages.ts`.
- API-контракты: текущие route-модули в `server/routes/*` и endpoints в `server/index.ts`.
- Роли и UI-маршруты: `src/App.tsx`, `src/admin/*`, `src/partner/*`.
- Правила и фактическая архитектура: `docs/RULES.md`, `docs/BUSINESS_LOGIC_RU.md`, `docs/ARCHITECTURE.md`.

Если схема и фактическая БД расходятся, агент обязан:
1. явно зафиксировать расхождение в отчете;
2. предложить безопасный путь синхронизации (миграция/пересид);
3. не делать ручные DDL-правки.

## 7. Правила работы с кодом

### 7.1 Общие
- Делать минимальный рабочий diff, без лишних рефакторингов.
- Сохранять текущий стиль кода в изменяемом модуле.
- Не менять публичные контракты API без явного запроса.
- Не переименовывать поля БД/статусы без миграции и проверки всех зависимостей.

### 7.2 Backend
- Проверять ACL при изменении защищенных маршрутов.
- Не логировать токены/пароли/секреты.
- Возвращать понятные ошибки API (`{ error: string }`) в текущем стиле проекта.

### 7.3 Frontend
- Не ломать маршрутизацию ролей (`/`, `/clone/:serialNumber`, `/admin/login`, `/admin/*`, `/partner/login`, `/partner/*`).
- Для новых UI-сценариев учитывать мобильную ширину и состояние загрузки/ошибки.
- Текст интерфейса по умолчанию на русском, если не задано иначе.

### 7.4 Prisma/БД
- Любое изменение `schema.prisma` должно сопровождаться миграцией.
- Учитывать enum-статусы и существующие переходы в API.
- Проверять, что сид остается идемпотентным и воспроизводимым.

## 8. Тестирование и проверка
Минимум перед сдачей (если применимо):
1. `npm run lint`
2. `npm run build`
3. Точечный запуск затронутого сценария (ручной или e2e)
4. Для изменений БД/seed: `npm run db:seed:languages && npm run db:seed`

Полезные команды:
- `npm run test:e2e`
- `npm run test:e2e:headed`
- `npm run dev:e2e`

Если проверка не запускалась, агент обязан явно написать это в отчете.

Для изменений только в документации агентов достаточно проверить diff по измененным документам.

## 9. Работа с тестовыми аккаунтами
Актуальные тестовые креды хранить и обновлять в:
- `docs/TEST_CREDENTIALS_AND_TECH_INFO_RU.md`

При изменении seed-аккаунтов агент обязан:
1. обновить этот документ;
2. проверить, не сломаны ли e2e-тесты с хардкодом логинов.

В e2e и фикстурах используются seeded-аккаунты:
- `admin@stones.com` / `admin123`
- `manager@stones.com` / `partner123`
- `sales@stones.com` / `partner123`
- `yakutia.partner@stones.com` / `partner123`

Если эти аккаунты или пароли меняются, нужно синхронно обновить seed, `docs/TEST_CREDENTIALS_AND_TECH_INFO_RU.md` и e2e/fixtures, где логины захардкожены.

## 10. Безопасность
- Секреты только через переменные окружения.
- Пароли только в хэшированном виде.
- Не добавлять в репозиторий приватные ключи, токены, дампы прод-данных.
- Не использовать destructive-команды (`reset --hard`, массовое удаление) без прямого запроса.

## 11. Правила для изменений API и контрактов
Если меняется контракт endpoint (request/response):
1. обновить фронтенд, который это использует;
2. обновить документацию в `docs/`;
3. при необходимости обновить e2e/интеграционные тесты.

## 12. Правила для документации
После значимых изменений агент обновляет релевантный документ:
- бизнес-правила: `docs/BUSINESS_LOGIC_RU.md`
- использование системы: `docs/SYSTEM_USAGE_GUIDE_RU.md`
- Docker/развертывание: `docs/DOCKER_RU.md`
- тестовые креды и тех.инфо: `docs/TEST_CREDENTIALS_AND_TECH_INFO_RU.md`

## 13. Definition of Done (DoD)
Задача считается завершенной, когда:
1. изменение реализовано и работает локально;
2. затронутые проверки выполнены или явно отмечены как невыполненные;
3. не нарушены ACL и ключевые бизнес-переходы статусов;
4. документация/креды обновлены при необходимости;
5. в отчете перечислены:
   - что изменено,
   - где изменено,
   - как проверено,
   - какие риски/ограничения остались.

## 14. Формат отчета агента по задаче
Рекомендуемый краткий формат:
1. **Изменения** — список файлов и сути правок.
2. **Проверка** — какие команды/сценарии выполнены.
3. **Риски/долг** — что осталось вне объема.
4. **Следующие шаги** — только если действительно нужны.

---

Если инструкции из задачи пользователя противоречат этому файлу, приоритет у прямой инструкции пользователя.
