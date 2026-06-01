import React, { useEffect, useRef } from 'react';
import { Scissors, Trash2, RotateCcw, Plus, Minus, Maximize2, HelpCircle, AlertTriangle, CheckCircle2, Play, Pause } from 'lucide-react';
import type {
    InlineNotice,
    Segment,
    TimelineViewport,
    VideoToolPanViewportState,
    VideoToolPreviewResizeState,
    VideoToolSegmentRow,
    WorkingSource
} from '../types';
import { formatDuration, getSourceTimelineStartMs, isSourceBoundaryBetween } from '../timelineUtils';
import { clamp } from '../engine';

interface EditorWorkspaceProps {
    sources: WorkingSource[];
    activeSourceIndex: number;
    setActiveSourceIndex: (idx: number) => void;
    segments: Segment[];
    selectedSegmentIndex: number;
    setSelectedSegmentIndex: (idx: number) => void;
    playheadMs: number;
    setPlayheadMs: (ms: number) => void;
    durationMs: number;
    timelineViewport: TimelineViewport;
    setTimelineViewport: React.Dispatch<React.SetStateAction<TimelineViewport>>;
    previewPanelWidth: number;
    setPreviewPanelWidth: (w: number) => void;
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    sourceUrl: string | null;
    sourcePreviewUnavailable: boolean;
    setSources: React.Dispatch<React.SetStateAction<WorkingSource[]>>;
    setNotice: React.Dispatch<React.SetStateAction<InlineNotice | null>>;
    handleLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    timelineRef: React.RefObject<HTMLDivElement | null>;
    timelineScrollbarRef: React.RefObject<HTMLDivElement | null>;
    dragPlayheadRef: React.MutableRefObject<boolean>;
    dragBoundaryIndexRef: React.MutableRefObject<number | null>;
    panViewportRef: React.MutableRefObject<VideoToolPanViewportState | null>;
    previewResizeRef: React.MutableRefObject<VideoToolPreviewResizeState | null>;
    segmentRows: VideoToolSegmentRow[];
    syncVideoTime: (timeMs: number) => void;
    pushSegmentsToHistory: (segs: Segment[]) => void;
    handleCut: () => void;
    handleToggleDeleted: () => void;
    handleRestoreAll: () => void;
    handleResetCuts: () => void;
    handleTimelineWheel: (event: WheelEvent, currentTarget: HTMLElement) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    zoomFit: () => void;
    previewOpen: boolean;
    setPreviewOpen: (open: boolean) => void;
    showHelp: boolean;
    setShowHelp: (show: boolean) => void;
    onVideoError?: () => void;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
    sources,
    activeSourceIndex,
    setActiveSourceIndex: _setActiveSourceIndex,
    segments,
    selectedSegmentIndex,
    setSelectedSegmentIndex,
    playheadMs,
    setPlayheadMs,
    durationMs,
    timelineViewport,
    setTimelineViewport,
    previewPanelWidth,
    setPreviewPanelWidth: _setPreviewPanelWidth,
    isPlaying,
    setIsPlaying,
    sourceUrl,
    sourcePreviewUnavailable,
    setSources: _setSources,
    setNotice: _setNotice,
    handleLoadedMetadata,
    videoRef,
    timelineRef,
    timelineScrollbarRef,
    dragPlayheadRef,
    dragBoundaryIndexRef,
    panViewportRef,
    previewResizeRef,
    segmentRows,
    syncVideoTime,
    pushSegmentsToHistory,
    handleCut,
    handleToggleDeleted,
    handleRestoreAll,
    handleResetCuts,
    handleTimelineWheel,
    zoomIn,
    zoomOut,
    zoomFit,
    previewOpen,
    setPreviewOpen,
    showHelp,
    setShowHelp,
    onVideoError
}) => {
    const timelineRulerRef = useRef<HTMLDivElement | null>(null);

    const activeSource = sources.find((s) => s.sourceIndex === activeSourceIndex);
    const selectedSegmentRow = segmentRows.find((r) => r.index === selectedSegmentIndex);

    const visibleStartMs = timelineViewport.visibleStartMs;
    const visibleDurationMs = timelineViewport.visibleDurationMs;
    const visibleEndMs = visibleStartMs + visibleDurationMs;

    const handleLoadedMetadataInternal = (event: React.SyntheticEvent<HTMLVideoElement>) => {
        handleLoadedMetadata(event);
    };

    useEffect(() => {
        const handleWheel = (event: WheelEvent) => {
            handleTimelineWheel(event, event.currentTarget as HTMLElement);
        };
        const timelineRuler = timelineRulerRef.current;
        const timelineScrollbar = timelineScrollbarRef.current;

        timelineRuler?.addEventListener('wheel', handleWheel, { passive: false });
        timelineScrollbar?.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            timelineRuler?.removeEventListener('wheel', handleWheel);
            timelineScrollbar?.removeEventListener('wheel', handleWheel);
        };
    }, [handleTimelineWheel, segments.length, timelineScrollbarRef]);

    return (
        <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden bg-[#0a0b0d]">
            {/* Top Toolbar */}
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-[#121316] px-4 py-2">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleCut}
                        data-testid="action-cut"
                        disabled={segments.length === 0}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Разрезать клип на плейхеде (C)"
                    >
                        <Scissors size={14} className="text-emerald-400" />
                        <span>Разрезать</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleToggleDeleted}
                        data-testid="action-delete"
                        disabled={segments.length === 0 || selectedSegmentRow?.role === 'intro'}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Исключить/вернуть выбранный клип (Del)"
                    >
                        <Trash2 size={14} className="text-red-400" />
                        <span>{selectedSegmentRow?.isDeleted ? 'Восстановить' : 'Удалить'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleRestoreAll}
                        disabled={segments.length === 0}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-50"
                        title="Восстановить все вырезанные фрагменты"
                    >
                        <RotateCcw size={14} />
                        <span>Восстановить всё</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleResetCuts}
                        disabled={segments.length <= 1}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-50"
                        title="Сбросить все разрезы таймлайна"
                    >
                        <RotateCcw size={14} className="rotate-180" />
                        <span>Сбросить разрезы</span>
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    {/* Zoom actions */}
                    <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg">
                        <button
                            type="button"
                            onClick={zoomOut}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            title="Отдалить ([-])"
                        >
                            <Minus size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={zoomFit}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            title="По размеру окна ([\/])"
                        >
                            <Maximize2 size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={zoomIn}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            title="Приблизить ([+])"
                        >
                            <Plus size={14} />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => setPreviewOpen(!previewOpen)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
                            previewOpen
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                        }`}
                    >
                        <span>Окно просмотра</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowHelp(!showHelp)}
                        className="text-zinc-500 hover:text-zinc-300 transition"
                        title="Горячие клавиши"
                    >
                        <HelpCircle size={18} />
                    </button>
                </div>
            </div>

            {/* Layout Workspace: main timeline + player */}
            <div
                className="flex-1 min-h-0 flex flex-col md:grid"
                style={{
                    gridTemplateColumns: `minmax(0, 1fr) ${previewOpen ? `${previewPanelWidth}px` : '0px'}`
                }}
            >
                {/* Timeline and Segments List */}
                <div className="flex-1 min-h-0 flex flex-col p-4 overflow-y-auto">
                    {segments.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500">
                            <AlertTriangle size={32} className="text-zinc-600 mb-3" />
                            <p className="text-sm font-semibold text-zinc-300">Загрузите видеофайлы на вкладке "Подготовка"</p>
                            <p className="text-xs text-zinc-500 mt-2 max-w-sm">
                                После загрузки здесь появится плеер, таймлайн и товарные сегменты.
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 flex flex-col gap-4">
                            {/* Segment cards row */}
                            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                                <div data-testid="clip-counter" className="mb-3 text-xs font-mono text-zinc-400">
                                    Товарных клипов: {segmentRows.filter((row) => row.role === 'clip' && !row.isDeleted).length} / {Math.max(0, segmentRows.filter((row) => row.role !== 'intro').length)}
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {segmentRows.map((row) => {
                                        const { index, segment, item, isDeleted, isUploaded, role, displaySequence } = row;
                                        const duration = segment.endMs - segment.startMs;
                                        const isTooShort = !isDeleted && role !== 'intro' && duration < 1500;
                                        const isActive = index === selectedSegmentIndex;

                                        return (
                                            <div
                                                key={`seg-${segment.sequence}`}
                                                data-testid={displaySequence ? `clip-card-${displaySequence}` : undefined}
                                                className={`rounded-xl border p-4 transition-all duration-200 cursor-pointer ${
                                                    isActive
                                                        ? 'border-emerald-500/40 bg-emerald-950/10 shadow-lg ring-1 ring-emerald-500/20'
                                                        : isDeleted
                                                            ? 'border-zinc-900 bg-zinc-950/30 opacity-40 hover:opacity-60'
                                                            : isTooShort
                                                                ? 'border-amber-500/30 bg-amber-950/15'
                                                                : 'border-zinc-800 bg-[#16171c]/60 hover:bg-zinc-900/50'
                                                }`}
                                                onClick={() => {
                                                    setSelectedSegmentIndex(index);
                                                    syncVideoTime(segment.startMs);
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] font-semibold text-zinc-400 font-mono">
                                                        #{displaySequence || 'Исключен'}
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        {isUploaded && <CheckCircle2 size={13} className="text-emerald-400" />}
                                                        {isTooShort && <AlertTriangle size={13} className="text-amber-400" />}
                                                        <span className="text-[10px] text-zinc-500 font-mono uppercase bg-zinc-900/80 px-2 py-0.5 rounded-full">
                                                            {role === 'intro' ? 'Интро' : 'Товар'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-2.5">
                                                    <p className="text-xs font-semibold text-zinc-200 truncate">
                                                        {role === 'intro' ? 'Вступительное интро' : item?.serial_number || 'Заглушка'}
                                                    </p>
                                                    <p className="text-[10px] font-mono text-zinc-500 mt-1">
                                                        {formatDuration(segment.startMs)} – {formatDuration(segment.endMs)} · ({Math.round(duration / 100) / 10}с)
                                                    </p>
                                                </div>

                                                {isTooShort && (
                                                    <p className="mt-2 text-[10px] leading-relaxed text-amber-200/90 font-medium">
                                                        Внимание: сегмент слишком короткий (менее 1.5с). Рекомендуется увеличить.
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Timeline ruler & playhead */}
                            <div className="shrink-0 rounded-2xl border border-zinc-800 bg-[#131418] p-3 shadow-inner">
                                <div
                                    ref={timelineRulerRef}
                                    data-testid="timeline-region"
                                    className="relative h-20 w-full select-none overflow-hidden rounded-xl bg-zinc-950/80 border border-zinc-900"
                                    onPointerMove={(event) => {
                                        if (!dragPlayheadRef.current) return;
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
                                        syncVideoTime(visibleStartMs + (ratio * visibleDurationMs));
                                    }}
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        timelineRef.current = event.currentTarget;
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
                                        const targetMs = visibleStartMs + (ratio * visibleDurationMs);
                                        syncVideoTime(targetMs);
                                        dragPlayheadRef.current = true;
                                        event.currentTarget.setPointerCapture?.(event.pointerId);
                                    }}
                                >
                                    {/* Segment blocks in timeline */}
                                    {segmentRows.map((row) => {
                                        const { index, segment, isDeleted, isUploaded, displaySequence } = row;
                                        if (segment.endMs < visibleStartMs || segment.startMs > visibleEndMs) {
                                            return null;
                                        }

                                        const leftPercent = Math.max(0, ((segment.startMs - visibleStartMs) / visibleDurationMs) * 100);
                                        const rightPercent = Math.min(100, ((segment.endMs - visibleStartMs) / visibleDurationMs) * 100);
                                        const widthPercent = Math.max(0.5, rightPercent - leftPercent);

                                        const style: React.CSSProperties = {
                                            left: `${leftPercent}%`,
                                            width: `${widthPercent}%`
                                        };

                                        let bgClasses = 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700/80';
                                        if (index === selectedSegmentIndex) {
                                            bgClasses = 'bg-emerald-500/20 border-emerald-400 hover:bg-emerald-500/30';
                                        } else if (isDeleted) {
                                            bgClasses = 'bg-red-500/5 border-red-500/20 opacity-30';
                                        } else if (isUploaded) {
                                            bgClasses = 'bg-indigo-500/10 border-indigo-500/30';
                                        }

                                        return (
                                            <div
                                                key={`timeline-block-${segment.sequence}`}
                                                className={`absolute bottom-3 top-3 rounded-lg border text-center transition flex flex-col justify-center ${bgClasses}`}
                                                style={style}
                                            >
                                                <span className="text-[10px] font-bold text-zinc-400 truncate px-1">
                                                    {displaySequence || '—'}
                                                </span>
                                            </div>
                                        );
                                    })}

                                    {/* Boundaries drag controls */}
                                    {segments.slice(0, -1).map((segment, index) => {
                                        if (segment.endMs < visibleStartMs || segment.endMs > visibleEndMs) {
                                            return null;
                                        }

                                        const isBoundaryBetween = isSourceBoundaryBetween(segment, segments[index + 1]);
                                        const leftPercent = ((segment.endMs - visibleStartMs) / visibleDurationMs) * 100;

                                        if (isBoundaryBetween) {
                                            return (
                                                <div
                                                    key={`boundary-line-${segment.sequence}`}
                                                    className="pointer-events-none absolute inset-y-2 z-20 w-0.5 -translate-x-1/2 bg-amber-500/60 shadow-lg"
                                                    style={{ left: `${leftPercent}%` }}
                                                />
                                            );
                                        }

                                        return (
                                            <button
                                                key={`boundary-drag-${segment.sequence}`}
                                                type="button"
                                                className="absolute inset-y-2 z-20 w-1.5 -translate-x-1/2 cursor-col-resize bg-zinc-300 hover:bg-emerald-400 rounded-full transition"
                                                style={{ left: `${leftPercent}%` }}
                                                onPointerDown={(event) => {
                                                    event.stopPropagation();
                                                    pushSegmentsToHistory(segments);
                                                    dragBoundaryIndexRef.current = index;
                                                }}
                                                aria-label="Переместить стык"
                                            />
                                        );
                                    })}

                                    {/* Playhead line */}
                                    {durationMs > 0 && playheadMs >= visibleStartMs && playheadMs <= visibleEndMs && (
                                        <>
                                            <button
                                                type="button"
                                                className="absolute top-1.5 z-30 h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-red-500 bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                                                style={{ left: `${((playheadMs - visibleStartMs) / visibleDurationMs) * 100}%` }}
                                                onPointerDown={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    timelineRef.current = timelineRulerRef.current;
                                                    dragPlayheadRef.current = true;
                                                    event.currentTarget.setPointerCapture?.(event.pointerId);
                                                }}
                                                data-testid="timeline-playhead-handle"
                                                aria-label="Переместить плейхед"
                                            />
                                            <div
                                                className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-red-600"
                                                style={{ left: `${((playheadMs - visibleStartMs) / visibleDurationMs) * 100}%` }}
                                            />
                                        </>
                                    )}
                                </div>

                                {/* Timeline scrollbar */}
                                <div className="mt-3 border-t border-zinc-850 pt-2 px-1">
                                    <div
                                        ref={timelineScrollbarRef}
                                        className="relative h-2 w-full rounded-full bg-zinc-950 cursor-pointer"
                                        onClick={(event) => {
                                            if (!durationMs || !visibleDurationMs) return;
                                            const rect = event.currentTarget.getBoundingClientRect();
                                            const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
                                            const centeredStartMs = (ratio * durationMs) - (visibleDurationMs / 2);
                                            const nextStart = Math.max(0, Math.min(centeredStartMs, durationMs - visibleDurationMs));
                                            setTimelineViewport((prev) => ({ ...prev, visibleStartMs: nextStart }));
                                        }}
                                    >
                                        <button
                                            type="button"
                                            data-testid="timeline-scrollbar-thumb"
                                            className="absolute inset-y-0 rounded-full border border-zinc-700 bg-zinc-800 shadow-sm"
                                            style={{
                                                left: `${durationMs ? (visibleStartMs / durationMs) * 100 : 0}%`,
                                                width: `${durationMs ? (visibleDurationMs / durationMs) * 100 : 100}%`
                                            }}
                                            onClick={(event) => event.stopPropagation()}
                                            onPointerDown={(event) => {
                                                event.stopPropagation();
                                                panViewportRef.current = {
                                                    source: 'scrollbar',
                                                    startClientX: event.clientX,
                                                    startVisibleStartMs: visibleStartMs
                                                };
                                                setTimelineViewport((prev) => ({ ...prev, isPanning: true }));
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right side resizing Preview Panel */}
                <div
                    className={`${
                        previewOpen
                            ? 'relative min-h-0 border-l border-zinc-800 bg-[#121316] p-4 flex flex-col'
                            : 'hidden'
                    }`}
                >
                    <button
                        type="button"
                        className="absolute bottom-0 left-0 top-0 z-30 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-emerald-500/20"
                        onPointerDown={(event) => {
                            event.preventDefault();
                            previewResizeRef.current = {
                                startClientX: event.clientX,
                                startWidth: previewPanelWidth
                            };
                        }}
                    />

                    <div className="relative flex h-full min-h-0 flex-col items-center overflow-hidden rounded-[24px] border border-zinc-850 bg-black">
                        {/* Preview header */}
                        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 text-[10px] uppercase tracking-widest text-zinc-400">
                            <span>Просмотр</span>
                            <span className="font-semibold text-zinc-200">
                                {selectedSegmentRow?.displaySequence || (selectedSegmentRow?.isDeleted ? 'del' : '—')}
                            </span>
                        </div>

                        {/* Timing indicator */}
                        <div className="absolute inset-x-0 top-10 z-10 flex items-center justify-between px-4 text-[10px] font-mono text-zinc-500">
                            <span>{formatDuration(playheadMs)}</span>
                            <span>{durationMs ? formatDuration(durationMs) : '—'}</span>
                        </div>

                        {/* Video player center */}
                        <div className="flex-1 w-full flex items-center justify-center p-4">
                            <div className="relative aspect-[9/16] w-full max-w-[280px] max-h-full overflow-hidden rounded-[20px] border border-zinc-900 bg-black shadow-lg">
                                {sourceUrl && !sourcePreviewUnavailable ? (
                                    <video
                                        key={sourceUrl}
                                        ref={videoRef}
                                        src={sourceUrl}
                                        preload="metadata"
                                        playsInline
                                        className="h-full w-full object-contain"
                                        onLoadedMetadata={handleLoadedMetadataInternal}
                                        onLoadedData={handleLoadedMetadataInternal}
                                        onCanPlay={handleLoadedMetadataInternal}
                                        onPlay={() => setIsPlaying(true)}
                                        onPause={() => setIsPlaying(false)}
                                        onTimeUpdate={(event) => {
                                            const offsetMs = activeSource
                                                ? getSourceTimelineStartMs(sources, activeSource.sourceIndex)
                                                : 0;
                                            setPlayheadMs(offsetMs + Math.round(event.currentTarget.currentTime * 1000));
                                        }}
                                        onError={() => onVideoError?.()}
                                    />
                                ) : (
                                    <div className="flex h-full flex-col items-center justify-center text-center p-4 text-xs text-zinc-600">
                                        <AlertTriangle size={24} className="mb-2" />
                                        <span>{activeSource?.previewError || 'Видео недоступно'}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Player control bar */}
                        <div className="w-full border-t border-zinc-900 bg-zinc-950/60 p-3 flex justify-center">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!videoRef.current) return;
                                    if (isPlaying) {
                                        videoRef.current.pause();
                                    } else {
                                        videoRef.current.play().catch(() => undefined);
                                    }
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-zinc-200 transition hover:border-zinc-600 hover:text-white"
                            >
                                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Help modal */}
            {showHelp && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#16171c] p-6 shadow-2xl">
                        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                            <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Горячие клавиши</h3>
                            <button
                                type="button"
                                onClick={() => setShowHelp(false)}
                                className="text-zinc-400 hover:text-white text-xs font-semibold"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="mt-4 space-y-3.5 text-xs text-zinc-300">
                            <div className="flex justify-between items-center py-1 border-b border-zinc-850">
                                <span className="font-semibold text-zinc-100">Space</span>
                                <span className="text-zinc-500">Воспроизведение / Пауза</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-zinc-850">
                                <span className="font-semibold text-zinc-100">С</span>
                                <span className="text-zinc-500">Разрезать клип</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-zinc-850">
                                <span className="font-semibold text-zinc-100">Delete / Backspace</span>
                                <span className="text-zinc-500">Исключить / вернуть клип</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-zinc-850">
                                <span className="font-semibold text-zinc-100">← / →</span>
                                <span className="text-zinc-500">Назад / вперед на 1 кадр</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-zinc-850">
                                <span className="font-semibold text-zinc-100">Shift + ← / →</span>
                                <span className="text-zinc-500">Назад / вперед на 1 секунду</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-zinc-850">
                                <span className="font-semibold text-zinc-100">Up / Down</span>
                                <span className="text-zinc-500">Предыдущая / следующая склейка</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
