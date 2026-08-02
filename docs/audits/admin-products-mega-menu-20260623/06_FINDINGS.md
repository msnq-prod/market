# Findings

## P1-01: Photo Tool и Video Tool продублированы ложными редакторами

- **Promise:** пользователь выполняет назначение фото и монтаж видео внутри нового UI.
- **Reality:** экран меняет только local state. Реальные tools работают на `/admin/photo-tool/:batchId` и `/admin/video-tool/:batchId`, причем через HQ Desktop.
- **Evidence:** `MediaWorkspaces.tsx:6-107`, `App.tsx:619-719`, `SYSTEM_USAGE_GUIDE_RU.md:277-322`.
- **Effect:** пользователь видит несуществующее сохранение и обходит реальные проверки, draft, IPC, render и upload.
- **Status:** confirmed.

## P1-02: Все ключевые операции показывают ложный success

- **Promise:** локация, шаблон, заказ, приемка, QR, склад сохранены.
- **Reality:** операции ограничены `useState`, API не вызывается.
- **Evidence:** `LocationsWorkspace.tsx:58-75`, `TemplatesWorkspace.tsx:50-67`, `CollectionOrdersWorkspace.tsx:47-61`, `AcceptanceWorkspace.tsx:6-74`, `WarehouseWorkspace.tsx:6-17`.
- **Effect:** интерфейс выглядит рабочим, но не выполняет бизнес-операцию.
- **Status:** confirmed.

## P1-03: Финализация партии имитируется таймером

- **Promise:** выполнена проверка и партия передана на склад.
- **Reality:** результат вычисляется из статического массива, затем локально ставится `stored`.
- **Evidence:** `StockReadinessWorkspace.tsx:15-29`, `StockReadinessWorkspace.tsx:52-73`; реальная финализация — `Acceptance.tsx:331-344`.
- **Effect:** ложная готовность и ложное складское состояние.
- **Status:** confirmed.

## P1-04: QR и серийные номера дублируют реальные сервисы

- **Promise:** серийные номера исправлены, QR подготовлены к печати.
- **Reality:** номера существуют только в локальном массиве, печать переключает boolean.
- **Evidence:** `IdentificationWorkspace.tsx:6-47`, `IdentificationWorkspace.tsx:57-106`; реальный QR flow — `Acceptance.tsx:347-383`, `QrPrint.tsx`.
- **Effect:** пользователь не получает PDF и не меняет Item.
- **Status:** confirmed.

## P2-01: Неверная линейная модель обработки партии

- **Promise:** фото, видео, QR — последовательные стадии.
- **Reality:** после приемки это параллельные независимые возможности; склад зависит только от фактических media и backend-проверок.
- **Evidence:** `ProductsMegaMenu.tsx:4-8`, `BUSINESS_LOGIC_RU.md:204-223`.
- **Effect:** меню навязывает лишние переходы и неверно объясняет процесс.
- **Status:** confirmed.

## P2-02: Функции «Планеты» попали в «Товары»

- **Reality:** редактор локации содержит подпись планеты и переводы; шаблон содержит публикацию, маркетплейсы и переводы.
- **Evidence:** `LocationsWorkspace.tsx:85-107`, `TemplatesWorkspace.tsx:90-101`.
- **Effect:** нарушено функциональное разделение верхних зон.
- **Status:** confirmed.

## P2-03: Сценарии снова выглядят одинаково

- **Reality:** большинство экранов — одинаковая композиция `список слева / форма справа`; фото и видео реализованы одним компонентом.
- **Evidence:** `LocationsWorkspace.tsx`, `TemplatesWorkspace.tsx`, `CollectionOrdersWorkspace.tsx`, `AcceptanceWorkspace.tsx`, `MediaWorkspaces.tsx`.
- **Effect:** роль сценария считывается слабо, несмотря на исходное требование.
- **Status:** confirmed.

## P2-04: Очередь не является source of truth

- **Reality:** задачи, счетчики и статусы захардкожены; фильтр `Только требующие действия` не имеет handler.
- **Evidence:** `productData.ts:1-100`, `ProductsQueueWorkspace.tsx:8-24`.
- **Effect:** главный полезный экран не отражает реальную работу.
- **Status:** confirmed.

## P2-05: Рабочая область перегружена самостоятельными пунктами

- **Reality:** десять равноправных пунктов смешивают справочники, процесс партии, инструменты и результат.
- **Evidence:** `productScenarios.ts:15-130`.
- **Effect:** menu становится картой всей системы, а не быстрым доступом к работе.
- **Status:** confirmed.

## P2-06: URL и состояние могут расходиться

- **Reality:** `productsView` читается только при инициализации `useState`; back/forward не синхронизирует selection.
- **Evidence:** `MegaMenuPrototype.tsx:35-40`.
- **Effect:** URL может показывать один сценарий, экран — другой.
- **Status:** confirmed.
