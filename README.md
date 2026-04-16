# ZAGARAMI

ZAGARAMI — публичный бренд full-stack системы для работы с уникальными камнями: от постановки задачи на сбор и приемки партии до публичной витрины, заявки на покупку и цифрового паспорта конкретного экземпляра. Репозиторий, npm-пакет и часть технических идентификаторов пока используют внутреннее имя `stones`.

## Что уже покрывает система

- публичную витрину с глобусом, локациями и товарами;
- buyer-аккаунты, корзину и оформление заявки на покупку;
- кабинет HQ для приемки, склада, каталога и пользователей;
- кабинет франчайзи для выполнения задач на сбор и просмотра финансов;
- учет партий и отдельных `Item`;
- публичный цифровой паспорт `/clone/:serialNumber`;
- HQ-инструменты для фото, QR и итогового видео по item.

## Стек

- Frontend: React 19, TypeScript, Vite, Tailwind, Zustand, React Three Fiber
- Backend: Node.js, Express 5, TypeScript (`tsx`)
- Database: Prisma + MySQL
- Tests: Playwright

## Ключевые роли

- `ADMIN`
- `MANAGER`
- `SALES_MANAGER`
- `FRANCHISEE`
- `USER`

## Ключевые статусы

Заказы покупателей:
- `NEW`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELLED`

Заказы на сбор:
- `OPEN`
- `IN_PROGRESS`
- `IN_TRANSIT`
- `RECEIVED`
- `IN_STOCK`
- `CANCELLED`

Партии:
- `DRAFT`
- `TRANSIT`
- `RECEIVED`
- `ERROR`
- `FINISHED`

Позиции `Item`:
- `NEW`
- `REJECTED`
- `STOCK_HQ`
- `STOCK_ONLINE`
- `ON_CONSIGNMENT`
- `SOLD_ONLINE`
- `ACTIVATED`

## Быстрый старт

### Требования

- Node.js 22+
- npm 10+
- MySQL на `localhost:3307` или собственный `DATABASE_URL`

### Локальный запуск

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed:languages
npm run db:seed
npm run dev
```

После запуска:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:3001](http://localhost:3001)

### Запуск e2e-окружения

```bash
npm run dev:e2e
```

Playwright по умолчанию использует:

- app: `http://127.0.0.1:5273`
- backend healthcheck: `http://127.0.0.1:3101/healthz`

## Переменные окружения

Минимально обязательны:

- `DATABASE_URL`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`

Часто используются локально:

- `PORT=3001`
- `CLIENT_URL=http://localhost:5173`
- `VITE_HOST=127.0.0.1`
- `VITE_PORT=5173`
- `VITE_API_TARGET=http://127.0.0.1:3001`
- `VITE_VIDEO_HELPER_DOWNLOAD_URL=https://downloads.example.com/ZAGARAMI-Video-Helper.dmg`

## Основные скрипты

```bash
npm run dev
npm run dev:e2e
npm run build
npm run build:server
npm run lint
npm run server
npm run start:prod
npm run video-processor
npm run video-processor:prod
npm run db:migrate
npm run db:seed:languages
npm run db:seed
npm run db:repair:item-serials
npm run test:e2e
npm run test:e2e:headed
npm run ops:preflight
npm run ops:backup
npm run ops:restore
npm run ops:deploy
```

Проверка и исправление серийных номеров:

```bash
npm run db:repair:item-serials
npm run db:repair:item-serials -- --apply
```

## Структура проекта

- `src/` — клиентское приложение
- `src/admin/` — HQ-интерфейсы
- `src/partner/` — кабинет франчайзи
- `src/public/` — публичный цифровой паспорт
- `server/` — Express API, middleware, worker
- `prisma/` — схема, миграции, seed
- `tests/e2e/` — сценарии Playwright
- `docs/` — продуктовая, пользовательская и эксплуатационная документация
- `scripts/ops/` — production deploy / backup / restore
- `video-export-helper/` — локальный desktop helper для видеоэкспорта

## Что важно знать о текущей реализации

- публичный checkout не проводит реальную оплату, а создает заявку для менеджера продаж;
- публичная активация `Item` не делает финансовые проводки, а только фиксирует `ACTIVATED`;
- цифровой паспорт доступен только для item, у которых batch в `RECEIVED` или `FINISHED`, и сам item не `REJECTED`;
- UI и API распределения в текущем MVP используют онлайн-сценарий; офлайн-консигнация есть в модели данных и seed, но новое назначение этого канала заблокировано;
- Prisma в текущем коде используется прямо в роутерах и отдельных util/service-модулях, единого service layer на весь backend нет.

## Документация

- Полный пакет документации: [docs/DOCUMENTATION_PACKAGE_RU.md](./docs/DOCUMENTATION_PACKAGE_RU.md)
- Общий usage guide: [docs/SYSTEM_USAGE_GUIDE_RU.md](./docs/SYSTEM_USAGE_GUIDE_RU.md)
- Бизнес-логика: [docs/BUSINESS_LOGIC_RU.md](./docs/BUSINESS_LOGIC_RU.md)
- Карта процессов и аудит: [docs/BUSINESS_PROCESSES_AUDIT_RU.md](./docs/BUSINESS_PROCESSES_AUDIT_RU.md)
- Визуальная карта процессов: [docs/BUSINESS_PROCESS_MAP_RU.md](./docs/BUSINESS_PROCESS_MAP_RU.md)
- Руководство HQ: [docs/USER_GUIDE_ADMIN_RU.md](./docs/USER_GUIDE_ADMIN_RU.md)
- Руководство франчайзи: [docs/USER_GUIDE_FRANCHISEE_RU.md](./docs/USER_GUIDE_FRANCHISEE_RU.md)
- Руководство владельца: [docs/USER_GUIDE_OWNER_RU.md](./docs/USER_GUIDE_OWNER_RU.md)
- Тестовые креды и техинфо: [docs/TEST_CREDENTIALS_AND_TECH_INFO_RU.md](./docs/TEST_CREDENTIALS_AND_TECH_INFO_RU.md)
- Архитектура: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Docker и production deploy: [docs/DOCKER_RU.md](./docs/DOCKER_RU.md)
- Эксплуатация production: [docs/OPERATIONS.md](./docs/OPERATIONS.md)

## Deployment

- Production env template: [`.env.production.example`](./.env.production.example)
- Production compose: [`docker-compose.prod.yml`](./docker-compose.prod.yml)
- Local compose: [`docker-compose.yml`](./docker-compose.yml)
- Ops scripts: [`scripts/ops/`](./scripts/ops)
- VPS runbook template: [`VPS_DEPLOY_LOCAL.md`](./VPS_DEPLOY_LOCAL.md)
