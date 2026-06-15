# UI Truth Matrix

## Global

| UI Element | File | Expected Truth | Actual Truth / Gap |
| --- | --- | --- | --- |
| Desktop-only gate | `src/App.tsx:618` | Tool opens in HQ Desktop, dev mock allowed. | Matches. |
| Admin fullscreen ACL | `src/admin/components/AdminFullscreenRoute.tsx:5` | HQ staff only. | UI blocks sales-only users, backend allows `SALES_MANAGER`. |
| Error banner close | `VideoToolV3Controller.tsx:442` | Hide local error. | Matches local UI only. |
| Tabs `Подготовка/Монтаж/Экспорт` | `VideoToolV3Controller.tsx:408` | Switch between views. | Matches. No guard against switching during pending action. |

## Prepare View

| UI Element | File | Expected Truth | Actual Truth / Gap |
| --- | --- | --- | --- |
| `Папка проекта` | `PrepareView.tsx:78` | Opens local project folder. | Matches Electron `showProjectFolder`. |
| Quality preset buttons | `PrepareView.tsx:98` | Change render quality and invalidate prepared/export artifacts. | Code resets prepared sources and marks active run stale. |
| `Добавить видео` | `PrepareView.tsx:140` | Opens file picker and imports videos. | Disabled by global `actionLoading`, including unrelated actions. |
| Source row select | `SourceList.tsx:71` | Select source for editor context. | Matches local UI state. |
| Source retry | `SourceList.tsx:102` | Requeue failed/missing prepare. | Backend-local only. Disabled unless source failed/missing. |
| Source replace | `SourceList.tsx:113` | Replace source and invalidate stale artifacts. | Runtime cancels prepare jobs and marks run stale. Preview cache remains keyed by same source ID. |
| Source delete | `SourceList.tsx:124` | Delete source and dependent segments. | Runtime soft-deletes source/segments and marks run stale. |
| Prepare blockers | `PrepareView.tsx:60` | Tell if export can start. | Less strict than export/timeline validation. It does not fully mirror segment count/min-duration rules. |

## Editor View

| UI Element / Hotkey | File | Expected Truth | Actual Truth / Gap |
| --- | --- | --- | --- |
| Preview source | `EditorView.tsx:125` | Load prepared source preview. | Cache key is only `sourceId`; replacement/reprepare can show stale preview. |
| Play/pause button | `PreviewPanel.tsx:153` | Toggle preview playback. | Calls handler even without active preview source. Low risk. |
| Previous/next cut buttons | `PreviewPanel.tsx:153` | Jump to adjacent cut. | Matches timeline model. |
| Frame step buttons | `PreviewPanel.tsx:153` | Move one frame. | Matches. |
| `По размеру` button | `PreviewPanel.tsx:171` | Fit preview/timeline according to label. | No handler. Dead control. |
| Maximize icon | `PreviewPanel.tsx:176` | Maximize preview. | No handler. Dead control. |
| Camera icon | `PreviewPanel.tsx:177` | Snapshot/capture. | No handler. Dead control. |
| Segment click | `TimelineTrack.tsx:60` | Select segment. | Matches. |
| Trim handles | `EditorTimeline.tsx:91` | Adjust segment boundary. | Saves on every pointer move; stale snapshot race. |
| `Space` | `EditorView.tsx:296` | Play/pause. | Matches. |
| `C` | `EditorView.tsx:300` | Cut. | Matches if cut validation passes. |
| `Delete` / `Backspace` | `EditorView.tsx:302` | Delete/restore selected segment. | Matches. |
| `Z` | `EditorView.tsx:305` | Undo. | Works without Ctrl/Cmd. Help does not say this explicitly. |
| `,` / `.` | `EditorView.tsx:309` | Frame step. | Works, but help popup omits these hotkeys. |
| `ArrowLeft` / `ArrowRight` | `EditorView.tsx:317` | Previous/next cut. | Matches. |
| `+` / `=` / `-` | `EditorView.tsx:323` | Zoom. | Matches. |
| `F` | `EditorView.tsx:331` | Fit timeline. | Matches. |
| `?` help button | `SegmentStrip.tsx:31` | Show full hotkey truth. | Incomplete. Missing frame-step keys. |

## Export View

| UI Element | File | Expected Truth | Actual Truth / Gap |
| --- | --- | --- | --- |
| `Папка проекта` | `ExportView.tsx:165` | Opens local project folder. | Matches. |
| `Начать export` | `ExportView.tsx:174` | Starts render/upload only when safe. | Uses local snapshot. Stale server item video/status can cause late backend rejection after rendering. |
| Replace confirmation modal | `VideoToolV3Controller.tsx:496` | Warn before overwriting existing videos. | Uses stale local `existing_video_url`. Newly uploaded videos are not reflected in project items. |
| Cancel replace modal | `VideoToolV3Controller.tsx:523` | Close modal. | Matches. |
| Confirm replace modal | `VideoToolV3Controller.tsx:529` | Start export with `replaceExisting=true`. | Backend honors flag only at run creation. |
| Cancel run | `ExportView.tsx:268` | Stop active local/server run. | Local and server cancel both attempted when server run exists. |
| Bulk retry failed render | `ExportView.tsx:303` | Retry all render failures. | Loops over current snapshot. Later changes during loop are not re-read. |
| Bulk retry failed upload | `ExportView.tsx:313` | Retry all upload failures. | Loops over current snapshot. Offline/auth paused uploads are disabled through UI state. |
| Bulk cancel pending | `ExportView.tsx:323` | Cancel remaining non-terminal items. | Loops over current snapshot. |
| `Проверить клон` | `ExportItemTile.tsx:130` | Open public clone for item. | Always enabled if clone URL exists, even before current export upload. |
| Per-item local folder | `ExportItemTile.tsx:167` | Reveal rendered local output. | Matches if local output exists. |
| Per-item server link | `ExportItemTile.tsx:180` | Show uploaded server file URL. | Matches local export item only. |
| Retry render | `ExportItemTile.tsx:191` | Retry render failure. | Matches. |
| Retry upload | `ExportItemTile.tsx:203` | Retry upload failure/pause. | Disabled for offline/auth conditions until runtime state changes. |
| Cancel item | `ExportItemTile.tsx:217` | Cancel pending item. | Matches local rules. |
| Auth sync | `VideoToolV3Controller.tsx:326` | Push current web token into desktop runtime. | Manual button path exists. |

