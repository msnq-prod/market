# Запуск проекта в Docker

## Что поднимается
- `db`: MySQL 8.0 (порт `3307` на хосте)
- `app`: Node.js 22 (LTS) + фронтенд Vite + API Express (порты `5173` и `3001`)

При старте `app` автоматически:
1. применяет Prisma миграции;
2. запускает API и фронтенд.

Сиды не выполняются автоматически. Это сделано для того, чтобы данные, добавленные вручную в работающей системе, не перезаписывались при `docker compose up --build`.

## Запуск
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
- MySQL: localhost:3307

## Тестовые аккаунты (из seed)
- Админ: `admin@stones.com` / `admin123`
- Менеджер продаж: `sales@stones.com` / `partner123`
- Франчайзи: `yakutia.partner@stones.com` / `partner123`
- Покупатель: `anna` / `partner123`

## Остановка
```bash
docker compose down
```

## Остановка с удалением томов (полный сброс БД)
```bash
docker compose down -v
```
