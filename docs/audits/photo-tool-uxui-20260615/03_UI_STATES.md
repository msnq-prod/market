# UI States — Photo Tool

Taxonomy of every user-visible state, where it's shown, and whether the UI tells the operator enough. Scope is UX/UI (labels, visibility, disabled logic), not data correctness.

## 1. Page-level states

| State | Trigger | UI surface | Adequate? |
|---|---|---|---|
| Loading | `loading=true` | Centered splash "Загружаем photo-tool..." (`:1881-1892`) | OK. |
| Error (load) | `loadPhotoTool` catch | Red banner in main (`:2098-2111`) | OK, but no retry button — only the stale-conflict variant has `Обновить Photo Tool`. |
| Error (save, generic) | `handleSave` catch, non-stale | Red banner | OK. |
| Error (save, conflict) | code `PHOTO_TOOL_STATE_STALE` | Red banner + `Обновить Photo Tool` button (`:2101-2109`) | Partial — button does full `window.location.reload()`; no in-place rebase. |
| Success (info) | `successMessage` | Emerald banner | OK, but competes with error banner (see §4). |
| Saving | `saving=true` | Button → `Сохраняем` + spinner | OK. |
| Importing | `importProgress != null` | `PhotoImportPanel` + button label `Обработка...` | OK. |

## 2. Workflow / background states

| Phase (`workflowPhaseLabel :180-191`) | Label | UI treatment |
|---|---|---|
| `queued` | "В очереди" | Workflow pill (warning tone when active) |
| `converting` | "Конвертация" | pill |
| `uploading` | "Загрузка" | pill |
| `verifying` | "Проверка" | pill |
| `paused_offline` | "Пауза: нет связи с сервером" | pill |
| `auth_required` | "Нужен повторный вход" | pill |
| `stale` | "Конфликт данных" | pill |
| `failed` | "Ошибка" | pill |
| `completed` | "Готово" | pill (success tone) |
| `cancelled` | "Отменено" | pill |

- The header Workflow pill appears only when `batchPhotoWorkflow` exists (`:1917`). Tones: warning while active, success on completed, default otherwise.
- The dedicated **banner** under the header (`:1943-1957`) appears **only while `activePhotoWorkflow`** (i.e. non-terminal). Terminal phases (failed/stale/cancelled) are reduced to a small pill with no banner and no in-page recovery CTA — recovery lives in the separate Status Center drawer.
- `buildWorkflowStatusText` (`:208-214`) formats `"phase: N фото. [error]"`. Terminal failure phases show the raw normalized error text only inside the pill's `value`, which can be long; there's no dedicated failure row in the page.

## 3. Edit-lock state (`workflowLocked`)

When an active workflow is running, the page enters a read-only-ish mode — **but inconsistently** (also flagged PT-003 in prior audit; here we focus on UI signal):

| Surface | Locked? | Signal to user |
|---|---|---|
| Save button | Re-labelled `В фоне`, opens Status Center instead of saving | implicit |
| `Добавить фото` | disabled, label `Сохранение в фоне` | OK |
| Sort/assignment toggles | disabled (`workflowLocked`) | only `disabled` style, no tooltip/why |
| Assignment inputs | `disabled` | only `disabled` style |
| List remove (Trash) | disabled | only `disabled` style |
| Export `Заменить`/`Заново` | disabled | only `disabled` style |
| Export `Снять` | disabled | only `disabled` style |
| Hotkeys (Delete/digits) | no-op (`:1837-1839`, `:1443`, etc.) | **no signal at all** — keypresses silently swallowed |
| Step nav | **still clickable** | no signal |
| Carousel navigation (←/→) | **still works** | fine, but inconsistent with the rest |

So during a background save the operator can still flip between Качество/Назначение/Экспорт and change quality presets *visually* — except `applyPhotoExportSettings` early-returns when locked (`:851-860`), so preset clicks silently do nothing. The preset/number fields are **not** visually disabled (no `readOnly` passed to `PhotoQualityPanel`? — they are: `readOnly={workflowLocked}` at `:2120`), but the disabled style is the only hint.

The single global "why am I locked?" explanation lives in the banner (`:1948`): "Редактирование заблокировано до завершения workflow." Good that it exists; weak that disabled controls don't restate it.

