# Перенос HQ-админки в Electron

Документ описывает целевой перенос HQ-админки из браузерного web-интерфейса в desktop-приложение на Electron.

Цель переноса:

- убрать повседневную работу HQ из браузера;
- встроить текущий `video-export-helper` внутрь одного HQ-приложения;
- сделать загрузки фото/видео устойчивее при плохом соединении;
- снизить нагрузку на backend за счет локальной подготовки файлов;
- не строить полноценный offline-first и не переносить источник истины из backend/MySQL на рабочие станции.

## 0. Статус реализации

На текущем этапе реализованы первые три пакета переноса:

- **Пакет 1: Electron MVP для HQ** — добавлено отдельное приложение `ZAGARAMI HQ`, dev-запуск поверх Vite, production loopback-server для `dist/` и proxy `/api`, `/auth`, `/uploads`, `/healthz`.
- **Пакет 2: встроенный video helper** — HQ Electron запускает helper внутри main process, хранит рабочие файлы в desktop `userData` и сохраняет совместимость с текущим helper protocol `stones-video-export-helper-v3`.
- **Пакет 3: устойчивая media upload queue** — Photo Tool и Video Tool в Electron используют локальную очередь загрузок, JSON state и file cache под `userData/media-upload-queue`, retry/backoff и ручные действия retry/cancel/clear.
- **Пакет 5: обновления ZAGARAMI HQ** — приложение проверяет `ZAGARAMI-HQ-update.json`, скачивает DMG для своей архитектуры, проверяет `sha256` и открывает установщик без автоматической замены `.app`.

Текущий пакет приемки:

- проверить Electron HQ в dev и production-сборке;
- подтвердить Photo Tool / Video Tool на плохом соединении;
- обновить пользовательскую и эксплуатационную документацию;
- оставить web-HQ как emergency fallback до отдельного решения об отключении.

## 1. Граница задачи

### Текущий вариант

Сейчас система состоит из:

- общего React SPA, где живут публичная витрина, публичный цифровой паспорт, HQ и partner UI;
- Express API;
- MySQL + Prisma;
- server-side worker для обработки batch-видео;
- отдельного `video-export-helper`, который запускается как desktop-helper и обслуживает часть видео-сценариев HQ.

HQ доступен через web-маршруты:

- `/admin/login`
- `/admin/*`
- `/admin/photo-tool/:batchId`
- `/admin/video-tool/:batchId`
- `/admin/qr/print`

Текущий helper находится отдельно:

- `video-export-helper/server.js`
- `video-export-helper/desktop/main.cjs`
- `video-export-helper/desktop/preload.cjs`
- `video-export-helper/desktop/renderer.html`
- `video-export-helper/desktop/renderer.js`
- `video-export-helper/electron-builder.json`

### Как должно быть

HQ должен стать desktop-приложением:

- оператор открывает не браузерную админку, а установленное приложение;
- React UI остается основной технологией интерфейса;
- Electron main process берет на себя работу с файлами, папками, локальной очередью и helper-функциями;
- backend остается источником истины для пользователей, ролей, партий, item, заказов, цифровых двойников и бизнес-переходов;
- публичная часть остается в web:
  - `/`
  - `/clone/:serialNumber`
  - `/api/public/items/:serialNumber`
  - `/api/public/items/:serialNumber/qr`
  - `POST /api/public/items/:serialNumber/activate`
- partner UI можно оставить в web, если отдельного требования на desktop для партнеров нет.

### Что нужно сделать

- Выделить HQ desktop-контур в отдельный Electron app.
- Встроить `video-export-helper` в Electron HQ app или заменить его внутренним модулем.
- Добавить локальную очередь файловых операций и загрузок.
- Оставить бизнес-логику статусов на backend.
- Обновить сборку, установку, обновления и эксплуатационную документацию.

## 2. Принципиальная архитектура

### Текущий вариант

```text
Browser
  React SPA
    Public site
    Public clone
    Admin UI
    Partner UI
      |
      v
Express API
  Prisma
  MySQL
  public/uploads
  video worker

Separate Video Helper
  Electron shell
  Local helper server
  ffmpeg/ffprobe
```

Проблемы текущей схемы:

- HQ зависит от ограничений браузера при работе с файлами;
- helper является отдельным приложением, которое нужно ставить, запускать и поддерживать;
- при плохом соединении большие загрузки и видео-сценарии хрупкие;
- часть тяжелой подготовки уходит через web/API, хотя ее безопаснее делать локально;
- оператору приходится понимать разницу между web-админкой и helper.

