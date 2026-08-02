# Критерии разработки новой desktop HQ-админки

> Граница: редизайн меняет UI/навигацию, но не изобретает новую бизнес-логику. Автоматическая приёмка и существующие Photo/Video workflows сохраняются (`10_PROCESS_CORRECTION.md`).

## 1. Главный принцип

Каждый экран проектируется от одного решения пользователя, а не от универсального набора `метрики + действия + ссылки + инспектор`.

Страница считается самостоятельной только если у неё есть:

1. свой пользовательский результат;
2. своя выборка/проекция данных;
3. своя приоритетная иерархия;
4. своё главное действие или честный read-only результат;
5. собственные loading/empty/error/blocker states.

Если хотя бы два пункта отсутствуют, это filter/tab/redirect, а не новый пункт навигации.

## 2. Проверяемые UX-критерии

| Критерий | Условие приёмки |
|---|---|
| Однозначная задача | неподготовленный пользователь за 5 секунд отвечает «что здесь делать» |
| Один primary | на одном состоянии видна ровно одна главная кнопка; повторов в inspector/header нет |
| Канонический owner | одно бизнес-действие изменяется только из одного workflow; в других местах badge/link |
| Первый экран | на 1440×900 видны объект, причина/состояние и следующее действие без scroll |
| Нет плакатов | отсутствуют `Текущий режим`, `Фокус`, `Инспектор`, `Интерфейс ...`, `MVP` и описания структуры UI |
| Короткий путь | ежедневная задача начинается максимум за 2 перехода из любого основного раздела |
| Неизвестное честно | `UNKNOWN`, stale и error не превращаются в 0, empty или green success |
| Blocker у действия | disabled primary всегда имеет короткую конкретную причину рядом |
| Context сохранён | возврат из detail/fullscreen восстанавливает route, filter, selection и scroll |
| Нет скрытой последовательности | prerequisites сохраняются одним атомарным действием либо явно показываются как шаги |

## 3. Desktop layout

### Поддерживаемые размеры

- основной: `1440×900`;
- широкий: `1920×1080`;
- mobile/tablet не проектируются и не входят в acceptance.

### Shell

- одна постоянная верхняя строка `56–64px`;
- основные зоны — одно слово/короткое название без второй строки;
- глобальный второй nav row запрещён; одна contextual row активной зоны допустима и содержит только самостоятельные бизнес-процессы;
- contextual row не содержит этапы выбранного workflow и не повторяет его filters;
- contextual workflow-map открывается по запросу;
- main content использует всю ширину за вычетом минимальных полей `20–32px`.

### Боковые панели

- максимум одна постоянная боковая область;
- detail drawer/inspector появляется только после выбора объекта;
- empty selection не резервирует 300–340px пустоты;
- список/таблица не сжимается ниже читаемой ширины ради summary;
- resize допустим для list-detail, но default должен работать без настройки.

### Таблицы и очереди

- обязательные колонки одновременно видны на 1440×900;
- horizontal scroll допустим только для optional technical columns, не для primary decision;
- серверная пагинация и stable sort обязательны для растущих списков;
- default page size соответствует видимому viewport, не `300` строк;
- row height `44–64px` для dense work, cards — только когда сравнение по колонкам не требуется;
- filters находятся в компактной toolbar/drawer и отражаются в URL.
- партия любого размера занимает одну строку; Item не рендерятся в batch queue/detail;
- агрегаты `N фото / N видео` считаются сервером или уже существующим источником, а подробности открываются только в специализированном инструменте;
- collapsed/expanded batch не может случайно породить сотни Item rows/cards.

## 4. Визуальная система

### Сохраняется

- тёмный нейтральный фон;
- сдержанные акценты зон;
- белый основной текст;
- Lucide как текущая icon library;
- fullscreen mode для QR/3D/Photo/Video.

### Меняется

- рабочие контейнеры: radius `6–10px`, не `18–24px` в каждом вложенном блоке;
- cards не вкладываются друг в друга без отдельной семантики;
- border/divider используется чаще, чем отдельный фон каждой строки;
- accent color обозначает один смысл в пределах страницы;
- danger red появляется только у реального необратимого/опасного действия;
- badges не выглядят как switches, если не интерактивны.

### Типографика

- русский язык по умолчанию;
- основной UI-текст `14–16px`, line-height `1.4–1.6`;
- metadata не меньше `12px`;
- uppercase + wide tracking только для редких section labels, не для каждого поля;
- один H1 на страницу, затем плоская иерархия H2/H3;
- ID/serial используют monospace только когда оператор реально сравнивает их.

## 5. Правила текста

### Названия

- страница — существительное/результат: `Новые заказы`, `Приёмка`, `Наличие`, `Публикация`;
- кнопка — глагол + результат: `Принять в работу`, `Сохранить и отправить`, `Опубликовать`;
- status — человеческое состояние: `В пути`, `Нужны фото`, `Доступ приостановлен`;
- технический enum может быть в раскрываемых деталях поддержки.

### Что удаляется

- повтор названия страницы в rail/banner/inspector;
- очевидные инструкции (`Нажмите кнопку, чтобы...`);
- смешение `Hero`, `Media`, `runtime`, `stuck`, `snapshot`, `Run`, `Items/Jobs` в routine UI;
- тексты, объясняющие внутреннюю архитектуру;
- комментарии о временности/MVP.

