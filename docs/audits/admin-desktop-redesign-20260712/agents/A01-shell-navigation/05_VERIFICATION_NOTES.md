# A01 — verification notes

## Route/ACL matrix

Для каждого canonical route и alias проверить:

- `ADMIN`, `MANAGER`, `SALES_MANAGER`, `FRANCHISEE`, anonymous;
- прямой deep link, refresh, browser back/forward;
- canonical redirect сохраняет безопасные параметры и не образует loop;
- active zone не определяется fallback-ом;
- nav никогда не показывает route, который гарантированно вернёт 403.

## Desktop visual matrix

Viewports:

- 1440×900 — обязательный baseline;
- 1920×1080 — широкий desktop;
- 1280×720 — допустимый нижний desktop guard, если продукт его поддерживает; иначе показать явный minimum-size state.

Проверить:

- один nav row;
- первый meaningful row виден без scroll;
- нет пустого постоянного inspector;
- table/list не получает horizontal scroll из-за layout chrome;
- primary action встречается один раз;
- длинные русские названия и 200% text zoom не перекрывают actions.

## Keyboard/accessibility

- skip link в main;
- полный nav и command palette с keyboard;
- явный focus ring;
- focus возвращается в trigger после закрытия overlay/drawer;
- route/title announcement;
- contrast WCAG AA для обычного текста/status;
- status имеет icon/text, не только цвет.

## Work queue contract

Contract tests:

- каждый элемент ссылается на существующий и доступный actor объект;
- action capability соответствует backend;
- resolved item исчезает после command/invalidation;
- stale/unknown data не становится `OK`;
- pagination/sort стабильны;
- counts соответствуют тому же filter source.

Browser scenarios:

1. очередь с 0, 1, 20, 200 items;
2. смешанные severity/assignee/due date;
3. object исчез после действия другого пользователя;
4. partial endpoint failure;
5. actor теряет permission во время открытой страницы;
6. offline/reconnect.

## System status

Controlled probes для `200`, `401`, `403`, `404`, `500`, timeout, desktop bridge absent, Photo queue failed, Video queue failed. Ожидание: ни одно из этих состояний не превращается в зеленое по косвенному `loading=false`.

## Regression

- `npm run lint`
- `npm run build`
- route-specific e2e для nav/ACL/aliases;
- screenshot comparison current reference ↔ selected concept ↔ implementation на одинаковом viewport/state;
- проверить отсутствие `/prototypes/*` и `/brandbook` в production nav/bundle entry.

## Rollback

Новый shell включать feature flag/route-slice флагом. Redirect registry должен быть независим от визуального rollout, чтобы при rollback не потерять deep links.