### Как должно быть

```text
Electron HQ App
  Renderer
    React Admin UI
  Preload
    typed IPC bridge
  Main process
    file/folder access
    video helper module
    upload queue
    retry/backoff
    local state/cache
    secure token storage
      |
      v
Remote Express API
  ACL and roles
  batch/item/order state transitions
  Prisma
  MySQL
  public clone endpoints
  uploads storage
  workers
```

### Что нужно сделать

- Создать Electron entrypoint для HQ-приложения.
- Подключить production-сборку React admin UI как renderer.
- В dev-режиме открывать Vite URL, в prod-режиме открывать локальный `dist`.
- Вынести desktop-only операции из renderer в main process через IPC.
- Запретить прямой Node-доступ в renderer:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - только явный preload API.

## 3. Разделение web и desktop

### Текущий вариант

Один React app содержит все контуры:

- публичная витрина;
- публичный цифровой паспорт;
- HQ;
- partner UI.

Express в production раздает собранный SPA и API.

### Как должно быть

Нужно сохранить web для публичных и внешних сценариев, но вывести HQ из браузера:

- web остается для публичного паспорта и partner UI;
- HQ desktop использует те же API-контракты, но запускается в Electron;
- web-маршруты `/admin/*` можно временно оставить как fallback;
- после стабилизации desktop-версии web-HQ можно закрыть на уровне доступа или убрать из публичной навигации.

### Что нужно сделать

1. Определить статус web-HQ:
   - этап 1: оставить как emergency fallback;
   - этап 2: ограничить доступ по feature flag или reverse proxy;
   - этап 3: убрать из production-сборки только после полной замены.
2. Не трогать публичные маршруты цифрового двойника.
3. Не менять partner UI без отдельного решения.
4. Проверить маршрутизацию в `src/App.tsx`, чтобы desktop build мог стартовать сразу в HQ-контуре.

## 4. Electron shell

### Текущий вариант

Electron уже используется для helper:

- есть `electron`;
- есть `electron-builder`;
- есть scripts:
  - `npm run video-export-helper:desktop`
  - `npm run video-export-helper:desktop:dist`
  - `npm run video-export-helper:desktop:dist:raw`

Но это отдельное маленькое приложение, а не полноценный HQ shell.

### Как должно быть

Нужно отдельное desktop-приложение уровня HQ:

- название условно: `ZAGARAMI HQ`;
- single instance lock;
- главное окно с React HQ UI;
- preload API для desktop-функций;
- tray/menu по необходимости;
- понятная обработка ошибок запуска;
- отдельный builder config;
- отдельные npm scripts.

### Что нужно сделать

Добавить структуру:

```text
electron/
  hq/
    main.cjs
    preload.cjs
    electron-builder.json
    assets/
```

Добавить scripts:

```json
{
  "admin:desktop": "electron electron/hq/main.cjs",
  "admin:desktop:dist": "node scripts/build-admin-desktop.mjs",
  "admin:desktop:dist:raw": "electron-builder --config electron/hq/electron-builder.json"
}
```

Сборочный скрипт должен:

- собрать React client;
- убедиться, что Electron app видит `dist/`;
- положить metadata версии/API origin;
- запустить `electron-builder`.

## 5. API и источник истины

### Текущий вариант

HQ ходит в Express API. Backend проверяет:

- JWT/refresh-session;
- роли через middleware;
- бизнес-правила партий, item, заказов;
- доступ к загрузкам и публичным ресурсам.

### Как должно быть

Backend должен остаться источником истины:

- роли: `ADMIN`, `MANAGER`, `SALES_MANAGER`, `FRANCHISEE`, `USER`;
- статусы заказов;
- статусы collection workflow;
- статусы партий;
- статусы item;
- привязка цифрового двойника к `Item.serial_number`;
- правила доступности публичного паспорта;
- audit log и финансовые операции.

Desktop не должен сам финально менять бизнес-состояния в обход API.

### Что нужно сделать

