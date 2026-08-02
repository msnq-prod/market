# Master Report — desktop HQ admin

## Scope

Все рабочие `/admin/*` маршруты, shell, ACL, реальные API/статусы и desktop tools. Мобильная компоновка админки исключена. Аудит начат 2026-07-12, итоговая реализация зафиксирована 2026-07-16.

Коррекция владельца продукта от 2026-07-15: реализация ограничена UI и навигацией; приёмка автоматическая, Photo/Video tools уже готовы и сохраняются. Поштучные концепты отменены (`10_PROCESS_CORRECTION.md`).

## Areas

| Area | Iteration 1 | Analysis | Problems | Needs research | Solution plan |
|---|---|---|---|---|---|
| A01 Shell/overview | complete | `agents/A01-shell-navigation/01_ANALYSIS.md` | `agents/A01-shell-navigation/02_PROBLEMS.md` | `agents/A01-shell-navigation/03_NEEDS_MORE_RESEARCH.md` | `agents/A01-shell-navigation/04_SOLUTION_PLAN.md` |
| A02 Goods/Planet | complete | `agents/A02-goods-planet/01_ANALYSIS.md` | `agents/A02-goods-planet/02_PROBLEMS.md` | `agents/A02-goods-planet/03_NEEDS_MORE_RESEARCH.md` | `agents/A02-goods-planet/04_SOLUTION_PLAN.md` |
| A03 Sales/CRM | complete | `agents/A03-sales-crm/01_ANALYSIS.md` | `agents/A03-sales-crm/02_PROBLEMS.md` | `agents/A03-sales-crm/03_NEEDS_MORE_RESEARCH.md` | `agents/A03-sales-crm/04_SOLUTION_PLAN.md` |
| A04 System/media | complete | `agents/A04-system-media/01_ANALYSIS.md` | `agents/A04-system-media/02_PROBLEMS.md` | `agents/A04-system-media/03_NEEDS_MORE_RESEARCH.md` | `agents/A04-system-media/04_SOLUTION_PLAN.md` |

## Severity summary

| Severity | Confirmed | Суть |
|---|---:|---|
| P0 | 3 | скрытый резерв заказа; чужой order hide; общий предсказуемый desktop ADMIN token |
| P1 | 37 | сломанные/ложные workflow, false success, потеря правок, неверные readiness/health, опасные операции |
| P2 | 35 | архитектурные дубли, неверная IA, масштабирование, stale contracts/tests |
| P3 | 4 | визуальная/терминологическая консистентность и legacy cleanup |

Ещё 9 гипотез/продуктовых вопросов требуют решения или runtime/production evidence.

## Главный вывод аудита

Исходная версия не была набором специализированных рабочих страниц. Большинство URL представляли собой фильтры нескольких больших компонентов, обёрнутые одинаковым трехколоночным shell. Объясняющие тексты и правый inspector маскировали отсутствие task model. Поэтому редизайн был выполнен через отдельные интерфейсы существующих задач без расширения бизнес-логики.

## Итог реализации

- Верхний уровень: `Сегодня / Продажи / Товары / Планета / Система`.
- `Сегодня` — один список текущих задач без внутренних вкладок.
- `Товары` — ровно пять вкладок: `Партии / Заявки на сбор / Склад HQ / Распределение / QR-печать`.
- Страницы продаж разделены по этапам заказа; закрытые заказы доступны только для чтения.
- Страницы Планеты разделены на локации, карточки, публикацию, подписи и паспорта.
- Система разделена на состояние, пользователей, Telegram и файлы.
- Общие списки работают на уровне партии, заявки, заказа, товарного шаблона или локации.
- Item показывается только в detail заказа, точном складском поиске, частичном распределении, выборочной QR-печати и готовых Photo/Video tools.
- Приёмка выполняется на уровне партии без сканирования и автоматического раскрытия Item.
- Действующие API, роли, статусы и бизнес-переходы не расширялись.

## Критические дефекты до визуальной реализации

1. `P0-A03-01`: soft-hide активного заказа оставляет невидимый резерв Item.
2. `P0-A03-02`: SALES_MANAGER может скрыть заказ другого менеджера.
3. `P0-A04-01`: desktop fallback token и общий ADMIN identity нарушают безопасность и атрибуцию.
4. `P1-A02-01/02` переклассифицированы: ручной item workflow является legacy/расхождением источников и не должен появляться в новом UI. Визуальный дефект исходного экрана — раскрытие Item и обещание лишнего ручного процесса вместо автоматической batch-level приёмки.
5. `P1-A04-02`: обычная диагностика создаёт production-like бизнес-данные без cleanup.

Эти вопросы требуют отдельного hardening/contract work. Новый UI не должен скрыть их или продолжить вызывать опасные commands.

## Что уже хорошо и сохраняется

- пять понятных доменных направлений как исходная карта;
- визуально стабильный dark desktop shell;
- очередь → выбранный объект как базовая модель там, где она уместна;
- выделенные fullscreen QR/Photo/Video/3D инструменты;
- идея workflow navigation из Mega Menu prototype;
- серверные state machines и status policy как основа, после устранения дублирующих трактовок.

## Cross-area problems

Полная дедупликация: `03_CROSS_AREA_MAP.md`.

Ключевые темы:

- один универсальный layout для несвязанных задач;
- route aliases/filter pages вместо самостоятельных interfaces;
- локально вычисляемая readiness вместо server capability;
- несколько write-владельцев одной сущности;
- опасные действия в routine UI;
- ACL и identity не выражены capabilities;
- data-heavy экраны загружают всё и фильтруют после limit;
- fullscreen tools теряют origin context;
- диагностика/implementation vocabulary попадает в интерфейс пользователя.

## Визуальные доказательства

- Для исходного аудита 43 состояния при 1440×900 сохранены в корне каталога.
- Browser snapshot и screenshot исходной версии проверены для каждого состояния; ключевые выводы описаны в `05_VISUAL_AUDIT.md`.
- Шесть исходных контрольных экранов проверены при 1920×1080: зафиксированы лишнее пустое пространство, дубли и горизонтальное сжатие inventory.
- Итоговые канонические маршруты проверены в desktop viewport; общие страницы не создают горизонтальный overflow и не раскрывают Item без запроса.

## Реализованная последовательность

1. Зафиксированы ограничения и batch-first модель.
2. Выбрано визуальное направление `Pipeline Matrix + contextual product tabs`.
3. Пересобраны shell и каноническая навигация.
4. Реализованы специализированные страницы продаж и товаров.
5. Реализованы страницы каталога/Планеты и Системы.
6. Сохранена внутренняя логика Photo Tool, Video Tool, QR-конструктора и редактора подписей.

Полная последовательность: `92_RECOMMENDATIONS.md`.

## Отложено за границы UI-редизайна

- серверные правила publication readiness;
- order ownership/reassignment и канонический архив;
- персональная desktop authentication;
- роль MANAGER в destructive/global actions и Telegram;
- production-like volumes/latency;
- packaged Desktop queues и runtime probes.

Эти пункты не создают дополнительных экранов и требуют отдельной задачи на backend/contracts/security.

## Результат design/implementation gate

Выбранный `Pipeline Matrix` применён ко всей desktop-админке как правило специализированных рабочих страниц. В `Товары → Партии` сохранены этапы `Приёмка / Фото / Видео / Завершение`, одна строка на партию и одно текущее действие. Остальные существующие процессы получили собственные таблицы или редакторы без универсальных боковых панелей, дублирующих действий и новых функций. Проверка: `design-qa.md` и итоговые screenshots в каталоге аудита.
