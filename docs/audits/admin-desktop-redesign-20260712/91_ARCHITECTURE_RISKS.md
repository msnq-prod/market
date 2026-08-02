# Architecture risks

## R1. Универсальные «рабочие области» продолжают размножаться

Если сохранить общий трехколоночный компонент, каждая новая задача снова станет filter + description + inspector. Стоимость навигации и дубли будут расти быстрее функций.

## R2. Frontend readiness расходится с backend invariants

Уже расходятся Acceptance ready, QR printable, Planet ready, media runtime и order shipment. Любое новое правило backend создаст активную кнопку, которая закономерно падает. Нужен server-owned capability projection.

## R3. Несколько write paths разрушают целостность

Order staff APIs, batch finish APIs, Product publish controls, Location full PUT и Telegram recipients имеют параллельных владельцев. Исправление одного экрана не гарантирует целостность других.

## R4. Shared desktop identity делает UI-ACL декоративным

Даже идеальная role navigation не имеет смысла, если все packaged Desktop установки получают одну ADMIN-сессию. Нельзя строить audit trail и индивидуальные capabilities.

## R5. Опасные сервисные функции доступны как обычные UI-действия

Recursive storage delete, batch hide/video clear и E2E diagnostics не имеют безопасного recovery boundary. Ошибка пользователя может повредить данные независимо от качества нового UI.

## R6. Client-side full-data consoles не выдержат рост

Orders, customers, inventory, batches, products и storage используют limit-after-load, полные include или рекурсивные вычисления. Новый плотный UI может визуально ускориться, но network/DB bottleneck останется.

## R7. Last-write-wins незаметно теряет работу

Location, CloneContent, Telegram draft, Orders draft и bulk allocation показывают разные формы одной проблемы: нет revision/dirty/partial-result contract. Параллельные desktop-сессии увеличат вероятность.

## R8. Служебные слова становятся публичным UX-contract

`runtime`, `snapshot`, `manifest`, `temp_id`, `chat_id`, `workflow`, `Run` и status enums закрепляются в тестах и документах. Их последующая замена дорожает, а пользователь вынужден знать внутреннюю архитектуру.

## R9. Старые e2e дают ложную уверенность

Часть тестов проверяет устаревшие заголовки, часть закрепляет ошибочный production origin, критические flows не покрыты. Без новой outcome-matrix редизайн может пройти build и сломать операцию.

## R10. Большой одномоментный rewrite конфликтует с dirty worktree

Админка, backend, schema и tests уже имеют изменения пользователя. Реализация должна идти вертикальными slices и не переписывать несвязанные области; иначе невозможно отделить регрессии и сохранить работу пользователя.

