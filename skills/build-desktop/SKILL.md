---
name: build-desktop
description: "Инструкция по сборке десктопных приложений проекта (ZAGARAMI HQ и Video Export Helper) в файлы формата DMG и другие дистрибутивы."
---

# Сборка десктопных приложений (ZAGARAMI HQ & Video Export Helper)

Этот навык описывает шаги и переменные окружения, необходимые для сборки macOS DMG-файлов (и других дистрибутивов) для приложений ZAGARAMI HQ (HQ-админка) и Video Export Helper.

---

## 1. Сборка ZAGARAMI HQ (Основная админ-панель)

Скрипт сборки ZAGARAMI HQ автоматически обновляет версию в `package.json`, компилирует React-клиент, генерирует Electron-приложение под macOS (архитектуры `arm64` и `x64`) и упаковывает их в DMG-образы с помощью утилиты `hdiutil`.

### Версионирование приложения
Версия приложения в `package.json` генерируется автоматически при запуске сборки по следующему шаблону:
`1.<номер_месяца>.<день_месяца>-<номер_сборки_за_день>`

* **Первая цифра (`1`)**: Мажорная версия (остается фиксированной).
* **Вторая цифра**: Номер текущего месяца (например, `5` для мая).
* **Третья цифра**: Текущий день месяца (например, `24`).
* **Суффикс (`-1`, `-2` и т.д.)**: Порядковый номер сборки за текущий день. Если в тот же день запускается повторный билд, номер автоматически инкрементируется.

### Переменные окружения (опционально)
* `STONES_HQ_API_ORIGIN` — базовый URL бэкенда (например, `https://zagarami.com`). Если переменная не задана, по умолчанию используется `https://zagarami.com`.

### Команда сборки
Для запуска полного цикла сборки выполните следующую команду в корне проекта:
```bash
npm run admin:desktop:dist
```

### Что делает скрипт сборки (`scripts/build-admin-desktop.mjs`):
1. **Обновление версии**: Вычисляет и перезаписывает версию в `package.json` согласно правилам автоматического версионирования.
2. **Сборка фронтенда**: Выполняет `npm run build:client` для компиляции React-приложения в папку `dist/`.
3. **Конфигурация сборщика**: Создает временный конфигурационный файл для `electron-builder`, подставляя в него `apiOrigin` и `updateBaseUrl`.
4. **Компиляция Electron**: Запускает `electron-builder` для сборки распакованного приложения (`dir` target) под архитектуры `x64` и `arm64`.
5. **Упаковка DMG**:
   * Для каждой архитектуры создает временную директорию (staging).
   * Копирует туда собранное приложение `.app` и создает символическую ссылку на `/Applications`.
   * Создает сжатый DMG-образ формата `UDZO` с именем `ZAGARAMI-HQ-${version}-${arch}.dmg`. Неверсионные копии файлов (`ZAGARAMI-HQ.dmg` / `ZAGARAMI-HQ-arm64.dmg`) **не создаются**.
6. **Манифест обновлений**: Генерирует файл манифеста `ZAGARAMI-HQ-update.json`, содержащий размеры файлов и SHA-256 хеши версионных образов.

### Выходные артефакты
Все собранные файлы сохраняются в директорию `dist-electron-hq/`:
* `ZAGARAMI-HQ-<version>-arm64.dmg` — для процессоров Apple Silicon.
* `ZAGARAMI-HQ-<version>-x64.dmg` — для процессоров Intel.
* `ZAGARAMI-HQ-update.json` — манифест обновлений (ссылается на версионные DMG).

---

## 2. Сборка Video Export Helper

Video Export Helper — это специализированная утилита для обработки и экспорта видеоматериалов HQ.

### Переменные окружения
* `STONES_HELPER_ALLOWED_ORIGIN` (**обязательно**) — разрешенный CORS-origin бэкенда (например, `https://zagarami.com`).
* `STONES_HELPER_VERSION` (опционально) — версия хелпера (по умолчанию генерируется на основе текущей даты `YYYY.M.D`).
* `STONES_HELPER_UPDATE_BASE_URL` (опционально) — URL для скачивания обновлений (по умолчанию `${allowedOrigin}/uploads/downloads`).
* `STONES_HELPER_SENTRY_DSN` (опционально) — DSN для мониторинга ошибок Sentry.
* `STONES_HELPER_SENTRY_ENVIRONMENT` (опционально) — окружение Sentry (по умолчанию `production`).

### Команда сборки
Перед сборкой необходимо экспортировать обязательную переменную `STONES_HELPER_ALLOWED_ORIGIN`, после чего запустить скрипт сборки:
```bash
export STONES_HELPER_ALLOWED_ORIGIN="https://zagarami.com"
npm run video-export-helper:desktop:dist
```

### Что делает скрипт сборки (`video-export-helper/build-desktop.mjs`):
1. Валидирует переданную переменную `STONES_HELPER_ALLOWED_ORIGIN`.
2. Запускает сборку Electron-приложения через `electron-builder` с временным конфигурационным файлом.
3. Копирует полученные DMG в стабильные файлы `ZAGARAMI-Video-Helper.dmg` и `ZAGARAMI-Video-Helper-arm64.dmg`.
4. Генерирует манифест обновлений `ZAGARAMI-Video-Helper-update.json`.

### Выходные артефакты
Все собранные файлы сохраняются в директорию `dist-electron/`:
* `ZAGARAMI-Video-Helper-arm64.dmg` — для Apple Silicon.
* `ZAGARAMI-Video-Helper.dmg` — для Intel.
* `ZAGARAMI-Video-Helper-update.json` — манифест обновлений.
