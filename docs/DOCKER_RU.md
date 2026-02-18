# Запуск проекта в Docker

## Что поднимается
- `db`: MySQL 8.0 (порт `3307` на хосте)
- `app`: Node.js 22 (LTS) + фронтенд Vite + API Express (порты `5173` и `3001`)

При старте `app` автоматически:
1. применяет Prisma миграции;
2. выполняет сиды языков;
3. выполняет базовый сид данных;
4. запускает API и фронтенд.

## Запуск
```bash
docker compose up --build
```

## Доступ
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- MySQL: localhost:3307

## Тестовые аккаунты (из seed)
- Админ: `admin@stones.com` / `admin123`
- Франчайзи: `partner@stones.com` / `partner123`

## Остановка
```bash
docker compose down
```

## Остановка с удалением томов (полный сброс БД)
```bash
docker compose down -v
```
