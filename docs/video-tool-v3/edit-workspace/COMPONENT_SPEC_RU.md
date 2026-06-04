# Меню монтажа: компоненты и данные

## 1. Новые/обновляемые файлы

```text
src/admin/pages/video-tool-v3/components/EditorView.tsx
src/admin/pages/video-tool-v3/components/EditToolbar.tsx
src/admin/pages/video-tool-v3/components/SegmentStrip.tsx
src/admin/pages/video-tool-v3/components/SegmentBlock.tsx
src/admin/pages/video-tool-v3/components/EditorTimeline.tsx
src/admin/pages/video-tool-v3/components/TimelineRuler.tsx
src/admin/pages/video-tool-v3/components/TimelineTrack.tsx
src/admin/pages/video-tool-v3/components/Playhead.tsx
src/admin/pages/video-tool-v3/components/PreviewPanel.tsx
src/admin/pages/video-tool-v3/timelineModel.ts
```

## 2. `timelineModel.ts`

Pure frontend helpers. Без React и DOM.

```ts
export type TimelineViewport = {
  startMs: number;
  durationMs: number;
};

export type TimelinePlayhead = {
  globalMs: number;
  sourceId: string | null;
  sourceLocalMs: number;
  segmentId: string | null;
};

export type SegmentDisplayMeta = {
  segmentId: string;
  role: 'INTRO' | 'ITEM' | 'DELETED';
  label: string;
  serialNumber: string | null;
  durationMs: number;
  globalStartMs: number;
  globalEndMs: number;
  sourceId: string;
  sourceLabel: string;
  selected: boolean;
  deleted: boolean;
};
```

Functions:

```ts
getSourceOffsets(sources): Map<string, number>
getTotalTimelineDuration(sources): number
segmentLocalToGlobal(segment, offsets): { startMs: number; endMs: number }
globalToSourceTime(globalMs, sources, offsets): { sourceId: string; localMs: number } | null
globalToSegment(globalMs, segments, sources): VideoToolV3Segment | null
buildSegmentDisplayMeta(snapshot, selectedSegmentId): SegmentDisplayMeta[]
canCutAtPlayhead(playhead, segments, sources): { ok: boolean; reason?: string }
splitSegmentsAtPlayhead(segments, playhead, sources): VideoToolV3Segment[]
clampViewport(viewport, totalDuration): TimelineViewport
```

## 3. `EditorView`

Role: layout orchestrator.

Props:

```ts
type EditorViewProps = {
  snapshot: VideoToolV3Snapshot;
  uiState: VideoToolV3UiState;
  actionLoading: boolean;
  onSaveSegments(segments: VideoToolV3Segment[]): Promise<boolean>;
  onUiStateChange(patch: Partial<VideoToolV3UiState>): void;
};
```

State внутри:

- `viewport`;
- `selectedSegmentId`;
- `playheadMs`;
- `isPlaying`.

Не хранить:

- segments source of truth;
- source status;
- export status.

## 4. `EditToolbar`

Props:

```ts
type EditToolbarProps = {
  canCut: boolean;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  snapping: boolean;
  blockersCount: number;
  onCut(): void;
  onDelete(): void;
  onUndo(): void;
  onRedo(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  onToggleSnapping(): void;
};
```

## 5. `SegmentStrip`

Props:

```ts
type SegmentStripProps = {
  segments: SegmentDisplayMeta[];
  viewport: TimelineViewport;
  totalDurationMs: number;
  onSelect(segmentId: string): void;
};
```

Rules:

- text-only cards;
- no thumbnails;
- selected card has blue outline;
- deleted card is muted.

## 6. `EditorTimeline`

Props:

```ts
type EditorTimelineProps = {
  snapshot: VideoToolV3Snapshot;
  viewport: TimelineViewport;
  playheadMs: number;
  selectedSegmentId: string | null;
  onSeek(globalMs: number): void;
  onScrub(globalMs: number): void;
  onSelectSegment(segmentId: string): void;
  onMoveBoundary(segmentId: string, edge: 'start' | 'end', globalMs: number): void;
};
```

Responsibilities:

- ruler;
- track;
- playhead;
- boundary handles;
- pointer events.

## 7. `PreviewPanel`

Props:

```ts
type PreviewPanelProps = {
  sourcePreviewUrl: string | null;
  sourceLocalMs: number;
  playheadMs: number;
  totalDurationMs: number;
  isPlaying: boolean;
  onPlayPause(): void;
  onSeek(globalMs: number): void;
  onFrameStep(direction: -1 | 1): void;
  onPreviousCut(): void;
  onNextCut(): void;
};
```

Behavior:

- set `video.currentTime` on sourceLocalMs changes;
- throttle seeks while scrubbing;
- preserve last frame while source switches.

## 8. IPC addition

Add:

```ts
videoV3:getSourcePreviewUrl(sourceId: string)
```

Response:

```ts
type SourcePreviewUrlResponse = {
  previewUrl: string;
};
```

Main rules:

- source must belong to current project;
- source status must be `READY`;
- prepared file must exist;
- return custom protocol URL, not raw path.