- Оставить переходы статусов на backend.
- Не переносить Prisma/MySQL внутрь Electron.
- Не давать Electron прямой доступ к production DB.
- Desktop может локально готовить файлы и черновики, но финальные действия должны идти через API.
- Для нестабильной сети добавить очередь только для безопасных операций:
  - подготовка файлов;
  - загрузка файлов;
  - дозагрузка хвостов;
  - сохранение черновика upload-сессии;
  - повторная отправка metadata после успешной загрузки.

## 6. Авторизация и хранение токенов

### Текущий вариант

В web-клиенте:

- access token хранится в `localStorage`;
- refresh-session хранится в `HttpOnly` cookie;
- запросы используют `authFetch`.

### Как должно быть

В Electron нужно уменьшить зависимость от браузерного storage:

- access token хранить в памяти renderer/main;
- refresh/session хранить через защищенное desktop-хранилище или cookie partition Electron;
- не логировать токены;
- не прокидывать секреты в renderer;
- сброс сессии должен очищать локальные desktop-данные пользователя.

### Что нужно сделать

Вариант MVP:

- оставить текущий `authFetch` и cookie-модель;
- использовать отдельный Electron session partition;
- проверить refresh flow в desktop.

Вариант production:

- добавить secure storage через `safeStorage`/keychain-совместимый пакет;
- спрятать token lifecycle за preload API;
- сделать единый session manager в Electron main process;
- добавить экран повторной авторизации при истечении refresh-session.

## 7. Файлы, фото и загрузки

### Текущий вариант

Загрузки идут через web-интерфейс и API. Это создает проблемы:

- большие файлы зависят от браузерной сессии;
- при обрыве связи операция часто требует ручного повтора;
- нет надежной локальной очереди;
- сложно сохранять состояние между перезапусками.

### Как должно быть

Electron должен взять файловые операции на себя:

- выбор файлов и папок через native dialog;
- локальная валидация форматов, размеров и последовательностей;
- сохранение задач в локальную очередь;
- повторные попытки при плохой сети;
- продолжение после перезапуска приложения;
- отображение понятных статусов в HQ UI.

### Что нужно сделать

Добавить локальную upload queue:

```text
pending -> uploading -> uploaded -> committing -> done
               |             |          |
               v             v          v
            retrying       failed     failed
```

Минимальные поля задачи:

- `id`;
- `type`;
- `batchId`;
- `itemId` или `serialNumber`, если применимо;
- `localPath`;
- `targetEndpoint`;
- `checksum`;
- `size`;
- `createdAt`;
- `updatedAt`;
- `attempts`;
- `lastError`;
- `status`.

Технически очередь можно хранить:

- MVP: JSON-файл в `app.getPath('userData')`;
- надежнее: SQLite;
- для больших временных данных: отдельная папка cache/storage.

## 8. Video Tool и helper

### Текущий вариант

В проекте есть отдельный `video-export-helper`, который:

- запускает локальный helper server;
- работает с ffmpeg/ffprobe;
- имеет отдельное окно статуса;
- имеет отдельную сборку и обновление.

### Как должно быть

Оператор не должен запускать отдельный helper. HQ app должен включать эти возможности:

- проверка наличия ffmpeg/ffprobe;
- локальный монтаж/подготовка видео;
- локальные временные файлы;
- прогресс по задачам;
- очистка cache;
- загрузка результата в backend;
- ретраи при плохом соединении.

### Что нужно сделать

1. Провести инвентаризацию текущих helper endpoint/API.
2. Выделить reusable helper core:
   - работа с ffmpeg/ffprobe;
   - подготовка output;
   - cleanup;
   - health/status;
   - update metadata, если нужно.
3. Подключить helper core в Electron HQ main process.
4. Постепенно убрать локальный HTTP helper server, если IPC полностью покрывает сценарии.
5. Оставить совместимость со старым helper на переходный период, если это нужно для production.

Важно: не переносить финализацию batch в desktop. Финализация должна оставаться backend-операцией, потому что backend проверяет полноту фото/видео и статусы.

## 9. Устойчивость при плохом соединении

### Текущий вариант

При плохом соединении оператор часто видит ошибку операции и должен вручную повторить действие. Большие загрузки и видео-результаты особенно уязвимы.

### Как должно быть

Desktop должен вести себя как надежный клиент:

- обнаруживать недоступность API через `/healthz`;
- не терять выбранные файлы;
- автоматически повторять загрузки;
- показывать состояние очереди;
- не блокировать всю работу из-за одной упавшей загрузки;
- не создавать дубли на backend при повторной отправке.

### Что нужно сделать

