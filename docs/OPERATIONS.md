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
