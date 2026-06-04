import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VideoToolV3Api, VideoToolV3IpcError, VideoToolV3Segment, VideoToolV3Snapshot, VideoToolV3UiState } from '../types';
import {
    buildSegmentDisplayMeta,
    canCutAtPlayhead,
    clampViewport,
    followPlayheadViewport,
    getOrderedSegments,
    getPlayhead,
    getSegmentDuration,
    getSourceOffsets,
    getTotalTimelineDuration,
    globalToSegment,
    MIN_SEGMENT_DURATION_MS,
    segmentLocalToGlobal,
    splitSegmentsAtPlayhead,
    type TimelineViewport
} from '../timelineModel';
import { EditorTimeline } from './EditorTimeline';
import { PreviewPanel } from './PreviewPanel';
import { SegmentStrip } from './SegmentStrip';

const FRAME_MS = 1_000 / 24;

const getApi = (): VideoToolV3Api | null => window.stones?.videoToolV3 ?? window.stonesDesktop?.videoToolV3 ?? null;

const createSegmentId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `segment-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
};

const normalizePositions = (segments: VideoToolV3Segment[]) =>
    getOrderedSegments(segments).map((segment, index) => ({ ...segment, position: index }));

const isIpcError = (value: { previewUrl: string } | VideoToolV3IpcError): value is VideoToolV3IpcError =>
    'error' in value && typeof value.error === 'string';

const getExportBlockers = (snapshot: VideoToolV3Snapshot) => {
    const project = snapshot.project;
    const activeSegments = snapshot.segments.filter((segment) => !segment.deleted);
    const tailCount = Math.max(0, activeSegments.length - 1);
    const expectedItems = project?.expected_output_count ?? snapshot.items.length;
    const blockers = [];

    if (activeSegments.length === 0) {
        blockers.push('Нет intro segment.');
    }
    if (tailCount !== expectedItems) {
        blockers.push(`Товарных segment: ${tailCount}, ожидается: ${expectedItems}.`);
    }
    if (snapshot.sources.some((source) => source.status !== 'READY')) {
        blockers.push('Есть source не READY.');
    }
    if (!project || project.batch_status !== 'RECEIVED') {
        blockers.push('Партия должна быть RECEIVED.');
    }
    if (snapshot.items.some((item) => !item.serial_number)) {
        blockers.push('Есть item без serial_number.');
    }
    if (snapshot.segments.some((segment) => getSegmentDuration(segment) < MIN_SEGMENT_DURATION_MS)) {
        blockers.push('Есть segment короче 500 ms.');
    }

    return blockers;
};

type EditorViewProps = {
    snapshot: VideoToolV3Snapshot;
    uiState: VideoToolV3UiState;
    onSaveSegments(segments: VideoToolV3Segment[]): Promise<boolean>;
    onUiStateChange(patch: Partial<VideoToolV3UiState>): void;
};

export function EditorView({
    snapshot,
    uiState,
    onSaveSegments,
    onUiStateChange
}: EditorViewProps) {
    const totalTimelineDuration = Math.max(1, getTotalTimelineDuration(snapshot.sources));
    const [undoStack, setUndoStack] = useState<VideoToolV3Segment[][]>([]);
    const [viewportState, setViewportState] = useState<TimelineViewport>(() => clampViewport({
        startMs: 0,
        durationMs: totalTimelineDuration
    }, totalTimelineDuration));
    const [previewUrlBySourceId, setPreviewUrlBySourceId] = useState<Record<string, string>>({});
    const [previewLoadError, setPreviewLoadError] = useState<string | null>(null);
    const viewport = useMemo(
        () => clampViewport(viewportState, totalTimelineDuration),
        [totalTimelineDuration, viewportState]
    );

    const orderedSegments = useMemo(() => normalizePositions(snapshot.segments), [snapshot.segments]);
    const playhead = useMemo(
        () => getPlayhead(uiState.playheadMs, orderedSegments, snapshot.sources),
        [orderedSegments, snapshot.sources, uiState.playheadMs]
    );
    const selectedSegmentId = uiState.selectedSegmentId ?? playhead.segmentId ?? orderedSegments[0]?.id ?? null;
    const segmentMeta = useMemo(
        () => buildSegmentDisplayMeta({ ...snapshot, segments: orderedSegments }, selectedSegmentId),
        [orderedSegments, selectedSegmentId, snapshot]
    );
    const exportBlockers = useMemo(() => getExportBlockers({ ...snapshot, segments: orderedSegments }), [orderedSegments, snapshot]);
    const activeDurationMs = orderedSegments
        .filter((segment) => !segment.deleted)
        .reduce((sum, segment) => sum + getSegmentDuration(segment), 0);
    const cutState = canCutAtPlayhead(playhead, orderedSegments, snapshot.sources);
    const selectedSegment = orderedSegments.find((segment) => segment.id === selectedSegmentId) ?? null;
    const activeSegments = orderedSegments.filter((segment) => !segment.deleted);
    const canDelete = Boolean(selectedSegment) && (Boolean(selectedSegment?.deleted) || activeSegments.length > 1);
    const offsets = useMemo(() => getSourceOffsets(snapshot.sources), [snapshot.sources]);
    const sourceGlobalStartMs = playhead.sourceId ? offsets.get(playhead.sourceId) ?? 0 : 0;
    const sourcePreviewUrl = playhead.sourceId ? previewUrlBySourceId[playhead.sourceId] ?? null : null;
    const previewError = previewLoadError ?? (!getApi()?.getSourcePreviewUrl ? 'IPC preview URL недоступен.' : null);

    useEffect(() => {
        const fallbackSegment = globalToSegment(uiState.playheadMs, orderedSegments, snapshot.sources) ?? orderedSegments.find((segment) => !segment.deleted) ?? orderedSegments[0] ?? null;
        if (!uiState.selectedSegmentId && fallbackSegment) {
            onUiStateChange({ selectedSegmentId: fallbackSegment.id });
        }
    }, [onUiStateChange, orderedSegments, snapshot.sources, uiState.playheadMs, uiState.selectedSegmentId]);

    useEffect(() => {
        if (!playhead.sourceId || previewUrlBySourceId[playhead.sourceId]) return;
        const api = getApi();
        if (!api?.getSourcePreviewUrl) {
            return;
        }

        let cancelled = false;
        api.getSourcePreviewUrl(playhead.sourceId)
            .then((result) => {
                if (cancelled) return;
                if (isIpcError(result)) {
                    setPreviewLoadError(result.error);
                    return;
                }
                setPreviewLoadError(null);
                setPreviewUrlBySourceId((current) => ({
                    ...current,
                    [playhead.sourceId as string]: result.previewUrl
                }));
            })
            .catch((error) => {
                if (!cancelled) {
                    setPreviewLoadError(error instanceof Error ? error.message : 'Preview недоступен.');
                }
            });

        return () => {
            cancelled = true;
        };
    }, [playhead.sourceId, previewUrlBySourceId]);

    const saveNext = useCallback(async (segments: VideoToolV3Segment[]) => {
        return onSaveSegments(normalizePositions(segments));
    }, [onSaveSegments]);

    const saveUndoable = useCallback(async (segments: VideoToolV3Segment[]) => {
        const previousSegments = normalizePositions(orderedSegments);
        setUndoStack((current) => [...current.slice(-19), previousSegments]);
        return saveNext(segments);
    }, [orderedSegments, saveNext]);

    const handleUndo = useCallback(() => {
        const previousSegments = undoStack[undoStack.length - 1];
        if (!previousSegments) return;

        setUndoStack((current) => current.slice(0, -1));
        void saveNext(previousSegments);
    }, [saveNext, undoStack]);

    const followPlayhead = useCallback((globalMs: number) => {
        setViewportState((current) => {
            const next = followPlayheadViewport(globalMs, current, totalTimelineDuration);
            return next.startMs === current.startMs && next.durationMs === current.durationMs ? current : next;
        });
    }, [totalTimelineDuration]);

    const handleSeek = useCallback((globalMs: number) => {
        const nextPlayhead = getPlayhead(globalMs, orderedSegments, snapshot.sources);
        followPlayhead(nextPlayhead.globalMs);
        onUiStateChange({
            playheadMs: nextPlayhead.globalMs,
            selectedSegmentId: nextPlayhead.segmentId ?? uiState.selectedSegmentId
        });
    }, [followPlayhead, onUiStateChange, orderedSegments, snapshot.sources, uiState.selectedSegmentId]);

    const handleSelectSegment = useCallback((segmentId: string) => {
        const segment = orderedSegments.find((entry) => entry.id === segmentId);
        if (!segment) return;
        const globalBounds = segmentLocalToGlobal(segment, offsets);
        followPlayhead(globalBounds.startMs);
        onUiStateChange({
            selectedSegmentId: segment.id,
            playheadMs: globalBounds.startMs,
            selectedSourceId: segment.source_id
        });
    }, [followPlayhead, offsets, onUiStateChange, orderedSegments]);

    const handleSelectTimelineSegment = useCallback((segmentId: string) => {
        const segment = orderedSegments.find((entry) => entry.id === segmentId);
        if (!segment) return;
        onUiStateChange({
            selectedSegmentId: segment.id,
            selectedSourceId: segment.source_id
        });
    }, [onUiStateChange, orderedSegments]);

    const handleCut = useCallback(() => {
        if (!cutState.ok) return;
        const rightId = createSegmentId();
        const nextSegments = splitSegmentsAtPlayhead(orderedSegments, playhead, snapshot.sources, () => rightId);
        onUiStateChange({ selectedSegmentId: rightId });
        void saveUndoable(nextSegments);
    }, [cutState.ok, onUiStateChange, orderedSegments, playhead, saveUndoable, snapshot.sources]);

    const handleDeleteRestore = useCallback(() => {
        if (!selectedSegment || !canDelete) return;
        const nextDeleted = !selectedSegment.deleted;
        void saveUndoable(orderedSegments.map((segment) => (
            segment.id === selectedSegment.id ? { ...segment, deleted: nextDeleted } : segment
        )));
    }, [canDelete, orderedSegments, saveUndoable, selectedSegment]);

    const handleMoveBoundary = useCallback((segmentId: string, edge: 'start' | 'end', globalMs: number) => {
        const sourceById = new Map(snapshot.sources.map((source) => [source.id, source]));
        const target = orderedSegments.find((segment) => segment.id === segmentId);
        if (!target || target.deleted) return;
        const sourceOffset = offsets.get(target.source_id) ?? 0;
        const localMs = Math.max(0, Math.round(globalMs - sourceOffset));

        void saveUndoable(orderedSegments.map((segment) => {
            if (segment.id !== segmentId || segment.deleted) return segment;
            if (edge === 'start') {
                return {
                    ...segment,
                    start_ms: Math.max(0, Math.min(localMs, segment.end_ms - MIN_SEGMENT_DURATION_MS))
                };
            }

            const sourceDuration = sourceById.get(segment.source_id)?.duration_ms ?? Number.MAX_SAFE_INTEGER;
            return {
                ...segment,
                end_ms: Math.min(sourceDuration, Math.max(segment.start_ms + MIN_SEGMENT_DURATION_MS, localMs))
            };
        }));
    }, [offsets, orderedSegments, saveUndoable, snapshot.sources]);

    const handleZoom = useCallback((factor: number) => {
        const nextDuration = viewport.durationMs * factor;
        const anchorRatio = (playhead.globalMs - viewport.startMs) / Math.max(1, viewport.durationMs);
        setViewportState(clampViewport({
            startMs: playhead.globalMs - nextDuration * anchorRatio,
            durationMs: nextDuration
        }, totalTimelineDuration));
    }, [playhead.globalMs, totalTimelineDuration, viewport]);

    const handleFit = useCallback(() => {
        setViewportState(clampViewport({ startMs: 0, durationMs: totalTimelineDuration }, totalTimelineDuration));
    }, [totalTimelineDuration]);

    const cutPoints = useMemo(() => {
        const points = new Set<number>([0, totalTimelineDuration]);
        for (const segment of orderedSegments) {
            const bounds = segmentLocalToGlobal(segment, offsets);
            points.add(bounds.startMs);
            points.add(bounds.endMs);
        }
        return [...points].sort((left, right) => left - right);
    }, [offsets, orderedSegments, totalTimelineDuration]);

    const moveToAdjacentCut = useCallback((direction: -1 | 1) => {
        const nextCut = direction < 0
            ? [...cutPoints].reverse().find((point) => point < playhead.globalMs - 1)
            : cutPoints.find((point) => point > playhead.globalMs + 1);
        if (nextCut !== undefined) {
            handleSeek(nextCut);
        }
    }, [cutPoints, handleSeek, playhead.globalMs]);

    const frameStep = useCallback((direction: -1 | 1) => {
        handleSeek(playhead.globalMs + FRAME_MS * direction);
    }, [handleSeek, playhead.globalMs]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

            if (event.code === 'Space') {
                event.preventDefault();
                onUiStateChange({ previewPlaying: !uiState.previewPlaying });
            }
            if (event.code === 'KeyC' || event.key.toLowerCase() === 'c') {
                event.preventDefault();
                handleCut();
            }
            if (event.code === 'Delete' || event.code === 'Backspace' || event.key === 'Delete' || event.key === 'Backspace' || event.key === 'Del') {
                event.preventDefault();
                handleDeleteRestore();
            }
            if (event.code === 'KeyZ' || event.key.toLowerCase() === 'z') {
                event.preventDefault();
                handleUndo();
            }
            if (event.code === 'Comma' || event.key === ',') {
                event.preventDefault();
                frameStep(-1);
            }
            if (event.code === 'Period' || event.key === '.') {
                event.preventDefault();
                frameStep(1);
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveToAdjacentCut(-1);
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveToAdjacentCut(1);
            }
            if (event.code === 'Equal' || event.key === '+' || event.key === '=') {
                event.preventDefault();
                handleZoom(0.72);
            }
            if (event.code === 'Minus' || event.key === '-') {
                event.preventDefault();
                handleZoom(1.28);
            }
            if (event.code === 'KeyF' || event.key.toLowerCase() === 'f') {
                event.preventDefault();
                handleFit();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [frameStep, handleCut, handleDeleteRestore, handleFit, handleUndo, handleZoom, moveToAdjacentCut, onUiStateChange, uiState.previewPlaying]);

    if (snapshot.sources.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-white/10 bg-[#15171b] p-6 text-sm text-gray-400">
                Сначала добавьте видео во вкладке Подготовка.
            </div>
        );
    }

    if (orderedSegments.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-white/10 bg-[#15171b] p-6 text-sm text-gray-400">
                Сегменты появятся после подготовки источника.
            </div>
        );
    }

    return (
        <section data-testid="video-v3-editor-root" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0f141a] shadow-2xl">
            <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
                <div className="flex min-w-0 flex-1 flex-col">
                    <SegmentStrip
                        segments={segmentMeta}
                        totalDurationMs={activeDurationMs}
                        onSelect={handleSelectSegment}
                    />
                    <EditorTimeline
                        snapshot={{ ...snapshot, segments: orderedSegments }}
                        viewport={viewport}
                        playheadMs={playhead.globalMs}
                        selectedSegmentId={selectedSegmentId}
                        onSeek={handleSeek}
                        onScrub={handleSeek}
                        onSelectSegment={handleSelectTimelineSegment}
                        onMoveBoundary={handleMoveBoundary}
                        onViewportChange={(nextViewport) => setViewportState(clampViewport(nextViewport, totalTimelineDuration))}
                    />
                    <div className="flex h-10 shrink-0 flex-wrap items-center gap-4 border-t border-white/10 bg-[#0d1218] px-5 py-2 text-xs text-white/60">
                        <span>Партия: {snapshot.batchId}</span>
                        <span className="h-5 w-px bg-white/12" />
                        <span>Ожидаемых товаров: {snapshot.project?.expected_output_count ?? snapshot.items.length}</span>
                        <span className="h-5 w-px bg-white/12" />
                        <span>Статус партии: <span className="rounded-md bg-emerald-500/18 px-2 py-1 text-emerald-200">{snapshot.project?.batch_status ?? 'нет'}</span></span>
                        <span className="h-5 w-px bg-white/12" />
                        <span className={[
                            'rounded-md px-2 py-1',
                            exportBlockers.length === 0 ? 'bg-emerald-500/18 text-emerald-200' : 'bg-amber-500/14 text-amber-200'
                        ].join(' ')}>
                            {exportBlockers.length === 0 ? 'Готово к экспорту' : `Блокеры: ${exportBlockers.length}`}
                        </span>
                        {exportBlockers.length > 0 ? (
                            <span className="min-w-0 flex-1 truncate text-amber-200">
                                {exportBlockers[0]}{exportBlockers.length > 1 ? ` +${exportBlockers.length - 1}` : ''}
                            </span>
                        ) : null}
                    </div>
                </div>

                <PreviewPanel
                    sourcePreviewUrl={sourcePreviewUrl}
                    sourceLocalMs={playhead.sourceLocalMs}
                    sourceGlobalStartMs={sourceGlobalStartMs}
                    playheadMs={playhead.globalMs}
                    totalDurationMs={totalTimelineDuration}
                    isPlaying={uiState.previewPlaying}
                    error={previewError}
                    onPlayPause={() => onUiStateChange({ previewPlaying: !uiState.previewPlaying })}
                    onSeek={handleSeek}
                    onFrameStep={frameStep}
                    onPreviousCut={() => moveToAdjacentCut(-1)}
                    onNextCut={() => moveToAdjacentCut(1)}
                />
            </div>

            <div className="shrink-0 border-t border-white/10 bg-[#0d1218] px-4 py-2 text-xs text-white/42 xl:hidden">
                Монтаж удобнее в desktop app.
            </div>
        </section>
    );
}