- Добавить network monitor:
  - periodic `/healthz`;
  - online/offline status;
  - backoff после ошибок.
- Добавить retry policy:
  - короткие ошибки: быстрый retry;
  - долгий outage: exponential backoff;
  - ручной retry из UI.
- Добавить idempotency для критичных upload/commit операций:
  - `Idempotency-Key`;
  - checksum;
  - server-side проверка уже загруженного результата.
- Добавить UI очереди:
  - ожидает;
  - загружается;
  - ошибка;
  - повтор;
  - готово.

## 10. Backend-изменения для очереди

### Текущий вариант

Backend принимает обычные API-запросы и загрузки. Не все операции рассчитаны на повторную отправку после сетевого обрыва.

### Как должно быть

Backend должен безопасно принимать повторные запросы от desktop-клиента:

- не создавать дубли файлов/записей;
- уметь подтверждать уже загруженный файл;
- возвращать понятные ошибки;
- сохранять текущие ACL и бизнес-проверки.

### Что нужно сделать

- Проверить `server/routes/upload.ts` и video endpoints в `server/routes/batches.ts`.
- Для upload endpoints добавить или проверить:
  - ограничение ролей;
  - размер файлов;
  - типы файлов;
  - checksum;
  - idempotency key;
  - безопасное имя файла;
  - повторный commit без дубля.
- Для video export добавить endpoint подтверждения результата, если его нет.
- Не менять публичные контракты без синхронного обновления frontend/Electron.

## 11. Локальный cache и данные

### Текущий вариант

Основные данные живут в backend/MySQL. Клиентское состояние временное и браузерное.

### Как должно быть

Desktop может хранить только операционный cache:

- очередь загрузок;
- локальные пути выбранных файлов;
- временные видео-артефакты;
- черновики незавершенных media-сессий;
- настройки окна и API origin;
- последние health/status данные.

Не нужно хранить локальную копию всей БД.

### Что нужно сделать

- Определить storage root:
  - macOS: `app.getPath('userData')`;
  - временные файлы: `app.getPath('temp')` или вложенная cache-папка.
- Добавить cleanup policy:
  - удалять завершенные временные файлы после подтверждения backend;
  - хранить failed/pending до ручной очистки;
  - не удалять данные активной очереди.
- Добавить экран или действие "очистить cache" с защитой от удаления pending-задач.

## 12. UI-изменения в HQ

### Текущий вариант

HQ UI рассчитан на браузер:

- работа с файлами через browser file input;
- helper воспринимается как внешний сервис;
- состояние загрузок не является полноценным desktop queue UI.

### Как должно быть

HQ UI должен явно показывать desktop-состояния:

- статус соединения с backend;
- статус локального helper/video engine;
- очередь загрузок;
- прогресс текущих операций;
- понятные действия: повторить, пауза, отменить, открыть папку, очистить завершенные.

### Что нужно сделать

- Добавить desktop capability layer:
  - в web режиме использовать текущие browser-механики;
  - в Electron режиме использовать `window.stonesDesktop`.
- Обновить Photo Tool и Video Tool:
  - выбор папки/файлов через IPC;
  - передача локальных путей в очередь;
  - прогресс и ошибки из main process;
  - продолжение незавершенной сессии.
- Добавить глобальный индикатор:
  - API online/offline;
  - pending uploads count;
  - failed uploads count.
- Не перегружать обычные CRUD-разделы desktop-спецификой.

## 13. Сборка, установка и обновления

### Текущий вариант

Есть production web build и отдельная сборка helper.

### Как должно быть

Должна быть отдельная сборка desktop HQ:

- development run;
- production package;
- подпись/нотаризация для macOS, если приложение распространяется вне локальной машины;
- понятная версия;
- канал обновления;
- отдельные build artifacts.

### Что нужно сделать

- Добавить `electron/hq/electron-builder.json`.
- Добавить build script.
- Настроить appId, productName, icons, output directory.
- Проверить включение:
  - `dist/**/*`;
  - Electron main/preload files;
  - helper/video core;
  - ffmpeg/ffprobe binaries, если они нужны в package.
- Определить update strategy:
  - реализованный MVP: manifest + download, как у helper;
  - auto-replace через `electron-updater` остается отдельным этапом после signing/notarization.

Реализованный update flow:

