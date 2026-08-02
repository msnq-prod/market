# A01 — solution plan

## Цель

Сделать shell незаметной рамкой работы: пользователь всегда понимает зону и следующий шаг, но навигация не повторяет страницу и не отбирает ширину. Dashboard становится очередью конкретных исключений, а не витриной общих чисел.

## 1. Канонический route registry

Создать один типизированный реестр маршрутов, который хранит:

- route id и canonical URL;
- business zone;
- допустимые роли для отображения;
- layout type (`queue`, `list-detail`, `table`, `editor`, `fullscreen`, `support`);
- краткое русское название;
- optional compatibility aliases;
- статус `navVisible/devOnly/deprecated`.

Из registry генерируются main navigation, active state, page title и redirects. Backend ACL остаётся отдельным security source; registry не заменяет серверную проверку.

### Что удалить после migration window

- ручные pathname whitelist/meta maps в `AdminLayout`;
- параллельные `?view` match-записи после redirect telemetry;
- production navigation к `/brandbook` и `/prototypes/*`;
- fallback, который подсвечивает `Обзор` неизвестному route.

## 2. Shell desktop

### Постоянно

- одна верхняя строка высотой 56–64 px;
- логотип/роль компактно;
- 4–5 зон без описаний второй строкой;
- справа: глобальный поиск/command palette при доказанной необходимости, профиль/выход, компактный реальный status indicator только при degraded state.

### По запросу

- компактная workflow-map выбранной зоны открывается кликом/keyboard, а не занимает второй постоянный ряд;
- breadcrumbs только внутри глубокого editor/fullscreen flow;
- local tabs только если это режимы одного объекта, а не разные страницы.

### Запрещено

- постоянный второй nav row с пояснениями;
- общий left rail для повторения текущей зоны;
- общий right inspector без выбранного объекта;
- page description, объясняющий очевидное действие.

## 3. Layout primitives вместо одного template

Минимальный набор:

1. `QueuePage`: header/actions + dense queue, без inspector.
2. `ListDetailPage`: resizable list + detail; inspector появляется только после selection.
3. `DataTablePage`: full-width table + filter bar + optional drawer.
4. `EditorPage`: form + preview/save bar.
5. `FullscreenToolPage`: собственный chrome + origin context.
6. `SupportPage`: probes/log detail, ADMIN/support only.

Каждая предметная область выбирает primitive и определяет свои поля/actions. Нельзя передавать универсальный массив `metrics/actions/links` как содержимое любой страницы.

## 4. Новый стартовый экран

### Основной вариант — role-aware «Работа сегодня»

Первый экран содержит:

- очередь конкретных объектов, требующих действия;
- колонки: задача, объект, причина, возраст/срок, ответственный, одно следующее действие;
- фильтры `Мои / Без ответственного / Все` только где есть ownership;
- компактную строку 3–5 истинных totals как filter shortcuts, не отдельные cards;
- empty state `Сейчас нет задач`, без предложений открыть пять других разделов.

### Требуемый server contract

`GET /api/admin/work-queue` или role-specific endpoints возвращают не эвристику counters, а элементы:

```text
id, kind, entity_id, title, reason_code, reason_label,
severity, occurred_at/due_at, assignee, capability, action
```

Правило inclusion принадлежит серверному домену. UI не выводит «риск» из сравнения двух totals.

### Альтернативы

- **A. Старт сразу в основной route роли.** Самый простой вариант; хорош, если ADMIN почти всегда работает только в одной зоне. Минус — нет сквозных исключений.
- **B. Work queue (рекомендуется).** Уместна ADMIN/MANAGER; требует нового projection contract.
- **C. Старый KPI dashboard.** Не рекомендуется: не ведёт к конкретному объекту/действию.

## 5. Судьба текущих overview routes

| Current | Target |
|---|---|
| `/admin` | role-aware work queue |
| `/admin/operations` | redirect `/admin`; operation cards удалены |
| `/admin/risks` | redirect `/admin?filter=attention` либо alias очереди |
| `/admin/release` | убрать из nav; version/update в System support |
| `/admin/system/status` | самостоятельная truthful support page |

Compatibility redirects сохраняются минимум один release cycle. Старые bookmarks не должны открывать экран с несовпадающим заголовком.

## 6. Truthful System status boundary

Каждая строка проверки должна иметь:

- dependency/probe name;
- `OK / DEGRADED / DOWN / UNKNOWN`;
- checked_at и latency;
- источник (`API`, `Desktop`, `queue`);
- короткое последствие для работы;
- retry/detail только при ошибке.

Нельзя показывать зеленый status без выполненного probe. Отсутствие desktop bridge в web — `Недоступно в браузере`, не success.

## 7. Визуальная система

- сохранить dark neutral palette и domain accents;
- сократить радиусы рабочих контейнеров до 6–10 px;
- cards только для summary/selection, rows/table для очередей;
- 14–16 px основной текст, минимум 12 px только для metadata;
- удалить uppercase tracking из обычных labels;
- цвет не является единственным носителем status;
- один primary button на текущую задачу;
- destructive actions скрыты в separate menu/zone и никогда не конкурируют с primary.

## 8. Rollout

1. Зафиксировать target registry/redirect map без изменения UI.
2. Добавить layout primitives рядом со старым shell.
3. Перенести один vertical slice (рекомендуется Sales New или Acceptance) и проверить навигацию/role gate.
4. Ввести work-queue contract; заменить Dashboard.
5. Переносить зоны по одной, удаляя local rails/inspectors только после QA.
6. Убрать old query views/meta maps после telemetry/consumer check.
7. Перенести prototypes/brandbook в dev-only surface.

## Stop gates

- Кто является владельцем cross-area work queue и какие реальные SLA существуют?
- Нужен ли общий Dashboard ADMIN/MANAGER или прямой role landing достаточно?
- Как долго поддерживаются legacy URLs/query views?
- Какие probes реально доступны browser и packaged Desktop?

