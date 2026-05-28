import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RefreshCw, HardDriveDownload, Clipboard } from 'lucide-react';
import {
    getStonesDesktop,
    isStonesDesktop,
    stageDesktopVideoSourceFile,
    type StonesMediaWorkflowSnapshot
} from '../../../utils/desktop';
import {
    DESKTOP_VIDEO_HELPER_URL,
    HELPER_HEALTH_TIMEOUT_MS,
    PREVIEW_PANEL_MAX_WIDTH,
    PREVIEW_PANEL_MIN_WIDTH,
    PREVIEW_PANEL_WIDTH_STORAGE_KEY,
    TIMELINE_ZOOM_STEP,
    VIDEO_EXPORT_HELPER_PROTOCOL_VERSION,
    VIDEO_EXPORT_HELPER_URL,
    VIDEO_HELPER_DOWNLOAD_URL,
    VIDEO_HELPER_DOWNLOAD_URL_ARM64
} from './constants';
import { draftKeyFor, parseDraft } from './draftStorage';
import {
    buildRenderManifest,
    createSourceFromFingerprint,
    createSourcesFromManifest,
    hydrateSegmentsFromManifest,
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
    VIDEO_EXPORT_HELPER_URL_CANDIDATES,
    buildHelperIssueMessage,
    classifyHelperFetchError,
    getHelperErrorDetail,
    helperFetch,
    revokeObjectUrl
} from './videoHelperClient';
import { useVideoToolHotkeys } from './useVideoToolHotkeys';
import {
    cancelVideoExportRun,
    commitVideoExportRun,
    createVideoExportRun,
    fetchVideoExportRunDetails,
    fetchVideoExportRuns,
    fetchVideoToolPayload,
    uploadVideoExportRunItemManual
} from './videoExportClient';
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
    LocalVideoExportRunSnapshot,
    Segment,
    SourceFingerprint,
    SourceRole,
    TimelineViewport,
    VideoExportManifest,
    VideoExportManifestSlice,
    VideoExportRunDetails,
    VideoExportSettings,
    VideoToolPanViewportState,
    VideoToolPreviewResizeState,
    VideoToolSegmentRow,
    VideoToolDraft,
    VideoToolPayload,
    VideoToolState,
    WorkingSource
} from './types';

const emptyWorkflowSnapshot: StonesMediaWorkflowSnapshot = { workflows: [], counts: {} };
const terminalWorkflowPhases = new Set(['completed', 'cancelled', 'failed']);
const SOURCE_DURATION_TOLERANCE_MS = 1000;

const normalizeDesktopDraft = (batchId: string, value: unknown): VideoToolDraft | null => {
    const draft = value as Partial<VideoToolDraft> | null;
    if (!draft || draft.batchId !== batchId || !Array.isArray(draft.sources) || !Array.isArray(draft.segments)) {
        return null;
    }

    return {
        version: 2,
        batchId,
        sources: draft.sources.map((source) => ({
            sourceIndex: source.sourceIndex,
            role: source.role,
            fingerprint: source.fingerprint,
            helperSourceId: source.helperSourceId ?? null,
            stagedSourceId: source.stagedSourceId ?? null,
            cachePath: source.cachePath ?? null,
            checksumSha256: source.checksumSha256 ?? null,
            previewUrl: typeof source.previewUrl === 'string' && source.previewUrl.startsWith('zagarami-media://') ? source.previewUrl : null,
            previewFileId: source.previewFileId ?? null,
            previewError: source.previewError ?? null
        })),
        segments: normalizeSegments(draft.segments),
        sessionId: draft.sessionId ?? null,
        sessionVersion: draft.sessionVersion ?? null,
        pendingSerials: Array.isArray(draft.pendingSerials) ? draft.pendingSerials : [],
        introHelperSourceId: draft.introHelperSourceId ?? null,
        exportSettings: draft.exportSettings
    };
};

const workflowPhaseLabel: Record<string, string> = {
    queued: 'В очереди',
    converting: 'Конвертация',
    uploading: 'Загрузка',
    verifying: 'Проверка',
    preparing_session: 'Подготовка session',
    importing_sources: 'Импорт исходников',
    rendering_intro: 'Сборка intro',
    rendering_outputs: 'Рендер',
    uploading_outputs: 'Загрузка MP4',
    paused_offline: 'Пауза: нет связи с сервером',
    auth_required: 'Нужен повторный вход',
    failed: 'Ошибка',
    completed: 'Готово',
    cancelled: 'Отменено'
};

const normalizeWorkflowError = (value: string | null | undefined) => {
    const message = String(value || '').trim();
    if (!message) {
        return '';
    }

    if (/fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|ENETUNREACH|network|offline/i.test(message)) {
        return 'Сервер недоступен. Workflow продолжит работу после восстановления связи.';
    }

    if (/401|403|auth|token|войти/i.test(message)) {
        return 'Нужно войти в HQ заново. После входа workflow продолжит работу.';
    }

    return message;
};

const isActiveWorkflow = (workflow: StonesMediaWorkflow | null | undefined) =>
    Boolean(workflow && !terminalWorkflowPhases.has(workflow.phase));

const buildWorkflowStatusText = (workflow: StonesMediaWorkflow | null | undefined) => {
    if (!workflow) {
        return '';
    }

    const phase = workflowPhaseLabel[workflow.phase] || workflow.phase;
    const total = Math.max(workflow.progress.total || 0, 0);
    const completed = Math.min(Math.max(workflow.progress.completed || 0, 0), total || workflow.progress.completed || 0);
    const left = Math.max(total - completed, 0);
    const serial = workflow.summary?.currentSerial ? ` · сейчас ${workflow.summary.currentSerial}` : '';
    const error = normalizeWorkflowError(workflow.lastError);

    return workflow.kind === 'VIDEO_EXPORT_WORKFLOW'
        ? `${phase}: загружено ${completed}/${total}, осталось ${left}${serial}${error ? `. ${error}` : ''}`
        : `${phase}: ${total} фото${error ? `. ${error}` : ''}`;
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
        baseUrl: isStonesDesktop() ? DESKTOP_VIDEO_HELPER_URL : VIDEO_EXPORT_HELPER_URL,
        diagnostics: [],
        accessRequesting: false,
        diagnosticCopied: false
    },
    export: { session: null, pendingSerials: [], renderJobId: '', phase: 'idle', message: '', notice: null },
    layout: { previewPanelWidth: readStoredPreviewPanelWidth() },
    workflow: { snapshot: emptyWorkflowSnapshot }
});