- build script создает `ZAGARAMI-HQ.dmg`, `ZAGARAMI-HQ-arm64.dmg` и `ZAGARAMI-HQ-update.json`;
- manifest публикуется в `/uploads/downloads`;
- приложение показывает desktop-only панель обновлений в HQ header;
- скачанный DMG открывается локально, а оператор вручную устанавливает новую версию.

## 14. Безопасность

### Текущий вариант

Web-приложение защищается backend ACL, JWT/cookie и browser sandbox. Helper уже использует Electron с `contextIsolation: true` и `nodeIntegration: false`.

### Как должно быть

Electron app должен сохранить строгую границу между UI и системными возможностями:

- renderer не получает прямой доступ к `fs`, `child_process`, токенам и секретам;
- все filesystem/video операции идут через preload IPC;
- backend продолжает проверять ACL;
- локальные файлы не раздаются произвольному web-контенту;
- external links открываются через `shell.openExternal` после проверки.

### Что нужно сделать

- Запретить remote content, кроме явно заданного dev URL.
- В production грузить локальный `dist`.
- Реализовать allowlist IPC-методов.
- Валидировать аргументы IPC:
  - path;
  - batchId;
  - serialNumber;
  - file type;
  - operation type.
- Не хранить секреты в plain text.
- Не логировать Authorization headers, cookies, local paths с персональными данными без необходимости.

## 15. Тестирование

### Текущий вариант

Основные проверки:

- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- ручная проверка helper/video workflows.

### Как должно быть

Нужны отдельные проверки desktop-сценариев:

- запуск Electron в dev;
- запуск packaged app;
- логин HQ;
- healthcheck backend;
- выбор файлов/папок;
- постановка задачи в очередь;
- обрыв соединения;
- восстановление соединения;
- повтор загрузки;
- завершение batch через backend;
- проверка публичного clone после загрузки media.

### Что нужно сделать

Минимальный тестовый набор:

1. Unit/integration для queue state machine.
2. Backend tests или e2e для idempotent upload/commit.
3. Playwright/Electron smoke test:
   - приложение стартует;
   - открывает login;
   - проходит авторизацию seeded admin;
   - видит dashboard.
4. Ручной сценарий с плохим соединением:
   - поставить upload в очередь;
   - выключить API;
   - убедиться, что задача не потеряна;
   - включить API;
   - убедиться, что upload продолжился.

## 16. Поэтапный план работ

## Этап 0. Аудит текущего HQ и helper

### Текущий вариант

HQ и helper связаны операционно, но технически живут отдельно.

### Как должно быть

Перед переносом нужно точно знать:

- какие экраны HQ реально используют helper;
- какие endpoints дергает Video Tool;
- какие файлы создаются локально;
- где ломаются загрузки при плохом соединении;
- какие backend-операции должны стать idempotent.

### Что нужно сделать

- Описать текущие сценарии Photo Tool и Video Tool.
- Выписать все helper endpoints/events.
- Выписать все upload endpoints.
- Зафиксировать минимальный desktop MVP.

Результат этапа:

- короткая техническая карта текущих зависимостей;
- список endpoints для стабилизации.

## Этап 1. Electron HQ shell

### Текущий вариант

Есть только отдельный Electron helper.

### Как должно быть

Есть запускаемое desktop-приложение HQ, которое открывает текущий admin UI.

### Что нужно сделать

- Создать `electron/hq/main.cjs`.
- Создать `electron/hq/preload.cjs`.
- Добавить dev/prod загрузку renderer:
  - dev: Vite URL;
  - prod: `dist/index.html`.
- Добавить `admin:desktop` script.
- Проверить login и основные HQ-разделы.

Результат этапа:

- HQ можно открыть в Electron;
- web-HQ пока остается без изменений.

## Этап 2. Desktop capability layer

### Текущий вариант

React UI напрямую использует browser APIs.

### Как должно быть

UI должен уметь работать в двух режимах:

- browser mode;
- desktop mode.

### Что нужно сделать

- Добавить типизированный `window.stonesDesktop`.
- Добавить feature detection.
- Обернуть desktop-функции в клиентский service:
  - `isDesktop`;
  - `selectFiles`;
  - `selectDirectory`;
  - `getNetworkStatus`;
  - `enqueueUpload`;
  - `subscribeQueue`.
- Не ломать browser fallback на переходном периоде.

Результат этапа:

- UI готов использовать Electron API без прямой зависимости от Electron в компонентах.

