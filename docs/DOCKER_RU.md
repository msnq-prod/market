# Запуск проекта в Docker

## Что поднимается
- `db`: MySQL 8.0 (порт `3307` на хосте)
- `app`: Node.js 22 (LTS) + API Express, который раздает собранный фронтенд и API на порту `3001`

При старте `app` автоматически:
1. применяет Prisma миграции;
2. запускает API;
3. раздает заранее собранный production-фронтенд из `dist/`.

Сиды не выполняются автоматически. Это сделано для того, чтобы данные, добавленные вручную в работающей системе, не перезаписывались при `docker compose up --build`.

JWT-секреты теперь обязательны. Перед `docker compose up --build` задайте в `.env`:

```env
ACCESS_TOKEN_SECRET=replace_with_a_long_random_access_secret
REFRESH_TOKEN_SECRET=replace_with_a_long_random_refresh_secret
```

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
- Приложение и API: http://localhost:3001
- Health check: http://localhost:3001/healthz
- MySQL: localhost:3307

## Тестовые аккаунты (из seed)
- Админ: `admin@stones.com` / `admin123`
- Менеджер продаж: `sales@stones.com` / `partner123`
- Франчайзи: `yakutia.partner@stones.com` / `partner123`
- Покупатель: `anna` / `partner123`

Для внешнего доступа поменяйте `CLIENT_URL` на публичный origin приложения, иначе QR/clone-ссылки будут собираться некорректно.

## Остановка
```bash
docker compose down
```

## Остановка с удалением томов (полный сброс БД)
```bash
docker compose down -v
```
