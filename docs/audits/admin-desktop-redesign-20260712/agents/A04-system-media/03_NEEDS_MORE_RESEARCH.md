# A04: требуется дополнительное исследование

Решения и implementation plan здесь намеренно не формулируются. Ниже только пробелы доказательств после статического анализа.

## Критично до design/implementation gate

| ID | Что нужно доказать | Проверка | Связанные findings |
|---|---|---|---|
| R-A04-01 | Переопределён ли `DESKTOP_ADMIN_TOKEN` в production, как он распространяется/ротируется и доступен ли `/auth/desktop-login` извне | безопасно проверить наличие/политику env без вывода secret; проверить ingress; прочитать security audit события `auth-desktop-login-success`; подтвердить владельца `DESKTOP_ADMIN_EMAIL` | `P0-A04-01` |
| R-A04-02 | Кто реально запускает packaged HQ Desktop и должен ли каждый оператор иметь персональную роль/атрибуцию | инвентаризация установок и короткие интервью ADMIN/MANAGER; сравнить ожидаемого пользователя с фактическим `DesktopAuthGate` session | `P0-A04-01` |
| R-A04-03 | Сколько тестовых `[e2e]` location/product/batch уже создано диагностикой и запускается ли она в production | read-only DB count по marker/note, audit logs и Telegram jobs; проверить packaged build, не нажимая кнопку | `P1-A04-02` |
| R-A04-04 | Может ли diagnostic «успешно» завершиться с недоступным video URL и каким публичным данным это вредит | на изолированной test DB проверить наличие реального файла `/uploads/videos/v3/diagnostics/*`, `has_video`, HTTP media URL и состояние created entities после каждого искусственного fail-step | `P1-A04-02` |
| R-A04-05 | Фактическое поведение Status Center при 401/403/404 health, падении `/api/batches`, ffmpeg/runtime init failure | controlled mocks/локальная среда; screenshot и assert всех badges, header summary и `/admin/media/runtime` | `P1-A04-04`, `P1-A04-07` |

## Визуальный и task-flow аудит

Нужны свежие screenshots 1440×900 и 1920×1080 в двух режимах: обычный browser и packaged/dev Desktop. Для каждого экрана зафиксировать fold, главное действие, дубли, технические слова, keyboard/focus и состояния loading/empty/error/dirty/destructive:

1. `/admin/users` под `ADMIN` и `MANAGER`;
2. `/admin/settings`, `/admin/settings/files`, batch-folder mode и вложенная папка;
3. все `/admin/telegram/**` с 0/1/несколькими bots и dirty draft;
4. `/admin/media`, `/photo`, `/video`, `/runtime`, `/diagnostics` с партиями `TRANSIT/RECEIVED/FINISHED`, пустой batch и API error;
5. `/admin/system/status` и наличие/отсутствие реального Status Center trigger;
6. Photo Tool и Video Tool, открытые по очереди из Acceptance и Media center;
7. web placeholder для обоих tools, включая доступность двух DMG links.

Особенно проверить, помещается ли в 900 px: Telegram bot list + five modes, Users table + inspector, Media rail + row actions, Status Center modal diagnostics terminal. Статический код уже показывает три колонки и большие текстовые описания, но визуальная тяжесть пока не измерена.

## Поведение и состояния

| ID | Непроверенное поведение | Как проверить | Связанные findings |
|---|---|---|---|
| R-A04-06 | Теряется ли Telegram draft при клике `Получатели -> События`, browser back/forward и MegaNav | Playwright с изменением token/event без save; проверить confirm и восстановление | `P1-A04-09` |
| R-A04-07 | Кто использует legacy `/admin/video-tool?view=*` и `/admin/telegram-bots?view=*` | access logs/analytics, bookmarks в docs и desktop deep links; ручной route matrix | `P1-A04-13` |
| R-A04-08 | Реальная очередь после offline/restart: Photo и Video одновременно | запустить один Photo workflow и один Video export, отключить сеть, перезапустить app; сравнить `/admin/media`, Status Center и Video Tool snapshot | `P1-A04-03`, `P1-A04-07`, `P2-A04-19` |
| R-A04-09 | Сколько времени пользователь теряет, открыв Video Tool для `TRANSIT/FINISHED` batch | test DB: пройти подготовку до start export и зафиксировать момент/текст отказа; Photo Tool проверить отдельно | `P1-A04-05` |
| R-A04-10 | Действительно ли empty batch возможна в текущих бизнес-потоках | read-only DB query и seed; если возможна — screenshot diagnostics; если невозможна — проверить зачем promise остался | `P1-A04-06` |
| R-A04-11 | Возвращается ли пользователь в ожидаемый контекст после fullscreen tool и сохраняются ли фильтр/selected batch | ручной сценарий из `/admin/media/photo` и `/admin/acceptance/media`, browser back и explicit back links | `P2-A04-19` |
| R-A04-12 | Доступен ли Status Center trigger на всех wide system routes и реагирует ли невидимый listener | DOM/keyboard проверка `/admin/media`, `/admin/system/status`, `/admin/users`, `/admin/settings`, `/admin/telegram` | `P1-A04-03`, `P1-A04-04` |

