# Fix Plan

1. Закрыть незавершенный проход по продажам: `Clients`, `SalesInventory`, `SalesHistory`.
2. Перепроверить `Users`, `Settings`, `Telegram`, убрать крупные заголовочные блоки.
3. Перепроверить `CloneContent`, `PlanetLabelsWorkspace`, убрать верхние KPI/header-полосы.
4. Запустить build/lint.
5. Playwright smoke: первый экран по ключевым routes, проверка отсутствия старых headers и наличия left/center/right зон.
6. Обновить verification/progress в обоих аудитах.
