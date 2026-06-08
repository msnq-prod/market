# Photo Tool Function Map

## Boundaries

| Boundary | Entrypoint | Owner | Evidence |
|---|---|---|---|
| Route gate | `/admin/photo-tool/:batchId` | React route + desktop-only gate | `src/App.tsx:612`, `src/App.tsx:639` |
| Main UI | `PhotoTool` | React state, local draft, direct save, desktop workflow save | `src/admin/pages/PhotoTool.tsx:757` |
| Desktop API | `window.stonesDesktop` | Renderer-to-Electron bridge | `src/utils/desktop.ts:220`, `electron/hq/preload.cjs:26` |
| Desktop staging | `stageDesktopFile` | Streams browser `File` to local queue files dir | `src/utils/desktop.ts:259`, `electron/hq/mediaQueue.cjs:223` |
| Workflow IPC | `stones:start-photo-apply-workflow` | Starts durable photo workflow | `electron/hq/preload.cjs:46`, `electron/hq/ipcHandlers.cjs:138` |
| Workflow worker | `MediaWorkflowManager` | Converts HEIC, posts apply request, retries auth/offline | `electron/hq/mediaWorkflowManager.cjs:178`, `electron/hq/mediaWorkflowManager.cjs:554` |
| Legacy queue | `enqueuePhotoToolApply` | Still exposed and displayed, not used by current Photo Tool save path | `electron/hq/preload.cjs:45`, `electron/hq/mediaQueue.cjs:315` |
| Status Center | `DesktopStatusCenter` | Shows workflow/queue status and retry/cancel/open actions | `src/admin/components/DesktopStatusCenter.tsx:356`, `src/admin/components/DesktopStatusCenter.tsx:514` |
| API load | `GET /api/batches/:id/photo-tool` | ACL + batch payload | `server/routes/batches/photoToolRoutes.ts:101` |
| API apply | `POST /api/batches/:id/photo-tool/apply` | ACL + multipart + normalization + DB apply | `server/routes/batches/photoToolRoutes.ts:115` |
| Service | `applyPhotoTool` | State token, manifest validation, file move, item update | `server/routes/batches/photoToolService.ts:297` |
| Upload helper | `normalizeSharedUploadedFiles` | Type sniff, markup block, image normalization | `server/middleware/upload.ts:650` |
| DB truth | `Batch.status`, `Item.item_seq`, `Item.item_photo_url` | Prisma schema | `prisma/schema.prisma:425`, `prisma/schema.prisma:457` |
| Tests | `admin-photo-tool.spec.ts` | API, placeholder, desktop mock, hotkeys; some UI tests skipped | `tests/e2e/admin-photo-tool.spec.ts:164`, `tests/e2e/admin-photo-tool.spec.ts:437` |

## UI Actions

| Action | Trigger | Handler / state | Persistence / side effect | User-visible result |
|---|---|---|---|---|
| Open tool | Route `/admin/photo-tool/:batchId` | `DesktopOnlyToolRoute`, `loadPhotoTool` | API `GET /api/batches/:id/photo-tool` | Loader, then Photo Tool or error |
| Browser non-desktop | Same route without `stonesDesktop` | `DesktopOnlyToolRoute` | No Photo Tool load | HQ download placeholder |
| Back to acceptance | Header link | React Router `Link` | None | `/admin/acceptance` |
| Save | `photo-save` button | `handleSave` | Direct multipart API or desktop workflow | Success/error/banner/status center |
| Save while workflow active | `photo-save` button | `handleSave` early return | Opens Status Center | Button text `В фоне` |
| Add photos | `Добавить фото` button / hidden file input | `handleAddFiles` | Local `File`, object URLs, draft storage later | New photos assigned, step becomes `assign` |
| Reject RAW/unsupported | File input | `handleAddFiles` extension checks | None | Error message |
| HEIC browser convert | File input | `convertHeicFileToJpeg` | Local converted `File` if possible | Status message; server fallback if failed |
| Sort by name/date | Sidebar toggles | `applyFullReassignment` | Local state + draft | Photos reordered and reassigned |
| Reverse list/assignment | Sidebar toggles | `applyFullReassignment` | Local state + draft | List/order assignment changes |
| Collapse controls | Chevron button | `setSidebarControlsOpen` | Local state only | Compact/full sidebar |
| Select photo | Filmstrip item / carousel card | `activatePhoto` | Commits active pending assignment first | Active carousel changes |
| Remove photo | Trash button | `handleRemovePhoto` | Revokes local object URL, local state + draft | Photo disappears |
| Change item number | Assignment input | `handleAssignmentInputChange` | Staged `assignmentDraft` | Input changes; list not committed until Enter/activation |
| Commit assignment | Enter / input flow | `handleAssignmentCommit` | Local state + draft | Unique assignment applied; conflicting photo unassigned |
| Clear assignment | Delete hotkey / export clear | `handleAssignmentDelete` / `commitAssignmentChange` | Local state + draft | Photo becomes unassigned |
| Step tabs | `Качество`, `Назначение`, `Экспорт` | `setActiveStep` | Local state only | Panel switches |
| Quality presets | Light/Standard/Max | `applyPhotoExportSettings` | Local state + draft; direct save sends to API | Settings values update |
| Numeric quality fields | number inputs | `PhotoNumberField` -> `applyPhotoExportSettings` | Local state + draft | Clamped values update |
| Export tile click | Photo tile | `onActivatePhoto` | Local state only | Switches to assign step |
| Export replace | `Заменить` | `openItemFilePicker` -> `handleReplaceItemPhoto` | Local file state + draft | Item gets new local photo |
| Export reupload | `Заново` | If local: message; if persisted: file picker | Local state + draft when picked | Reupload message or replace flow |
| Export clear | `Снять` | `commitAssignmentChange` | Local state + draft | Assignment removed |
| Workflow banner | `Открыть Status Center` | `openDesktopStatusCenter` | Window event | Status Center opens to workflow |
| Conflict reload | `Обновить Photo Tool` | `window.location.reload()` | Full reload | Draft restore attempted |

