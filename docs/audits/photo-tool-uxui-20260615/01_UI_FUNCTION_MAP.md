# UI Function Map — Photo Tool

Every observable UI action and entrypoint, traced to its handler and the resulting UI/state effect. Focus is **UX/UI surface**, not backend correctness (see prior audit for that).

All line references are `src/admin/pages/PhotoTool.tsx` unless noted.

## Entrypoints / Navigation

| Entry | Where | Effect |
|---|---|---|
| Route `/admin/photo-tool/:batchId` | `src/App.tsx:700-709` | Page mounts inside `AdminFullscreenRoute` + `DesktopOnlyToolRoute`. Non-desktop → placeholder. |
| Back link `← Приемка` | header `:1902` | `<Link to="/admin/acceptance">`. No draft-preserving nav; `beforeunload`-style guard only fires on real unload, not SPA nav (see negative paths). |
| Launch from Acceptance | `src/admin/pages/Acceptance.tsx:568-574` | Link shown only when `canFinalizeBatch(selectedBatch.status)`. |
| Deep link from Status Center (stale job) | `DesktopStatusCenter.tsx:703-710` | `window.location.assign('/admin/photo-tool/:batchId')` — full reload. |
| `batchId` change | `useEffect :963-965` | `loadPhotoTool({ restoreDraft: true, showLoading: true })`. |

## Top-level Controls

| Control | Location | Handler | Disabled when | UI effect |
|---|---|---|---|---|
| Save button (`photo-save`) | header `:1927-1939` | `handleSave :1474` | `(!canSave && !activePhotoWorkflow) || saving || isImportingPhotos` | Label cycles: `Сохранить` → `Сохраняем` → `В фоне` (when active workflow). |
| Status pills (Назначено / Без номера / Лишние / Workflow) | header `:1914-1923` | none (display) | — | Tones: success / warning / default. |
| `DesktopStatusCenter` button | header `:1924` | internal | — | Opens status center drawer. |
| Workflow banner | under header `:1943-1957` | shown only when `activePhotoWorkflow` | — | Text + `Открыть Status Center` button. |

## Aside (left rail) Controls

| Control | Location | Handler | Disabled when |
|---|---|---|---|
| `Добавить фото` button (`photo-upload-input` hidden) | `:1995-2003` | `fileInputRef.click()` → `handleAddFiles :1211` | `isImportingPhotos \|\| activePhotoWorkflow`. Label → `Обработка...` / `Сохранение в фоне`. |
| Import progress panel | `:2005-2007` | display | — | `PhotoImportPanel` (`:2478`). |
| Sort `Имя` toggle (`photo-sort-name`) | `:2012-2019` | `applyFullReassignment('name', sortDescending, assignmentDescending) :1192` | `workflowLocked` |
| Sort `Дата` toggle (`photo-sort-date`) | `:2020-2027` | `applyFullReassignment('date', ...)` | `workflowLocked` |
| `Список` reverse toggle (`photo-reverse-list`) | `:2028-2035` | `applyFullReassignment(sortMode, !sortDescending, ...)` | `workflowLocked` |
| `Назначение` reverse toggle (`photo-reverse-assignment`) | `:2036-2043` | `applyFullReassignment(sortMode, sortDescending, !assignmentDescending)` | `workflowLocked` |
| Coverage row (`photo-coverage`) | `:2046-2049` / `:2053-2058` | display | — | Two different markups depending on `sidebarControlsOpen`. |
| Collapse settings chevron | `:2060-2067` | `setSidebarControlsOpen` | — | `aria-label` flips. |
| Photo list item activate (`photo-list-item-:i`) | `:2590-2617` | `onActivate → handleListItemActivate :1866` | — |
| Photo list item remove (Trash) | `:2619-2630` | `onRemove → handleListItemRemove :1870` | `readOnly` (workflowLocked) |
| Empty state | `:2071-2078` | — | — | "Лента пока пустая". |

**Note on toggles UX:** All four toggles call `applyFullReassignment`, which re-sorts the whole list **and re-runs `assignAllPhotos`** — i.e. toggling "Список reverse" silently reassigns every photo's item number. This is a flow/taxonomy concern (see findings), not a backend bug.

## Main Area

### Step nav (`PhotoToolStepNav :2227-2255`)

Three steps, always visible, always clickable, no gating:

