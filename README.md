# Stones

Stones is a full-stack application for HQ and franchise operations around stone item batches, inventory tracking, finance flows, and public digital twins tied to individual `Item` records.

## Stack

- Frontend: React 19, TypeScript, Vite, Tailwind, Zustand, React Three Fiber
- Backend: Node.js, Express, TypeScript (`tsx`)
- Database: Prisma + MySQL
- Tests: Playwright

## Core domain

- Roles: `ADMIN`, `MANAGER`, `FRANCHISEE`, `USER`
- Batch lifecycle: `DRAFT -> TRANSIT -> RECEIVED -> FINISHED`
- Item statuses: `NEW`, `REJECTED`, `STOCK_HQ`, `STOCK_ONLINE`, `ON_CONSIGNMENT`, `SOLD_ONLINE`, `ACTIVATED`
- Digital twin is attached to `Item`, not `Product`
- Public item page: `/clone/:publicToken`

Detailed product and business docs live in [docs/](./docs).

## Quick start

### Requirements

- Node.js 22+
- npm 10+
- MySQL available at `127.0.0.1:3307` or a custom `DATABASE_URL`

### Setup

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed:languages
npm run db:seed
npm run dev
```

Frontend runs on [http://localhost:5173](http://localhost:5173), backend on [http://localhost:3001](http://localhost:3001).

## Environment variables

Create `.env` from `.env.example`.

Required:

- `DATABASE_URL`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`

Common local defaults:

- `PORT=3001`
- `CLIENT_URL=http://localhost:5173`
- `VITE_HOST=127.0.0.1`
- `VITE_PORT=5173`
- `VITE_API_TARGET=http://127.0.0.1:3001`

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run server
npm run db:migrate
npm run db:seed:languages
npm run db:seed
npm run test:e2e
```

For isolated e2e runs:

```bash
npm run dev:e2e
```

## Project structure

- `src/` client application
- `server/` Express API and middleware
- `prisma/` schema, migrations, seed scripts
- `tests/e2e/` Playwright scenarios
- `docs/` business, usage, architecture, and operations docs

## Publication notes

- Local `.env`, SQLite/MySQL dumps, uploads, build artifacts, and test artifacts are ignored by Git.
- Example configuration is stored in `.env.example`.
- Test credentials and local technical notes are documented in [docs/TEST_CREDENTIALS_AND_TECH_INFO_RU.md](./docs/TEST_CREDENTIALS_AND_TECH_INFO_RU.md).

## Deployment and docs

- Usage guide: [docs/SYSTEM_USAGE_GUIDE_RU.md](./docs/SYSTEM_USAGE_GUIDE_RU.md)
- Business rules: [docs/BUSINESS_LOGIC_RU.md](./docs/BUSINESS_LOGIC_RU.md)
- Architecture: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Docker: [docs/DOCKER_RU.md](./docs/DOCKER_RU.md)