## 4. Banner conflict: error vs success

`{(error || successMessage) && …}` (`:2098`) renders a single banner. The class is `error ? red : emerald`. If both `error` and `successMessage` are set, **error wins** and the success text is hidden (template shows `{error || successMessage}`). In practice handlers clear the other field, but a few paths set `error` while a stale `successMessage` lingers (e.g. `handleAddFiles` sets `successMessage` then a later `setError` in another path) — worth a glance; not confirmed (hypothesis).

## 5. Per-photo states (filmstrip + carousel + grid)

| State | Filmstrip signal | Carousel signal | Export grid signal |
|---|---|---|---|
| Assigned | "Позиция NNN" line + no overlay | green `CheckCircle2 NNN` chip | tile image + "Новое/Сохраненное фото: name" in emerald |
| Unassigned | red overlay + "Без назначения" | red-tinted input bg + `placeholder="Без номера"` | "Фото не назначено" placeholder + amber "Нет назначения" |
| Local (new) | "Local" caption (`:2614`) | none distinct | "Новое фото" prefix |
| Persisted (saved) | "Saved" caption | none distinct | "Сохраненное фото" prefix |
| HEIC (no browser preview) | generic thumb icon | `PhotoPreview` HEIC card | compact HEIC icon |

- The "Local" / "Saved" caption in the filmstrip (`:2614`) uses **English** words in an otherwise all-Russian UI. Inconsistent terminology.
- The carousel makes no local/persisted distinction — an operator can't tell from the carousel whether the active photo is already saved or pending upload.

## 6. Coverage / metrics states

Header pills + aside coverage row both show `min(itemSeqs, assigned)/itemSeqs`. Additional signals:

| Pill | Value | Tone logic |
|---|---|---|
| Назначено | `min(items, assigned)/items` | success when `canSave` else default |
| Без номера | `unassignedCount` | warning if > 0 else default |
| Лишние | `extraPhotoCount` | **always default** — even when there are extra photos that will silently be dropped/ignored on save |

"Лишние" (extra photos beyond item count) is a meaningful state (those photos will not be assigned to any item) but the UI gives it neutral styling and no explanation of what happens to them.

## 7. Size-estimate states (`PhotoSizeEstimate`)

| status | message | tone |
|---|---|---|
| `idle` | "Загрузите локальное фото для оценки веса." | default |
| `estimating` | "Считаем примерный вес..." | default |
| `ready` | "Оценка по активному локальному фото." | success |
| `unavailable` | "Точный расчет доступен для локального фото с превью." | warning |

- Estimate is computed off the **active** photo only (`:1079`). If the active photo is persisted or HEIC, the estimate is `unavailable` even when other local photos could be measured. No batch-level estimate fallback.
- Estimate silently recomputes on every `activePhoto` / settings change (`useEffect :1070`); there's a brief flash through `estimating` each time.

## 8. Unsaved-changes signaling

Three independent surfaces, not always aligned:

1. Header `Draft` amber badge (`:1908`) — boolean.
2. Stat row "Статус: Есть несохраненные изменения / Все изменения сохранены" (`:2206-2209`) — same boolean, restated.
3. `beforeunload` guard (`:1790`) — boolean.

No granularity (added? removed? settings changed? assignment changed?). No "x unsaved edits" count. No per-control dirty marker.

## 9. Step-nav states

The step buttons have only two visual states: active (sky) / inactive (subtle). There is **no** "completed"/"dirty"/"disabled" state, no "you have unsaved work on this step" indicator, and `Экспорт` is always enabled even when nothing is assigned. The nav behaves like tabs, not like a wizard — which conflicts with the ordered naming Качество → Назначение → Экспорт.

## 10. Draft-restore states

| Restore outcome | Banner text | Tone |
|---|---|---|
| Conflict (token mismatch) | "Восстановлен конфликтный черновик: данные партии уже изменились. Проверьте назначения перед повторным сохранением." | emerald (successMessage) |
| Partial (missing blobs) | "Черновик восстановлен частично: часть локальных файлов недоступна." | emerald |
| Plain restore | "Восстановлен несохраненный черновик photo-tool." | emerald |

A *conflict* warning rendered in the **success (emerald)** tone is a tone mismatch — conflict is a warning/error condition, not a success.
