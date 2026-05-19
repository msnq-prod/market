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
- var `STONES_PROD_MIN_FREE_GB` — опционально, если нужен другой порог свободного места перед сборкой

Требования на сервере:

- git checkout репозитория уже существует;
- `.env.production` настроен вручную и не хранится в git;
- production checkout не должен содержать незакоммиченных tracked-изменений;
- `docker` и `docker compose` доступны для пользователя деплоя.
- `VITE_VIDEO_HELPER_DOWNLOAD_URL` может отсутствовать: тогда UI использует same-origin fallback `/uploads/downloads/ZAGARAMI-Video-Helper.dmg`.
- `VITE_VIDEO_HELPER_DOWNLOAD_URL_ARM64` может отсутствовать: тогда UI использует same-origin fallback `/uploads/downloads/ZAGARAMI-Video-Helper-arm64.dmg`.
- по умолчанию preflight требует 2 GiB свободного места, но порог можно переопределить через `STONES_MIN_FREE_GB`.

## 1.2 Desktop helper для zagarami.com

Production helper должен быть собран под канонический origin `https://zagarami.com`.

Базовый путь:

```bash
STONES_HELPER_ALLOWED_ORIGIN=https://zagarami.com npm run video-export-helper:desktop:dist
```

Для релизов можно явно задать версию helper:

```bash
STONES_HELPER_ALLOWED_ORIGIN=https://zagarami.com STONES_HELPER_VERSION=2026.5.14 npm run video-export-helper:desktop:dist
```

Если `STONES_HELPER_VERSION` не задан, сборка использует UTC-дату в формате `YYYY.M.D`. При нескольких релизах в один день задавайте версию вручную, чтобы встроенная проверка обновлений корректно видела новую сборку.

После сборки в `dist-electron/` должны лежать:

- versioned DMG от `electron-builder`;
- стабильный `ZAGARAMI-Video-Helper.dmg` для Intel;
- стабильный `ZAGARAMI-Video-Helper-arm64.dmg` для Apple Silicon.
- `ZAGARAMI-Video-Helper-update.json` — manifest обновлений с версией, URL, размером и sha256 для обеих архитектур.

Если используются same-origin ссылки по умолчанию, опубликуйте оба DMG по путям:

- `/uploads/downloads/ZAGARAMI-Video-Helper.dmg`
- `/uploads/downloads/ZAGARAMI-Video-Helper-arm64.dmg`
- `/uploads/downloads/ZAGARAMI-Video-Helper-update.json`

Если используются внешние URL, заполните `VITE_VIDEO_HELPER_DOWNLOAD_URL` и `VITE_VIDEO_HELPER_DOWNLOAD_URL_ARM64`.

Desktop helper проверяет обновления из `ZAGARAMI-Video-Helper-update.json`, скачивает подходящий DMG в локальный cache и открывает его. Автоматическая замена `.app` не выполняется: оператору нужно перетащить новую версию в Applications и перезапустить helper. Для нестандартного update URL используйте `STONES_HELPER_UPDATE_BASE_URL=https://.../downloads` при сборке helper.

При локальной эксплуатации packaged helper можно дополнительно ограничить render-нагрузку через `~/Library/Application Support/ZAGARAMI Video Helper/config.json` с ключами `video_render_concurrency` и `video_render_ffmpeg_threads`. Те же значения можно переопределить env-переменными `VIDEO_RENDER_CONCURRENCY` и `VIDEO_RENDER_FFMPEG_THREADS`.

При первом обращении `https://zagarami.com` к локальному `http://127.0.0.1:3012` браузер может запросить доступ к localhost или локальной сети. Этот доступ нужно разрешить, иначе Video Tool будет считать helper недоступным.

## 1.3 Desktop HQ для zagarami.com

`ZAGARAMI HQ` — отдельное Electron-приложение для HQ-админки. В production оно раздает собранный `dist/` через локальный loopback-server и проксирует `/api`, `/auth`, `/uploads`, `/healthz` на backend origin из `STONES_HQ_API_ORIGIN`.

Базовая сборка для production backend:

```bash
STONES_HQ_API_ORIGIN=https://zagarami.com npm run admin:desktop:dist
```

Для локальной приемки можно собрать против локального API:

```bash
STONES_HQ_API_ORIGIN=http://127.0.0.1:3001 npm run admin:desktop:dist
```

После сборки артефакты лежат в `dist-electron-hq/`. Эти файлы не коммитятся в репозиторий.

Для обновлений нужно опубликовать файлы:

- `/uploads/downloads/ZAGARAMI-HQ.dmg`
- `/uploads/downloads/ZAGARAMI-HQ-arm64.dmg`
- `/uploads/downloads/ZAGARAMI-HQ-update.json`

`ZAGARAMI-HQ-update.json` содержит версию, URL, размер и `sha256` для каждой macOS-архитектуры. Приложение проверяет manifest из same-origin backend, скачивает подходящий DMG в локальный cache, проверяет контрольную сумму и открывает установщик. Автоматическая замена `.app` не выполняется: оператору нужно перетащить новую версию в Applications и перезапустить `ZAGARAMI HQ`.

Особенности desktop HQ:

- dev-запуск: `npm run dev`, затем `npm run admin:desktop`;
- web-HQ пока остается emergency fallback и не отключается этим релизом;
- встроенный helper использует `ffmpeg`/`ffprobe` из packaged app;
- desktop media queue хранит state и временные файлы в `app.getPath('userData')/media-upload-queue`;
- скачанные обновления хранятся в `app.getPath('userData')/updates`;
- при проблемах с загрузками оператор должен сначала открыть индикатор очереди в HQ, повторить failed-задачи или отменить явно ненужные pending-задачи;
- ручная очистка cache допустима только при закрытом приложении и только если нет активных/pending задач, иначе можно потерять неподтвержденные загрузки.

Минимальная приемка перед выдачей операторам:

1. Открыть packaged `ZAGARAMI HQ`.
2. Войти под seeded/admin production-аккаунтом.
3. Проверить Dashboard, Acceptance, Photo Tool и Video Tool.
4. Проверить refresh/deep link для `/admin/login`, `/admin/photo-tool/:batchId`, `/admin/video-tool/:batchId`.
5. Проверить, что Photo Tool и Video Tool показывают состояние desktop media queue при временно недоступном backend.
6. Открыть панель обновлений HQ, проверить manifest, скачать DMG при наличии новой версии и убедиться, что checksum проходит.

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
