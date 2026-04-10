# Запуск проекта в Docker

## Что поднимается
- `db`: MySQL 8.0 (порт `3307` на хосте)
- `app`: Node.js 22 (LTS) + фронтенд Vite + API Express (порты `5173` и `3001`)
- `video-processor`: отдельный worker без HTTP, который забирает video jobs из БД и обрабатывает их через `ffmpeg`/`ffprobe`

При старте `app` автоматически:
1. применяет Prisma миграции;
2. запускает API и фронтенд.

Образ приложения теперь включает `ffmpeg` и `ffprobe`, потому что они нужны `video-processor` для нормализации и склейки роликов.

Важно для нового HQ local export:
- backend хранит финальные MP4 на локальном диске контейнера;
- текущий rollout рассчитан только на `single-instance app` с persistent volume `stones_video_exports`;
- multi-instance deployment для этого флоу не поддерживается, пока storage не вынесен в object storage.

Сиды не выполняются автоматически. Это сделано для того, чтобы данные, добавленные вручную в работающей системе, не перезаписывались при `docker compose up --build`.

## Запуск
Перед `docker compose up --build` задайте обязательные secrets в окружении или `.env`:

```bash
export ACCESS_TOKEN_SECRET='replace-me'
export REFRESH_TOKEN_SECRET='replace-me'
```

После этого:

```bash
docker compose up --build
```

## Первичное заполнение тестовыми данными
Если нужна тестовая база из seed, выполните команды вручную после старта контейнеров:

```bash
docker compose exec app npm run db:seed:languages
docker compose exec app npm run db:seed
```

## Доступ
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Health: http://localhost:3001/healthz
- MySQL: localhost:3307

Логи video worker:

```bash
docker compose logs -f video-processor
```

Persistent volumes:
- `stones_uploads` -> публичные uploads;
- `stones_video_jobs` -> legacy video bundle processing;
- `stones_video_exports` -> финальные MP4 из HQ local export flow.

## Минимальный release smoke
1. `GET /healthz` возвращает `{ ok: true }`.
2. После `db:seed:languages` и `db:seed` доступны 5 пользователей и 1 базовая категория.
3. HQ может создать первую локацию и первый товар-шаблон.
4. Upload endpoints недоступны анонимно и работают только после логина.

## Тестовые аккаунты (из seed)
- Админ: `admin@stones.com` / `admin123`
- Менеджер HQ: `manager@stones.com` / `partner123`
- Менеджер продаж: `sales@stones.com` / `partner123`
- Франчайзи: `yakutia.partner@stones.com` / `partner123`
- Покупатель: `user` / `partner123`

## Остановка
```bash
docker compose down
```

## Остановка с удалением томов (полный сброс БД)
```bash
docker compose down -v
```