### Когда пояснение обязательно

- почему действие недоступно;
- что будет удалено/изменено;
- что произошло при partial/conflict/error;
- редкий термин, который нельзя заменить;
- empty state с одним следующим действием.

## 6. Действия и безопасность

| Класс | UX |
|---|---|
| Routine reversible | выполняется сразу, локальный progress/result |
| Routine domain transition | semantic action, server capability/blocker, atomic transaction |
| Bulk | sticky selection bar, число выбранных, impact, result matrix, безопасный retry |
| Rare admin | отдельный screen/section, explicit save, revision, audit |
| Destructive | server impact preview, сильное confirm по риску, typed confirm при большом масштабе, recovery/undo где возможно |
| Test-only | отсутствует в production UI |

`Удалить/Скрыть/Очистить` не может быть маленькой постоянной иконкой рядом с routine action. UI не предлагает действие, которое actor гарантированно не может выполнить.

## 7. Формы и редакторы

- form state различает `clean`, `dirty`, `saving`, `saved`, `conflict`, `error`;
- dirty navigation guard работает для links, router navigation, back/forward, reload и закрытия;
- server validation привязана к полю и не стирает draft;
- `Save` disabled только с видимой причиной либо при отсутствии изменений;
- optimistic concurrency через version/revision/If-Match;
- load failure не подменяется default values;
- live preview использует production renderer и только реально поддерживаемые поля;
- большие формы делятся по пользовательскому решению, не по названиям DB-полей.

## 8. Состояния данных

Каждая страница обязана иметь отдельные макеты:

- initial loading/skeleton;
- populated;
- legitimate empty;
- search/filter empty;
- partial data;
- stale/offline;
- permission denied;
- server error + local retry;
- conflict/revision changed;
- action in progress/success/failure.

Запрещено одновременно показывать `Не удалось загрузить`, `Данные загружены`, нулевые totals и зеленый success.

## 9. Server contract criteria

- list projection содержит только данные решения текущей страницы;
- filters/sort/ACL применяются до limit;
- readiness/capabilities/blockers вычисляет server domain owner;
- semantic command охватывает все side effects в одной transaction;
- bulk command атомарен либо возвращает per-item result и idempotent retry;
- actor/ownership/capability присутствуют в projection;
- stable IDs и version обязательны;
- status/date semantics документированы;
- response typed/validated на обеих границах;
- duplicate staff APIs/commands выводятся из эксплуатации после consumer audit.

Эти критерии не разрешают менять существующие media/state contracts в рамках визуального среза. Новый UI сначала использует текущие команды; отдельный backend cleanup не подменяет задачу редизайна.

## 10. Role criteria

- `ADMIN`, `MANAGER`, `SALES_MANAGER` получают разные task maps, а не один UI с поздними 403;
- UI скрывает/disabled control по server capability, API повторно проверяет;
- персональная identity обязательна в browser и HQ Desktop;
- ownership видим как `Мой / Свободный / Другой ответственный` там, где это влияет на действие;
- роль нельзя читать из localStorage как источник истины;
- permission loss во время открытой страницы имеет понятное состояние.

## 11. Accessibility

- WCAG 2.2 AA contrast для текста/controls;
- все функции доступны keyboard;
- видимый focus и корректный tab order;
- dialog/drawer trap + возврат focus;
- status не передаётся только цветом;
- icon-only button имеет accessible name и tooltip, но критическое действие всё равно получает текст;
- live status/error объявляется screen reader без повторного чтения всей страницы;
- 200% text zoom не перекрывает primary actions на desktop viewport.

## 12. Performance/freshness

- p95 budgets определяются на production-like объёмах до freeze;
- list не загружает full detail/timeline/media;
- поиск debounce + abort;
- visible-tab polling/focus refresh для inbox, если realtime не обоснован;
- last successful update видим при stale state;
- тяжелые filesystem/aggregate операции вынесены из request-time full scan;
- virtualisation используется только после измерения, не вместо server pagination.

## 13. Page Definition of Done

Страница готова, только если:

1. есть утвержденный job statement и owner;
2. удалены дублирующие routes/actions;
3. API/capability/readiness contract проверен;
4. 1440×900 и 1920×1080 states сняты и просмотрены;
5. primary action один и виден;
6. все data/action states реализованы;
7. role/ownership/ACL tests зелёные;
8. keyboard/contrast пройдены;
9. outcome-based e2e зелёный;
10. docs и redirect map обновлены;
11. старый writer выключен или имеет утверждённый срок удаления;
12. rollback не возвращает P0/false-success.

Для `Партии` дополнительно: тестовая партия на 500 Item не создаёт 500 карточек/строк на основном экране, а Photo/Video открываются в существующих инструментах без изменения их внутренней логики.

## 14. Usability gate

До общего rollout минимум 5 реальных представителей ролей выполняют критические routine-задачи без инструктажа. Цель: ≥80% first-attempt success для routine flows и 100% осознанного замечания последствий destructive actions. Ошибки первого клика фиксируются и приводят к повторной проверке интерфейса.