## Hotkeys

| Hotkey | Handler | Conditions | Effect | Evidence |
|---|---|---|---|---|
| ArrowLeft | `handleHotkey` | Active photo, no meta/ctrl/alt, previous photo exists | Activate previous photo | `src/admin/pages/PhotoTool.tsx:1661` |
| ArrowRight | `handleHotkey` | Active photo, no meta/ctrl/alt, next photo exists | Activate next photo | `src/admin/pages/PhotoTool.tsx:1667` |
| Enter | `handleHotkey` | Active photo has assignment draft | Commit assignment | `src/admin/pages/PhotoTool.tsx:1673` |
| Delete | `handleHotkey` | Active photo | Clear assignment | `src/admin/pages/PhotoTool.tsx:1679` |
| Digits `0..9` | `handleHotkey` | Not in assignment input | Append assignment draft digits | `src/admin/pages/PhotoTool.tsx:1685` |
| Backspace | `handleHotkey` | Not in assignment input and draft exists | Remove last staged digit | `src/admin/pages/PhotoTool.tsx:1692` |

## Lifecycle / Async Actions

| Flow | Trigger | Chain | Evidence |
|---|---|---|---|
| Initial load | `batchId` change | `loadPhotoTool` -> API -> optional `restoreDraftState` -> state baseline | `src/admin/pages/PhotoTool.tsx:848`, `src/admin/pages/PhotoTool.tsx:916` |
| Desktop workflow subscribe | Desktop runtime | `getMediaWorkflowSnapshot` + `subscribeMediaWorkflows` | `src/admin/pages/PhotoTool.tsx:920` |
| Workflow completed reload | Workflow phase `completed` | clear draft -> reload payload without draft | `src/admin/pages/PhotoTool.tsx:946` |
| Size estimate | active photo/settings change | browser canvas JPEG estimate | `src/admin/pages/PhotoTool.tsx:1000` |
| Draft metadata save | unsaved changes | 250ms localStorage save | `src/admin/pages/PhotoTool.tsx:1581` |
| Draft file save | local file signature change | IndexedDB sync | `src/admin/pages/PhotoTool.tsx:1612` |
| Before unload warning | unsaved changes | `beforeunload` listener | `src/admin/pages/PhotoTool.tsx:1626` |

## Backend / Worker Flow

| Flow | Chain | Evidence |
|---|---|---|
| Direct save | UI builds manifest/files/settings -> `authFetch` multipart -> route normalizes -> service applies | `src/admin/pages/PhotoTool.tsx:1507`, `server/routes/batches/photoToolRoutes.ts:140`, `server/routes/batches/photoToolService.ts:297` |
| Desktop save | UI stages files -> starts workflow -> workflow converts HEIC -> builds multipart -> API apply -> verifies response -> cleanup | `src/admin/pages/PhotoTool.tsx:1466`, `electron/hq/mediaWorkflowManager.cjs:485`, `electron/hq/mediaWorkflowManager.cjs:570` |
| Legacy queue apply | IPC enqueue -> queue uploads multipart -> API apply | `electron/hq/mediaQueue.cjs:315`, `electron/hq/mediaQueue.cjs:549` |
| API state token | Payload token compared to current token before item updates | `server/routes/batches/photoToolService.ts:307`, `server/routes/batches/photoToolService.ts:311` |
| Item update | Each manifest entry updates `Item.item_photo_url` | `server/routes/batches/photoToolService.ts:412` |
| Notifications | Media snapshot before/after queues Telegram side effects | `server/routes/batches/photoToolService.ts:304`, `server/routes/batches/photoToolService.ts:423` |
