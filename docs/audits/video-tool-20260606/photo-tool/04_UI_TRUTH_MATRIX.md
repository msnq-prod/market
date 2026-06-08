# Photo Tool UI Truth Matrix

| UI element | UI says | Based on | Real source of truth | Match? | Evidence |
|---|---|---|---|---|---|
| Browser route placeholder | Open in desktop HQ | `isStonesDesktop()` | `window.stonesDesktop?.isDesktop` | Yes | `src/App.tsx:616` |
| Header `Draft` pill | Unsaved changes exist | `hasUnsavedChanges` signature | React state vs baseline | Yes | `src/admin/pages/PhotoTool.tsx:985`, `src/admin/pages/PhotoTool.tsx:1740` |
| `Назначено` pill | Assigned/total | `assignedCount` capped by item count | Missing item seq coverage controls save | Mostly | `src/admin/pages/PhotoTool.tsx:967`, `src/admin/pages/PhotoTool.tsx:1746` |
| `Без номера` pill | Unassigned photos | photos without `assigned_item_seq` | UI working photos | Yes | `src/admin/pages/PhotoTool.tsx:1747` |
| `Лишние` pill | Extra photo count | photos minus items | UI working photos | Yes | `src/admin/pages/PhotoTool.tsx:976` |
| Save disabled | Cannot save incomplete/importing/saving | `canSave`, `saving`, `isImportingPhotos` | Backend requires full manifest | Yes for direct save | `src/admin/pages/PhotoTool.tsx:1763`, `server/routes/batches/photoToolService.ts:206` |
| Save button `В фоне` | Workflow active | current batch active workflow | Electron workflow snapshot | Yes | `src/admin/pages/PhotoTool.tsx:800`, `src/admin/pages/PhotoTool.tsx:1770` |
| Add button disabled in workflow | Cannot add while background save active | `activePhotoWorkflow` | workflow snapshot | Yes | `src/admin/pages/PhotoTool.tsx:1830` |
| Sort/assignment/delete during workflow | Looks editable | no `disabled` guard | Active workflow will reload/clear draft on completion | No | `src/admin/pages/PhotoTool.tsx:1849`, `src/admin/pages/PhotoTool.tsx:2528`, `src/admin/pages/PhotoTool.tsx:946` |
| Quality panel | Settings apply to final photos | `photoExportSettings` | Direct API only; desktop workflow drops settings | No | `src/admin/pages/PhotoTool.tsx:1497`, `electron/hq/mediaWorkflowManager.cjs:570` |
| Size estimate | Approximate output size | active local photo canvas | Browser-only estimate | Yes, approximate | `src/admin/pages/PhotoTool.tsx:1000` |
| Export `Новое фото` | Local photo will upload | `photo.source === local` | Direct/desktop manifest upload entries | Yes | `src/admin/pages/PhotoTool.tsx:2251` |
| Export `Сохраненное фото` | Existing URL reused | `photo.source === persisted` | Manifest `existing_url` | Yes | `src/admin/pages/PhotoTool.tsx:1427` |
| Export `Заново` | Reupload | local source only shows reupload message; persisted opens replace picker | Working photo source | Partial | `src/admin/pages/PhotoTool.tsx:1958` |
| Workflow banner | Background save is running | active workflow | Electron workflow snapshot | Yes | `src/admin/pages/PhotoTool.tsx:1775` |
| Status Center `Media workflows` | Photo Tool continues after close/restart | workflow diagnostics | `MediaWorkflowManager` persisted state | Yes | `src/admin/components/DesktopStatusCenter.tsx:1064`, `electron/hq/mediaWorkflowManager.cjs:204` |
| Status Center `Media uploads` | Photo Tool uploads through local queue | queue diagnostics | Current Photo Tool uses workflow; queue only stages files/legacy jobs | Partial/stale wording | `src/admin/components/DesktopStatusCenter.tsx:1071`, `src/admin/pages/PhotoTool.tsx:1490` |
| Conflict error | Local draft saved; refresh and retry | `PHOTO_TOOL_STATE_STALE` catch | reload deletes token-mismatched draft | No | `src/admin/pages/PhotoTool.tsx:1571`, `src/admin/pages/PhotoTool.tsx:693` |
| Hotkey hint | Arrows, digits, Enter, Delete | static text | implemented hotkeys | Yes | `src/admin/pages/PhotoTool.tsx:2034`, `src/admin/pages/PhotoTool.tsx:1642` |
| Workflow row progress | Per-workflow progress bar | `workflow.progress.completed/total` | Manager reports 0 until completed | Partial | `src/admin/components/DesktopStatusCenter.tsx:431`, `electron/hq/mediaWorkflowManager.cjs:148` |