| Step | testId | description label | Panel rendered |
|---|---|---|---|
| `Качество` | `photo-step-quality` | "Сжатие и размер" | `PhotoQualityPanel :2257` |
| `Назначение` | `photo-step-assign` | "Карусель и номера" | Carousel + stats (`:2149-2216`) |
| `Экспорт` | `photo-step-export` | "Плитки товаров" | `PhotoExportGrid :2387` |

`activeStep` auto-changes on: draft restore → `assign` (`:951`); add files → `assign` (`:1326`); replace item photo → `export` (`:1388`).

### Quality panel (`PhotoQualityPanel :2257-2346`)

| Control | testId | Handler | Disabled |
|---|---|---|---|
| Preset Легкий / Стандарт / Максимум (`:157-176`) | `photo-preset-:id` | `onApplySettings(preset.settings)` | `readOnly` |
| Сжатие number | `photo-quality-input` | `onChange → clampInteger` | `readOnly` |
| Ширина number | `photo-max-width-input` | same | `readOnly` |
| Высота number | `photo-max-height-input` | same | `readOnly` |
| Size estimate block | `photo-size-estimate` | display (computed by `useEffect :1070-1105`) | — |

### Assign panel (carousel + stats)

| Control | Location | Handler |
|---|---|---|
| Prev / Active / Next `CarouselStageCard` (`:2154-2189`) | `:2636-2743` | click → `onActivate → activatePhoto`; assignment input `onFocus → onActivate`, `onChange → handleAssignmentInputChange :1442` |
| Assignment inputs (`photo-assignment-input-prev/center/next`) | `:2722-2736` | `disabled={readOnly}` |
| Stats row (Текущий файл / Позиция / Статус / Подсказка) | `:2194-2215` | display |

### Export grid (`PhotoExportGrid :2387-2459`)

| Control | testId | Handler | Disabled |
|---|---|---|---|
| Tile click (activate) | `photo-export-tile-:seq` | `onActivatePhoto` (jumps to assign step) | `!photo` |
| `Заменить` | `photo-export-replace-:seq` | `onReplace → openItemFilePicker :866` | `readOnly` |
| `Заново` | `photo-export-reupload-:seq` | `onReupload` — local photo → toast; persisted → `openItemFilePicker` (`:2133-2140`) | `readOnly` |
| `Снять` | `photo-export-clear-:seq` | `onClear → commitAssignmentChange(photo.id, '')` | `!photo \|\| readOnly` |

## Hotkeys (`handleHotkey :1806-1864`, window-level `keydown`)

| Key | Effect | Guarded by |
|---|---|---|
| `←` / `→` | prev/next photo | only if `activePhoto` and no meta/ctrl/alt |
| `Enter` | commit assignment draft | only if draft belongs to active photo; not during workflow |
| `Delete` | clear active photo's assignment | not during workflow |
| `0-9` | append digit to assignment | not in other editable fields, not during workflow |
| `Backspace` | drop last digit | only when draft active |

Hotkey handler is registered once on mount (`:1874-1879`) and uses refs to read fresh state. Editable targets (input/textarea/select/contenteditable) are skipped **except** assignment inputs (identified by `data-photo-assignment-input="true"`).

## File Inputs (hidden)

| Input | ref | accept | Used by |
|---|---|---|---|
| Multi photo (`photo-upload-input`) | `fileInputRef` | `.jpg,.jpeg,...,.heif` | `Добавить фото` |
| Single item replace (`photo-item-replace-input`) | `itemFileInputRef` | same | `Заменить` / `Заново` (persisted) in export grid |

## Display-only Feedback Surfaces

| Surface | Location | Trigger |
|---|---|---|
| Loading splash | `:1881-1892` | `loading` true |
| Error/success banner | `:2098-2111` | `error` / `successMessage`; conflict variant shows `Обновить Photo Tool` (full reload) |
| `Draft` badge | header `:1908` | `hasUnsavedChanges` |
| Workflow Status pill | header `:1917-1923` | `batchPhotoWorkflow` present |
| `beforeunload` guard | `:1790-1804` | `hasUnsavedChanges` |

## Gaps in Traceability (UI-side)

- No drag-and-drop target despite "filmstrip working list" framing — files enter only via the single `Добавить фото` button.
- No visible representation of *which* unsaved change type (added vs reassigned vs removed vs settings change) — only a binary `Draft` badge and a generic "Есть несохраненные изменения" stat.
- No undo; every sort/assignment toggle mutates the whole list irreversibly (until Save/restore).