export function VideoToolController() {
    const navigate = useNavigate();
    const params = useParams<{ batchId: string }>();
    const batchId = params.batchId || '';
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const timelineScrollbarRef = useRef<HTMLDivElement | null>(null);
    const dragBoundaryIndexRef = useRef<number | null>(null);
    const dragPlayheadRef = useRef(false);
    const panViewportRef = useRef<VideoToolPanViewportState | null>(null);
    const previewResizeRef = useRef<VideoToolPreviewResizeState | null>(null);
    const segmentHistoryRef = useRef<Segment[][]>([]);
    const sourceObjectUrlsRef = useRef<Set<string>>(new Set());

    const [controllerState, dispatchVideoTool] = useReducer(videoToolReducer, undefined, createInitialVideoToolState);
    const [data, setData] = useState<VideoToolPayload | null>(null);
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
    const [helperAccessRequesting, setHelperAccessRequesting] = useState(false);
    const [helperBaseUrl, setHelperBaseUrl] = useState(() => (
        isStonesDesktop() ? DESKTOP_VIDEO_HELPER_URL : VIDEO_EXPORT_HELPER_URL
    ));
    const [helperDiagnostics, setHelperDiagnostics] = useState<HelperDiagnosticEntry[]>([]);
    const [sources, setSources] = useState<WorkingSource[]>([]);
    const [activeSourceIndex, setActiveSourceIndex] = useState(0);
    const [introHelperSourceId, setIntroHelperSourceId] = useState('');
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
    const [playheadMs, setPlayheadMs] = useState(0);
    const [draft, setDraft] = useState<VideoToolDraft | null>(null);
    const [activeMode, setActiveMode] = useState<'prepare' | 'edit' | 'export'>('prepare');
    const [activeV2Run, setActiveV2Run] = useState<VideoExportRunDetails | null>(null);
    const [localRunSnapshot, setLocalRunSnapshot] = useState<LocalVideoExportRunSnapshot | null>(null);
    const [isStartingRun, setIsStartingRun] = useState(false);
    const [isRefreshingRun, setIsRefreshingRun] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
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
    const [exportResolution, setExportResolution] = useState<'1080p' | '720p'>('1080p');
    const [exportQuality, setExportQuality] = useState<'high' | 'medium' | 'low'>('high');
    const [exportFps, setExportFps] = useState<30 | 60>(30);
    const [exportAudioNormalize, setExportAudioNormalize] = useState(true);
    const previewPanelWidth = controllerState.layout.previewPanelWidth;
    const setPreviewPanelWidth = useCallback((nextWidth: number | ((current: number) => number)) => {
        const resolvedWidth = typeof nextWidth === 'function' ? nextWidth(previewPanelWidth) : nextWidth;
        dispatchVideoTool({ type: 'layout/preview-width', width: resolvedWidth });
    }, [previewPanelWidth]);
    const [previewOpen, setPreviewOpen] = useState(true);
    const [workflowSnapshot, setWorkflowSnapshot] = useState<StonesMediaWorkflowSnapshot>(emptyWorkflowSnapshot);
    const [timelineViewport, setTimelineViewport] = useState<TimelineViewport>({
        zoom: 1,
        visibleStartMs: 0,
        visibleDurationMs: 0,
        isPanning: false
    });

    const expectedOutputCount = data?.batch.expected_output_count ?? 0;
    const durationMs = getTotalSourceDurationMs(sources);
    const activeSource = sources.find((source) => source.sourceIndex === activeSourceIndex) ?? sources[0] ?? null;
    const sourceUrl = activeSource?.previewUrl ?? '';
    const sourcePreviewUnavailable = Boolean(activeSource?.previewUnavailable);
    const visibleDurationMs = durationMs ? (timelineViewport.visibleDurationMs || durationMs) : 0;
    const visibleStartMs = durationMs ? clampVisibleStart(durationMs, timelineViewport.visibleStartMs, visibleDurationMs || durationMs) : 0;
    const visibleEndMs = visibleStartMs + visibleDurationMs;
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
    const isDesktopApp = isStonesDesktop();
    const batchVideoWorkflow = useMemo(() => (
        workflowSnapshot.workflows.find((workflow) =>
            workflow.kind === 'VIDEO_EXPORT_WORKFLOW' && workflow.batchId === batchId
        ) || null
    ), [batchId, workflowSnapshot.workflows]);
    const activeVideoWorkflow = isActiveWorkflow(batchVideoWorkflow) ? batchVideoWorkflow : null;
    const videoWorkflowStatusText = buildWorkflowStatusText(batchVideoWorkflow);
    const missingLocalSources = useMemo(
        () => sources.filter((source) => isDesktopApp ? !source.stagedSourceId : (!source.file && !source.helperSourceId)),
        [isDesktopApp, sources]
    );
    const firstMissingLocalSource = missingLocalSources[0] ?? null;
    const helperDownloadConfigured = Boolean(VIDEO_HELPER_DOWNLOAD_URL);
    const helperDownloadArm64Configured = Boolean(VIDEO_HELPER_DOWNLOAD_URL_ARM64);
    const helperIssueKind = helperStatus === 'version_mismatch'
        ? 'version'
        : !isDesktopApp && helperIssueMessage.includes('Safari блокирует')
            ? 'safari'
        : !isDesktopApp && (helperIssueMessage.includes('заблокировал доступ') || helperIssueMessage.includes('доступ к localhost'))
            ? 'browser'
            : helperIssueMessage.includes('старый Stones Video Helper') || helperIssueMessage.includes('собран не для')
                ? 'old'
                : 'missing';
    const helperNeedsDownload = !isDesktopApp && !['browser', 'safari'].includes(helperIssueKind);
    const helperBlockReason = helperStatus === 'unavailable'
        ? helperIssueKind === 'safari'
            ? 'Откройте страницу в Chrome или Яндекс Браузере.'
            : helperIssueKind === 'browser'
            ? 'Разрешите доступ к localhost.'
            : isDesktopApp ? 'Перезапустите ZAGARAMI admin.' : 'Запустите ZAGARAMI Video Helper.'
        : helperStatus === 'version_mismatch'
            ? isDesktopApp ? 'Обновите ZAGARAMI admin.' : 'Обновите ZAGARAMI Video Helper.'
            : '';
    const exportBlockedReason = activeVideoWorkflow
        ? 'По этой партии уже идет фоновый video workflow.'
        : helperStatus === 'unavailable'
        ? helperBlockReason
        : helperStatus === 'version_mismatch'
            ? helperBlockReason
            : helperStatus !== 'ready'
                ? isDesktopApp ? 'Проверяем встроенный helper.' : 'Проверяем ZAGARAMI Video Helper.'
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
            activeV2Run?.items
                .filter((item) => item.status === 'UPLOADED' || item.upload_status === 'UPLOADED' || Boolean(item.file_url))
                .map((item) => item.serial_number) ?? []
        ),
        [activeV2Run]
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
    const timelineClientXToMs = useCallback((clientX: number, rect: DOMRect) => clamp(
        visibleStartMs + (((clientX - rect.left) / rect.width) * visibleDurationMs),
        0,
        durationMs
    ), [durationMs, visibleDurationMs, visibleStartMs]);
    const syncVideoTime = useCallback((nextMs: number) => {
        const sourceHit = getSourceForGlobalMs(sources, nextMs);
        if (sourceHit && sourceHit.source.sourceIndex !== activeSourceIndex) {
            setActiveSourceIndex(sourceHit.source.sourceIndex);
        }

        if (!videoRef.current) {
            setPlayheadMs(nextMs);
            return;
        }

        videoRef.current.currentTime = Math.max(0, (sourceHit?.localMs ?? nextMs) / 1000);
        setPlayheadMs(nextMs);
    }, [activeSourceIndex, sources]);
    const getSnappedMs = useCallback((targetMs: number) => {
        if (segments.length === 0) return targetMs;
        const boundaries = new Set<number>([0, durationMs]);
        segments.forEach((seg) => {
            boundaries.add(seg.startMs);
            boundaries.add(seg.endMs);
        });

        let closest = targetMs;
        let minDiff = 150; // 150ms snapping threshold

        for (const boundary of boundaries) {
            const diff = Math.abs(boundary - targetMs);
            if (diff < minDiff) {
                minDiff = diff;
                closest = boundary;
            }
        }
        return closest;
    }, [segments, durationMs]);

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

    const applyLoadedExportSettings = useCallback((settings?: VideoExportSettings | null) => {
        if (!settings) {
            return;
        }

        if (settings.resolution) setExportResolution(settings.resolution);
        if (settings.quality) setExportQuality(settings.quality);
        if (settings.fps) setExportFps(settings.fps);
        if (settings.audio_normalize !== undefined) setExportAudioNormalize(settings.audio_normalize);
    }, []);

    const refreshLocalRunSnapshot = useCallback(async (nextBatchId = batchId) => {
        if (!isDesktopApp) {
            setLocalRunSnapshot(null);
            return null;
        }

        const desktop = getStonesDesktop();
        if (!desktop) {
            setLocalRunSnapshot(null);
            return null;
        }

        const snapshot = await desktop.getVideoExportRunSnapshot(nextBatchId).catch(() => null) as LocalVideoExportRunSnapshot | null;
        setLocalRunSnapshot(snapshot);
        return snapshot;
    }, [batchId, isDesktopApp]);

    const refreshActiveV2Run = useCallback(async (
        runId?: string | null,
        options?: { silent?: boolean }
    ) => {
        const targetRunId = runId || activeV2Run?.run_id || null;
        if (!targetRunId) {
            setActiveV2Run(null);
            return null;
        }

        if (!options?.silent) {
            setIsRefreshingRun(true);
        }

        try {
            const nextRun = await fetchVideoExportRunDetails(batchId, targetRunId) as VideoExportRunDetails;
            setActiveV2Run(nextRun);
            applyLoadedExportSettings(nextRun.export_settings ?? nextRun.render_manifest?.export_settings ?? null);
            return nextRun;
        } finally {
            if (!options?.silent) {
                setIsRefreshingRun(false);
            }
        }
    }, [activeV2Run?.run_id, applyLoadedExportSettings, batchId]);

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
            const payload = await fetchVideoToolPayload(batchId);
            setData(payload);
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
                    previewUrl: `${helperBaseUrl}/sources/${helperSourceId}/preview`,
                    previewFileId: draftSource?.previewFileId || helperSourceId,
                    previewError: null,
                    previewUnavailable: false
                };
            };
            const { runs } = await fetchVideoExportRuns(batchId);
            const preferredRun = runs.find((run) => !['COMPLETED', 'CANCELLED'].includes(run.status)) ?? runs[0] ?? null;
            setActiveV2Run(preferredRun as VideoExportRunDetails | null);

            if (preferredRun) {
                const latestRun = await fetchVideoExportRunDetails(batchId, preferredRun.run_id) as VideoExportRunDetails;
                setActiveV2Run(latestRun);
                applyLoadedExportSettings(latestRun.export_settings ?? latestRun.render_manifest?.export_settings ?? null);

                const manifestSources = await Promise.all(createSourcesFromManifest(latestRun.render_manifest).map(async (source) => {
                    const draftSource = existingDraft?.sources.find((entry) =>
                        entry.sourceIndex === source.sourceIndex
                        && entry.fingerprint.name === source.name
                        && entry.fingerprint.size === source.size
                        && Math.abs(entry.fingerprint.durationMs - source.durationMs) <= SOURCE_DURATION_TOLERANCE_MS
                    );
                    const helperSourceId = draftSource?.helperSourceId || '';
                    const previewState = await resolveRestoredPreview(helperSourceId, draftSource);
                    return {
                        ...source,
                        helperSourceId: helperSourceId,
                        stagedSourceId: draftSource?.stagedSourceId || null,
                        cachePath: draftSource?.cachePath || null,
                        checksumSha256: draftSource?.checksumSha256 || null,
                        ...previewState
                    };
                }));
                if (manifestSources.length > 0) {
                    setSources(manifestSources);
                    setActiveSourceIndex(manifestSources[0]?.sourceIndex ?? 0);
                    const manifestSegments = hydrateSegmentsFromManifest(latestRun.render_manifest, manifestSources);
                    if (manifestSegments.length > 0) {
                        setSegments(manifestSegments);
                        setSelectedSegmentIndex(0);
                        setPlayheadMs(0);
                    }
                }

                setPendingSerials(
                    latestRun.items
                        .filter((item) => !['UPLOADED', 'SKIPPED', 'CANCELLED'].includes(item.status))
                        .map((item) => item.serial_number)
                );
            } else if (existingDraft?.sources.length) {
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
            }

            await refreshLocalRunSnapshot(batchId);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить данные инструмента.');
        } finally {
            setLoading(false);
        }
    });

    const helperUrlCandidates = useMemo(() => {
        if (isDesktopApp) {
            return [DESKTOP_VIDEO_HELPER_URL];
        }

        return Array.from(new Set([
            helperBaseUrl,
            ...VIDEO_EXPORT_HELPER_URL_CANDIDATES
        ]));
    }, [helperBaseUrl, isDesktopApp]);

    const fetchHelperHealth = useCallback(async (init?: RequestInit) => {
        let lastError: unknown = null;
        const diagnostics: HelperDiagnosticEntry[] = [];

        if (isDesktopApp) {
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
            const detail = payload.error || (payload.ok ? 'Embedded helper ответил через IPC.' : 'Embedded helper недоступен.');
            const diagnostic: HelperDiagnosticEntry = {
                url: 'desktop-ipc',
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
                helperUrl: 'desktop-ipc',
                response: { ok: payload.ok, status: payload.ok ? 200 : 503 },
                payload
            };
        }

        for (const helperUrl of helperUrlCandidates) {
            for (const mode of ['standard', 'pna'] as const) {
                const controller = new AbortController();
                const timeoutId = window.setTimeout(() => controller.abort(), HELPER_HEALTH_TIMEOUT_MS);
                try {
                    const response = await helperFetch(helperUrl, '/health', {
                        ...init,
                        signal: controller.signal
                    }, { useTargetAddressSpace: mode === 'pna' });
                    const payload = await response.json().catch(() => ({ error: 'Helper не отвечает.' })) as HelperHealthPayload;
                    const detail = payload.error || (response.ok ? 'Helper ответил.' : `HTTP ${response.status}`);
                    const diagnostic: HelperDiagnosticEntry = {
                        url: helperUrl,
                        mode,
                        status: response.ok && payload.ok
                            ? payload.protocol_version === VIDEO_EXPORT_HELPER_PROTOCOL_VERSION
                                ? 'ok'
                                : 'bad protocol'
                            : detail.includes('Origin helper запроса') || detail.includes('Private Network')
                                ? 'cors/pna failed'
                                : 'connection failed',
                        detail,
                        httpStatus: response.status,
                        protocolVersion: payload.protocol_version,
                        pageOrigin: payload.pageOrigin || (typeof window !== 'undefined' ? window.location.origin : undefined),
                        allowedOrigins: payload.allowed_origins || payload.allowedOrigins,
                        expectedPort: payload.expected_port,
                        discoveredPort: payload.discovered_port,
                        storageRoot: payload.storage_root
                    };
                    diagnostics.push(diagnostic);
                    setHelperDiagnostics(diagnostics);
                    return { helperUrl, response, payload };
                } catch (helperError) {
                    lastError = helperError;
                    diagnostics.push({
                        url: helperUrl,
                        mode,
                        status: classifyHelperFetchError(helperError),
                        detail: getHelperErrorDetail(helperError)
                    });
                } finally {
                    window.clearTimeout(timeoutId);
                    setHelperDiagnostics(diagnostics);
                }
            }
        }

        throw lastError instanceof Error ? lastError : new Error('Локальный helper не отвечает.');
    }, [helperUrlCandidates, isDesktopApp]);

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

            setHelperBaseUrl(isDesktopApp ? DESKTOP_VIDEO_HELPER_URL : helperUrl);
            setHelperHealth(payload);
            if (payload.protocol_version !== VIDEO_EXPORT_HELPER_PROTOCOL_VERSION) {
                setHelperIssueMessage(isDesktopApp
                    ? 'Встроенный helper устарел. Обновите ZAGARAMI admin и перепроверьте статус.'
                    : 'Локальный helper устарел. Скачайте актуальную версию для zagarami.com и перепроверьте статус.');
                setHelperStatus('version_mismatch');
                return;
            }

            setHelperIssueMessage('');
            setHelperStatus('ready');
        } catch (helperError) {
            setHelperHealth(null);
            setHelperIssueMessage(buildHelperIssueMessage(helperError instanceof Error ? helperError.message : '', {
                helperBaseUrl
            }));
            setHelperStatus('unavailable');
            console.error(helperError);
        }
    }, [fetchHelperHealth, helperBaseUrl, isDesktopApp, setHelperIssueMessage, setHelperStatus]);
    const requestHelperBrowserAccess = async () => {
        setHelperAccessRequesting(true);
        setHelperStatus('checking');
        setHelperIssueMessage('');
        try {
            const { helperUrl, response, payload } = await fetchHelperHealth({ cache: 'no-store' });
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

            setHelperBaseUrl(helperUrl);
            setHelperHealth(payload);
            setHelperStatus(payload.protocol_version === VIDEO_EXPORT_HELPER_PROTOCOL_VERSION ? 'ready' : 'version_mismatch');
            setHelperIssueMessage(payload.protocol_version === VIDEO_EXPORT_HELPER_PROTOCOL_VERSION
                ? ''
                : isDesktopApp
                    ? 'Встроенный helper устарел. Обновите ZAGARAMI admin и перепроверьте статус.'
                    : 'Локальный helper устарел. Скачайте актуальную версию для zagarami.com и перепроверьте статус.');
        } catch (helperError) {
            setHelperHealth(null);
            setHelperIssueMessage(buildHelperIssueMessage(helperError instanceof Error ? helperError.message : '', {
                helperBaseUrl
            }));
            setHelperStatus('unavailable');
            console.error(helperError);
        } finally {
            setHelperAccessRequesting(false);
        }
    };
    const openHelperDownload = () => {
        if (!helperDownloadConfigured) {
            return;
        }

        window.open(VIDEO_HELPER_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
    };
    const openHelperDownloadArm64 = () => {
        if (!helperDownloadArm64Configured) {
            return;
        }

        window.open(VIDEO_HELPER_DOWNLOAD_URL_ARM64, '_blank', 'noopener,noreferrer');
    };
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
        if (!isDesktopApp) {
            return;
        }

        const desktop = getStonesDesktop();
        if (!desktop) {
            return;
        }

        let cancelled = false;
        void desktop.getMediaWorkflowSnapshot()
            .then((snapshot) => {
                if (!cancelled) {
                    setWorkflowSnapshot(snapshot);
                }
            })
            .catch(() => undefined);

        const unsubscribe = desktop.subscribeMediaWorkflows(setWorkflowSnapshot);
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [isDesktopApp]);

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
            sessionId: activeV2Run?.run_id || null,
            sessionVersion: activeV2Run?.version || null,
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
            void refreshActiveV2Run(activeV2Run.run_id, { silent: true }).catch(() => undefined);
        }, 1500);

        return () => window.clearInterval(intervalId);
    }, [activeV2Run?.run_id, isDesktopApp, refreshActiveV2Run, refreshLocalRunSnapshot]);

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

            if (dragPlayheadRef.current && timelineRef.current && durationMs && visibleDurationMs) {
                const rect = timelineRef.current.getBoundingClientRect();
                const nextMs = timelineClientXToMs(event.clientX, rect);
                const snappedMs = getSnappedMs(nextMs);
                syncVideoTime(snappedMs);
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
            dragPlayheadRef.current = false;
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
    }, [clampPreviewPanelWidth, durationMs, getSnappedMs, segments, setPreviewPanelWidth, syncVideoTime, timelineClientXToMs, updateTimelineViewport, visibleDurationMs]);

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

        if (playheadMs < visibleStartMs) {
            updateTimelineViewport(playheadMs - (visibleDurationMs * 0.08), visibleDurationMs);
            return;
        }

        if (playheadMs > visibleEndMs) {
            updateTimelineViewport(playheadMs - (visibleDurationMs * 0.92), visibleDurationMs);
        }
    }, [durationMs, playheadMs, updateTimelineViewport, visibleDurationMs, visibleEndMs, visibleStartMs]);

    useEffect(() => {
        const nextSelectedIndex = segments.findIndex((segment, index) => {
            const isLastSegment = index === segments.length - 1;
            return playheadMs >= segment.startMs && (playheadMs < segment.endMs || (isLastSegment && playheadMs <= segment.endMs));
        });
        if (nextSelectedIndex >= 0 && nextSelectedIndex !== selectedSegmentIndex) {
            setSelectedSegmentIndex(nextSelectedIndex);
        }
    }, [durationMs, playheadMs, segments, selectedSegmentIndex]);

    const handleSourcePicked = (file: File | null, mode: 'first' | 'append' = 'first', targetSourceIndex?: number) => {
        if (!file) {
            return;
        }

        const sourceIndex = typeof targetSourceIndex === 'number' ? targetSourceIndex : mode === 'first' ? 0 : sources.length;
        const existingSource = sources.find((source) => source.sourceIndex === sourceIndex) ?? null;
        const role: SourceRole = existingSource?.role ?? (sourceIndex === 0 ? 'WITH_INTRO' : 'NO_INTRO');
        const preserveExistingTimeline = Boolean(existingSource && (mode === 'first' || mode === 'append'));
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
        void importSourceIntoHelper(file, sourceIndex, role, nextObjectUrl, {
            preserveTimeline: preserveExistingTimeline,
            expectedFingerprint: existingSource
        });
    };

    const handleLoadedMetadata = () => {
        if (!activeSource || !videoRef.current || !Number.isFinite(videoRef.current.duration) || videoRef.current.duration <= 0) {
            return;
        }

        setSources((current) => current.map((source) => source.sourceIndex === activeSource.sourceIndex
            ? { ...source, previewUnavailable: false }
            : source));
    };

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
            expectedFingerprint?: SourceFingerprint | null;
        }
    ) => {
        try {
            let stagedSource: Awaited<ReturnType<typeof stageDesktopVideoSourceFile>> | null = null;
            let payload: Partial<HelperSourceUploadPayload> & { error?: string };

            if (isDesktopApp) {
                const desktop = getStonesDesktop();
                if (!desktop) {
                    throw new Error('Desktop API недоступен.');
                }

                stagedSource = await stageDesktopVideoSourceFile(file);
                payload = await desktop.importVideoSource({
                    stagedSourceId: stagedSource.stagedSourceId,
                    cachePath: stagedSource.cachePath,
                    originalName: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    size: stagedSource.size,
                    lastModified: file.lastModified
                });
            } else {
                const form = new FormData();
                form.append('file', file);
                form.append('lastModified', String(file.lastModified));

                const response = await helperFetch(helperBaseUrl, '/sources', {
                    method: 'POST',
                    body: form
                });
                payload = await response.json().catch(() => ({ error: 'Не удалось загрузить исходник в helper.' })) as Partial<HelperSourceUploadPayload> & { error?: string };
                if (!response.ok) {
                    throw new Error(buildHelperIssueMessage(payload.error || 'Не удалось загрузить исходник в helper.', {
                        helperBaseUrl,
                        pageOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
                        allowedOrigins: helperHealth?.allowed_origins,
                        storageRoot: helperHealth?.storage_root
                    }));
                }
            }

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
                } else {
                    try {
                        previewUrl = `${helperBaseUrl}${new URL(payload.preview_url).pathname}`;
                    } catch {
                        previewUrl = payload.preview_url;
                    }
                }
            }
            if (isDesktopApp && (!payload.preview_created || !payload.preview_file_id || !previewUrl.startsWith('zagarami-media://'))) {
                throw new Error(payload.preview_error || 'Helper не создал desktop preview для исходника.');
            }

            const nextSource = createSourceFromFingerprint(sourceIndex, role, expectedFingerprint || nextFingerprint, {
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

            const baseSources = sourceIndex === 0
                ? []
                : sources.filter((source) => source.sourceIndex !== sourceIndex);
            const nextSources = [...baseSources, nextSource].sort((left, right) => left.sourceIndex - right.sourceIndex);
            setSources(nextSources);
            setSegments((currentSegments) => (
                sourceIndex === 0
                    ? createFirstSourceSegments(nextSource)
                    : appendInitialSourceSegment(currentSegments, nextSource, nextSources)
            ));
            setTimelineViewport({
                zoom: 1,
                visibleStartMs: 0,
                visibleDurationMs: getTotalSourceDurationMs(nextSources),
                isPanning: false
            });
            setSelectedSegmentIndex(0);
            setPlayheadMs(0);

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

    const buildManifestSliceForItem = useCallback((itemId: string, manifest: VideoExportManifest): VideoExportManifestSlice => {
        const output = manifest.outputs.find((entry) => entry.item_id === itemId);
        if (!output) {
            throw new Error('Не найден output для выбранного item.');
        }

        const introSegment = manifest.segments.find((segment) => segment.sequence === 0);
        const targetSegment = manifest.segments.find((segment) => segment.sequence === output.segment_seq);
        if (!introSegment || !targetSegment) {
            throw new Error('Не удалось собрать manifest slice для перерендера.');
        }

        return {
            segments: [introSegment, targetSegment],
            outputs: [output]
        };
    }, []);

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
        || activeVideoWorkflow
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
                    helperBaseUrl,
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

    const handleStartRun = useCallback(async () => {
        if (!data) {
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
            setExportMessage('Подготавливаем V2 запуск экспорта...');
            runPreflightCheck();

            const manifest = buildCurrentManifest();
            setIsStartingRun(true);
            const created = await createVideoExportRun(
                data.batch.id,
                data.batch.expected_output_count,
                manifest,
                manifest.export_settings
            );
            const nextRun = created.run as VideoExportRunDetails;
            setActiveV2Run(nextRun);
            setPendingSerials(nextRun.items.map((item) => item.serial_number));

            await desktop.startVideoExportRun({
                batchId: data.batch.id,
                runId: nextRun.run_id,
                renderManifest: manifest,
                sources: buildDesktopRunSources()
            });
            await refreshLocalRunSnapshot();
            await refreshActiveV2Run(nextRun.run_id);

            setExportPhase('ready');
            setExportMessage(created.resumed ? 'V2 запуск экспорта восстановлен.' : 'V2 запуск экспорта создан.');
            setActiveMode('export');
        } catch (startError) {
            console.error(startError);
            setExportPhase('failed');
            setExportMessage(startError instanceof Error ? startError.message : 'Не удалось создать V2 запуск экспорта.');
        } finally {
            setIsStartingRun(false);
        }
    }, [buildCurrentManifest, buildDesktopRunSources, data, exportBlockedReason, refreshActiveV2Run, refreshLocalRunSnapshot, runPreflightCheck, setExportPhase]);

    const handleStartRender = useCallback(async (itemId: string) => {
        if (!data || !activeV2Run) {
            return;
        }

        const desktop = getStonesDesktop();
        if (!desktop) {
            setExportPhase('failed');
            setExportMessage('Desktop workflow недоступен.');
            return;
        }

        try {
            setExportPhase('rendering');
            setExportMessage('Запускаем рендер и загрузку по товару...');
            await desktop.renderVideoExportItem({ batchId: data.batch.id, runId: activeV2Run.run_id, itemId });
            await desktop.uploadVideoExportItem({ batchId: data.batch.id, runId: activeV2Run.run_id, itemId });
            await refreshLocalRunSnapshot();
            await refreshActiveV2Run(activeV2Run.run_id);
            setExportPhase('uploading');
            setExportMessage('Рендер и загрузка поставлены в обработку.');
        } catch (renderError) {
            console.error(renderError);
            setExportPhase('failed');
            setExportMessage(renderError instanceof Error ? renderError.message : 'Не удалось запустить рендер элемента.');
        }
    }, [activeV2Run, data, refreshActiveV2Run, refreshLocalRunSnapshot, setExportPhase]);

    const handleRetryUpload = useCallback(async (itemId: string) => {
        if (!activeV2Run) {
            return;
        }

        const desktop = getStonesDesktop();
        if (!desktop) {
            setExportPhase('failed');
            setExportMessage('Desktop workflow недоступен.');
            return;
        }

        try {
            setExportPhase('uploading');
            setExportMessage('Повторяем загрузку элемента...');
            await desktop.retryVideoExportItemUpload(activeV2Run.run_id, itemId);
            await refreshLocalRunSnapshot();
            await refreshActiveV2Run(activeV2Run.run_id);
        } catch (retryError) {
            console.error(retryError);
            setExportPhase('failed');
            setExportMessage(retryError instanceof Error ? retryError.message : 'Не удалось повторить загрузку.');
        }
    }, [activeV2Run, refreshActiveV2Run, refreshLocalRunSnapshot, setExportPhase]);

    const handleRerender = useCallback(async (itemId: string) => {
        if (!data || !activeV2Run) {
            return;
        }

        const desktop = getStonesDesktop();
        if (!desktop) {
            setExportPhase('failed');
            setExportMessage('Desktop workflow недоступен.');
            return;
        }

        try {
            const manifest = buildCurrentManifest();
            const manifestSlice = buildManifestSliceForItem(itemId, manifest);
            setExportPhase('rendering');
            setExportMessage('Перерендериваем товар по актуальному таймлайну...');
            await desktop.rerenderVideoExportItem(activeV2Run.run_id, itemId, manifestSlice);
            await desktop.uploadVideoExportItem({ batchId: data.batch.id, runId: activeV2Run.run_id, itemId });
            await refreshLocalRunSnapshot();
            await refreshActiveV2Run(activeV2Run.run_id);
        } catch (rerenderError) {
            console.error(rerenderError);
            setExportPhase('failed');
            setExportMessage(rerenderError instanceof Error ? rerenderError.message : 'Не удалось перерендерить элемент.');
        }
    }, [activeV2Run, buildCurrentManifest, buildManifestSliceForItem, data, refreshActiveV2Run, refreshLocalRunSnapshot, setExportPhase]);

    const handleCancelItem = useCallback(async (itemId: string) => {
        if (!activeV2Run) {
            return;
        }

        const desktop = getStonesDesktop();
        if (!desktop) {
            setExportPhase('failed');
            setExportMessage('Desktop workflow недоступен.');
            return;
        }

        try {
            await desktop.cancelVideoExportItem(activeV2Run.run_id, itemId);
            await refreshLocalRunSnapshot();
            await refreshActiveV2Run(activeV2Run.run_id);
            setExportPhase('cancelled');
            setExportMessage('Элемент отменён.');
        } catch (cancelError) {
            console.error(cancelError);
            setExportPhase('failed');
            setExportMessage(cancelError instanceof Error ? cancelError.message : 'Не удалось отменить элемент.');
        }
    }, [activeV2Run, refreshActiveV2Run, refreshLocalRunSnapshot, setExportPhase]);

    const handleManualReplace = useCallback(async (itemId: string, file: File) => {
        if (!data || !activeV2Run) {
            return;
        }

        const targetItem = activeV2Run.items.find((item) => item.item_id === itemId);
        if (!targetItem) {
            setExportPhase('failed');
            setExportMessage('Элемент для ручной замены не найден.');
            return;
        }

        try {
            setExportPhase('uploading');
            setExportMessage('Загружаем MP4 вручную...');
            const updatedRun = await uploadVideoExportRunItemManual(
                data.batch.id,
                activeV2Run.run_id,
                itemId,
                targetItem.serial_number,
                file
            ) as VideoExportRunDetails;
            setActiveV2Run(updatedRun);
            setPendingSerials(updatedRun.items
                .filter((item) => !['UPLOADED', 'SKIPPED', 'CANCELLED'].includes(item.status))
                .map((item) => item.serial_number));
            await refreshLocalRunSnapshot();
            setExportPhase('completed');
            setExportMessage('Файл заменён вручную.');
        } catch (uploadError) {
            console.error(uploadError);
            setExportPhase('failed');
            setExportMessage(uploadError instanceof Error ? uploadError.message : 'Не удалось заменить файл вручную.');
        }
    }, [activeV2Run, data, refreshLocalRunSnapshot, setExportPhase]);

    const handleCommitRun = useCallback(async () => {
        if (!data || !activeV2Run) {
            return;
        }

        setIsCommitting(true);
        try {
            const updatedRun = await commitVideoExportRun(data.batch.id, activeV2Run.run_id) as VideoExportRunDetails;
            setActiveV2Run(updatedRun);
            setPendingSerials([]);
            setData((current) => current ? {
                ...current,
                items: current.items.map((item) => {
                    const runItem = updatedRun.items.find((entry) => entry.item_id === item.id);
                    return runItem?.file_url
                        ? { ...item, item_video_url: runItem.file_url }
                        : item;
                })
            } : current);
            clearSavedDraft();
            setDraft(null);
            setExportPhase('completed');
            setExportMessage('Результаты V2 экспорта применены.');
        } catch (commitError) {
            console.error(commitError);
            setExportPhase('failed');
            setExportMessage(commitError instanceof Error ? commitError.message : 'Не удалось применить результаты экспорта.');
        } finally {
            setIsCommitting(false);
        }
    }, [activeV2Run, clearSavedDraft, data, setExportPhase]);

    const handleCancelRun = useCallback(async () => {
        if (!data || !activeV2Run) {
            return;
        }

        try {
            const updatedRun = await cancelVideoExportRun(data.batch.id, activeV2Run.run_id) as VideoExportRunDetails;
            setActiveV2Run(updatedRun);
            await refreshLocalRunSnapshot();
            setExportPhase('cancelled');
            setExportMessage('Запуск экспорта отменён.');
        } catch (cancelError) {
            console.error(cancelError);
            setExportPhase('failed');
            setExportMessage(cancelError instanceof Error ? cancelError.message : 'Не удалось отменить запуск.');
        }
    }, [activeV2Run, data, refreshLocalRunSnapshot, setExportPhase]);

    const helperNeedsAttention = helperStatus === 'unavailable' || helperStatus === 'version_mismatch';
    const helperSidebarStatus = isDesktopApp
        ? helperStatus === 'checking'
            ? 'Проверяем встроенный helper.'
            : helperStatus === 'version_mismatch'
                ? 'Встроенный helper устарел. Обновите ZAGARAMI admin и перепроверьте статус.'
                : helperStatus === 'unavailable'
                    ? 'Встроенный helper не запущен.'
                    : 'Встроенный helper готов'
        : helperStatus === 'checking'
            ? 'Проверяем локальный helper.'
            : helperStatus === 'version_mismatch'
                ? 'Локальный helper устарел. Обновите приложение и перепроверьте статус.'
                : helperStatus === 'unavailable'
                    ? helperIssueKind === 'safari'
                        ? 'Safari не поддерживает текущий доступ к helper.'
                        : helperIssueKind === 'browser'
                            ? 'Доступ к helper заблокирован браузером.'
                            : 'Локальный helper не найден или не запущен.'
                    : 'Готово к работе';
    const helperProblemDescription = isDesktopApp
        ? helperStatus === 'version_mismatch'
            ? 'Установите актуальную версию ZAGARAMI admin и перепроверьте статус.'
            : 'Перезапустите ZAGARAMI admin. Встроенный helper запускается вместе с приложением. Если проблема повторится, откройте Status Center и скопируйте диагностику.'
        : helperStatus === 'version_mismatch'
            ? 'Скачайте актуальную версию для zagarami.com, откройте приложение и перепроверьте статус.'
            : helperIssueKind === 'safari'
                ? 'Safari блокирует локальный HTTP helper с production HTTPS-страницы. Для текущей версии инструмента используйте Chrome или Яндекс Браузер.'
                : helperIssueKind === 'browser'
                    ? 'Нажмите «Разрешить доступ», подтвердите запрос браузера к локальной сети или localhost, затем перепроверьте статус.'
                    : helperIssueKind === 'old'
                        ? 'Закройте Stones Video Helper, удалите старое приложение и запустите ZAGARAMI Video Helper.'
                        : 'Откройте ZAGARAMI Video Helper на Mac. Если приложения нет, скачайте подходящий DMG.';
    const helperQuickActionTitle = isDesktopApp
        ? helperStatus === 'version_mismatch' ? 'Обновите ZAGARAMI admin' : 'Встроенный helper требует внимания'
        : helperStatus === 'version_mismatch'
            ? 'Обновите desktop helper'
            : helperIssueKind === 'safari'
                ? 'Safari блокирует helper'
                : helperIssueKind === 'browser'
                    ? 'Helper не отвечает в браузере'
                    : 'Нужен ZAGARAMI Video Helper';
    const helperQuickActionDescription = isDesktopApp
        ? helperProblemDescription
        : helperIssueKind === 'safari'
            ? 'Chrome уже поддерживает этот сценарий после последнего исправления. В Safari текущая HTTP-связка с локальным helper остаётся заблокированной.'
            : helperIssueKind === 'browser'
                ? 'Сайт может вызвать запрос доступа только по клику. Если браузер не покажет окно, разрешение уже заблокировано в настройках браузера или macOS.'
                : helperProblemDescription;
    const statusMessage = error
        || (activeVideoWorkflow ? videoWorkflowStatusText : '')
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
    const exportMenuRun = useMemo(() => (
        activeV2Run
            ? {
                run_id: activeV2Run.run_id,
                status: activeV2Run.status,
                version: activeV2Run.version,
                items: activeV2Run.items.map((item) => ({
                    ...item,
                    render_status: item.render_status || '',
                    upload_status: item.upload_status || ''
                }))
            }
            : null
    ), [activeV2Run]);

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
                            {helperIssueKind === 'browser' && (
                                <button
                                    type="button"
                                    data-testid="helper-request-access-top"
                                    onClick={() => void requestHelperBrowserAccess()}
                                    disabled={helperAccessRequesting}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-200 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <RefreshCw size={14} />
                                    {helperAccessRequesting ? 'Запрашиваем доступ' : 'Разрешить доступ'}
                                </button>
                            )}
                            {helperNeedsDownload && helperDownloadArm64Configured && (
                                <button
                                    type="button"
                                    data-testid="helper-download-arm64-top"
                                    onClick={openHelperDownloadArm64}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-200 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-100"
                                >
                                    <HardDriveDownload size={14} />
                                    Скачать Apple Silicon
                                </button>
                            )}
                            {helperNeedsDownload && helperDownloadConfigured && (
                                <button
                                    type="button"
                                    data-testid="helper-download-top"
                                    onClick={openHelperDownload}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:bg-amber-200/15"
                                >
                                    <HardDriveDownload size={14} />
                                    Скачать Intel
                                </button>
                            )}
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
                        setPlayheadMs={setPlayheadMs}
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
                        videoRef={videoRef}
                        timelineScrollbarRef={timelineScrollbarRef}
                        dragPlayheadRef={dragPlayheadRef}
                        dragBoundaryIndexRef={dragBoundaryIndexRef}
                        panViewportRef={panViewportRef}
                        previewResizeRef={previewResizeRef}
                        segmentRows={segmentRows}
                        syncVideoTime={syncVideoTime}
                        pushSegmentsToHistory={pushSegmentsToHistory}
                        handleCut={handleCut}
                        handleToggleDeleted={handleToggleDeleted}
                        handleRestoreAll={handleRestoreAllDeleted}
                        handleResetCuts={handleClearCuts}
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
                        onStartRender={handleStartRender}
                        onRetryUpload={handleRetryUpload}
                        onRerender={handleRerender}
                        onCancelItem={handleCancelItem}
                        onManualReplace={handleManualReplace}
                        onCommitRun={handleCommitRun}
                        onCancelRun={handleCancelRun}
                        onStartRun={handleStartRun}
                        isExporting={isExporting}
                        isCommitting={isCommitting}
                    />
                )}
            </div>
        </div>
    );
}
