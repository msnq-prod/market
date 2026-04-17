# Docker и production deploy

Документ описывает реальные Docker-файлы и compose-стек текущего репозитория.

## 1. Что есть в репозитории

- `Dockerfile` — multi-stage build для runtime image
- `docker-compose.yml` — локальный production-like stack
- `docker-compose.prod.yml` — production stack для VPS
- `docker/Caddyfile` — reverse proxy для production
- `.env.production.example` — шаблон production env
- `scripts/ops/` — preflight, deploy, backup, restore

## 2. Локальный Docker stack

Запуск:

```bash
docker compose up -d --build
```

Поднимаются сервисы:

- `db` — MySQL 8.0, наружу `3307:3306`
- `app` — runtime image, наружу `3001:3001`
- `video-processor` — отдельный worker

### Особенности локального compose

- `app` запускается с `RUN_MIGRATIONS=1`
- `video-processor` запускается с `RUN_MIGRATIONS=0`
- uploads и video storage вынесены в docker volumes
- `CLIENT_URL` внутри local docker stack — `http://localhost:3001`
- сиды не выполняются автоматически
- runtime image использует системный `ffmpeg` из Alpine; desktop helper-зависимости `ffmpeg-static` и `ffprobe-static` в compose-сборку не устанавливаются

## 3. Production stack

Production compose рассчитан на один сервер и один публичный домен.

Сервисы:

- `caddy`
- `db`
- `app`
- `video-processor`

Наружу публикуются только:

- `80/tcp`
- `443/tcp`

`app`, `db` и `video-processor` остаются внутренними сервисами compose.

## 4. Production env

Создание файла:

```bash
cp .env.production.example .env.production
```

Ключевые переменные:

- `APP_DOMAIN`
- `ACME_EMAIL`
- `PORT`
- `CLIENT_URL`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `DATABASE_URL`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`
- `VIDEO_PROCESSOR_POLL_MS`
- `STONES_HELPER_ALLOWED_ORIGIN`
- `VITE_VIDEO_HELPER_DOWNLOAD_URL` — опционально, если нужен внешний URL вместо same-origin fallback `/uploads/downloads/ZAGARAMI-Video-Helper.dmg`

Инварианты:

- `CLIENT_URL` должен быть `https://<APP_DOMAIN>`
- `STONES_HELPER_ALLOWED_ORIGIN` должен совпадать с `CLIENT_URL`
- `DATABASE_URL` должен указывать на `db:3306`
- если `VITE_VIDEO_HELPER_DOWNLOAD_URL` не задан, UI использует same-origin fallback `/uploads/downloads/ZAGARAMI-Video-Helper.dmg`

## 5. Production deploy через scripts/ops

Рекомендуемый путь:

```bash
npm run ops:preflight
npm run ops:deploy
```

`preflight` проверяет:

- наличие `.env.production`
- обязательные env vars
- отсутствие placeholder-значений
- совпадение `CLIENT_URL` и `STONES_HELPER_ALLOWED_ORIGIN`
- что `DATABASE_URL` указывает на `db:3306`
- что хватает свободного места
- валидность production compose

`deploy` делает:

1. preflight
2. backup БД, если production db уже работает
3. `docker compose ... up -d --build`
4. ожидание healthy для `db` и `app`
5. healthcheck внутри `app`
6. healthcheck через `caddy`

### Deploy конкретной ревизии

Для CI/CD в репозиторий добавлен `scripts/ops/deploy-revision.sh`.

Пример:

```bash
./scripts/ops/deploy-revision.sh <commit_sha>
```

Скрипт:

- проверяет, что working tree чист по tracked-файлам;
- делает `git fetch --prune --tags origin`;
- переключает checkout на нужный commit;
- запускает стандартный `./scripts/ops/deploy.sh`.

Это позволяет деплоить на VPS ровно тот commit, который прошел CI в GitHub Actions.

### Порог свободного места

По умолчанию `preflight` требует минимум 5 GiB свободного места.

Для небольших VPS порог можно снизить через env:

```bash
STONES_MIN_FREE_GB=2 ./scripts/ops/deploy-revision.sh <commit_sha>
```

В GitHub Actions для этого предусмотрен repo variable `STONES_PROD_MIN_FREE_GB`.

## 6. Проверка после деплоя

Минимум:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -k -I https://<APP_DOMAIN>/healthz
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 100 app
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 100 caddy
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 100 video-processor
```

Плюс ручной smoke:

- открыть витрину;
- открыть `/admin/login`;
- открыть `/partner/login`;
- открыть хотя бы один `clone` URL;
- проверить HQ video flow и QR при необходимости.

## 7. Volumes

Local/prod compose используют:

- `stones_mysql_data`
- `stones_uploads`
- `stones_video_jobs`
- `stones_video_exports`

Production дополнительно использует:

- `caddy_data`
- `caddy_config`

## 8. Что важно помнить

- удаление compose stack вместе с volumes — destructive операция;
- backup БД хранится вне контейнеров, в `ops/backups/mysql/`;
- desktop video helper не запускается внутри docker compose;
- `video-processor` — обязательная часть production стека, если используется server-side video workflow.