## Пользователи и ACL

- Подтвердить операционные сценарии: увольнение/временная блокировка, смена роли, reset password, компрометация аккаунта, отзыв всех sessions, исправление ошибочного email.
- Найти текущий вне-UI workaround и кто имеет к нему доступ. Проверить, ведётся ли audit log таких изменений.
- Сопоставить `ADMIN`, `MANAGER`, `SALES_MANAGER` на всех A04 routes/API, отдельно `photo-tool-v2`, legacy photo API и fullscreen guard.
- Проверить stale/tampered `localStorage.userRole`: что видит пользователь до backend 403/refresh и какой экран объясняет отказ.
- Уточнить, должен ли `MANAGER` получать Telegram events как роль или его отсутствие намеренно.

Связанные findings: `P1-A04-12`, `P2-A04-20`, `P2-A04-23`.

## Telegram end-to-end truth

- С отозванным token проверить initial label «Сохраненный токен активен» до и после manual validation.
- Запустить реальный worker на test bot и доказать доставку для: linked ADMIN, linked SALES_MANAGER, scoped FRANCHISEE, manual chat ID, manual username.
- Проверить дубликат, если один chat одновременно linked и manual: текущий map использует разные keys `linked:`/`manual:`, поэтому возможны две jobs; требуется фактическое подтверждение.
- Проверить deleted bot impact на pending/retry jobs, recent contacts и low-stock state; зафиксировать, что видит оператор после recreate.
- Определить, является ли `bot_username` историческим snapshot или должен отражать живое состояние.

Связанные findings: `P1-A04-08`, `P2-A04-15`, `P2-A04-16`, `P2-A04-23`.

## Storage truth и риск удаления

- Проверить deployment topology: соответствует ли текущий browser origin серверу `public/uploads`; есть ли CDN/отдельный media host. Без этого нельзя окончательно классифицировать hardcoded `zagarami.com` как ошибку для production, хотя localhost/staging mismatch подтверждён.
- Построить read-only обратные ссылки DB -> каждый тип пути в uploads: Product/Location/Batch/Item/QR/desktop artifacts. Определить, какие папки можно обслуживать вручную и какие являются domain-owned.
- Измерить на копии production: количество entries, общий размер, latency и I/O для root/nested list. Проверить worst case рекурсивного `getDirectorySize`.
- Проверить поведение удаления непустой batch folder, параллельной загрузки и symlink/race после `realpath` до `rm`.
- Проверить возможность восстановления из backup и фактический RPO/RTO; UI сейчас этого не сообщает.

Связанные findings: `P1-A04-10`, `P1-A04-11`, `P2-A04-22`.

## Desktop runtime и обновления

- Убедиться, что Video Tool v3 init/ffmpeg/disk/SQLite health можно наблюдать независимо от hardcoded `helper.ok`.
- Проверить, что Status Center export не включает access token, bot token, персональные данные или локальные absolute paths сверх допустимого; payload содержит raw diagnostics/workflow/client logs.
- Проверить update manifest signature/checksum requirement, поведение при отсутствующем `sha256`, источник DMG и права на открытие скачанного образа.
- Проверить, доступны ли `getAdminAutoLoginCredentials` и shared credentials в packaged renderer, используются ли они ещё кем-либо и попадают ли в bundle/log export.

## Тесты, которые нужно фактически запустить

Статический анализ не заменяет запуск. В следующем verification-pass нужны как минимум:

- `tests/e2e/admin-server-storage.spec.ts`;
- `tests/e2e/admin-telegram-bots.spec.ts`;
- `tests/e2e/admin-batch-diagnostics.spec.ts` только на изолированной test DB с явным cleanup;
- `tests/e2e/admin-photo-tool.spec.ts`;
- `tests/e2e/admin-video-tool-v3-upload.spec.ts`;
- новые read-only/mocked проверки media launcher, route compatibility, role matrix и status false-negative/false-positive.

Ожидаемые блокеры уже видны статически: storage и Telegram tests используют тексты предыдущего UI; текущий результат test run неизвестен.

## Внешние блокеры текущей итерации

- Нет безопасного доступа к production env/ingress/audit logs.
- Не запускался packaged Desktop с реальными local queues.
- Не было свежей визуальной съёмки A04 routes.
- Не проводились интервью пользователей и нет частотности реальных операций.
- Не выполнялись тесты, DB queries и destructive diagnostics.