## Этап 3. Встраивание helper

### Текущий вариант

Helper запускается отдельно и имеет собственное окно.

### Как должно быть

Helper-функции запускаются внутри HQ app.

### Что нужно сделать

- Выделить helper core из `video-export-helper/server.js`, если он завязан на HTTP.
- Подключить helper core к Electron main process.
- Прокинуть status/progress в renderer через IPC.
- Перенести действия:
  - health;
  - cleanup;
  - restart/reinitialize;
  - show storage;
  - check ffmpeg/ffprobe.
- Оставить старый helper на время миграции, если production еще на него опирается.

Результат этапа:

- оператору не нужно отдельное helper-приложение для новых desktop-сценариев.

## Этап 4. Локальная очередь загрузок

Статус: реализовано в пакете 3 для Photo Tool и Video Tool.

### Текущий вариант

В браузерном HQ загрузки выполняются как обычные web/API операции.
В Electron HQ тяжелые media-загрузки ставятся в локальную очередь.

### Как должно быть

Desktop ставит тяжелые загрузки в локальную очередь.

### Что нужно сделать

- Реализован queue storage под `app.getPath('userData')/media-upload-queue`.
- Реализован sequential worker в Electron main process.
- Добавлены retry/backoff, ручные retry/cancel и очистка завершенных задач.
- Добавлено восстановление незавершенных задач после перезапуска приложения.
- Добавлен HQ-индикатор очереди и inline-статусы в Photo Tool / Video Tool.

Результат этапа:

- плохое соединение не приводит к потере подготовленной работы.

## Этап 5. Backend idempotency и upload hardening

Статус: реализовано в пакете 3 для media endpoints без миграции Prisma.

### Текущий вариант

Обычные web-запросы продолжают работать без queue metadata.
Electron HQ добавляет optional queue metadata для повторяемых media upload.

### Как должно быть

Повторная отправка одной и той же задачи не создает дублей и не ломает состояние batch/item.

### Что нужно сделать

- Добавлены optional поля `queue_job_id`, `queue_file_id`, `checksum_sha256`.
- Photo Tool получает deterministic filenames для queued desktop uploads и duplicate detection по `queue_job_id`.
- Video Tool сохраняет idempotency по существующим правилам `sessionId + serial_number` и `manifest.intro_asset`.
- Checksum mismatch возвращает `400`.
- ACL остается на backend через существующие middleware.

Результат этапа:

- очередь может безопасно повторять запросы после сетевых ошибок.

## Этап 6. Перенос Photo Tool и Video Tool на desktop flow

Статус: реализовано в пакете 3 в рамках desktop queue, без удаления browser flow.

### Текущий вариант

Photo Tool и Video Tool сохраняют browser-first модель в web-HQ.
В Electron HQ эти сценарии используют desktop capability layer.

### Как должно быть

В Electron они используют локальные файлы, helper core и upload queue.

### Что нужно сделать

- Photo Tool:
  - browser file picker остается UI-слоем;
  - выбранные файлы chunked IPC переносятся в Electron file cache;
  - `Save` создает `PHOTO_TOOL_APPLY` queue job;
  - browser mode продолжает прямой multipart upload.
- Video Tool:
  - встроенный helper рендерит output внутри HQ app;
  - готовые `.mp4` ставятся в `VIDEO_INTRO_UPLOAD` и `VIDEO_RENDER_UPLOAD`;
  - `retry-tail` остается backend-источником недостающих `serial_number`;
  - browser mode продолжает работать со старым helper-сценарием.
- Финализацию batch оставить через backend.

Результат этапа:

- основные болезненные HQ-сценарии работают внутри desktop app.

## Этап 6.5. Приемка Electron HQ

### Текущий вариант

Пакеты 1-3 реализованы кодом, но перед отдачей операторам нужен отдельный приемочный проход.

### Как должно быть

Перед выпуском desktop HQ должны быть подтверждены:

- dev-запуск `npm run admin:desktop` поверх `npm run dev`;
- production-сборка `npm run admin:desktop:dist`;
- deep links `/admin/login`, `/admin/photo-tool/:batchId`, `/admin/video-tool/:batchId`;
- восстановление queue после сетевых ошибок и перезапуска;
- работоспособность встроенного helper без отдельного helper-приложения.

### Что нужно сделать

