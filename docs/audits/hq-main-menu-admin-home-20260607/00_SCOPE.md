# Scope

## Target

Аудит главного меню HQ Electron-приложения и главной страницы web-админки, включая видимые меню, быстрые действия, карточки, ссылки и статусы, которые оператор видит на desktop 16:9 около Full HD.

## Boundaries

- Desktop-only: 16:9, около 1920x1080.
- Роли: `ADMIN`, `MANAGER`, `SALES_MANAGER`, если они могут видеть админскую оболочку или ее пункты.
- UI-области:
  - Electron chrome / application menu / окно HQ Desktop.
  - `AdminLayout` и `Sidebar`.
  - Главная страница web-админки (`Dashboard`).
  - Связанные entrypoints, на которые ведут пункты меню.
- Проверка касается UX/UI-логики: дубли, лишние пункты, нелогичная группировка, расхождение между текстом UI и реальным действием.

## Non-goals

- Не менять бизнес-логику, API-контракты и схему БД.
- Не делать мобильный аудит.
- Не редизайнить интерфейс до согласования выводов.
- Не фиксить найденное до завершения audit-этапа.

## Assumptions

- Под "главным меню электрон приложения" понимаются Electron app menu / desktop shell и web-админка, загруженная в HQ Desktop.
- Скрин не приложен в контекст, поэтому аудит строится по исходникам и доступной локальной проверке.

## Commands Used

- `sed -n '1,240p' /Users/nikitamysnik/.codex/skills/dissect-and-fix-code/SKILL.md`
- `rg --files`
- `sed -n '1,240p' package.json`
- `mkdir -p docs/audits/hq-main-menu-admin-home-20260607`
- `sed -n '1,260p' electron/hq/main.cjs`
- `sed -n '1,260p' electron/hq/windows.cjs`
- `sed -n '1,320p' src/admin/components/Sidebar.tsx`
- `sed -n '1,320p' src/admin/pages/Dashboard.tsx`
- `sed -n '560,700p' src/App.tsx`
- `sed -n '1,260p' src/admin/components/AdminLayout.tsx`
- `sed -n '438,1545p' src/admin/components/DesktopStatusCenter.tsx`
- `sed -n '1,260p' src/admin/components/HqDesktopDownloadPlaceholder.tsx`
- `sed -n '1,260p' shared/domain/policy.ts`
- `sed -n '330,410p' server/index.ts`
- `sed -n '1,120p' docs/USER_GUIDE_ADMIN_RU.md`
- `sed -n '180,210p' docs/SYSTEM_USAGE_GUIDE_RU.md`
- `sed -n '320,345p' docs/SYSTEM_USAGE_GUIDE_RU.md`
- `sed -n '390,410p' docs/SYSTEM_USAGE_GUIDE_RU.md`
- `rg -n "...menu/dashboard/status patterns..." src electron docs tests server`

## Verification Constraints

- Скрин не приложен в контекст.
- Dev-сервер и актуальная Electron dev-сборка не запускались на audit-этапе.
- В `ps aux` виден уже запущенный packaged `ZAGARAMI admin`, но аудит привязан к текущим исходникам репозитория.
