# Video Tool V3 UI Truth Matrix

## Global

| UI | Truth Source | Code | Notes |
| --- | --- | --- | --- |
| Desktop-only warning | Electron bridge/dev env | `src/App.tsx:611` | Browser mock only in dev with env flag. |
| Loader | `loading` | `VideoToolV3Controller.tsx:416` | Initial load only. |
| Error banner | `error` | `VideoToolV3Controller.tsx:423` | Last action/error wins. |
| Header stats | Local snapshot counts | `VideoToolV3Controller.tsx:446` | Local, not live backend. |
| Tabs | `uiState.activeTab` | `VideoToolV3Controller.tsx:408` | Local UI state. |
| Batch warning | `snapshot.project.batch_status` | `VideoToolV3Controller.tsx:466` | Can be stale. |

## Prepare

| UI | Truth Source | Code | Notes |
| --- | --- | --- | --- |
| Project folder | Local project | `PrepareView.tsx:78` | Opens filesystem path. |
| Quality buttons | `project.quality_preset` | `PrepareView.tsx:95` | Confirm if prepared sources/run exist. |
| Add video | `actionLoading` | `PrepareView.tsx:140` | Global controller loading. |
| Source status | `source.status` | `SourceList.tsx:4` | `COPYING` label exists but state appears unreachable. |
| Source progress | Job event/status | `SourceList.tsx:39` | Ready forces 100, failed/missing 0. |
| Source retry | Failed/missing source | `SourceList.tsx:69` | Disabled during global action. |
| Source replace/delete | Non-deleted source | `SourceList.tsx:71` | Delete/replace marks active run stale. |
| Blockers | Local batch/source/item checks | `PrepareView.tsx:60` | Based on local snapshot. |

## Editor

| UI | Truth Source | Code | Notes |
| --- | --- | --- | --- |
| Empty/preparing states | Active sources/segments | `EditorView.tsx:343` | Local snapshot. |
| Export blockers | Local project/source/item/segment checks | `EditorView.tsx:40` | No backend refresh. |
| Segment list | Timeline model | `EditorView.tsx:95` | Maps active segment order to item order. |
| Selected segment | `uiState.selectedSegmentId` | `EditorView.tsx:118` | Falls back to first segment. |
| Cut enablement | `canCutAtPlayhead` | `timelineModel.ts:192` | Min segment duration 500 ms. |
| Delete/restore | Segment `deleted` | `EditorView.tsx:220` | Full segment save. |
| Trim handles | Selected non-deleted segment | `TimelineTrack.tsx:95` | Saves every pointer move. |
| Undo | Local undo stack | `EditorView.tsx:82` | Full segment-array snapshots. |
| Hotkey help | Static popover | `SegmentStrip.tsx:35` | Missing frame-step keys. |
| Preview URL | Prepared source file | `EditorView.tsx:125` | Local preview protocol. |
| Preview sync | HTML video element | `PreviewPanel.tsx:35` | Source-local/global time mapping. |
| Preview bottom row | Static buttons/icons | `PreviewPanel.tsx:159` | Dead controls. |

## Export

| UI | Truth Source | Code | Notes |
| --- | --- | --- | --- |
| Start export | Local blockers + `actionLoading` | `ExportView.tsx:174` | Double-click race possible. |
| Existing-video modal | Local `existing_video_url` | `VideoToolV3Controller.tsx:231` | Can be stale. |
| Run status | Local `export_runs.status` | `ExportView.tsx` | Local/server vocabularies differ. |
| Retry all renders/uploads | Local item statuses | `VideoToolV3Controller.tsx:344`, `VideoToolV3Controller.tsx:371` | Sequential item calls. |
| Cancel pending | Local item statuses | `VideoToolV3Controller.tsx:395` | Sequential item cancel. |
| Open clone | Local clone URL/serial | `VideoToolV3Controller.tsx:299` | Shell open. |

## Events

| Event | Source | Code | Notes |
| --- | --- | --- | --- |
| `snapshot-updated` | Electron runtime | `VideoToolV3Controller.tsx:95` | Replaces full snapshot. |
| `job-progress` | Workers/queue | `VideoToolV3Controller.tsx:100` | Source progress separate from snapshot. |
| `network-changed` | Network service | `VideoToolV3Controller.tsx:105` | Merges runtime network state. |
| `runtime-error` | Runtime/queue | `VideoToolV3Controller.tsx:114` | Global error banner. |

## Main UI/Truth Gaps

- Local snapshot can be stale vs backend batch/items/videos.
- Editor mutating actions are not serialized.
- Trim drag persists too frequently.
- Preview panel shows controls with no behavior.
- Hotkey popover is incomplete.
- Start export can duplicate work on rapid activation.
