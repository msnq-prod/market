import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RefreshCw, Clipboard, AlertTriangle } from 'lucide-react';
import {
    getStonesDesktop,
    isStonesDesktop,
    stageDesktopVideoSourceFile
} from '../../../utils/desktop';
import {
    DESKTOP_VIDEO_HELPER_URL,
    PREVIEW_PANEL_MAX_WIDTH,
    PREVIEW_PANEL_MIN_WIDTH,
    PREVIEW_PANEL_WIDTH_STORAGE_KEY,
    TIMELINE_ZOOM_STEP,
    VIDEO_EXPORT_HELPER_PROTOCOL_VERSION
} from './constants';
import { draftKeyFor, parseDraft } from './draftStorage';
import {
    SOURCE_DURATION_TOLERANCE_MS,
    createLocalRunId,
    createLocalVideoExportRunDetails,
    createRestoredLocalVideoExportRunDetails,
    normalizeDesktopDraft
} from './localRun';
import {
    buildRenderManifest,
    createSourceFromFingerprint,
    appendInitialSourceSegment,
    areSegmentsEqual,
    cloneSegments,
    createFirstSourceSegments,
    deleteSegmentAt,
    getSourceForGlobalMs,
    getTotalSourceDurationMs,
    isSourceBoundaryBetween,
    moveBoundary,
    normalizeSegments,
    padSequence,
    splitSegmentAt,
    toggleSegmentDeletedAt,
    clamp
} from './engine/index.ts';
import { runPreflight, type PreflightIssue } from './engine/preflight';
import {
    buildHelperIssueMessage,
    revokeObjectUrl
} from './videoHelperClient';
import { useVideoToolHotkeys } from './useVideoToolHotkeys';
import {
    cancelVideoExportRun as cancelServerVideoExportRun,
    fetchVideoExportRuns,
    fetchVideoToolPayload,
    fetchVideoUploadStatus,
    runVideoExportServerHealthcheck
} from './videoExportClient';
import { useVideoExportRunState } from './useVideoExportRunState';
import {
    clampVisibleDuration,
    clampVisibleStart,
    readStoredPreviewPanelWidth
} from './timelineUtils';
import { videoToolReducer } from './videoToolReducer';
import { VideoToolTopNav } from './components/VideoToolTopNav';
import { PrepareMenu } from './components/PrepareMenu';
import { EditorWorkspace } from './components/EditorWorkspace';
import { ExportMenu } from './components/ExportMenu';
import type {
    DesktopVideoExportSource,
    ExportPhase,
    HelperDiagnosticEntry,
    HelperHealthPayload,
    HelperSourceUploadPayload,
    HelperStatus,
    InlineNotice,
    Segment,
    SourceFingerprint,
    SourceRole,
    TimelineViewport,
    VideoExportManifest,
    VideoExportRunDetails,
    VideoExportSettings,
    VideoToolPanViewportState,
    VideoToolPreviewResizeState,
    VideoToolSegmentRow,
    VideoToolDraft,
    VideoUploadStatusItem,
    VideoToolPayload,
    VideoToolState,
    WorkingSource
} from './types';

type PlayheadDragSession = {
    pointerId: number;
    timelineRect: {
        left: number;
        width: number;
    };
    visibleStartMs: number;
    visibleDurationMs: number;
};

type PendingPreviewSeek = {
    sourceIndex: number;
    localMs: number;
};

const createInitialVideoToolState = (): VideoToolState => ({
    data: { payload: null, loading: true, error: '' },
    sources: { items: [], activeSourceIndex: 0, introHelperSourceId: '' },
    timeline: {
        segments: [],
        selectedSegmentIndex: 0,
        playheadMs: 0,
        viewport: { zoom: 1, visibleStartMs: 0, visibleDurationMs: 0, isPanning: false },
        isPlaying: false
    },
    helper: {
        status: 'checking',
        health: null,
        issueMessage: '',
        baseUrl: DESKTOP_VIDEO_HELPER_URL,
        diagnostics: [],
        accessRequesting: false,
        diagnosticCopied: false
    },
    export: { pendingSerials: [], renderJobId: '', phase: 'idle', message: '', notice: null },
    layout: { previewPanelWidth: readStoredPreviewPanelWidth() },
    workflow: { snapshot: null }
});

const mergeVideoUploadsIntoToolPayload = (
    payload: VideoToolPayload,
    uploads: VideoUploadStatusItem[]
): VideoToolPayload => {
    const uploadsByItemId = new Map(uploads.map((item) => [item.item_id, item]));
    return {
        ...payload,
        items: payload.items.map((item) => ({
            ...item,
            item_video_url: uploadsByItemId.get(item.id)?.item_video_url ?? item.item_video_url
        }))
    };
};