- Прогнать static checks: `node --check`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Прогнать targeted e2e для Photo Tool и Video Tool.
- Провести ручной Electron smoke на seeded admin.
- Зафиксировать невыполненные manual-сценарии и остаточные риски в отчете.

## Этап 7. Ограниченное отключение web-HQ

### Текущий вариант

HQ доступен в браузере.

### Как должно быть

После стабилизации desktop app браузерная HQ-админка перестает быть основным способом работы.

### Что нужно сделать

- Сначала убрать ссылки на web-HQ из пользовательских инструкций.
- Затем ограничить доступ через feature flag/reverse proxy.
- Оставить emergency fallback для администратора до завершения миграции.
- Не отключать public clone и partner UI.

Результат этапа:

- HQ фактически работает через desktop app.

## Этап 8. Production package и эксплуатация

### Текущий вариант

Production ориентирован на web + отдельный helper.

### Как должно быть

Есть понятная поставка desktop HQ:

- installer/package;
- версия;
- обновления;
- инструкция установки;
- инструкция диагностики;
- recovery flow при проблемах с очередью.

### Что нужно сделать

- Настроить builder.
- Проверить packaged app.
- Документировать:
  - установку;
  - обновление;
  - где лежат логи;
  - где лежит cache/queue;
  - как безопасно очистить cache;
  - как собрать диагностический пакет.
- Обновить `docs/SYSTEM_USAGE_GUIDE_RU.md` и `docs/USER_GUIDE_ADMIN_RU.md`.

Результат этапа:

- desktop HQ можно отдавать операторам.

## 17. Что не нужно делать в первой версии

Не нужно:

- переносить MySQL локально в Electron;
- делать полный offline-first;
- дублировать всю Prisma-схему в локальную БД;
- разрешать финальные бизнес-переходы без backend;
- переносить публичный цифровой паспорт в desktop;
- ломать partner UI;
- сразу удалять web-HQ до стабилизации desktop app;
- давать renderer прямой доступ к файловой системе.

## 18. Риски

### Риск: расхождение бизнес-логики

Если часть переходов статусов уедет в desktop, появятся расхождения между локальным состоянием и MySQL.

Решение:

- все финальные переходы оставить на backend;
- desktop хранит только очередь и черновики.

### Риск: дубли при повторных загрузках

При плохой сети один и тот же файл может отправиться несколько раз.

Решение:

- idempotency key;
- checksum;
- server-side проверка уже принятого результата.

### Риск: небезопасный Electron renderer

Если включить Node в renderer, XSS может стать доступом к файловой системе.

Решение:

- `contextIsolation: true`;
- `nodeIntegration: false`;
- строгий preload API;
- валидация IPC.

### Риск: слишком раннее отключение web-HQ

Если desktop app еще не покрывает все сценарии, операторы могут потерять рабочий fallback.

Решение:

- отключать web-HQ только после приемки desktop flow;
- сначала ограничить, а не удалять.

## 19. Definition of Done

Перенос можно считать завершенным, когда:

- HQ app устанавливается и запускается как desktop-приложение;
- `ADMIN`, `MANAGER`, `SALES_MANAGER` могут войти и работать в своих разрешенных разделах;
- Photo Tool и Video Tool работают через desktop flow;
- helper больше не нужен как отдельное приложение для основного сценария;
- большие загрузки переживают обрыв соединения и продолжаются после восстановления;
- очередь сохраняется после перезапуска приложения;
- backend остается источником истины для batch/item/order/status transitions;
- публичный `/clone/:serialNumber` работает как раньше;
- web-HQ либо оставлен как documented fallback, либо безопасно ограничен;
- выполнены проверки:
  - `npm run lint`;
  - `npm run build`;
  - smoke test Electron HQ;
  - ручной сценарий плохого соединения для загрузок;
  - e2e или ручная проверка критичного batch media workflow.

## 20. Рекомендуемый порядок внедрения

1. Не начинать с полного offline mode.
2. Сначала сделать Electron shell для HQ.
3. Потом добавить desktop capability layer.
4. Затем встроить helper.
5. После этого сделать локальную upload queue.
6. Только потом менять backend endpoints под idempotency.
7. Перевести Photo Tool и Video Tool на queue/helper flow.
8. Стабилизировать packaged app.
9. Ограничить web-HQ только после production-проверки.

Такой порядок дает быструю пользу без резкой переделки бизнес-архитектуры.
