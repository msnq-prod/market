# Эксплуатация production stack

Документ описывает рабочие production-операции, которые поддерживаются текущими скриптами `scripts/ops/*`.

## 1. Релиз

Базовый путь релиза:

```bash
npm run ops:preflight
npm run ops:deploy
```

### Что делает preflight

- загружает `.env.production`
- проверяет обязательные env vars
- проверяет, что значения не похожи на placeholder
- сверяет `CLIENT_URL` и `STONES_HELPER_ALLOWED_ORIGIN`
- проверяет `DATABASE_URL -> db:3306`
- проверяет Docker и `docker compose`
- проверяет свободное место на диске
- валидирует `docker-compose.prod.yml`

### Что делает deploy

1. запускает preflight
2. делает backup БД, если production db уже поднята
3. запускает `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`
4. ждет healthy для `db`
5. ждет healthy для `app`
6. делает внутренний healthcheck `app`
7. делает внешний healthcheck через `caddy`

## 1.1 Автоматический релиз через GitHub Actions

В репозитории предусмотрен workflow:

- `.github/workflows/ci-cd.yml`

Поведение:

1. на каждый push в `main` запускает `npm ci`, `npm run lint`, `npm run build`;
2. если CI зеленый, подключается по SSH к production-серверу;
3. на сервере запускает `./scripts/ops/deploy-revision.sh <commit_sha>`;
4. `deploy-revision.sh` делает `git fetch`, переключает checkout на точный commit и запускает обычный `scripts/ops/deploy.sh`.

Нужные GitHub Actions secrets / vars:

- secret `STONES_PROD_SSH_PRIVATE_KEY`
- var `STONES_PROD_SSH_HOST`
- var `STONES_PROD_SSH_PORT`
- var `STONES_PROD_SSH_USER`
- var `STONES_PROD_APP_DIR`
- var `STONES_PROD_MIN_FREE_GB` — опционально, если на VPS меньше 5 GiB свободного места перед сборкой

Требования на сервере:

- git checkout репозитория уже существует;
- `.env.production` настроен вручную и не хранится в git;
- production checkout не должен содержать незакоммиченных tracked-изменений;
- `docker` и `docker compose` доступны для пользователя деплоя.
- `VITE_VIDEO_HELPER_DOWNLOAD_URL` может отсутствовать, если production-сборка desktop helper пока не опубликована.
- по умолчанию preflight требует 5 GiB свободного места, но порог можно переопределить через `STONES_MIN_FREE_GB`.

## 2. Backup базы данных

Команда:

```bash
npm run ops:backup
```

Или напрямую:

```bash
./scripts/ops/backup-db.sh
./scripts/ops/backup-db.sh /absolute/path/to/backup.sql.gz
```

Поведение:

- использует `mysqldump` внутри контейнера `db`
- пишет gzip-backup
- по умолчанию сохраняет файл в `ops/backups/mysql/`
- удаляет `.sql.gz` старше 14 дней

## 3. Restore базы данных

Команда:

```bash
./scripts/ops/restore-db.sh ops/backups/mysql/<backup>.sql.gz --yes
```

Поведение:

1. поднимает `db`, если нужно
2. останавливает `app` и `video-processor`
3. удаляет и создает БД заново
4. разворачивает backup
5. поднимает `app` и `video-processor`
6. ждет healthcheck `app`

Важно:

- restore — destructive операция;
- выполняется только осознанно и вручную;
- без `--yes` команда не запустится.

## 4. Rollback

Если проблема только в коде:

1. зафиксируйте логи
2. верните предыдущий commit / tag на сервере
3. повторите `npm run ops:deploy`

Если проблема в данных:

- используйте restore только после решения оператора;
- не делайте ручной DDL в production.

## 5. Healthcheck и наблюдаемость

### Основные сигналы

- `GET /healthz` должен возвращать `200`
- `docker compose ps` не должен показывать restarting/unhealthy
- логи смотреть через `docker compose logs`

### Что проверять регулярно

- свободное место на диске;
- размер `stones_mysql_data`;
- размер `stones_uploads`;
- размер `ops/backups/mysql/`;
- свежесть последнего backup.

## 6. Запрещенные действия

- ручной DDL в production
- restore без backup и явного подтверждения
- удаление volumes без понимания последствий
- хранение реальных production secrets в документации репозитория