export function VideoToolController() {
    const navigate = useNavigate();
    const params = useParams<{ batchId: string }>();
    const batchId = params.batchId || '';
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const timelineScrollbarRef = useRef<HTMLDivElement | null>(null);
    const dragBoundaryIndexRef = useRef<number | null>(null);
    const dragPlayheadRef = useRef<PlayheadDragSession | null>(null);
    const pendingPreviewSeekRef = useRef<PendingPreviewSeek | null>(null);
    const panViewportRef = useRef<VideoToolPanViewportState | null>(null);
    const previewResizeRef = useRef<VideoToolPreviewResizeState | null>(null);
    const suppressTimelineAutoScrollUntilRef = useRef(0);
    const segmentHistoryRef = useRef<Segment[][]>([]);
    const sourceObjectUrlsRef = useRef<Set<string>>(new Set());

    const [controllerState, dispatchVideoTool] = useReducer(videoToolReducer, undefined, createInitialVideoToolState);
    const [data, setData] = useState<VideoToolPayload | null>(null);
    const [isImportingSource, setIsImportingSource] = useState(false);
    const [videoUploads, setVideoUploads] = useState<VideoUploadStatusItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const helperStatus = controllerState.helper.status;
    const setHelperStatus = useCallback((status: HelperStatus, issueMessage?: string) => {
        dispatchVideoTool({ type: 'helper/status', status, issueMessage });
    }, []);
    const [helperHealth, setHelperHealth] = useState<HelperHealthPayload | null>(null);
    const helperIssueMessage = controllerState.helper.issueMessage;
    const setHelperIssueMessage = useCallback((issueMessage: string) => {
        dispatchVideoTool({ type: 'helper/status', status: controllerState.helper.status, issueMessage });
    }, [controllerState.helper.status]);
    const [helperDiagnostics, setHelperDiagnostics] = useState<HelperDiagnosticEntry[]>([]);
    const [sources, setSources] = useState<WorkingSource[]>([]);
    const [activeSourceIndex, setActiveSourceIndex] = useState(0);
    const [introHelperSourceId, setIntroHelperSourceId] = useState('');
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
    const [playheadMs, setPlayheadMs] = useState(0);
    const [draft, setDraft] = useState<VideoToolDraft | null>(null);
    const [activeMode, setActiveMode] = useState<'prepare' | 'edit' | 'export'>('prepare');
    const [serverAssetOrigin, setServerAssetOrigin] = useState('');
    const [isStartingRun, setIsStartingRun] = useState(false);
    const [pendingSerials, setPendingSerials] = useState<string[]>([]);
    const exportPhase = controllerState.export.phase;
    const setExportPhase = useCallback((phase: ExportPhase) => {
        dispatchVideoTool({ type: 'export/phase', phase });
    }, []);
    const [exportMessage, setExportMessage] = useState('');
    const [notice, setNotice] = useState<InlineNotice | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [preflightIssues, setPreflightIssues] = useState<PreflightIssue[]>([]);
    const [showHotkeyHelp, setShowHotkeyHelp] = useState(false);
    const [showOverwriteModal, setShowOverwriteModal] = useState(false);
    const [exportResolution, setExportResolution] = useState<'1080p' | '720p'>('1080p');
    const [exportQuality, setExportQuality] = useState<'high' | 'medium' | 'low'>('high');
    const [exportFps, setExportFps] = useState<30 | 60>(30);
    const [exportAudioNormalize, setExportAudioNormalize] = useState(true);
    const isDesktopApp = isStonesDesktop();
    const applyLoadedExportSettings = useCallback((settings?: VideoExportSettings | null) => {
        if (!settings) {
            return;
        }

        if (settings.resolution) setExportResolution(settings.resolution);
        if (settings.quality) setExportQuality(settings.quality);
        if (settings.fps) setExportFps(settings.fps);
        if (settings.audio_normalize !== undefined) setExportAudioNormalize(settings.audio_normalize);
    }, []);
    const {
        activeV2Run,
        setActiveV2Run,
        localRunSnapshot,
        setLocalRunSnapshot,
        refreshLocalRunSnapshot,
        refreshActiveV2Run,
        isRefreshingRun
    } = useVideoExportRunState(batchId, isDesktopApp, applyLoadedExportSettings);
    const previewPanelWidth = controllerState.layout.previewPanelWidth;
    const setPreviewPanelWidth = useCallback((nextWidth: number | ((current: number) => number)) => {
        const resolvedWidth = typeof nextWidth === 'function' ? nextWidth(previewPanelWidth) : nextWidth;
        dispatchVideoTool({ type: 'layout/preview-width', width: resolvedWidth });
    }, [previewPanelWidth]);
    const [previewOpen, setPreviewOpen] = useState(true);
    const [timelineViewport, setTimelineViewport] = useState<TimelineViewport>({
        zoom: 1,
        visibleStartMs: 0,
        visibleDurationMs: 0,
        isPanning: false
    });

    const expectedOutputCount = data?.batch.expected_output_count ?? 0;
    const refreshVideoUploads = useCallback(async (nextBatchId = batchId) => {
        const uploadStatus = await fetchVideoUploadStatus(nextBatchId);
        setVideoUploads(uploadStatus.items);
        setData((current) => current && current.batch.id === nextBatchId
            ? mergeVideoUploadsIntoToolPayload(current, uploadStatus.items)
            : current
        );
        return uploadStatus;
    }, [batchId]);
    const durationMs = getTotalSourceDurationMs(sources);
    const activeSource = sources.find((source) => source.sourceIndex === activeSourceIndex) ?? sources[0] ?? null;
    const sourceUrl = activeSource?.previewUrl ?? '';
    const sourcePreviewUnavailable = Boolean(activeSource?.previewUnavailable);
    const visibleDurationMs = durationMs ? (timelineViewport.visibleDurationMs || durationMs) : 0;
    const visibleStartMs = durationMs ? clampVisibleStart(durationMs, timelineViewport.visibleStartMs, visibleDurationMs || durationMs) : 0;
    const visibleEndMs = visibleStartMs + visibleDurationMs;
    const timelineWheelStateRef = useRef({ durationMs: 0, visibleStartMs: 0, visibleDurationMs: 0 });
    timelineWheelStateRef.current = { durationMs, visibleStartMs, visibleDurationMs };

    const clampPreviewPanelWidth = useCallback((nextWidth: number) => {
        const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
        const leftRailWidth = 224;
        const mainWorkspaceMinWidth = 560;
        const maxWidthByViewport = Math.max(
            PREVIEW_PANEL_MIN_WIDTH,
            viewportWidth - leftRailWidth - mainWorkspaceMinWidth
        );

        return clamp(
            Math.round(nextWidth),
            PREVIEW_PANEL_MIN_WIDTH,
            Math.min(PREVIEW_PANEL_MAX_WIDTH, maxWidthByViewport)
        );
    }, []);
    const activeSegments = useMemo(
        () => segments.filter((segment) => !segment.deleted),
        [segments]
    );
    const activeProductCount = Math.max(0, activeSegments.length - 1);
    const missingLocalSources = useMemo(
        () => sources.filter((source) => isDesktopApp ? !source.stagedSourceId : (!source.file && !source.helperSourceId)),
        [isDesktopApp, sources]
    );
    const firstMissingLocalSource = missingLocalSources[0] ?? null;
    const helperBlockReason = helperStatus === 'unavailable'
        ? 'Перезапустите ZAGARAMI admin.'
        : helperStatus === 'version_mismatch'
            ? 'Обновите ZAGARAMI admin.'
            : '';
    const exportBlockedReason = helperStatus === 'unavailable'
        ? helperBlockReason
        : helperStatus === 'version_mismatch'
            ? helperBlockReason
            : helperStatus !== 'ready'
                ? 'Проверяем внутренний video helper.'
        : sources.length === 0 || !durationMs
            ? 'Загрузите исходник.'
        : firstMissingLocalSource
            ? `Привяжите локальный исходник: ${firstMissingLocalSource.name}.`
        : activeProductCount <= 0
            ? 'Нужен минимум один товарный фрагмент.'
        : activeProductCount > expectedOutputCount
            ? `Лишних товарных фрагментов: ${activeProductCount - expectedOutputCount}.`
        : '';
    const sessionUploadedSerials = useMemo(
        () => new Set(
            videoUploads
                .filter((item) => item.status === 'uploaded' && item.serial_number)
                .map((item) => item.serial_number as string)
        ),
        [videoUploads]
    );
    const pushSegmentsToHistory = useCallback((snapshot: Segment[]) => {
        const clonedSnapshot = cloneSegments(snapshot);
        const lastSnapshot = segmentHistoryRef.current.at(-1);
        if (lastSnapshot && areSegmentsEqual(lastSnapshot, clonedSnapshot)) {
            return;
        }

        segmentHistoryRef.current.push(clonedSnapshot);
        if (segmentHistoryRef.current.length > 100) {
            segmentHistoryRef.current.shift();
        }
    }, []);
    const applySegmentEdit = useCallback((updater: (current: Segment[]) => Segment[]) => {
        setSegments((current) => {
            const next = updater(current);
            if (areSegmentsEqual(current, next)) {
                return current;
            }

            pushSegmentsToHistory(current);
            return next;
        });
        setExportPhase('idle');
        setExportMessage('');
        setPreflightIssues([]);
    }, [pushSegmentsToHistory, setExportPhase]);
    const restorePreviousSegments = useCallback(() => {
        const previous = segmentHistoryRef.current.pop();
        if (!previous) {
            return;
        }

        setSegments(cloneSegments(previous));
        setSelectedSegmentIndex((current) => Math.min(current, Math.max(0, previous.length - 1)));
        setExportPhase('idle');
        setExportMessage('');
    }, [setExportPhase]);
    const clearSavedDraft = useCallback(() => {
        if (isDesktopApp) {
            void getStonesDesktop()?.discardVideoDraft?.(batchId).catch(() => undefined);
        } else {
            localStorage.removeItem(draftKeyFor(batchId));
        }
    }, [batchId, isDesktopApp]);
    const hardDeleteSelectedSegment = useCallback(() => {
        setSegments((current) => {
            const next = deleteSegmentAt(current, selectedSegmentIndex);
            if (areSegmentsEqual(current, next)) {
                return current;
            }

            pushSegmentsToHistory(current);
            return next;
        });
        setSelectedSegmentIndex((current) => Math.max(0, Math.min(current, segments.length - 2)));
        setExportPhase('idle');
        setExportMessage('');
    }, [pushSegmentsToHistory, segments.length, selectedSegmentIndex, setExportPhase]);
    const segmentRows = useMemo<VideoToolSegmentRow[]>(() => {
        let activeIndex = -1;

        return segments.map((segment, index) => {
            const isDeleted = Boolean(segment.deleted);
            if (!isDeleted) {
                activeIndex += 1;
            }

            const role = isDeleted
                ? 'deleted'
                : activeIndex === 0
                    ? 'intro'
                    : 'clip';
            const item = !isDeleted && activeIndex > 0
                ? data?.items[activeIndex - 1] ?? null
                : null;
            const isUploaded = Boolean(item?.serial_number && sessionUploadedSerials.has(item.serial_number));

            return {
                index,
                segment,
                isDeleted,
                activeIndex: isDeleted ? null : activeIndex,
                displaySequence: isDeleted ? null : padSequence(activeIndex),
                role,
                item,
                isUploaded
            };
        });
    }, [data?.items, segments, sessionUploadedSerials]);
    const updateTimelineViewport = useCallback((nextVisibleStartMs: number, nextVisibleDurationMs: number, options?: { isPanning?: boolean }) => {
        if (!durationMs) {
            return;
        }

        const clampedVisibleDurationMs = clampVisibleDuration(durationMs, nextVisibleDurationMs || durationMs);
        const clampedVisibleStartMs = clampVisibleStart(durationMs, nextVisibleStartMs, clampedVisibleDurationMs);
        setTimelineViewport({
            zoom: Number((durationMs / clampedVisibleDurationMs).toFixed(3)),
            visibleStartMs: clampedVisibleStartMs,
            visibleDurationMs: clampedVisibleDurationMs,
            isPanning: options?.isPanning ?? false
        });
    }, [durationMs]);
    const zoomTimelineTo = useCallback((anchorMs: number, nextVisibleDurationMs: number) => {
        if (!durationMs || !visibleDurationMs) {
            return;
        }

        const anchorRatio = clamp((anchorMs - visibleStartMs) / visibleDurationMs, 0, 1);
        const clampedVisibleDurationMs = clampVisibleDuration(durationMs, nextVisibleDurationMs);
        const nextVisibleStartMs = anchorMs - (clampedVisibleDurationMs * anchorRatio);
        updateTimelineViewport(nextVisibleStartMs, clampedVisibleDurationMs);
    }, [durationMs, updateTimelineViewport, visibleDurationMs, visibleStartMs]);
    const zoomTimelineByFactor = useCallback((factor: number, anchorMs = playheadMs) => {
        if (!durationMs || !visibleDurationMs) {
            return;
        }

        zoomTimelineTo(anchorMs, visibleDurationMs * factor);
    }, [durationMs, playheadMs, visibleDurationMs, zoomTimelineTo]);
    const handleTimelineWheel = useCallback((event: WheelEvent, currentTarget: HTMLElement) => {
        const wheelState = timelineWheelStateRef.current;
        if (!wheelState.durationMs || !wheelState.visibleDurationMs) {
            return;
        }

        const absDeltaX = Math.abs(event.deltaX);
        const absDeltaY = Math.abs(event.deltaY);
        if (absDeltaX < 1 && absDeltaY < 1) {
            return;
        }

        event.preventDefault();
        suppressTimelineAutoScrollUntilRef.current = Date.now() + 500;
        const rect = currentTarget.getBoundingClientRect();
        const anchorRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const anchorMs = wheelState.visibleStartMs + (anchorRatio * wheelState.visibleDurationMs);
        const shouldZoom = event.ctrlKey || event.metaKey || (!event.shiftKey && absDeltaY >= absDeltaX);

        if (shouldZoom) {
            const zoomDelta = event.deltaY || event.deltaX;
            const zoomFactor = Math.exp(zoomDelta * 0.002);
            const nextVisibleDurationMs = clampVisibleDuration(wheelState.durationMs, wheelState.visibleDurationMs * zoomFactor);
            const nextVisibleStartMs = clampVisibleStart(
                wheelState.durationMs,
                anchorMs - (nextVisibleDurationMs * anchorRatio),
                nextVisibleDurationMs
            );
            setTimelineViewport({
                zoom: Number((wheelState.durationMs / nextVisibleDurationMs).toFixed(3)),
                visibleStartMs: nextVisibleStartMs,
                visibleDurationMs: nextVisibleDurationMs,
                isPanning: false
            });
            return;
        }

        const panDeltaPx = event.shiftKey && absDeltaY > absDeltaX ? event.deltaY : event.deltaX;
        const nextVisibleStartMs = clampVisibleStart(
            wheelState.durationMs,
            wheelState.visibleStartMs + ((panDeltaPx / rect.width) * wheelState.visibleDurationMs),
            wheelState.visibleDurationMs
        );
        setTimelineViewport({
            zoom: Number((wheelState.durationMs / wheelState.visibleDurationMs).toFixed(3)),
            visibleStartMs: nextVisibleStartMs,
            visibleDurationMs: wheelState.visibleDurationMs,
            isPanning: false
        });
    }, []);
    const timelineClientXToMs = useCallback((clientX: number, rect: Pick<DOMRect, 'left' | 'width'>) => clamp(
        visibleStartMs + (((clientX - rect.left) / rect.width) * visibleDurationMs),
        0,
        durationMs
    ), [durationMs, visibleDurationMs, visibleStartMs]);

    const playheadDragClientXToMs = useCallback((clientX: number, session: PlayheadDragSession) => clamp(
        session.visibleStartMs + (((clientX - session.timelineRect.left) / session.timelineRect.width) * session.visibleDurationMs),
        0,
        durationMs
    ), [durationMs]);

    const rebuildSegmentsForSources = useCallback((nextSources: WorkingSource[]) => {
        if (nextSources.length === 0) {
            return [];
        }

        return nextSources.reduce<Segment[]>((nextSegments, source, index) => (
            index === 0
                ? createFirstSourceSegments(source)
                : appendInitialSourceSegment(nextSegments, source, nextSources.slice(0, index + 1))
        ), []);
    }, []);

    const reindexSources = useCallback((nextSources: WorkingSource[]) => nextSources
        .sort((left, right) => left.sourceIndex - right.sourceIndex)
        .map((source, index) => ({
            ...source,
            sourceIndex: index,
            role: index === 0 ? 'WITH_INTRO' : 'NO_INTRO'
        } satisfies WorkingSource)), []);
    const seekPlayhead = useCallback((nextMs: number, options: { syncPreview?: boolean } = {}) => {
        const clampedMs = clamp(Math.round(nextMs), 0, durationMs);
        setPlayheadMs(clampedMs);

        if (options.syncPreview === false) {
            return;
        }

        const sourceHit = getSourceForGlobalMs(sources, clampedMs);
        if (!sourceHit) {
            return;
        }

        const nextSourceIndex = sourceHit.source.sourceIndex;
        if (nextSourceIndex !== activeSourceIndex) {
            pendingPreviewSeekRef.current = {
                sourceIndex: nextSourceIndex,
                localMs: sourceHit.localMs
            };
            setActiveSourceIndex(nextSourceIndex);
            return;
        }

        pendingPreviewSeekRef.current = null;
        if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, sourceHit.localMs / 1000);
        }
    }, [activeSourceIndex, durationMs, sources]);

    const syncVideoTime = seekPlayhead;

    const beginPlayheadDrag = useCallback((clientX: number, pointerId: number) => {
        if (!durationMs || !visibleDurationMs || !timelineRef.current) {
            return;
        }

        const rect = timelineRef.current.getBoundingClientRect();
        if (!rect.width) {
            return;
        }

        const session: PlayheadDragSession = {
            pointerId,
            timelineRect: {
                left: rect.left,
                width: rect.width
            },
            visibleStartMs,
            visibleDurationMs
        };
        dragPlayheadRef.current = session;
        suppressTimelineAutoScrollUntilRef.current = Date.now() + 1000;
        seekPlayhead(playheadDragClientXToMs(clientX, session));
    }, [durationMs, playheadDragClientXToMs, seekPlayhead, visibleDurationMs, visibleStartMs]);

    const togglePlayback = useCallback(async () => {
        if (!videoRef.current || !sourceUrl || sourcePreviewUnavailable) {
            return;
        }

        if (videoRef.current.paused) {
            try {
                await videoRef.current.play();
            } catch (playError) {
                console.error(playError);
                setNotice({
                    tone: 'warning',
                    message: 'Браузер заблокировал воспроизведение. Кликните по области просмотра и повторите.'
                });
            }
            return;
        }

        videoRef.current.pause();
    }, [sourcePreviewUnavailable, sourceUrl]);

    const loadPageData = useEffectEvent(async () => {
        if (!batchId) {
            setError('Не указан batchId для монтажа.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');
        setNotice(null);
        try {
            const [payload, uploadStatus] = await Promise.all([
                fetchVideoToolPayload(batchId),
                fetchVideoUploadStatus(batchId)
            ]);
            setVideoUploads(uploadStatus.items);
            setData(mergeVideoUploadsIntoToolPayload(payload, uploadStatus.items));
            const desktop = getStonesDesktop();
            const existingDraft = isDesktopApp && desktop
                ? normalizeDesktopDraft(batchId, await desktop.getVideoDraft(batchId))
                : parseDraft(batchId);
            setDraft(existingDraft);
            const resolveRestoredPreview = async (
                helperSourceId: string,
                draftSource?: NonNullable<VideoToolDraft['sources']>[number]
            ) => {
                if (!helperSourceId) {
                    return {
                        previewUrl: '',
                        previewFileId: null,
                        previewError: 'Исходник нужно привязать заново.',
                        previewUnavailable: true
                    };
                }

                if (isDesktopApp && desktop) {
                    try {
                        const preview = await desktop.getVideoSourcePreview(helperSourceId);
                        return {
                            previewUrl: preview.previewUrl,
                            previewFileId: preview.previewFileId,
                            previewError: null,
                            previewUnavailable: false
                        };
                    } catch (previewError) {
                        return {
                            previewUrl: '',
                            previewFileId: draftSource?.previewFileId || helperSourceId,
                            previewError: previewError instanceof Error ? previewError.message : 'Preview-файл отсутствует. Привяжите исходник заново.',
                            previewUnavailable: true
                        };
                    }
                }

                return {
                    previewUrl: '',
                    previewFileId: draftSource?.previewFileId || helperSourceId,
                    previewError: 'Preview доступен только в Desktop app.',
                    previewUnavailable: true
                };
            };
            const { runs } = await fetchVideoExportRuns(batchId);
            const preferredRun = runs.find((run) => !['COMPLETED', 'CANCELLED'].includes(run.status)) ?? runs[0] ?? null;
            setActiveV2Run(preferredRun as VideoExportRunDetails | null);

            if (preferredRun) {
                const latestRun = await refreshActiveV2Run(preferredRun.run_id);
                if (!latestRun) {
                    throw new Error('Не удалось загрузить активную video upload session.');
                }
            }

            if (existingDraft?.sources.length) {
                const draftSources = await Promise.all(existingDraft.sources.map(async (source) => {
                    const helperSourceId = source.helperSourceId || '';
                    const previewState = await resolveRestoredPreview(helperSourceId, source);
                    return createSourceFromFingerprint(
                        source.sourceIndex,
                        source.role,
                        source.fingerprint,
                        {
                            helperSourceId,
                            stagedSourceId: source.stagedSourceId || null,
                            cachePath: source.cachePath || null,
                            checksumSha256: source.checksumSha256 || null,
                            ...previewState
                        }
                    );
                }));
                setSources(draftSources);
                setActiveSourceIndex(draftSources[0]?.sourceIndex ?? 0);
                setSegments(normalizeSegments(existingDraft.segments));
                setPendingSerials(existingDraft.pendingSerials);
                setIntroHelperSourceId(existingDraft.introHelperSourceId || '');
                applyLoadedExportSettings(existingDraft.exportSettings);
                if (!preferredRun) {
                    setActiveV2Run(createRestoredLocalVideoExportRunDetails(batchId, existingDraft));
                }
            }

            setPendingSerials(
                uploadStatus.items
                    .filter((item) => item.status === 'missing' && item.serial_number)
                    .map((item) => item.serial_number as string)
            );

            await refreshLocalRunSnapshot(batchId);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить данные инструмента.');
        } finally {
            setLoading(false);
        }
    });

    const helperUrlCandidates = useMemo(() => {
        return [DESKTOP_VIDEO_HELPER_URL];
    }, []);

    const fetchHelperHealth = useCallback(async () => {
        const desktop = getStonesDesktop();
        if (!desktop) {
            throw new Error('Desktop API недоступен.');
        }

        const status = await desktop.getVideoHelperStatus();
        const payload: HelperHealthPayload = {
            ok: Boolean(status.ok),
            helper_version: status.helper_version,
            protocol_version: status.protocol_version,
            listen_hosts: status.listen_hosts,
            storage_root: status.storage_root,
            free_bytes: status.free_bytes,
            allowed_origins: status.allowed_origins,
            queued_jobs: status.queued_jobs,
            error: status.error || status.startup_error,
            pageOrigin: status.page_origin,
            expected_port: status.expected_port,
            discovered_port: status.discovered_port
        };
        const detail = payload.error || (payload.ok ? 'Video helper ответил через IPC.' : 'Video helper недоступен.');
        const diagnostic: HelperDiagnosticEntry = {
            url: DESKTOP_VIDEO_HELPER_URL,
            mode: 'standard',
            status: payload.ok
                ? payload.protocol_version === VIDEO_EXPORT_HELPER_PROTOCOL_VERSION
                    ? 'ok'
                    : 'bad protocol'
                : 'connection failed',
            detail,
            protocolVersion: payload.protocol_version,
            pageOrigin: payload.pageOrigin,
            allowedOrigins: payload.allowed_origins,
            expectedPort: payload.expected_port,
            discoveredPort: payload.discovered_port,
            storageRoot: payload.storage_root
        };
        setHelperDiagnostics([diagnostic]);
        return {
            helperUrl: DESKTOP_VIDEO_HELPER_URL,
            response: { ok: payload.ok, status: payload.ok ? 200 : 503 },
            payload
        };
    }, []);

    const checkHelper = useCallback(async () => {
        setHelperStatus('checking');
        setHelperIssueMessage('');
        try {
            const { helperUrl, response, payload } = await fetchHelperHealth();
            if (!response.ok || !payload.ok) {
                throw new Error(buildHelperIssueMessage(payload.error || 'Helper ffmpeg недоступен.', {
                    helperBaseUrl: helperUrl,
                    pageOrigin: payload.pageOrigin,
                    allowedOrigins: payload.allowed_origins || payload.allowedOrigins,
                    expectedPort: payload.expected_port,
                    discoveredPort: payload.discovered_port,
                    storageRoot: payload.storage_root
                }));
            }

            setHelperHealth(payload);
            if (payload.protocol_version !== VIDEO_EXPORT_HELPER_PROTOCOL_VERSION) {
                setHelperIssueMessage('Внутренний video helper устарел. Обновите ZAGARAMI admin и перепроверьте статус.');
                setHelperStatus('version_mismatch');
                return;
            }

            setHelperIssueMessage('');
            setHelperStatus('ready');
        } catch (helperError) {
            setHelperHealth(null);
            setHelperIssueMessage(buildHelperIssueMessage(helperError instanceof Error ? helperError.message : '', {
                helperBaseUrl: DESKTOP_VIDEO_HELPER_URL
            }));
            setHelperStatus('unavailable');
            console.error(helperError);
        }
    }, [fetchHelperHealth, setHelperIssueMessage, setHelperStatus]);
    const openDesktopStatusCenter = (focusWorkflowId?: string) => {
        window.dispatchEvent(new CustomEvent('stones:open-status-center', {
            detail: {
                tab: 'queue',
                ...(focusWorkflowId ? { focus: { type: 'workflow', id: focusWorkflowId } } : {})
            }
        }));
    };

    useEffect(() => {
        void loadPageData();
        if (isDesktopApp) {
            void checkHelper();
        } else {
            setHelperStatus('unavailable');
            setHelperIssueMessage('Video Tool доступен только в ZAGARAMI admin Desktop app.');
        }
    }, [batchId, checkHelper, isDesktopApp, setHelperIssueMessage, setHelperStatus]);

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, []);

    useEffect(() => {
        return () => {
            sourceObjectUrlsRef.current.forEach((objectUrl) => revokeObjectUrl(objectUrl));
            sourceObjectUrlsRef.current.clear();
        };
    }, []);

    useEffect(() => {
        if (!durationMs) {
            setTimelineViewport({
                zoom: 1,
                visibleStartMs: 0,
                visibleDurationMs: 0,
                isPanning: false
            });
            return;
        }

        updateTimelineViewport(0, durationMs);
    }, [durationMs, updateTimelineViewport]);

    useEffect(() => {
        if (!batchId || sources.length === 0 || segments.length === 0) {
            return;
        }

        let renderManifest: VideoExportManifest | null = null;
        try {
            renderManifest = data ? buildRenderManifest(segments, sources, data.items) : null;
        } catch {
            renderManifest = null;
        }

        const nextDraft: VideoToolDraft & { renderManifest?: VideoExportManifest | null; exportSettings?: Record<string, unknown> } = {
            version: 2,
            batchId,
            sources: sources.map((source) => ({
                sourceIndex: source.sourceIndex,
                role: source.role,
                fingerprint: {
                    name: source.name,
                    size: source.size,
                    lastModified: source.lastModified,
                    durationMs: source.durationMs
                },
                helperSourceId: source.helperSourceId || null,
                stagedSourceId: source.stagedSourceId || null,
                cachePath: source.cachePath || null,
                checksumSha256: source.checksumSha256 || null,
                previewUrl: source.previewUrl.startsWith('zagarami-media://') ? source.previewUrl : null,
                previewFileId: source.previewFileId || null,
                previewError: source.previewError || null
            })),
            segments,
            runId: activeV2Run?.run_id || null,
            runVersion: activeV2Run?.version || null,
            pendingSerials,
            introHelperSourceId: introHelperSourceId || null,
            renderManifest,
            exportSettings: {
                resolution: exportResolution,
                quality: exportQuality,
                fps: exportFps,
                audio_normalize: exportAudioNormalize
            }
        };
        if (isDesktopApp) {
            void getStonesDesktop()?.saveVideoDraft(nextDraft).catch((draftError) => {
                console.error(draftError);
            });
        } else {
            localStorage.setItem(draftKeyFor(batchId), JSON.stringify(nextDraft));
        }
        setDraft(nextDraft);
    }, [activeV2Run?.run_id, activeV2Run?.version, batchId, data, introHelperSourceId, isDesktopApp, pendingSerials, segments, sources, exportResolution, exportQuality, exportFps, exportAudioNormalize]);

    useEffect(() => {
        if (!isDesktopApp || !activeV2Run?.run_id) {
            return;
        }

        void refreshLocalRunSnapshot();
        const intervalId = window.setInterval(() => {
            void refreshLocalRunSnapshot();
            void refreshVideoUploads(batchId).catch(() => undefined);
            void refreshActiveV2Run(activeV2Run.run_id, { silent: true }).catch(() => undefined);
        }, 1500);

        return () => window.clearInterval(intervalId);
    }, [activeV2Run?.run_id, batchId, isDesktopApp, refreshActiveV2Run, refreshLocalRunSnapshot, refreshVideoUploads]);

    useEffect(() => {
        if (loading || !activeV2Run) {
            return;
        }

        let currentRenderManifest: VideoExportManifest | null = null;
        try {
            currentRenderManifest = data ? buildRenderManifest(segments, sources, data.items) : null;
        } catch {
            currentRenderManifest = null;
        }

        const currentExportSettings: VideoExportSettings = {
            resolution: exportResolution,
            quality: exportQuality,
            fps: exportFps,
            audio_normalize: exportAudioNormalize
        };

        const isMatch = (() => {
            if (!currentRenderManifest) {
                return false;
            }

            const runManifest = activeV2Run.render_manifest;
            const runSettings = activeV2Run.export_settings ?? activeV2Run.render_manifest?.export_settings;

            // Compare settings
            if (runSettings) {
                if (runSettings.resolution !== currentExportSettings.resolution) return false;
                if (runSettings.quality !== currentExportSettings.quality) return false;
                if (runSettings.fps !== currentExportSettings.fps) return false;
                if (runSettings.audio_normalize !== currentExportSettings.audio_normalize) return false;
            } else {
                return false;
            }

            // Compare manifest sources
            if (runManifest?.sources?.length !== currentRenderManifest.sources?.length) return false;
            if (runManifest?.sources && currentRenderManifest.sources) {
                for (let i = 0; i < runManifest.sources.length; i++) {
                    const sa = runManifest.sources[i];
                    const sb = currentRenderManifest.sources[i];
                    if (sa.source_index !== sb.source_index) return false;
                    if (sa.role !== sb.role) return false;
                    if (sa.fingerprint?.name !== sb.fingerprint?.name) return false;
                    if (sa.fingerprint?.size !== sb.fingerprint?.size) return false;

                    const durA = sa.fingerprint?.durationMs;
                    const durB = sb.fingerprint?.durationMs;
                    if (durA !== durB) return false;
                }
            }

            // Compare manifest segments
            if (runManifest?.segments?.length !== currentRenderManifest.segments.length) return false;
            if (runManifest?.segments) {
                for (let i = 0; i < runManifest.segments.length; i++) {
                    const sega = runManifest.segments[i];
                    const segb = currentRenderManifest.segments[i];
                    if (sega.sequence !== segb.sequence) return false;
                    if ((sega.source_index ?? 0) !== (segb.source_index ?? 0)) return false;
                    if (sega.start_ms !== segb.start_ms) return false;
                    if (sega.end_ms !== segb.end_ms) return false;
                }
            }

            // Compare manifest outputs
            if (runManifest?.outputs?.length !== currentRenderManifest.outputs.length) return false;
            if (runManifest?.outputs) {
                for (let i = 0; i < runManifest.outputs.length; i++) {
                    const outa = runManifest.outputs[i];
                    const outb = currentRenderManifest.outputs[i];
                    if (outa.segment_seq !== outb.segment_seq) return false;
                    if (outa.serial_number !== outb.serial_number) return false;
                    if (outa.item_id !== outb.item_id) return false;
                }
            }

            return true;
        })();

        if (!isMatch) {
            const isActive = !['COMPLETED', 'CANCELLED', 'FAILED'].includes(activeV2Run.status.toUpperCase());
            if (isActive) {
                const runId = activeV2Run.run_id;
                const version = activeV2Run.version;
                const activeBatchId = data?.batch?.id;

                // Cancel locally in desktop app
                const desktop = getStonesDesktop();
                void desktop?.cancelVideoExportRun(runId).catch((err) => console.error('Failed to cancel local run upon edit:', err));

                // Cancel on server if it's not a local-only draft (version > 0)
                if (version > 0 && activeBatchId) {
                    void cancelServerVideoExportRun(activeBatchId, runId).catch((err) => console.error('Failed to cancel server run upon edit:', err));
                }
            }
            setActiveV2Run(null);
        }
    }, [
        loading,
        activeV2Run,
        segments,
        sources,
        data,
        exportResolution,
        exportQuality,
        exportFps,
        exportAudioNormalize,
        setActiveV2Run
    ]);

    useEffect(() => {
        let cancelled = false;

        const loadServerAssetOrigin = async () => {
            if (!isDesktopApp) {
                setServerAssetOrigin(window.location.origin);
                return;
            }

            const desktop = getStonesDesktop();
            if (!desktop) {
                setServerAssetOrigin(window.location.origin);
                return;
            }

            try {
                const appInfo = await desktop.getAppInfo();
                if (!cancelled) {
                    setServerAssetOrigin(appInfo.apiOrigin || window.location.origin);
                }
            } catch {
                if (!cancelled) {
                    setServerAssetOrigin(window.location.origin);
                }
            }
        };

        void loadServerAssetOrigin();

        return () => {
            cancelled = true;
        };
    }, [isDesktopApp]);

    useEffect(() => {
        setPreviewPanelWidth((current) => clampPreviewPanelWidth(current));
    }, [clampPreviewPanelWidth, setPreviewPanelWidth]);

    useEffect(() => {
        localStorage.setItem(PREVIEW_PANEL_WIDTH_STORAGE_KEY, String(previewPanelWidth));
    }, [previewPanelWidth]);

    useEffect(() => {
        const handleResize = () => {
            setPreviewPanelWidth((current) => clampPreviewPanelWidth(current));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [clampPreviewPanelWidth, setPreviewPanelWidth]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            const previewResize = previewResizeRef.current;
            if (previewResize) {
                const deltaPx = event.clientX - previewResize.startClientX;
                setPreviewPanelWidth(clampPreviewPanelWidth(previewResize.startWidth - deltaPx));
                return;
            }

            const playheadDrag = dragPlayheadRef.current;
            if (playheadDrag && durationMs) {
                if (playheadDrag.pointerId !== event.pointerId) {
                    return;
                }

                const nextMs = playheadDragClientXToMs(event.clientX, playheadDrag);
                suppressTimelineAutoScrollUntilRef.current = Date.now() + 1000;
                syncVideoTime(nextMs);
                return;
            }

            const boundaryIndex = dragBoundaryIndexRef.current;
            if (boundaryIndex != null && timelineRef.current && durationMs && visibleDurationMs) {
                if (isSourceBoundaryBetween(segments[boundaryIndex], segments[boundaryIndex + 1])) {
                    return;
                }

                const rect = timelineRef.current.getBoundingClientRect();
                const nextMs = timelineClientXToMs(event.clientX, rect);
                setSegments((current) => moveBoundary(current, boundaryIndex, nextMs));
                return;
            }

            const panViewport = panViewportRef.current;
            if (!panViewport || !durationMs || !visibleDurationMs) {
                return;
            }

            const activeRef = panViewport.source === 'scrollbar' ? timelineScrollbarRef.current : timelineRef.current;
            if (!activeRef) {
                return;
            }

            const rect = activeRef.getBoundingClientRect();
            const deltaPx = event.clientX - panViewport.startClientX;
            const deltaMs = (deltaPx / rect.width) * durationMs;
            updateTimelineViewport(
                panViewport.startVisibleStartMs + deltaMs,
                visibleDurationMs,
                { isPanning: true }
            );
        };

        const handlePointerUp = () => {
            previewResizeRef.current = null;
            dragPlayheadRef.current = null;
            dragBoundaryIndexRef.current = null;
            if (panViewportRef.current) {
                panViewportRef.current = null;
                setTimelineViewport((current) => ({ ...current, isPanning: false }));
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [clampPreviewPanelWidth, durationMs, playheadDragClientXToMs, segments, setPreviewPanelWidth, syncVideoTime, timelineClientXToMs, updateTimelineViewport, visibleDurationMs]);

    const timelineCuts = useMemo(
        () => segments.slice(1).map((segment) => segment.startMs),
        [segments]
    );

    useVideoToolHotkeys({
        applySegmentEdit,
        durationMs,
        hardDeleteSelectedSegment,
        playheadMs,
        restorePreviousSegments,
        selectedSegmentIndex,
        segmentsLength: segments.length,
        syncVideoTime,
        timelineCuts,
        togglePlayback,
        zoomTimelineByFactor
    });

    useEffect(() => {
        if (!durationMs || !visibleDurationMs) {
            return;
        }

        if (timelineViewport.isPanning || Date.now() < suppressTimelineAutoScrollUntilRef.current) {
            return;
        }

        if (playheadMs < visibleStartMs) {
            updateTimelineViewport(playheadMs - (visibleDurationMs * 0.08), visibleDurationMs);
            return;
        }

        if (playheadMs > visibleEndMs) {
            updateTimelineViewport(playheadMs - (visibleDurationMs * 0.92), visibleDurationMs);
        }
    }, [durationMs, playheadMs, timelineViewport.isPanning, updateTimelineViewport, visibleDurationMs, visibleEndMs, visibleStartMs]);

    useEffect(() => {
        const nextSelectedIndex = segments.findIndex((segment, index) => {
            const isLastSegment = index === segments.length - 1;
            return playheadMs >= segment.startMs && (playheadMs < segment.endMs || (isLastSegment && playheadMs <= segment.endMs));
        });
        if (nextSelectedIndex >= 0 && nextSelectedIndex !== selectedSegmentIndex) {
            setSelectedSegmentIndex(nextSelectedIndex);
        }
    }, [durationMs, playheadMs, segments, selectedSegmentIndex]);

    const handleSourcePicked = async (file: File | null, mode: 'first' | 'append' | 'rebind' | 'replace' = 'first', targetSourceIndex?: number) => {
        if (!file) {
            return;
        }

        const sourceIndex = typeof targetSourceIndex === 'number' ? targetSourceIndex : mode === 'first' ? 0 : sources.length;
        const existingSource = sources.find((source) => source.sourceIndex === sourceIndex) ?? null;
        const role: SourceRole = existingSource?.role ?? (sourceIndex === 0 ? 'WITH_INTRO' : 'NO_INTRO');
        const preserveExistingTimeline = Boolean(existingSource && mode === 'rebind');
        const nextObjectUrl = URL.createObjectURL(file);
        sourceObjectUrlsRef.current.add(nextObjectUrl);

        setError('');
        setExportPhase('idle');
        setExportMessage('');
        setIsPlaying(false);

        if (mode === 'first' && !preserveExistingTimeline) {
            sourceObjectUrlsRef.current.forEach((objectUrl) => {
                if (objectUrl !== nextObjectUrl) {
                    revokeObjectUrl(objectUrl);
                }
            });
            sourceObjectUrlsRef.current = new Set([nextObjectUrl]);
            setSources([]);
            setSegments([]);
            setPendingSerials([]);
            setIntroHelperSourceId('');
            segmentHistoryRef.current = [];
        }

        setActiveSourceIndex(sourceIndex);
        try {
            setIsImportingSource(true);
            await importSourceIntoHelper(file, sourceIndex, role, nextObjectUrl, {
                preserveTimeline: preserveExistingTimeline,
                resetTimeline: mode === 'replace',
                expectedFingerprint: preserveExistingTimeline ? existingSource : null
            });
        } finally {
            setIsImportingSource(false);
        }
    };

    const handleSourceDeleted = useCallback((sourceIndex: number) => {
        const nextSources = reindexSources(sources.filter((source) => source.sourceIndex !== sourceIndex));
        sourceObjectUrlsRef.current.forEach((objectUrl) => revokeObjectUrl(objectUrl));
        sourceObjectUrlsRef.current.clear();
        pushSegmentsToHistory(segments);
        setSources(nextSources);
        setActiveSourceIndex(nextSources[0]?.sourceIndex ?? 0);
        setSegments(rebuildSegmentsForSources(nextSources));
        setSelectedSegmentIndex(0);
        setPlayheadMs(0);
        setPendingSerials([]);
        setIntroHelperSourceId('');
        setExportPhase('idle');
        setExportMessage('');
        setNotice({
            tone: 'warning',
            message: 'Исходник удалён. Монтаж пересобран по оставшимся файлам.'
        });
        setTimelineViewport({
            zoom: 1,
            visibleStartMs: 0,
            visibleDurationMs: getTotalSourceDurationMs(nextSources),
            isPanning: false
        });
    }, [rebuildSegmentsForSources, reindexSources, segments, setExportPhase, sources, pushSegmentsToHistory]);

    const handleLoadedMetadata = () => {
        if (!activeSource || !videoRef.current || !Number.isFinite(videoRef.current.duration) || videoRef.current.duration <= 0) {
            return;
        }

        const pendingSeek = pendingPreviewSeekRef.current;
        if (pendingSeek?.sourceIndex === activeSource.sourceIndex) {
            videoRef.current.currentTime = Math.max(0, pendingSeek.localMs / 1000);
            pendingPreviewSeekRef.current = null;
        }

        setSources((current) => current.map((source) => source.sourceIndex === activeSource.sourceIndex
            ? { ...source, previewUnavailable: false }
            : source));
    };

    const handlePreviewTimeUpdate = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
        if (dragPlayheadRef.current || pendingPreviewSeekRef.current) {
            return;
        }

        const offsetMs = activeSource
            ? sources
                .filter((source) => source.sourceIndex < activeSource.sourceIndex)
                .reduce((sum, source) => sum + source.durationMs, 0)
            : 0;
        setPlayheadMs(clamp(offsetMs + Math.round(event.currentTarget.currentTime * 1000), 0, durationMs));
    }, [activeSource, durationMs, sources]);

    const handleVideoError = () => {
        if (!activeSource) {
            return;
        }

        setSources((current) => current.map((source) => source.sourceIndex === activeSource.sourceIndex
            ? {
                ...source,
                previewUnavailable: true,
                previewError: `Preview не декодируется${source.helperSourceId ? ` (source ${source.helperSourceId})` : ''}. Привяжите исходник заново.`
            }
            : source));
    };

    const importSourceIntoHelper = async (
        file: File,
        sourceIndex: number,
        role: SourceRole,
        fallbackPreviewUrl = '',
        options?: {
            preserveTimeline?: boolean;
            resetTimeline?: boolean;
            expectedFingerprint?: SourceFingerprint | null;
        }
    ) => {
        try {
            let stagedSource: Awaited<ReturnType<typeof stageDesktopVideoSourceFile>> | null = null;

            const desktop = getStonesDesktop();
            if (!isDesktopApp || !desktop) {
                throw new Error('Video Tool доступен только в ZAGARAMI admin Desktop app.');
            }

            stagedSource = await stageDesktopVideoSourceFile(file);
            const payload: Partial<HelperSourceUploadPayload> & { error?: string } = await desktop.importVideoSource({
                stagedSourceId: stagedSource.stagedSourceId,
                cachePath: stagedSource.cachePath,
                originalName: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: stagedSource.size,
                lastModified: file.lastModified
            });

            if (!payload.source_id || !payload.fingerprint) {
                throw new Error(payload.error || 'Не удалось импортировать исходник в helper.');
            }

            const nextFingerprint: SourceFingerprint = {
                name: payload.fingerprint.name,
                size: payload.fingerprint.size,
                lastModified: payload.fingerprint.lastModified,
                durationMs: payload.fingerprint.durationMs
            };
            const expectedFingerprint = options?.expectedFingerprint ?? null;
            if (expectedFingerprint) {
                const durationDiff = Math.abs(nextFingerprint.durationMs - expectedFingerprint.durationMs);
                if (nextFingerprint.size !== expectedFingerprint.size || durationDiff > SOURCE_DURATION_TOLERANCE_MS) {
                    throw new Error(`Файл не совпадает с восстановленным source "${expectedFingerprint.name}". Выберите исходник с тем же размером и длительностью.`);
                }
            }
            let previewUrl = fallbackPreviewUrl;

            const codec = (payload.video_codec || '').toLowerCase();
            const formatName = (payload.format_name || '').toLowerCase();
            const isHevcMov = (codec === 'hevc' || codec === 'h265') && formatName.includes('mov');
            if (payload.preview_url) {
                if (isDesktopApp && payload.preview_url.startsWith('zagarami-media://')) {
                    previewUrl = payload.preview_url;
                }
            }
            if (isDesktopApp && (!payload.preview_created || !payload.preview_file_id || !previewUrl.startsWith('zagarami-media://'))) {
                throw new Error(payload.preview_error || 'Helper не создал desktop preview для исходника.');
            }

            const nextSource = createSourceFromFingerprint(sourceIndex, role, nextFingerprint, {
                file,
                helperSourceId: payload.source_id,
                stagedSourceId: stagedSource?.stagedSourceId || null,
                cachePath: stagedSource?.cachePath || null,
                checksumSha256: stagedSource?.checksumSha256 || null,
                previewUrl,
                previewFileId: payload.preview_file_id || null,
                previewError: payload.preview_error || null,
                previewUnavailable: false
            });

            if (options?.preserveTimeline) {
                setSources((current) => current.map((source) => source.sourceIndex === sourceIndex ? nextSource : source));
                setNotice({
                    tone: 'info',
                    message: `Исходник ${nextSource.name} привязан к восстановленному монтажу.`
                });
                return payload.source_id;
            }

            const hasExistingSource = sources.some((source) => source.sourceIndex === sourceIndex);
            const baseSources = hasExistingSource || sourceIndex !== 0
                ? sources.filter((source) => source.sourceIndex !== sourceIndex)
                : [];
            const nextSources = reindexSources([...baseSources, nextSource]);
            setSources(nextSources);
            setSegments((currentSegments) => {
                if (options?.resetTimeline || sourceIndex === 0) {
                    pushSegmentsToHistory(currentSegments);
                    return rebuildSegmentsForSources(nextSources);
                }

                return appendInitialSourceSegment(currentSegments, nextSource, nextSources);
            });
            setTimelineViewport({
                zoom: 1,
                visibleStartMs: 0,
                visibleDurationMs: getTotalSourceDurationMs(nextSources),
                isPanning: false
            });
            setSelectedSegmentIndex(0);
            setPlayheadMs(0);
            if (options?.resetTimeline) {
                setNotice({
                    tone: 'warning',
                    message: `Исходник ${nextSource.name} заменён. Монтаж пересобран по текущим файлам.`
                });
            }

            if (isHevcMov) {
                setNotice({
                    tone: 'info',
                    message: payload.preview_url
                        ? 'Исходник MOV/H.265 принят. Helper подготовил совместимое превью и экспорт остаётся доступным.'
                        : 'Исходник MOV/H.265 принят через helper. Если браузер не покажет preview, экспорт всё равно будет доступен.'
                });
            }

            return payload.source_id;
        } catch (sourceError) {
            console.error(sourceError);
            setError(sourceError instanceof Error ? sourceError.message : 'Не удалось импортировать исходник в helper.');
            throw sourceError;
        }
    };

    const handleDiscardDraft = () => {
        clearSavedDraft();
        setDraft(null);
        setActiveV2Run(null);
        setLocalRunSnapshot(null);
        setNotice(null);
        setPendingSerials([]);
        setIntroHelperSourceId('');
        setExportPhase('idle');
        setExportMessage('');
        segmentHistoryRef.current = [];
        setIsPlaying(false);
        if (sources[0]) {
            setSources([sources[0]]);
            setActiveSourceIndex(sources[0].sourceIndex);
            setSegments(createFirstSourceSegments(sources[0]));
            setSelectedSegmentIndex(0);
            setPlayheadMs(0);
            setTimelineViewport({
                zoom: 1,
                visibleStartMs: 0,
                visibleDurationMs: sources[0].durationMs,
                isPanning: false
            });
        }
    };

    const buildCurrentManifest = useCallback(() => {
        if (!data) {
            throw new Error('Данные партии не загружены.');
        }

        return {
            ...buildRenderManifest(segments, sources, data.items),
            export_settings: {
                resolution: exportResolution,
                quality: exportQuality,
                fps: exportFps,
                audio_normalize: exportAudioNormalize
            }
        } satisfies VideoExportManifest;
    }, [data, exportAudioNormalize, exportFps, exportQuality, exportResolution, segments, sources]);

    const buildDesktopRunSources = useCallback((): DesktopVideoExportSource[] => {
        return sources.map((source) => {
            if (!source.stagedSourceId) {
                throw new Error(`Source ${source.sourceIndex + 1} не сохранён в Desktop cache. Добавьте исходник заново.`);
            }

            return {
                fileId: source.stagedSourceId,
                originalName: source.name,
                mimeType: source.file?.type || 'video/mp4',
                size: source.size,
                checksumSha256: source.checksumSha256 || '',
                cachePath: source.cachePath || '',
                sourceIndex: source.sourceIndex,
                role: source.role,
                helperSourceId: source.helperSourceId || '',
                lastModified: source.lastModified,
                fingerprint: {
                    name: source.name,
                    size: source.size,
                    lastModified: source.lastModified,
                    durationMs: source.durationMs
                }
            };
        });
    }, [sources]);

    const runPreflightCheck = useCallback(() => {
        if (!data) {
            throw new Error('Данные партии не загружены.');
        }

        const preflight = runPreflight({
            helperStatus,
            helperHealth,
            sources,
            segments,
            items: data.items,
            expectedOutputCount
        });
        setPreflightIssues(preflight.issues);
        if (!preflight.passed) {
            throw new Error('Префлайт-проверка выявила блокирующие проблемы.');
        }
    }, [data, expectedOutputCount, helperHealth, helperStatus, segments, sources]);

    const handleCut = useCallback(() => {
        applySegmentEdit((current) => splitSegmentAt(current, playheadMs));
    }, [applySegmentEdit, playheadMs]);

    const handleToggleDeleted = useCallback(() => {
        if (selectedSegmentIndex < 0) {
            return;
        }

        applySegmentEdit((current) => toggleSegmentDeletedAt(current, selectedSegmentIndex));
    }, [applySegmentEdit, selectedSegmentIndex]);

    const zoomIn = useCallback(() => {
        zoomTimelineByFactor(1 / TIMELINE_ZOOM_STEP);
    }, [zoomTimelineByFactor]);

    const zoomOut = useCallback(() => {
        zoomTimelineByFactor(TIMELINE_ZOOM_STEP);
    }, [zoomTimelineByFactor]);

    const zoomFit = useCallback(() => {
        if (!durationMs) {
            return;
        }

        updateTimelineViewport(0, durationMs);
    }, [durationMs, updateTimelineViewport]);

    const isExporting = Boolean(
        isStartingRun
        || isRefreshingRun
        || ['rendering', 'uploading', 'verifying'].includes(exportPhase)
    );

    const handleCleanupCache = async () => {
        const desktop = getStonesDesktop();
        if (!desktop) return;
        if (isExporting) {
            setNotice({
                tone: 'warning',
                message: 'Невозможно очистить кэш во время активного экспорта.'
            });
            return;
        }

        try {
            setExportMessage('Очистка кэша локального helper...');
            const result = await desktop.cleanupVideoHelper();
            setExportMessage('');
            setNotice({
                tone: 'info',
                message: `Кэш успешно очищен. Удалено источников: ${result.removed_sources || 0}, задач: ${result.removed_jobs || 0}.`
            });
            await checkHelper();
        } catch (err) {
            setExportMessage('');
            setNotice({
                tone: 'error',
                message: err instanceof Error ? err.message : 'Не удалось очистить кэш.'
            });
        }
    };

    const handleCollectDiagnostics = async () => {
        const desktop = getStonesDesktop();
        if (!desktop) return;
        try {
            setExportMessage('Сбор отчета диагностики...');
            const nextDiagnostics = await desktop.getDesktopDiagnostics();
            const workflowSnapshot = await desktop.getMediaWorkflowSnapshot();
            const queueSnapshot = await desktop.getMediaQueueSnapshot();
            
            const payload = {
                diagnostics: nextDiagnostics,
                queue: nextDiagnostics.queue,
                queueJobs: queueSnapshot.jobs,
                workflows: workflowSnapshot,
                videoTool: {
                    batchId,
                    pageOrigin: window.location.origin,
                    helperStatus,
                    helperIssueMessage,
                    helperUrlCandidates,
                    helperHealth,
                    helperDiagnostics
                },
                batchDiagnosticsLog: {
                    status: 'video-tool',
                    batchId: batchId,
                    serialNumber: activeV2Run?.run_id || 'none'
                }
            };
            
            const result = await desktop.exportDiagnosticsMarkdown(payload);
            setExportMessage('');
            setNotice({
                tone: 'info',
                message: `Отчет успешно сохранен: ${result.path}`
            });
        } catch (err) {
            setExportMessage('');
            setNotice({
                tone: 'error',
                message: err instanceof Error ? err.message : 'Не удалось экспортировать диагностику.'
            });
        }
    };

    const handleRestoreAllDeleted = () => {
        applySegmentEdit((current) => current.map((seg) => ({ ...seg, deleted: false })));
        setNotice({ tone: 'info', message: 'Все удаленные фрагменты успешно восстановлены.' });
    };

    const handleClearCuts = () => {
        if (sources.length === 0) return;
        applySegmentEdit(() => {
            let next = createFirstSourceSegments(sources[0]);
            for (let i = 1; i < sources.length; i++) {
                next = appendInitialSourceSegment(next, sources[i], sources.slice(0, i + 1));
            }
            return next;
        });
        setSelectedSegmentIndex(0);
        setPlayheadMs(0);
        setNotice({ tone: 'info', message: 'Нарезка сброшена. Шкала объединена.' });
    };

    const handleStartRun = useCallback(async (options?: { forceOverwrite?: boolean }) => {
        if (!data) {
            return;
        }

        const hasExistingVideos = videoUploads.some((item) => item.status === 'uploaded' || item.item_video_url);
        if (hasExistingVideos && !options?.forceOverwrite) {
            setShowOverwriteModal(true);
            return;
        }

        if (exportBlockedReason) {
            setExportPhase('failed');
            setExportMessage(exportBlockedReason);
            return;
        }

        const desktop = getStonesDesktop();
        if (!desktop) {
            setExportPhase('failed');
            setExportMessage('Desktop workflow недоступен.');
            return;
        }

        try {
            setError('');
            setNotice(null);
            setExportPhase('preflight');
            setExportMessage('Проверяем готовность сервера к video upload...');
            runPreflightCheck();
            await runVideoExportServerHealthcheck(data.batch.id);
            setExportMessage('Подготавливаем V2 запуск экспорта...');

            const manifest = buildCurrentManifest();
            setIsStartingRun(true);
            const localRunId = createLocalRunId();
            const localRun = createLocalVideoExportRunDetails(data.batch.id, localRunId, manifest, manifest.export_settings);
            setActiveV2Run(localRun);
            setPendingSerials(localRun.items.map((item) => item.serial_number));

            await desktop.startVideoExportRun({
                batchId: data.batch.id,
                runId: localRunId,
                renderManifest: manifest,
                sources: buildDesktopRunSources(),
                overwrite: Boolean(options?.forceOverwrite)
            });
            await refreshLocalRunSnapshot();
            await refreshVideoUploads(data.batch.id).catch(() => null);
            await refreshActiveV2Run(localRunId, { silent: true }).catch(() => null);

            setExportPhase('ready');
            setExportMessage('Локальный запуск экспорта создан. Сервер подключится только на этапе upload.');
            setActiveMode('export');
        } catch (startError) {
            console.error(startError);
            setExportPhase('failed');
            setExportMessage(startError instanceof Error ? startError.message : 'Не удалось создать V2 запуск экспорта.');
        } finally {
            setIsStartingRun(false);
        }
    }, [buildCurrentManifest, buildDesktopRunSources, data, exportBlockedReason, refreshActiveV2Run, refreshLocalRunSnapshot, refreshVideoUploads, runPreflightCheck, setActiveV2Run, setExportPhase, videoUploads]);

    const handleCancelRun = useCallback(async () => {
        if (!data || !activeV2Run) {
            return;
        }

        const desktop = getStonesDesktop();

        try {
            await desktop?.cancelVideoExportRun(activeV2Run.run_id);
            await refreshLocalRunSnapshot();
        } catch (cancelLocalError) {
            console.error(cancelLocalError);
            setExportPhase('failed');
            setExportMessage(cancelLocalError instanceof Error ? cancelLocalError.message : 'Не удалось отменить локальный запуск.');
            return;
        }

        if (activeV2Run.version === 0) {
            setActiveV2Run({
                ...activeV2Run,
                status: 'CANCELLED',
                items: activeV2Run.items.map((item) => ({
                    ...item,
                    status: 'CANCELLED',
                    render_status: 'CANCELLED',
                    upload_status: 'CANCELLED'
                }))
            });
            setExportPhase('cancelled');
            setExportMessage('Локальный запуск отменён до выгрузки на сервер.');
            return;
        }

        try {
            const updatedRun = await cancelServerVideoExportRun(data.batch.id, activeV2Run.run_id) as VideoExportRunDetails;
            setActiveV2Run(updatedRun);
            await refreshLocalRunSnapshot();
            setExportPhase('cancelled');
            setExportMessage('Запуск экспорта отменён.');
        } catch (cancelError) {
            console.error(cancelError);
            setExportPhase('failed');
            setExportMessage(cancelError instanceof Error ? cancelError.message : 'Не удалось отменить запуск.');
        }
    }, [activeV2Run, data, refreshLocalRunSnapshot, setActiveV2Run, setExportPhase]);

    const helperNeedsAttention = helperStatus === 'unavailable' || helperStatus === 'version_mismatch';
    const helperSidebarStatus = isDesktopApp
        ? helperStatus === 'checking'
            ? 'Проверяем внутренний video helper.'
            : helperStatus === 'version_mismatch'
                ? 'Внутренний video helper устарел. Обновите ZAGARAMI admin и перепроверьте статус.'
                : helperStatus === 'unavailable'
                    ? 'Внутренний video helper не запущен.'
                    : 'Внутренний video helper готов'
        : helperStatus === 'checking'
            ? 'Video Tool доступен только в ZAGARAMI admin.'
            : helperStatus === 'version_mismatch'
                ? 'Обновите ZAGARAMI admin.'
                : helperStatus === 'unavailable'
                    ? 'Video Tool доступен только в ZAGARAMI admin.'
                    : 'Готово к работе';
    const helperProblemDescription = isDesktopApp
        ? helperStatus === 'version_mismatch'
            ? 'Установите актуальную версию ZAGARAMI admin и перепроверьте статус.'
            : 'Перезапустите ZAGARAMI admin. Внутренний video helper запускается вместе с приложением. Если проблема повторится, откройте Status Center и скопируйте диагностику.'
        : helperStatus === 'version_mismatch'
            ? 'Обновите ZAGARAMI admin.'
            : 'Откройте Video Tool в ZAGARAMI admin Desktop app.';
    const helperQuickActionTitle = isDesktopApp
        ? helperStatus === 'version_mismatch' ? 'Обновите ZAGARAMI admin' : 'Внутренний video helper требует внимания'
        : helperStatus === 'version_mismatch'
            ? 'Обновите ZAGARAMI admin'
            : 'Нужен ZAGARAMI admin';
    const helperQuickActionDescription = isDesktopApp
        ? helperProblemDescription
        : helperProblemDescription;
    const statusMessage = error
        || exportMessage
        || notice?.message
        || helperIssueMessage
        || helperSidebarStatus;
    const normalizedStatusMessage = statusMessage === 'Load failed'
        ? 'Не удалось загрузить исходник.'
        : statusMessage;
    const statusMessageToneClass = error || exportPhase === 'failed'
        ? 'border-red-500/30 bg-red-500/10 text-red-100'
        : exportPhase === 'completed'
            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
        : notice?.tone === 'warning'
            ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
            : notice?.tone === 'info'
                ? 'border-white/12 bg-white/[0.06] text-gray-100'
                : 'border-zinc-800 bg-zinc-950/80 text-zinc-300';
    const exportMenuRun = useMemo(() => {
        if (!activeV2Run) {
            return null;
        }

        const uploadsByItemId = new Map(videoUploads.map((item) => [item.item_id, item]));
        return {
            run_id: activeV2Run.run_id,
            status: activeV2Run.status,
            version: activeV2Run.version,
            items: activeV2Run.items.map((item) => {
                const upload = uploadsByItemId.get(item.item_id);
                const isUploaded = upload?.status === 'uploaded' && Boolean(upload.item_video_url);
                return {
                    ...item,
                    upload_status: isUploaded ? 'UPLOADED' : item.upload_status || 'PENDING',
                    file_url: upload?.item_video_url ?? item.file_url ?? null,
                    item_card_url: `/clone/${encodeURIComponent(item.serial_number)}`
                };
            })
        };
    }, [activeV2Run, videoUploads]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center overflow-hidden bg-[#111214] text-zinc-200">
                <div className="rounded-2xl border border-zinc-800 bg-[#1a1b1f] px-6 py-5 text-sm tracking-[0.12em] text-zinc-400 uppercase">
                    Загрузка монтажного стола
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex h-screen items-center justify-center overflow-hidden bg-[#111214] px-6 text-zinc-200">
                <div className="w-full max-w-lg rounded-[28px] border border-zinc-800 bg-[#17181c] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {error || 'Не удалось загрузить инструмент монтажа.'}
                    </div>
                    <Link to="/admin/warehouse" className="mt-5 inline-flex items-center rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800">
                        Вернуться на склад
                    </Link>
                </div>
            </div>
        );
    }

    if (!isDesktopApp) {
        return (
            <div className="flex h-screen items-center justify-center overflow-hidden bg-[#111214] px-6 text-zinc-200">
                <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#17181c] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Video Workflow</p>
                    <h1 className="mt-3 text-2xl font-semibold text-zinc-50">Откройте Desktop app</h1>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                        Монтаж видео доступен только в ZAGARAMI admin. Browser helper больше не используется.
                    </p>
                    <Link to="/admin/warehouse" className="mt-6 inline-flex items-center rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800">
                        Вернуться на склад
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden bg-[#0f1013] text-zinc-100 flex flex-col">
            <VideoToolTopNav
                activeMode={activeMode}
                setActiveMode={setActiveMode}
                onBack={() => navigate('/admin/warehouse')}
                batchLabel={data?.batch.id}
                hasHelperIssues={helperNeedsAttention}
            />

            {/* Quick Actions (if helper needs attention) */}
            {helperNeedsAttention && (
                <section
                    data-testid="helper-quick-actions"
                    className="shrink-0 border-b border-amber-400/20 bg-[#22190b] px-4 py-3"
                >
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-[240px] flex-1">
                            <p className="text-sm font-semibold text-amber-50">{helperQuickActionTitle}</p>
                            <p className="mt-1 text-xs leading-5 text-amber-100/75">{helperQuickActionDescription}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {isDesktopApp && (
                                <button
                                    type="button"
                                    data-testid="helper-open-status-center-top"
                                    onClick={() => openDesktopStatusCenter()}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-200 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-100"
                                >
                                    <Clipboard size={14} />
                                    Открыть диагностику
                                </button>
                            )}
                            <button
                                type="button"
                                data-testid="helper-recheck-top"
                                onClick={() => void checkHelper()}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-600 bg-zinc-950/70 px-4 py-2 text-xs font-semibold text-zinc-100 transition hover:border-zinc-400"
                            >
                                <RefreshCw size={14} />
                                Проверить снова
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {/* V2 tabs rendering */}
            <div className="flex-1 min-h-0 flex flex-col">
                {activeMode === 'prepare' && (
                    <PrepareMenu
                        sources={sources}
                        activeSourceIndex={activeSourceIndex}
                        setActiveSourceIndex={setActiveSourceIndex}
                        onSourcePicked={handleSourcePicked}
                        onSourceDeleted={handleSourceDeleted}
                        exportResolution={exportResolution}
                        setExportResolution={setExportResolution}
                        exportQuality={exportQuality}
                        setExportQuality={setExportQuality}
                        exportFps={exportFps}
                        setExportFps={setExportFps}
                        exportAudioNormalize={exportAudioNormalize}
                        setExportAudioNormalize={setExportAudioNormalize}
                        checkHelper={checkHelper}
                        normalizedStatusMessage={normalizedStatusMessage}
                        statusMessageToneClass={statusMessageToneClass}
                        exportBlockedReason={helperBlockReason}
                        preflightIssues={preflightIssues}
                        draft={draft}
                        handleDiscardDraft={handleDiscardDraft}
                        cacheBytes={helperHealth?.cache_bytes}
                        helperDiagnostics={helperDiagnostics}
                        isExporting={isExporting}
                        handleCleanupCache={handleCleanupCache}
                        handleCollectDiagnostics={handleCollectDiagnostics}
                    />
                )}

                {activeMode === 'edit' && (
                    <EditorWorkspace
                        sources={sources}
                        activeSourceIndex={activeSourceIndex}
                        setActiveSourceIndex={setActiveSourceIndex}
                        segments={segments}
                        selectedSegmentIndex={selectedSegmentIndex}
                        setSelectedSegmentIndex={setSelectedSegmentIndex}
                        playheadMs={playheadMs}
                        durationMs={durationMs}
                        timelineViewport={timelineViewport}
                        setTimelineViewport={setTimelineViewport}
                        previewPanelWidth={previewPanelWidth}
                        setPreviewPanelWidth={setPreviewPanelWidth}
                        isPlaying={isPlaying}
                        setIsPlaying={setIsPlaying}
                        sourceUrl={sourceUrl}
                        sourcePreviewUnavailable={sourcePreviewUnavailable}
                        setSources={setSources}
                        setNotice={setNotice}
                        handleLoadedMetadata={handleLoadedMetadata}
                        handlePreviewTimeUpdate={handlePreviewTimeUpdate}
                        videoRef={videoRef}
                        timelineRef={timelineRef}
                        timelineScrollbarRef={timelineScrollbarRef}
                        dragBoundaryIndexRef={dragBoundaryIndexRef}
                        panViewportRef={panViewportRef}
                        previewResizeRef={previewResizeRef}
                        segmentRows={segmentRows}
                        syncVideoTime={syncVideoTime}
                        beginPlayheadDrag={beginPlayheadDrag}
                        pushSegmentsToHistory={pushSegmentsToHistory}
                        handleCut={handleCut}
                        handleToggleDeleted={handleToggleDeleted}
                        handleRestoreAll={handleRestoreAllDeleted}
                        handleResetCuts={handleClearCuts}
                        handleTimelineWheel={handleTimelineWheel}
                        zoomIn={zoomIn}
                        zoomOut={zoomOut}
                        zoomFit={zoomFit}
                        previewOpen={previewOpen}
                        setPreviewOpen={setPreviewOpen}
                        showHelp={showHotkeyHelp}
                        setShowHelp={setShowHotkeyHelp}
                        onVideoError={handleVideoError}
                    />
                )}

                {activeMode === 'export' && (
                    <ExportMenu
                        run={exportMenuRun}
                        localRunSnapshot={localRunSnapshot}
                        preflightIssues={preflightIssues}
                        onCancelRun={handleCancelRun}
                        onStartRun={handleStartRun}
                        serverAssetOrigin={serverAssetOrigin}
                    />
                )}
            </div>

            {isImportingSource && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-zinc-800 bg-[#17181c] p-8 shadow-2xl">
                        <RefreshCw className="h-8 w-8 animate-spin text-zinc-400" />
                        <div className="text-sm font-medium tracking-[0.12em] text-zinc-200 uppercase">
                            Копирование исходника...
                        </div>
                        <div className="text-xs text-zinc-500">
                            Пожалуйста, подождите. Это может занять несколько минут.
                        </div>
                    </div>
                </div>
            )}

            {showOverwriteModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#17181c] p-6 shadow-2xl space-y-6">
                        <div className="flex items-start gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                                <AlertTriangle size={20} />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
                                    Перезапись видео
                                </h3>
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    У некоторых товаров в этой партии уже есть загруженные видео. Вы хотите перезаписать все видео?
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row-reverse gap-2">
                            <button
                                type="button"
                                data-testid="confirm-overwrite"
                                onClick={async () => {
                                    setShowOverwriteModal(false);
                                    await handleStartRun({ forceOverwrite: true });
                                }}
                                className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition"
                            >
                                Да, перезаписать все видео
                            </button>
                            <button
                                type="button"
                                data-testid="cancel-overwrite"
                                onClick={() => setShowOverwriteModal(false)}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition"
                            >
                                Нет
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
