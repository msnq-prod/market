import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Scissors, Trash2, Upload, RefreshCw, Play, Pause, HardDriveDownload, Ban, Minus, Plus, Maximize2, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui';
import { authFetch } from '../../utils/authFetch';

const VIDEO_EXPORT_HELPER_URL = 'http://127.0.0.1:3012';
const VIDEO_EXPORT_HELPER_PROTOCOL_VERSION = 'stones-video-export-helper-v2';
const VIDEO_HELPER_DOWNLOAD_URL = (import.meta.env.VITE_VIDEO_HELPER_DOWNLOAD_URL || '').trim();
const MIN_SEGMENT_DURATION_MS = 200;
const CROSSFADE_MS = 200;
const TIMELINE_ZOOM_STEP = 1.2;
const TIMELINE_RULER_STEPS_MS = [
    500,
    1000,
    2000,
    5000,
    10000,
    15000,
    30000,
    60000,
    120000,
    300000,
    600000,
    900000
];

type VideoToolBatch = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    collected_date: string | null;
    collected_time: string | null;
    daily_batch_seq: number | null;
    expected_output_count: number;
    video_processing: {
        job_id: string;
        status: string;
    } | null;
    video_export: VideoExportSessionSummary | null;
};

type VideoToolItem = {
    id: string;
    temp_id: string;
    item_seq: number | null;
    serial_number: string | null;
    item_video_url: string | null;
};

type VideoExportSessionSummary = {
    session_id: string;
    status: string;
    version: number;
    expected_count: number;
    uploaded_count: number;
    crossfade_ms: number;
    error_message: string | null;
    started_at: string | null;
    finished_at: string | null;
};

type RetryTailPayload = {
    session: VideoExportSessionDetails;
    pending_serials: string[];
    resumed: boolean;
    recovered_stale: boolean;
};

type VideoExportManifest = {
    segments: Array<{
        sequence: number;
        start_ms: number;
        end_ms: number;
    }>;
    outputs: Array<{
        segment_seq: number;
        serial_number: string;
        item_id: string;
    }>;
};

type VideoExportSessionDetails = VideoExportSessionSummary & {
    source_fingerprint: SourceFingerprint | null;
    render_manifest: VideoExportManifest | null;
    uploaded_manifest: Array<{
        serial_number: string;
        item_id: string;
        file_name: string;
        relative_path: string;
        public_url: string;
        uploaded_at: string;
    }>;
    created_at: string;
    updated_at: string;
};

type VideoToolPayload = {
    batch: VideoToolBatch;
    product: {
        id: string;
        country_code: string;
        location_code: string;
        item_code: string;
        translations: Array<{
            language_id: number;
            name: string;
            description: string;
        }>;
    } | null;
    items: VideoToolItem[];
};

type Segment = {
    sequence: number;
    startMs: number;
    endMs: number;
    deleted?: boolean;
};

type SourceFingerprint = {
    name: string;
    size: number;
    lastModified: number;
    durationMs: number;
};

type VideoToolDraft = {
    version: 1;
    batchId: string;
    sourceFingerprint: SourceFingerprint;
    segments: Segment[];
    sessionId: string | null;
    sessionVersion: number | null;
    pendingSerials: string[];
    helperSourceId: string | null;
};

type ExportPhase = 'idle' | 'preparing' | 'retrying' | 'rendering' | 'uploading' | 'completed' | 'cancelled' | 'error';
type HelperStatus = 'checking' | 'ready' | 'unavailable' | 'version_mismatch';

type HelperHealthPayload = {
    ok: boolean;
    helper_version?: string;
    protocol_version?: string;
    storage_root?: string;
    free_bytes?: number;
    allowed_origins?: string[];
    queued_jobs?: number;
    error?: string;
};

type HelperSourceUploadPayload = {
    source_id: string;
    duration_ms: number;
    has_audio: boolean;
    video_codec?: string;
    format_name?: string;
    preview_url?: string;
    fingerprint: SourceFingerprint;
};

type NoticeTone = 'info' | 'warning' | 'error';

type InlineNotice = {
    tone: NoticeTone;
    message: string;
};

type TimelineViewport = {
    zoom: number;
    visibleStartMs: number;
    visibleDurationMs: number;
    isPanning: boolean;
};

const draftKeyFor = (batchId: string) => `video-tool-draft:${batchId}`;
const padSequence = (sequence: number) => String(sequence).padStart(3, '0');
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sleep = (delayMs: number) => new Promise((resolve) => window.setTimeout(resolve, delayMs));
const getTimelineMinVisibleDuration = (durationMs: number) => {
    if (!durationMs) {
        return MIN_SEGMENT_DURATION_MS * 4;
    }

    return Math.max(1500, Math.min(durationMs, Math.round(durationMs / 40)));
};
const clampVisibleDuration = (durationMs: number, proposedVisibleDurationMs: number) => {
    if (!durationMs) {
        return 0;
    }

    return clamp(
        Math.round(proposedVisibleDurationMs),
        Math.min(durationMs, getTimelineMinVisibleDuration(durationMs)),
        durationMs
    );
};
const clampVisibleStart = (durationMs: number, proposedVisibleStartMs: number, visibleDurationMs: number) => clamp(
    Math.round(proposedVisibleStartMs),
    0,
    Math.max(0, durationMs - visibleDurationMs)
);
const getRulerStepMs = (visibleDurationMs: number) => {
    const targetStep = Math.max(500, visibleDurationMs / 7);
    return TIMELINE_RULER_STEPS_MS.find((step) => step >= targetStep) || TIMELINE_RULER_STEPS_MS[TIMELINE_RULER_STEPS_MS.length - 1];
};
const buildRulerMarks = (visibleStartMs: number, visibleDurationMs: number) => {
    if (!visibleDurationMs) {
        return [];
    }

    const visibleEndMs = visibleStartMs + visibleDurationMs;
    const stepMs = getRulerStepMs(visibleDurationMs);
    const firstMarkMs = Math.floor(visibleStartMs / stepMs) * stepMs;
    const marks: number[] = [];

    for (let currentMs = firstMarkMs; currentMs <= visibleEndMs + stepMs; currentMs += stepMs) {
        if (currentMs >= visibleStartMs - stepMs) {
            marks.push(currentMs);
        }
    }

    return marks;
};
const getVisibleWindowStyle = (startMs: number, endMs: number, visibleStartMs: number, visibleDurationMs: number) => {
    const visibleEndMs = visibleStartMs + visibleDurationMs;
    const clippedStartMs = Math.max(startMs, visibleStartMs);
    const clippedEndMs = Math.min(endMs, visibleEndMs);

    if (clippedEndMs <= clippedStartMs || visibleDurationMs <= 0) {
        return null;
    }

    return {
        left: `${((clippedStartMs - visibleStartMs) / visibleDurationMs) * 100}%`,
        width: `${((clippedEndMs - clippedStartMs) / visibleDurationMs) * 100}%`
    };
};
const exportPhaseLabel: Record<ExportPhase, string> = {
    idle: 'Ожидание',
    preparing: 'Подготовка',
    retrying: 'Дозагрузка',
    rendering: 'Рендер',
    uploading: 'Загрузка',
    completed: 'Готово',
    cancelled: 'Отменено',
    error: 'Ошибка'
};
const sessionStatusLabel: Record<string, string> = {
    OPEN: 'Черновик',
    UPLOADING: 'Загрузка',
    COMPLETED: 'Готово',
    FAILED: 'Ошибка',
    CANCELLED: 'Отменено',
    ABANDONED: 'Зависло'
};
const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const formatDuration = (durationMs: number) => {
    const seconds = Math.max(0, durationMs / 1000);
    if (seconds < 60) {
        return `${seconds.toFixed(2)} c`;
    }

    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds - minutes * 60;
    return `${minutes}:${restSeconds.toFixed(2).padStart(5, '0')}`;
};

const normalizeSegments = (segments: Array<Omit<Segment, 'sequence'> | Segment>) =>
    segments
        .map((segment) => ({
            startMs: Math.round(segment.startMs),
            endMs: Math.round(segment.endMs),
            deleted: Boolean(segment.deleted)
        }))
        .sort((left, right) => left.startMs - right.startMs)
        .map((segment, index) => ({
            sequence: index,
            startMs: segment.startMs,
            endMs: segment.endMs,
            deleted: segment.deleted
        }));

const createInitialSegments = (durationMs: number) => normalizeSegments([{
    startMs: 0,
    endMs: durationMs
}]);

const splitSegmentAt = (segments: Segment[], playheadMs: number) => {
    const targetIndex = segments.findIndex((segment) => playheadMs > segment.startMs && playheadMs < segment.endMs);
    if (targetIndex < 0) {
        return segments;
    }

    const target = segments[targetIndex];
    if ((playheadMs - target.startMs) < MIN_SEGMENT_DURATION_MS || (target.endMs - playheadMs) < MIN_SEGMENT_DURATION_MS) {
        return segments;
    }

    const nextSegments = [...segments];
    nextSegments.splice(targetIndex, 1,
        { sequence: target.sequence, startMs: target.startMs, endMs: playheadMs, deleted: target.deleted },
        { sequence: target.sequence + 1, startMs: playheadMs, endMs: target.endMs, deleted: target.deleted }
    );

    return normalizeSegments(nextSegments);
};

const toggleSegmentDeletedAt = (segments: Segment[], index: number) => {
    if (index < 0 || index >= segments.length) {
        return segments;
    }

    return normalizeSegments(segments.map((segment, segmentIndex) => (
        segmentIndex === index
            ? { ...segment, deleted: !segment.deleted }
            : segment
    )));
};

const deleteSegmentAt = (segments: Segment[], index: number) => {
    if (segments.length <= 1 || index < 0 || index >= segments.length) {
        return segments;
    }

    const nextSegments = [...segments];
    const [removed] = nextSegments.splice(index, 1);
    if (!removed) {
        return segments;
    }

    if (index === 0 && nextSegments[0]) {
        nextSegments[0] = {
            ...nextSegments[0],
            startMs: 0
        };
    } else if (nextSegments[index - 1]) {
        nextSegments[index - 1] = {
            ...nextSegments[index - 1],
            endMs: removed.endMs
        };
    }

    return normalizeSegments(nextSegments);
};

const moveBoundary = (segments: Segment[], boundaryIndex: number, proposedMs: number) => {
    const left = segments[boundaryIndex];
    const right = segments[boundaryIndex + 1];
    if (!left || !right) {
        return segments;
    }

    const clampedBoundary = clamp(
        Math.round(proposedMs),
        left.startMs + MIN_SEGMENT_DURATION_MS,
        right.endMs - MIN_SEGMENT_DURATION_MS
    );

    const nextSegments = [...segments];
    nextSegments[boundaryIndex] = {
        ...left,
        endMs: clampedBoundary
    };
    nextSegments[boundaryIndex + 1] = {
        ...right,
        startMs: clampedBoundary
    };

    return normalizeSegments(nextSegments);
};

const buildRenderManifest = (segments: Segment[], items: VideoToolItem[]): VideoExportManifest => {
    const activeSegments = segments.filter((segment) => !segment.deleted);
    return {
        segments: activeSegments.map((segment, index) => ({
            sequence: index,
            start_ms: segment.startMs,
            end_ms: segment.endMs
        })),
        outputs: items.map((item, index) => {
            if (!item.serial_number) {
                throw new Error(`У Item ${item.id} отсутствует serial_number.`);
            }

            return {
                segment_seq: index + 1,
                serial_number: item.serial_number,
                item_id: item.id
            };
        })
    };
};

const cloneSegments = (segments: Segment[]) => segments.map((segment) => ({ ...segment }));

const areSegmentsEqual = (left: Segment[], right: Segment[]) => (
    left.length === right.length
    && left.every((segment, index) => {
        const compared = right[index];
        return Boolean(compared)
            && segment.sequence === compared.sequence
            && segment.startMs === compared.startMs
            && segment.endMs === compared.endMs
            && Boolean(segment.deleted) === Boolean(compared.deleted);
    })
);

const parseDraft = (batchId: string): VideoToolDraft | null => {
    try {
        const raw = localStorage.getItem(draftKeyFor(batchId));
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as VideoToolDraft;
        if (!parsed || parsed.batchId !== batchId || parsed.version !== 1 || !parsed.sourceFingerprint || !Array.isArray(parsed.segments)) {
            return null;
        }

        return {
            ...parsed,
            segments: normalizeSegments(parsed.segments)
        };
    } catch {
        return null;
    }
};

const sameFingerprint = (left: SourceFingerprint | null, right: SourceFingerprint | null) => {
    if (!left || !right) {
        return false;
    }

    return left.name === right.name
        && left.size === right.size
        && left.lastModified === right.lastModified
        && Math.abs(left.durationMs - right.durationMs) <= 10;
};

const helperFetch = async (input: string, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    if (method !== 'GET' && method !== 'HEAD') {
        headers.set('X-Stones-Video-Helper-Version', VIDEO_EXPORT_HELPER_PROTOCOL_VERSION);
    }

    const response = await fetch(`${VIDEO_EXPORT_HELPER_URL}${input}`, {
        ...init,
        headers
    });
    return response;
};

const revokeObjectUrl = (value: string | null) => {
    if (value?.startsWith('blob:')) {
        URL.revokeObjectURL(value);
    }
};

const isEditableHotkeyTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    if (target.isContentEditable) {
        return true;
    }

    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
};

export function VideoTool() {
    const navigate = useNavigate();
    const params = useParams<{ batchId: string }>();
    const batchId = params.batchId || '';
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const timelineScrollbarRef = useRef<HTMLDivElement | null>(null);
    const dragBoundaryIndexRef = useRef<number | null>(null);
    const dragPlayheadRef = useRef(false);
    const panViewportRef = useRef<{ source: 'timeline' | 'scrollbar'; startClientX: number; startVisibleStartMs: number } | null>(null);
    const segmentHistoryRef = useRef<Segment[][]>([]);
    const sourceObjectUrlRef = useRef<string | null>(null);

    const [data, setData] = useState<VideoToolPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [helperStatus, setHelperStatus] = useState<HelperStatus>('checking');
    const [helperHealth, setHelperHealth] = useState<HelperHealthPayload | null>(null);
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [sourceUrl, setSourceUrl] = useState('');
    const [sourceFingerprint, setSourceFingerprint] = useState<SourceFingerprint | null>(null);
    const [sourcePreviewUnavailable, setSourcePreviewUnavailable] = useState(false);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
    const [playheadMs, setPlayheadMs] = useState(0);
    const [draft, setDraft] = useState<VideoToolDraft | null>(null);
    const [session, setSession] = useState<VideoExportSessionDetails | null>(null);
    const [pendingSerials, setPendingSerials] = useState<string[]>([]);
    const [helperSourceId, setHelperSourceId] = useState('');
    const [_renderJobId, setRenderJobId] = useState('');
    const [exportPhase, setExportPhase] = useState<ExportPhase>('idle');
    const [exportMessage, setExportMessage] = useState('');
    const [renderProgress, setRenderProgress] = useState({ processed: 0, total: 0 });
    const [notice, setNotice] = useState<InlineNotice | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [leftRailOpen, setLeftRailOpen] = useState(true);
    const [timelineViewport, setTimelineViewport] = useState<TimelineViewport>({
        zoom: 1,
        visibleStartMs: 0,
        visibleDurationMs: 0,
        isPanning: false
    });

    const expectedOutputCount = data?.batch.expected_output_count ?? 0;
    const productName = data?.product ? getDefaultTranslationValue(data.product.translations, 'name') : batchId;
    const durationMs = sourceFingerprint?.durationMs ?? 0;
    const visibleDurationMs = durationMs ? (timelineViewport.visibleDurationMs || durationMs) : 0;
    const visibleStartMs = durationMs ? clampVisibleStart(durationMs, timelineViewport.visibleStartMs, visibleDurationMs || durationMs) : 0;
    const visibleEndMs = visibleStartMs + visibleDurationMs;
    const activeSegments = useMemo(
        () => segments.filter((segment) => !segment.deleted),
        [segments]
    );
    const activeProductCount = Math.max(0, activeSegments.length - 1);
    const itemDelta = activeProductCount - expectedOutputCount;
    const showHelperInstallPanel = helperStatus === 'unavailable' || helperStatus === 'version_mismatch';
    const helperDownloadConfigured = Boolean(VIDEO_HELPER_DOWNLOAD_URL);
    const exportBlockedReason = helperStatus === 'unavailable'
        ? 'Нужен Stones Video Helper.'
        : helperStatus === 'version_mismatch'
            ? 'Обновите Stones Video Helper.'
            : helperStatus !== 'ready'
                ? 'Проверяем Stones Video Helper.'
        : !sourceFile || !durationMs
            ? 'Сначала загрузите исходное видео.'
        : itemDelta < 0
                ? `Не хватает ${Math.abs(itemDelta)} товарных фрагментов.`
                    : itemDelta > 0
                    ? `Лишних товарных фрагментов: ${itemDelta}.`
                    : '';
    const selectedSegment = segments[selectedSegmentIndex] ?? null;
    const sessionUploadedSerials = useMemo(
        () => new Set(session?.uploaded_manifest.map((entry) => entry.serial_number) ?? []),
        [session]
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
    }, [pushSegmentsToHistory]);
    const restorePreviousSegments = useCallback(() => {
        const previous = segmentHistoryRef.current.pop();
        if (!previous) {
            return;
        }

        setSegments(cloneSegments(previous));
        setSelectedSegmentIndex((current) => Math.min(current, Math.max(0, previous.length - 1)));
        setExportPhase('idle');
        setExportMessage('');
    }, []);
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
    }, [pushSegmentsToHistory, segments.length, selectedSegmentIndex]);
    const segmentRows = useMemo(() => {
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
    const rulerMarks = useMemo(
        () => buildRulerMarks(visibleStartMs, visibleDurationMs),
        [visibleDurationMs, visibleStartMs]
    );
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
    const fitTimelineToAll = useCallback(() => {
        if (!durationMs) {
            return;
        }

        updateTimelineViewport(0, durationMs);
    }, [durationMs, updateTimelineViewport]);
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
    const seekTimelineAtClientX = useCallback((clientX: number) => {
        if (!timelineRef.current || !durationMs) {
            return;
        }

        const rect = timelineRef.current.getBoundingClientRect();
        syncVideoTime(timelineClientXToMs(clientX, rect));
    }, [durationMs, timelineClientXToMs]);
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
            const response = await authFetch(`/api/batches/${batchId}/video-tool`);
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить данные инструмента.' }));
                throw new Error(payload.error || 'Не удалось загрузить данные инструмента.');
            }

            const payload = await response.json() as VideoToolPayload;
            setData(payload);
            const existingDraft = parseDraft(batchId);
            setDraft(existingDraft);

            const latestSessionId = existingDraft?.sessionId || payload.batch.video_export?.session_id || '';
            if (latestSessionId) {
                const sessionResponse = await authFetch(`/api/batches/${batchId}/video-export-sessions/${latestSessionId}`);
                if (sessionResponse.ok) {
                    const sessionPayload = await sessionResponse.json() as { session: VideoExportSessionDetails };
                    setSession(sessionPayload.session);
                    const manifestOutputs = sessionPayload.session.render_manifest?.outputs ?? [];
                    const uploadedSerialSet = new Set(sessionPayload.session.uploaded_manifest.map((entry) => entry.serial_number));
                    setPendingSerials(manifestOutputs
                        .map((output) => output.serial_number)
                        .filter((serialNumber) => !uploadedSerialSet.has(serialNumber)));

                    if (sessionPayload.session.status === 'ABANDONED') {
                        setNotice({
                            tone: 'warning',
                            message: 'Обнаружена зависшая export-session. При следующем экспорте будет выполнен retry-tail только для отсутствующих serial_number.'
                        });
                    } else if (sessionPayload.session.status === 'CANCELLED') {
                        setNotice({
                            tone: 'warning',
                            message: 'Предыдущая export-session была отменена вручную. При новом экспорте будет создана новая сессия.'
                        });
                    }
                }
            }
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить данные инструмента.');
        } finally {
            setLoading(false);
        }
    });

    const checkHelper = async () => {
        setHelperStatus('checking');
        try {
            const response = await helperFetch('/health');
            const payload = await response.json().catch(() => ({ error: 'Helper не отвечает.' })) as HelperHealthPayload;
            if (!response.ok || !payload.ok) {
                throw new Error(payload.error || 'Helper ffmpeg недоступен.');
            }

            setHelperHealth(payload);
            if (payload.protocol_version !== VIDEO_EXPORT_HELPER_PROTOCOL_VERSION) {
                setHelperStatus('version_mismatch');
                return;
            }

            setHelperStatus('ready');
        } catch (helperError) {
            setHelperHealth(null);
            setHelperStatus('unavailable');
            console.error(helperError);
        }
    };
    const openHelperDownload = () => {
        if (!helperDownloadConfigured) {
            return;
        }

        window.open(VIDEO_HELPER_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
    };

    useEffect(() => {
        void loadPageData();
        void checkHelper();
    }, [batchId]);

    useEffect(() => {
        if (showHelperInstallPanel) {
            setLeftRailOpen(true);
        }
    }, [showHelperInstallPanel]);

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
            revokeObjectUrl(sourceObjectUrlRef.current);
            sourceObjectUrlRef.current = null;
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
        if (!batchId || !sourceFingerprint || segments.length === 0) {
            return;
        }

        const nextDraft: VideoToolDraft = {
            version: 1,
            batchId,
            sourceFingerprint,
            segments,
            sessionId: session?.session_id || null,
            sessionVersion: session?.version || null,
            pendingSerials,
            helperSourceId: helperSourceId || null
        };
        localStorage.setItem(draftKeyFor(batchId), JSON.stringify(nextDraft));
        setDraft(nextDraft);
    }, [batchId, helperSourceId, pendingSerials, segments, session?.session_id, session?.version, sourceFingerprint]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (dragPlayheadRef.current && timelineRef.current && durationMs && visibleDurationMs) {
                const rect = timelineRef.current.getBoundingClientRect();
                const nextMs = timelineClientXToMs(event.clientX, rect);
                syncVideoTime(nextMs);
                return;
            }

            const boundaryIndex = dragBoundaryIndexRef.current;
            if (boundaryIndex != null && timelineRef.current && durationMs && visibleDurationMs) {
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
    }, [durationMs, timelineClientXToMs, updateTimelineViewport, visibleDurationMs]);

    const timelineCuts = useMemo(
        () => segments.slice(1).map((segment) => segment.startMs),
        [segments]
    );

    const syncVideoTime = (nextMs: number) => {
        if (!videoRef.current) {
            setPlayheadMs(nextMs);
            return;
        }

        videoRef.current.currentTime = Math.max(0, nextMs / 1000);
        setPlayheadMs(nextMs);
    };

    const seekToNearestCut = (direction: 'prev' | 'next') => {
        if (timelineCuts.length === 0) {
            return;
        }

        if (direction === 'prev') {
            const previousCut = [...timelineCuts].reverse().find((cutMs) => cutMs < playheadMs - 1);
            syncVideoTime(previousCut ?? 0);
            return;
        }

        const nextCut = timelineCuts.find((cutMs) => cutMs > playheadMs + 1);
        syncVideoTime(nextCut ?? durationMs);
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableHotkeyTarget(event.target)) {
                return;
            }

            if (event.code === 'Space') {
                event.preventDefault();
                void togglePlayback();
                return;
            }

            const normalizedKey = event.key.toLowerCase();
            if (event.code === 'KeyC' || normalizedKey === 'c' || normalizedKey === 'с') {
                event.preventDefault();
                applySegmentEdit((current) => splitSegmentAt(current, playheadMs));
                return;
            }

            if (event.key === 'Delete' && event.shiftKey && segments.length > 0) {
                event.preventDefault();
                hardDeleteSelectedSegment();
                return;
            }

            if ((event.key === 'Delete' || event.key === 'Backspace') && segments.length > 0) {
                event.preventDefault();
                applySegmentEdit((current) => toggleSegmentDeletedAt(current, selectedSegmentIndex));
                return;
            }

            if (event.code === 'KeyZ' || normalizedKey === 'z' || normalizedKey === 'я') {
                event.preventDefault();
                restorePreviousSegments();
                return;
            }

            if (event.code === 'Equal' || normalizedKey === '=' || normalizedKey === '+') {
                event.preventDefault();
                zoomTimelineByFactor(1 / TIMELINE_ZOOM_STEP);
                return;
            }

            if (event.code === 'Minus' || normalizedKey === '-' || normalizedKey === '_') {
                event.preventDefault();
                zoomTimelineByFactor(TIMELINE_ZOOM_STEP);
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                const previousCut = [...timelineCuts].reverse().find((cutMs) => cutMs < playheadMs - 1);
                syncVideoTime(previousCut ?? 0);
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                const nextCut = timelineCuts.find((cutMs) => cutMs > playheadMs + 1);
                syncVideoTime(nextCut ?? durationMs);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [applySegmentEdit, durationMs, hardDeleteSelectedSegment, playheadMs, restorePreviousSegments, selectedSegmentIndex, segments.length, timelineCuts, togglePlayback, zoomTimelineByFactor]);

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

    const handleSourcePicked = (file: File | null) => {
        if (!file) {
            return;
        }

        setError('');
        setExportPhase('idle');
        setExportMessage('');
        setHelperSourceId('');
        setRenderJobId('');
        setRenderProgress({ processed: 0, total: 0 });
        setSourcePreviewUnavailable(false);
        setSourceFingerprint(null);
        setSegments([]);
        segmentHistoryRef.current = [];
        setPendingSerials([]);
        setIsPlaying(false);
        setSourceFile(file);

        revokeObjectUrl(sourceObjectUrlRef.current);
        const nextObjectUrl = URL.createObjectURL(file);
        sourceObjectUrlRef.current = nextObjectUrl;
        setSourceUrl(nextObjectUrl);
        void importSourceIntoHelper(file);
    };

    const applyLoadedSourceFingerprint = (
        nextFingerprint: SourceFingerprint,
        options?: {
            nextHelperSourceId?: string;
            preserveExistingNotice?: boolean;
        }
    ) => {
        setSourceFingerprint(nextFingerprint);

        if (options?.nextHelperSourceId) {
            setHelperSourceId(options.nextHelperSourceId);
        }

        if (draft && sameFingerprint(draft.sourceFingerprint, nextFingerprint)) {
            setSegments(normalizeSegments(draft.segments));
            segmentHistoryRef.current = [];
            setSelectedSegmentIndex(0);
            setPlayheadMs(clamp(playheadMs, 0, nextFingerprint.durationMs));
            setHelperSourceId(options?.nextHelperSourceId || draft.helperSourceId || '');
            setTimelineViewport({
                zoom: 1,
                visibleStartMs: 0,
                visibleDurationMs: nextFingerprint.durationMs,
                isPanning: false
            });
            if (session?.render_manifest) {
                const uploadedSerialSet = new Set(session.uploaded_manifest.map((entry) => entry.serial_number));
                setPendingSerials(session.render_manifest.outputs
                    .map((output) => output.serial_number)
                    .filter((serialNumber) => !uploadedSerialSet.has(serialNumber)));
            } else {
                setPendingSerials(draft.pendingSerials);
            }
            return;
        }

        setSegments(createInitialSegments(nextFingerprint.durationMs));
        segmentHistoryRef.current = [];
        setSelectedSegmentIndex(0);
        setPlayheadMs(0);
        setPendingSerials([]);
        setTimelineViewport({
            zoom: 1,
            visibleStartMs: 0,
            visibleDurationMs: nextFingerprint.durationMs,
            isPanning: false
        });
        if (!options?.preserveExistingNotice) {
            setNotice(null);
        }
    };

    const handleLoadedMetadata = () => {
        if (!sourceFile || !videoRef.current || !Number.isFinite(videoRef.current.duration) || videoRef.current.duration <= 0) {
            return;
        }

        if (sourceFingerprint
            && sourceFingerprint.name === sourceFile.name
            && sourceFingerprint.size === sourceFile.size
            && sourceFingerprint.lastModified === sourceFile.lastModified) {
            setSourcePreviewUnavailable(false);
            return;
        }

        const nextFingerprint: SourceFingerprint = {
            name: sourceFile.name,
            size: sourceFile.size,
            lastModified: sourceFile.lastModified,
            durationMs: Math.max(1, Math.round(videoRef.current.duration * 1000))
        };
        applyLoadedSourceFingerprint(nextFingerprint, { preserveExistingNotice: true });
        setSourcePreviewUnavailable(false);
    };

    const importSourceIntoHelper = async (file: File) => {
        try {
            const form = new FormData();
            form.append('file', file);
            form.append('lastModified', String(file.lastModified));

            const response = await helperFetch('/sources', {
                method: 'POST',
                body: form
            });
            const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить исходник в helper.' })) as Partial<HelperSourceUploadPayload> & { error?: string };
            if (!response.ok || !payload.source_id || !payload.fingerprint) {
                throw new Error(payload.error || 'Не удалось загрузить исходник в helper.');
            }

            const nextFingerprint: SourceFingerprint = {
                name: payload.fingerprint.name,
                size: payload.fingerprint.size,
                lastModified: payload.fingerprint.lastModified,
                durationMs: payload.fingerprint.durationMs
            };
            applyLoadedSourceFingerprint(nextFingerprint, {
                nextHelperSourceId: payload.source_id,
                preserveExistingNotice: true
            });

            const codec = (payload.video_codec || '').toLowerCase();
            const formatName = (payload.format_name || '').toLowerCase();
            const isHevcMov = (codec === 'hevc' || codec === 'h265') && formatName.includes('mov');
            if (payload.preview_url) {
                revokeObjectUrl(sourceObjectUrlRef.current);
                sourceObjectUrlRef.current = null;
                setSourceUrl(payload.preview_url);
                setSourcePreviewUnavailable(false);
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
            setHelperSourceId('');
            setSourceFingerprint(null);
            setSegments([]);
            setError(sourceError instanceof Error ? sourceError.message : 'Не удалось импортировать исходник в helper.');
            throw sourceError;
        }
    };

    const handleDiscardDraft = () => {
        localStorage.removeItem(draftKeyFor(batchId));
        setDraft(null);
        setSession(null);
        setNotice(null);
        setPendingSerials([]);
        setHelperSourceId('');
        setExportPhase('idle');
        setExportMessage('');
        segmentHistoryRef.current = [];
        setIsPlaying(false);
        if (sourceFingerprint) {
            setSegments(createInitialSegments(sourceFingerprint.durationMs));
            setSelectedSegmentIndex(0);
            setPlayheadMs(0);
            setTimelineViewport({
                zoom: 1,
                visibleStartMs: 0,
                visibleDurationMs: sourceFingerprint.durationMs,
                isPanning: false
            });
        }
    };

    const ensureHelperSource = async () => {
        if (!sourceFile) {
            throw new Error('Исходное видео не выбрано.');
        }

        if (helperSourceId) {
            return helperSourceId;
        }

        return importSourceIntoHelper(sourceFile);
    };

    const createOrResumeServerSession = async (manifest: VideoExportManifest) => {
        if (!data || !sourceFingerprint) {
            throw new Error('Невозможно создать export-session без данных партии и source fingerprint.');
        }

        const response = await authFetch(`/api/batches/${data.batch.id}/video-export-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expected_count: data.batch.expected_output_count,
                crossfade_ms: CROSSFADE_MS,
                source_fingerprint: sourceFingerprint,
                render_manifest: manifest
            })
        });
        const payload = await response.json().catch(() => ({ error: 'Не удалось создать сессию экспорта.' }));
        if (!response.ok || !payload.session) {
            throw new Error(payload.error || 'Не удалось создать сессию экспорта.');
        }

        const nextSession = payload.session as VideoExportSessionDetails;
        setSession(nextSession);
        const uploadedSerialSet = new Set(nextSession.uploaded_manifest.map((entry) => entry.serial_number));
        const nextPendingSerials = manifest.outputs
            .map((output) => output.serial_number)
            .filter((serialNumber) => !uploadedSerialSet.has(serialNumber));
        setPendingSerials(nextPendingSerials);

        return {
            session: nextSession,
            pending: nextPendingSerials
        };
    };

    const retryTailSession = async () => {
        if (!data || !session) {
            throw new Error('Нет export-session для retry-tail.');
        }

        const response = await authFetch(`/api/batches/${data.batch.id}/video-export-sessions/${session.session_id}/retry-tail`, {
            method: 'POST'
        });
        const payload = await response.json().catch(() => ({ error: 'Не удалось подготовить retry-tail.' }));
        if (!response.ok || !payload.session) {
            throw new Error(payload.error || 'Не удалось подготовить retry-tail.');
        }

        const typedPayload = payload as RetryTailPayload;
        setSession(typedPayload.session);
        setPendingSerials(typedPayload.pending_serials);

        if (typedPayload.recovered_stale) {
            setNotice({
                tone: 'warning',
                message: 'Зависшая export-session автоматически восстановлена. Будут дозагружены только отсутствующие ролики.'
            });
        }

        return {
            session: typedPayload.session,
            pending: typedPayload.pending_serials
        };
    };

    const prepareServerSession = async (manifest: VideoExportManifest) => {
        const canRetryTail = session
            && session.session_id
            && ['OPEN', 'UPLOADING', 'FAILED', 'ABANDONED'].includes(session.status);

        if (canRetryTail) {
            setExportPhase('retrying');
            setExportMessage('Подготовка retry-tail для отсутствующих роликов...');
            return retryTailSession();
        }

        return createOrResumeServerSession(manifest);
    };

    const createRenderJobInHelper = async (manifest: VideoExportManifest, pending: string[]) => {
        const renderOutputs = manifest.outputs.filter((output) => pending.includes(output.serial_number));
        let sourceId = await ensureHelperSource();

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const renderResponse = await helperFetch('/render-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_id: sourceId,
                    crossfade_ms: CROSSFADE_MS,
                    segments: manifest.segments,
                    outputs: renderOutputs
                })
            });
            const renderPayload = await renderResponse.json().catch(() => ({ error: 'Не удалось создать render job в helper.' }));
            if (renderResponse.ok && renderPayload.job_id) {
                return {
                    jobId: renderPayload.job_id as string,
                    processed: Number(renderPayload.processed_count) || 0,
                    total: Number(renderPayload.total_count) || renderOutputs.length
                };
            }

            const message = renderPayload.error || 'Не удалось создать render job в helper.';
            if (attempt === 0 && /исходный файл.*не найден/i.test(message)) {
                setHelperSourceId('');
                sourceId = await ensureHelperSource();
                continue;
            }

            throw new Error(message);
        }

        throw new Error('Не удалось создать render job в helper.');
    };

    const waitForRenderCompletion = async (jobId: string) => {
        while (true) {
            const response = await helperFetch(`/render-jobs/${jobId}`);
            const payload = await response.json().catch(() => ({ error: 'Не удалось получить статус render job.' }));
            if (!response.ok) {
                throw new Error(payload.error || 'Не удалось получить статус render job.');
            }

            const safeProcessed = typeof payload.processed_count === 'number' ? payload.processed_count : 0;
            const safeTotal = typeof payload.total_count === 'number' ? payload.total_count : 0;
            setRenderProgress({ processed: safeProcessed, total: safeTotal });

            if (payload.status === 'FAILED') {
                throw new Error(payload.error_message || 'Helper завершил render job с ошибкой.');
            }

            if (payload.status === 'COMPLETED') {
                return;
            }

            await sleep(1200);
        }
    };

    const uploadPendingFiles = async (jobId: string, sessionId: string, serials: string[]) => {
        if (!data) {
            throw new Error('Данные партии не загружены.');
        }

        let nextPending = [...serials];
        for (let index = 0; index < serials.length; index += 1) {
            const serialNumber = serials[index];
            setExportMessage(`Загрузка ${index + 1}/${serials.length}: ${serialNumber}.mp4`);

            const fileResponse = await helperFetch(`/render-jobs/${jobId}/files/${encodeURIComponent(serialNumber)}`);
            if (!fileResponse.ok) {
                const payload = await fileResponse.json().catch(() => ({ error: 'Не удалось получить готовый файл из helper.' }));
                throw new Error(payload.error || 'Не удалось получить готовый файл из helper.');
            }

            const fileBlob = await fileResponse.blob();
            const form = new FormData();
            form.append('file', fileBlob, `${serialNumber}.mp4`);
            form.append('serial_number', serialNumber);

            const uploadResponse = await authFetch(`/api/batches/${data.batch.id}/video-export-sessions/${sessionId}/files`, {
                method: 'POST',
                body: form
            });
            const uploadPayload = await uploadResponse.json().catch(() => ({ error: 'Не удалось загрузить финальный ролик на сервер.' }));
            if (!uploadResponse.ok || !uploadPayload.session) {
                throw new Error(uploadPayload.error || 'Не удалось загрузить финальный ролик на сервер.');
            }

            const updatedSession = uploadPayload.session as VideoExportSessionDetails;
            setSession(updatedSession);
            nextPending = nextPending.filter((item) => item !== serialNumber);
            setPendingSerials(nextPending);
        }
    };

    const handleCancelSession = async () => {
        if (!data || !session) {
            return;
        }

        try {
            const response = await authFetch(`/api/batches/${data.batch.id}/video-export-sessions/${session.session_id}/cancel`, {
                method: 'POST'
            });
            const payload = await response.json().catch(() => ({ error: 'Не удалось отменить export-session.' }));
            if (!response.ok || !payload.session) {
                throw new Error(payload.error || 'Не удалось отменить export-session.');
            }

            const nextSession = payload.session as VideoExportSessionDetails;
            setSession(nextSession);
            setExportPhase('cancelled');
            setExportMessage('Текущая export-session отменена.');
            setNotice({
                tone: 'warning',
                message: 'Сессия отменена вручную. При следующем экспорте будет создана новая session.'
            });
        } catch (cancelError) {
            console.error(cancelError);
            setExportPhase('error');
            setExportMessage(cancelError instanceof Error ? cancelError.message : 'Не удалось отменить export-session.');
        }
    };

    const handleExport = async () => {
        if (!data) {
            return;
        }

        if (exportBlockedReason) {
            setExportPhase('error');
            setExportMessage(exportBlockedReason);
            return;
        }

        try {
            setError('');
            setExportPhase('preparing');
            setExportMessage('Подготовка исходника и export-session...');
            setRenderProgress({ processed: 0, total: 0 });

            const manifest = buildRenderManifest(segments, data.items);
            const { session: nextSession, pending } = await prepareServerSession(manifest);

            if (pending.length === 0) {
                setExportPhase('completed');
                setExportMessage('Все финальные ролики уже загружены для этой сессии.');
                if (nextSession.status === 'COMPLETED') {
                    localStorage.removeItem(draftKeyFor(batchId));
                }
                return;
            }

            if (pending.length !== manifest.outputs.length) {
                setExportPhase('retrying');
                setExportMessage(`Дозагрузка хвоста: осталось ${pending.length} из ${manifest.outputs.length} роликов.`);
            }

            const renderJob = await createRenderJobInHelper(manifest, pending);
            setRenderJobId(renderJob.jobId);
            setExportPhase('rendering');
            setExportMessage('Helper рендерит финальные MP4...');
            setRenderProgress({
                processed: renderJob.processed,
                total: renderJob.total
            });

            await waitForRenderCompletion(renderJob.jobId);

            setExportPhase('uploading');
            setExportMessage('Загрузка готовых роликов на сервер...');
            await uploadPendingFiles(renderJob.jobId, nextSession.session_id, pending);

            const cleanupResponse = await helperFetch(`/render-jobs/${renderJob.jobId}/cleanup`, {
                method: 'POST'
            });
            if (!cleanupResponse.ok) {
                throw new Error('Серверные файлы загружены, но helper не смог очистить локальный render job. Черновик сохранён.');
            }

            setRenderJobId('');
            setExportPhase('completed');
            setExportMessage('Экспорт завершён: все финальные ролики загружены.');

            const latestSessionResponse = await authFetch(`/api/batches/${data.batch.id}/video-export-sessions/${nextSession.session_id}`);
        if (latestSessionResponse.ok) {
            const latestSessionPayload = await latestSessionResponse.json() as { session: VideoExportSessionDetails };
            setSession(latestSessionPayload.session);
            if (latestSessionPayload.session.status === 'COMPLETED') {
                setData((current) => current ? {
                    ...current,
                    batch: {
                        ...current.batch,
                        video_export: latestSessionPayload.session
                    },
                    items: current.items.map((item) => {
                        const uploadedEntry = latestSessionPayload.session.uploaded_manifest.find((entry) => entry.item_id === item.id);
                        return uploadedEntry
                            ? { ...item, item_video_url: uploadedEntry.public_url }
                            : item;
                    })
                } : current);
                localStorage.removeItem(draftKeyFor(batchId));
                setDraft(null);
                setPendingSerials([]);
            }
        }
        } catch (exportError) {
            console.error(exportError);
            setExportPhase('error');
            setExportMessage(exportError instanceof Error ? exportError.message : 'Не удалось завершить экспорт.');
        }
    };

    const selectedSegmentRow = selectedSegment ? segmentRows[selectedSegmentIndex] ?? null : null;
    const totalSegments = activeProductCount;
    const clipCounterText = `Товарных клипов: ${totalSegments} / ${expectedOutputCount}`;
    const selectedSegmentIsDeleted = Boolean(selectedSegmentRow?.isDeleted);
    const hasExportError = Boolean(error || session?.error_message || exportPhase === 'error');
    const helperStatusLabel = helperStatus === 'ready'
        ? 'Готов'
        : helperStatus === 'checking'
            ? 'Проверка'
            : helperStatus === 'version_mismatch'
                ? 'Обновить'
                : 'Не найден';
    const helperStatusToneClass = helperStatus === 'ready'
        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
        : helperStatus === 'checking'
            ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
            : helperStatus === 'version_mismatch'
                ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                : 'border-red-400/20 bg-red-400/10 text-red-200';
    const blockingStatusLabel = hasExportError
        ? 'Ошибка экспорта'
        : exportPhase === 'completed'
            ? 'Экспорт завершён'
            : exportPhase !== 'idle'
                ? exportPhaseLabel[exportPhase]
                : exportBlockedReason || 'Готово к экспорту';
    const blockingStatusToneClass = hasExportError
        ? 'border-red-500/30 bg-red-500/10 text-red-100'
        : exportPhase === 'completed'
            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
            : exportPhase !== 'idle' && exportPhase !== 'cancelled'
                ? 'border-sky-400/20 bg-sky-400/10 text-sky-100'
                : exportBlockedReason || exportPhase === 'cancelled'
                    ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                    : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
    const helperInstallTitle = helperStatus === 'version_mismatch'
        ? 'Обновите Stones Video Helper'
        : 'Установите Stones Video Helper';
    const helperInstallDescription = helperStatus === 'version_mismatch'
        ? 'Локальный helper устарел. Скачайте актуальную версию, откройте приложение и перепроверьте статус.'
        : 'Монтаж и экспорт работают через локальный macOS helper. Скачайте его, один раз откройте приложение и вернитесь к монтажу.';
    const statusMessage = error
        || session?.error_message
        || exportMessage
        || notice?.message
        || (helperStatus === 'ready'
            ? 'Helper подключён. Можно продолжать нарезку и экспорт.'
            : helperStatus === 'checking'
                ? 'Проверяем Stones Video Helper.'
                : helperStatus === 'version_mismatch'
                    ? 'Установлена несовместимая версия Stones Video Helper.'
                    : 'Stones Video Helper не найден или не запущен.');
    const normalizedStatusMessage = statusMessage === 'Load failed'
        ? 'Не удалось загрузить исходник.'
        : statusMessage;
    const statusMessageToneClass = error || session?.error_message || exportPhase === 'error'
        ? 'border-red-500/30 bg-red-500/10 text-red-100'
        : exportPhase === 'completed'
            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
        : notice?.tone === 'warning'
            ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
            : notice?.tone === 'info'
                ? 'border-sky-400/20 bg-sky-400/10 text-sky-100'
                : 'border-zinc-800 bg-zinc-950/80 text-zinc-300';
    const canCancelSession = Boolean(session && ['OPEN', 'UPLOADING', 'FAILED', 'ABANDONED'].includes(session.status));

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

    return (
        <div className="h-screen overflow-hidden bg-[#0f1013] text-zinc-100">
            <div className="flex h-full flex-col">
                <header className="flex shrink-0 items-center gap-4 border-b border-zinc-800 bg-[#15161a] px-4 py-3">
                    <button
                        type="button"
                        onClick={() => navigate('/admin/warehouse')}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                        aria-label="Вернуться на склад"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setLeftRailOpen((current) => !current)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                        aria-label={leftRailOpen ? 'Свернуть левую панель' : 'Открыть левую панель'}
                    >
                        {leftRailOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                    </button>

                    <div className="min-w-0 flex-1">
                        <h1 data-testid="video-tool-heading" className="text-sm font-semibold text-zinc-100">
                            Монтаж видео партии
                        </h1>
                        <p className="truncate text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                            {productName} • партия {data.batch.id} • цель: {expectedOutputCount} товарных клипов
                        </p>
                    </div>
                </header>

                <div
                    className="grid min-h-0 flex-1 transition-[grid-template-columns] duration-300"
                    style={{
                        gridTemplateColumns: leftRailOpen
                            ? 'minmax(196px,224px) minmax(0,3.4fr) minmax(300px,1.15fr)'
                            : '68px minmax(0,3.8fr) minmax(280px,1fr)'
                    }}
                >
                    <aside className="min-h-0 border-r border-zinc-800 bg-[#17181c] p-3">
                        {leftRailOpen ? (
                            <div className="flex h-full min-h-0 flex-col gap-3">
                            <section className="rounded-[20px] border border-zinc-800 bg-[#101115] p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Исходник</p>
                                        <p className="mt-1 truncate text-sm font-medium text-zinc-200">
                                            {sourceFile?.name || draft?.sourceFingerprint.name || 'Видео не выбрано'}
                                        </p>
                                    </div>
                                </div>

                                <label className="mt-4 inline-flex cursor-pointer items-center rounded-xl border border-emerald-700/60 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/15">
                                    <Upload size={14} />
                                    <span className="ml-2">Открыть видео</span>
                                    <input
                                        data-testid="source-input"
                                        aria-label="Исходное видео"
                                        type="file"
                                        accept="video/mp4,video/quicktime,.mov,video/x-m4v,video/webm,video/*"
                                        className="hidden"
                                        onChange={(event) => {
                                            handleSourcePicked(event.target.files?.[0] || null);
                                            event.currentTarget.value = '';
                                        }}
                                    />
                                </label>

                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
                                        <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Длительность</div>
                                        <div className="mt-1 text-sm text-zinc-100">
                                            {durationMs
                                                ? formatDuration(durationMs)
                                                : draft?.sourceFingerprint
                                                    ? formatDuration(draft.sourceFingerprint.durationMs)
                                                    : '—'}
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
                                        <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Нарезка</div>
                                        <div className="mt-1 text-sm text-zinc-100">{`${totalSegments}/${expectedOutputCount}`}</div>
                                    </div>
                                </div>
                            </section>

                            <section className="min-h-0 flex-1 rounded-[20px] border border-zinc-800 bg-[#101115] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Статус</p>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={openHelperDownload}
                                            disabled={!helperDownloadConfigured}
                                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <HardDriveDownload size={14} />
                                            Скачать helper
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void checkHelper()}
                                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                                        >
                                            <RefreshCw size={14} />
                                            Проверить
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${helperStatusToneClass}`}>
                                        Helper: {helperStatusLabel}
                                    </span>
                                    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${blockingStatusToneClass}`}>
                                        {blockingStatusLabel}
                                    </span>
                                </div>

                                <div className={`mt-4 rounded-2xl border px-3 py-3 text-sm leading-6 ${statusMessageToneClass}`}>
                                    {normalizedStatusMessage}
                                </div>

                                {showHelperInstallPanel && (
                                    <div
                                        data-testid="helper-install-panel"
                                        className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-3"
                                    >
                                        <p className="text-sm font-medium text-amber-50">{helperInstallTitle}</p>
                                        <p className="mt-2 text-sm leading-6 text-amber-100/90">
                                            {helperInstallDescription}
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                data-testid="helper-download"
                                                onClick={openHelperDownload}
                                                disabled={!helperDownloadConfigured}
                                                className="inline-flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/20 px-3 py-2 text-xs font-medium text-amber-50 transition hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                <HardDriveDownload size={14} />
                                                Скачать Stones Video Helper
                                            </button>
                                            <button
                                                type="button"
                                                data-testid="helper-recheck"
                                                onClick={() => void checkHelper()}
                                                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-100 transition hover:border-zinc-500 hover:text-white"
                                            >
                                                <RefreshCw size={14} />
                                                Я установил, перепроверить
                                            </button>
                                        </div>
                                        {!helperDownloadConfigured && (
                                            <p className="mt-3 text-xs leading-5 text-amber-100/75">
                                                Ссылка на production DMG ещё не настроена в `VITE_VIDEO_HELPER_DOWNLOAD_URL`.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {draft && (
                                    <div
                                        data-testid="draft-banner"
                                        className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-3 py-3 text-sm text-sky-100"
                                    >
                                        <p>Найден локальный draft: {draft.segments.length} фрагментов.</p>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleDiscardDraft}
                                            className="mt-2 h-auto justify-start px-0 py-0 text-sky-100 hover:bg-transparent"
                                        >
                                            Сбросить черновик
                                        </Button>
                                    </div>
                                )}

                                <div className="mt-4 grid gap-2">
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300">
                                        Загружено: {session ? `${session.uploaded_count}/${session.expected_count}` : `0/${expectedOutputCount}`}
                                    </div>
                                    {(renderProgress.total > 0 || exportPhase === 'rendering' || exportPhase === 'uploading') && (
                                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300">
                                            {exportPhaseLabel[exportPhase]}: {renderProgress.total ? `${renderProgress.processed}/${renderProgress.total}` : '—'}
                                        </div>
                                    )}
                                    {session && (
                                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300">
                                            Сессия: {sessionStatusLabel[session.status] || session.status}
                                        </div>
                                    )}
                                    {helperHealth?.helper_version && (
                                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300">
                                            Версия helper: {helperHealth.helper_version}
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                        ) : (
                            <div className="flex h-full flex-col items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setLeftRailOpen(true)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                                    aria-label="Открыть левую панель"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLeftRailOpen(true)}
                                    className="flex h-28 w-full items-center justify-center rounded-2xl border border-zinc-800 bg-[#101115] px-2 text-center text-[11px] uppercase tracking-[0.16em] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
                                >
                                    Исходник
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLeftRailOpen(true)}
                                    className="flex h-28 w-full items-center justify-center rounded-2xl border border-zinc-800 bg-[#101115] px-2 text-center text-[11px] uppercase tracking-[0.16em] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
                                >
                                    Статус
                                </button>
                            </div>
                        )}
                    </aside>

                    <section className="min-h-0 bg-[#131418] p-3">
                        <div className="flex h-full min-h-0 flex-col gap-3">
                            <section className="min-h-0 flex-1 overflow-hidden rounded-[24px] border border-zinc-800 bg-[#17191e]">
                                <div className="border-b border-zinc-800 px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Клипы партии</p>
                                </div>

                                <div className="min-h-0 h-full overflow-y-auto p-3">
                                    {segments.length === 0 ? (
                                        <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center text-sm text-zinc-500">
                                            Загрузите вертикальный исходник, чтобы получить стартовый фрагмент и перейти к нарезке.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                                            {segmentRows.map((row) => {
                                                const { index, segment, item, isDeleted, isUploaded, role, displaySequence } = row;
                                                const cardTitle = isDeleted
                                                    ? 'Удалённый фрагмент'
                                                    : role === 'intro'
                                                        ? 'Интро'
                                                        : item?.serial_number || `Клип ${displaySequence}`;
                                                const badgeClass = isDeleted
                                                    ? 'bg-red-400/15 text-red-100'
                                                    : role === 'intro'
                                                        ? 'bg-sky-300/15 text-sky-100'
                                                        : isUploaded
                                                            ? 'bg-emerald-400/15 text-emerald-100'
                                                            : 'bg-zinc-800 text-zinc-400';
                                                const badgeLabel = isDeleted
                                                    ? 'Удалён'
                                                    : role === 'intro'
                                                        ? 'Интро'
                                                        : isUploaded
                                                            ? 'Готов'
                                                            : 'Клип';

                                                return (
                                                    <button
                                                        key={`clip-card-${segment.sequence}`}
                                                        data-testid={`clip-card-${padSequence(segment.sequence)}`}
                                                        type="button"
                                                        aria-pressed={index === selectedSegmentIndex}
                                                        onClick={() => {
                                                            setSelectedSegmentIndex(index);
                                                            syncVideoTime(segment.startMs);
                                                        }}
                                                        className={`flex min-h-[104px] w-full flex-col items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                                                            isDeleted
                                                                ? 'border-red-400/35 bg-red-500/10 hover:border-red-300/50'
                                                                : index === selectedSegmentIndex
                                                                ? 'border-emerald-400/50 bg-emerald-400/10'
                                                                : role === 'intro'
                                                                    ? 'border-sky-400/30 bg-sky-400/10'
                                                                    : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-600'
                                                        }`}
                                                    >
                                                        <div className="flex w-full items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="text-lg font-semibold text-zinc-100">{displaySequence || '×××'}</p>
                                                                <p className="mt-1 text-[11px] text-zinc-500">{formatDuration(segment.endMs - segment.startMs)}</p>
                                                            </div>
                                                            <span className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${badgeClass}`}>
                                                                {badgeLabel}
                                                            </span>
                                                        </div>

                                                        <div className="min-w-0">
                                                            <p
                                                                className="truncate text-sm font-medium text-zinc-100"
                                                                title={cardTitle}
                                                            >
                                                                {cardTitle}
                                                            </p>
                                                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                                                                <span className="rounded-full border border-zinc-700 px-2.5 py-1">
                                                                    {formatDuration(segment.startMs)} → {formatDuration(segment.endMs)}
                                                                </span>
                                                                {!isDeleted && role !== 'intro' && item?.temp_id && (
                                                                    <span className="rounded-full border border-zinc-700 px-2.5 py-1">
                                                                        Пакет {item.temp_id}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="shrink-0 overflow-hidden rounded-[24px] border border-zinc-800 bg-[#15171c]">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            data-testid="action-cut"
                                            aria-label="Разрезать"
                                            size="sm"
                                            onClick={() => applySegmentEdit((current) => splitSegmentAt(current, playheadMs))}
                                            disabled={!sourceFile || !durationMs}
                                            className="border-blue-500/30 bg-blue-500/15 text-blue-50 hover:bg-blue-500/20 disabled:opacity-40"
                                        >
                                            <Scissors size={16} />
                                            Разрезать
                                        </Button>
                                        <Button
                                            data-testid="action-delete"
                                            aria-label={selectedSegmentIsDeleted ? 'Вернуть фрагмент' : 'Удалить фрагмент'}
                                            variant={selectedSegmentIsDeleted ? 'ghost' : 'danger'}
                                            size="sm"
                                            onClick={() => applySegmentEdit((current) => toggleSegmentDeletedAt(current, selectedSegmentIndex))}
                                            disabled={!selectedSegment}
                                            className={selectedSegmentIsDeleted
                                                ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20 hover:text-emerald-50 disabled:opacity-40'
                                                : 'disabled:opacity-40'}
                                        >
                                            {selectedSegmentIsDeleted ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                                            {selectedSegmentIsDeleted ? 'Вернуть' : 'Удалить'}
                                        </Button>
                                        <Button
                                            data-testid="action-export"
                                            aria-label="Экспорт"
                                            size="sm"
                                            onClick={() => void handleExport()}
                                            disabled={Boolean(exportBlockedReason) || exportPhase === 'preparing' || exportPhase === 'rendering' || exportPhase === 'uploading'}
                                            className="bg-[#2f63ff] text-white hover:bg-[#3f72ff] disabled:opacity-40"
                                        >
                                            <HardDriveDownload size={16} />
                                            Экспорт
                                        </Button>
                                        {canCancelSession && (
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => void handleCancelSession()}
                                                disabled={exportPhase === 'rendering' || exportPhase === 'uploading'}
                                            >
                                                <Ban size={16} />
                                                Отменить
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        <span
                                            data-testid="clip-counter"
                                            className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-200"
                                        >
                                            {clipCounterText}
                                        </span>
                                        <span
                                            data-testid="blocking-status"
                                            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${blockingStatusToneClass}`}
                                        >
                                            {blockingStatusLabel}
                                        </span>
                                        <span className="text-[11px] text-zinc-500">Масштаб {timelineViewport.zoom.toFixed(1)}x</span>
                                        <button
                                            type="button"
                                            onClick={() => zoomTimelineByFactor(TIMELINE_ZOOM_STEP)}
                                            disabled={!durationMs || visibleDurationMs >= durationMs}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => zoomTimelineByFactor(1 / TIMELINE_ZOOM_STEP)}
                                            disabled={!durationMs || visibleDurationMs <= getTimelineMinVisibleDuration(durationMs)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Plus size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={fitTimelineToAll}
                                            disabled={!durationMs}
                                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Maximize2 size={14} />
                                            Показать всё
                                        </button>
                                    </div>
                                </div>

                                <div className="h-[280px] px-3 pb-3 pt-3">
                                    <div className="grid h-full min-h-0 grid-rows-[26px_1fr_18px] rounded-[20px] border border-zinc-800 bg-[#15171c]">
                                        <div
                                            className="relative overflow-hidden border-b border-zinc-800 bg-[#101115]"
                                            onPointerDown={(event) => {
                                                if (!durationMs || !timelineRef.current) {
                                                    return;
                                                }
                                                seekTimelineAtClientX(event.clientX);
                                                dragPlayheadRef.current = true;
                                            }}
                                            onWheel={(event) => {
                                                if (!durationMs || !visibleDurationMs || !timelineRef.current) {
                                                    return;
                                                }

                                                event.preventDefault();
                                                const rect = timelineRef.current.getBoundingClientRect();
                                                const anchorMs = timelineClientXToMs(event.clientX, rect);

                                                if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                                                    const delta = event.shiftKey ? event.deltaY : event.deltaX;
                                                    updateTimelineViewport(
                                                        visibleStartMs + ((delta / rect.width) * visibleDurationMs),
                                                        visibleDurationMs
                                                    );
                                                    return;
                                                }

                                                const zoomFactor = event.deltaY > 0 ? TIMELINE_ZOOM_STEP : 1 / TIMELINE_ZOOM_STEP;
                                                zoomTimelineTo(anchorMs, visibleDurationMs * zoomFactor);
                                            }}
                                        >
                                            {rulerMarks.map((markMs) => {
                                                const left = ((markMs - visibleStartMs) / visibleDurationMs) * 100;
                                                return (
                                                    <div key={`ruler-${markMs}`} className="absolute inset-y-0" style={{ left: `${left}%` }}>
                                                        <div className="pointer-events-none h-full border-l border-zinc-700/70" />
                                                        <span className="absolute left-2 top-1 text-[10px] text-zinc-500">{formatDuration(markMs)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div
                                            ref={timelineRef}
                                            data-testid="timeline-region"
                                            className="relative min-h-0 overflow-hidden bg-[#101218]"
                                            onPointerDown={(event) => {
                                                if (event.target !== event.currentTarget) {
                                                    return;
                                                }
                                                seekTimelineAtClientX(event.clientX);
                                                dragPlayheadRef.current = true;
                                            }}
                                            onWheel={(event) => {
                                                if (!durationMs || !visibleDurationMs) {
                                                    return;
                                                }

                                                event.preventDefault();
                                                const rect = event.currentTarget.getBoundingClientRect();
                                                const anchorMs = timelineClientXToMs(event.clientX, rect);

                                                if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                                                    const delta = event.shiftKey ? event.deltaY : event.deltaX;
                                                    updateTimelineViewport(
                                                        visibleStartMs + ((delta / rect.width) * visibleDurationMs),
                                                        visibleDurationMs
                                                    );
                                                    return;
                                                }

                                                const zoomFactor = event.deltaY > 0 ? TIMELINE_ZOOM_STEP : 1 / TIMELINE_ZOOM_STEP;
                                                zoomTimelineTo(anchorMs, visibleDurationMs * zoomFactor);
                                            }}
                                            onClick={(event) => {
                                                if (event.target !== event.currentTarget) {
                                                    return;
                                                }
                                                seekTimelineAtClientX(event.clientX);
                                            }}
                                        >
                                            {rulerMarks.map((markMs) => {
                                                const left = ((markMs - visibleStartMs) / visibleDurationMs) * 100;
                                                return <div key={`grid-${markMs}`} className="pointer-events-none absolute inset-y-0 border-l border-zinc-800/80" style={{ left: `${left}%` }} />;
                                            })}

                                            {segmentRows.map((row) => {
                                                const { index, segment, isDeleted, role, item, displaySequence } = row;
                                                const visibleSegmentStartMs = Math.max(segment.startMs, visibleStartMs);
                                                const visibleSegmentEndMs = Math.min(segment.endMs, visibleEndMs);
                                                if (visibleSegmentEndMs <= visibleSegmentStartMs || visibleDurationMs <= 0) {
                                                    return null;
                                                }

                                                const widthPercent = ((visibleSegmentEndMs - visibleSegmentStartMs) / visibleDurationMs) * 100;
                                                const style = getVisibleWindowStyle(segment.startMs, segment.endMs, visibleStartMs, visibleDurationMs);
                                                if (!style) {
                                                    return null;
                                                }

                                                const showSequence = widthPercent >= 3.2;
                                                const showSecondaryLabel = widthPercent >= 10;
                                                const label = isDeleted
                                                    ? 'Удалён'
                                                    : role === 'intro'
                                                        ? 'Интро'
                                                        : item?.serial_number || `Клип ${displaySequence}`;

                                                return (
                                                    <button
                                                        key={`video-segment-${segment.sequence}`}
                                                        type="button"
                                                        className={`absolute bottom-4 top-4 overflow-hidden rounded-lg border px-2 text-left transition ${
                                                            isDeleted
                                                                ? 'border-red-300/45 bg-red-500/25 text-red-50 hover:bg-red-500/30'
                                                                : index === selectedSegmentIndex
                                                                ? 'border-emerald-300/70 bg-emerald-400/18 text-white'
                                                                : role === 'intro'
                                                                    ? 'border-sky-400/30 bg-sky-400/15 text-sky-100'
                                                                    : 'border-blue-300/20 bg-blue-300/45 text-white hover:bg-blue-300/55'
                                                        }`}
                                                        style={style}
                                                        onClick={() => {
                                                            setSelectedSegmentIndex(index);
                                                            syncVideoTime(segment.startMs);
                                                        }}
                                                    >
                                                        {showSequence && (
                                                            <div className="truncate pt-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                                                                {displaySequence || 'DEL'}
                                                            </div>
                                                        )}
                                                        {showSecondaryLabel && (
                                                            <div className="mt-1 truncate text-[10px] text-white/75">
                                                                {label}
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}

                                            {segments.slice(0, -1).map((segment, index) => {
                                                if (segment.endMs < visibleStartMs || segment.endMs > visibleEndMs) {
                                                    return null;
                                                }

                                                return (
                                                    <button
                                                        key={`boundary-${segment.sequence}`}
                                                        type="button"
                                                        className="absolute inset-y-4 z-20 w-2 -translate-x-1/2 cursor-col-resize bg-white/80 transition hover:bg-emerald-300"
                                                        style={{ left: `${((segment.endMs - visibleStartMs) / visibleDurationMs) * 100}%` }}
                                                        onPointerDown={(event) => {
                                                            event.stopPropagation();
                                                            pushSegmentsToHistory(segments);
                                                            dragBoundaryIndexRef.current = index;
                                                        }}
                                                        aria-label={`Изменить границу между ${padSequence(index)} и ${padSequence(index + 1)}`}
                                                    />
                                                );
                                            })}

                                            {durationMs > 0 && playheadMs >= visibleStartMs && playheadMs <= visibleEndMs && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="absolute top-2 z-30 h-4 w-4 -translate-x-1/2 rounded-full border border-red-300 bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.6)]"
                                                        style={{ left: `${((playheadMs - visibleStartMs) / visibleDurationMs) * 100}%` }}
                                                        onPointerDown={(event) => {
                                                            event.stopPropagation();
                                                            dragPlayheadRef.current = true;
                                                        }}
                                                        aria-label="Переместить плейхед"
                                                    />
                                                    <div
                                                        className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.55)]"
                                                        style={{ left: `${((playheadMs - visibleStartMs) / visibleDurationMs) * 100}%` }}
                                                    />
                                                </>
                                            )}
                                        </div>

                                        <div className="border-t border-zinc-800 bg-[#101115] px-3 py-2">
                                            <div
                                                ref={timelineScrollbarRef}
                                                className={`relative h-2 w-full rounded-full bg-zinc-900 ${timelineViewport.isPanning ? 'ring-1 ring-blue-400/40' : ''}`}
                                                onClick={(event) => {
                                                    if (!durationMs || !visibleDurationMs) {
                                                        return;
                                                    }

                                                    const rect = event.currentTarget.getBoundingClientRect();
                                                    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
                                                    const centeredStartMs = (ratio * durationMs) - (visibleDurationMs / 2);
                                                    updateTimelineViewport(centeredStartMs, visibleDurationMs);
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="absolute inset-y-0 rounded-full border border-blue-400/40 bg-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
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
                                                        setTimelineViewport((current) => ({ ...current, isPanning: true }));
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </section>

                    <section className="min-h-0 border-l border-zinc-800 bg-[#121317] p-3">
                        <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden rounded-[28px] border border-zinc-800 bg-[#090a0d]">
                            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/65 via-black/25 to-transparent px-4 py-4 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
                                <span>Просмотр</span>
                                <span>{selectedSegmentRow?.displaySequence || (selectedSegmentRow?.isDeleted ? 'del' : '—')}</span>
                            </div>

                            <div className="absolute inset-x-0 top-12 z-10 flex items-center justify-between px-4 text-xs text-zinc-400">
                                <span>{formatDuration(playheadMs)}</span>
                                <span>{durationMs ? formatDuration(durationMs) : '—'}</span>
                            </div>

                            <div className="flex h-full w-full items-center justify-center p-4">
                                <div className="relative aspect-[9/16] w-full max-w-[360px] max-h-full overflow-hidden rounded-[28px] border border-zinc-900 bg-black shadow-[0_18px_80px_rgba(0,0,0,0.55)] 2xl:max-w-[400px]">
                                    {sourceUrl && !sourcePreviewUnavailable ? (
                                        <video
                                            ref={videoRef}
                                            src={sourceUrl}
                                            preload="metadata"
                                            playsInline
                                            className="h-full w-full object-contain"
                                            onLoadedMetadata={handleLoadedMetadata}
                                            onPlay={() => setIsPlaying(true)}
                                            onPause={() => setIsPlaying(false)}
                                            onTimeUpdate={(event) => setPlayheadMs(Math.round(event.currentTarget.currentTime * 1000))}
                                            onError={() => {
                                                setSourcePreviewUnavailable(true);
                                                setIsPlaying(false);
                                                if (sourceFingerprint) {
                                                    setNotice({
                                                        tone: 'warning',
                                                        message: 'Браузер не смог показать превью. Таймлайн и экспорт остаются доступны через helper.'
                                                    });
                                                }
                                            }}
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(42,45,54,0.55),rgba(4,5,8,1))] p-8 text-center">
                                            <div className="max-w-[18rem]">
                                                <p className="text-base font-medium text-zinc-100">
                                                    {sourceUrl && sourcePreviewUnavailable ? 'Превью недоступно' : 'Загрузите вертикальный исходник'}
                                                </p>
                                                <p className="mt-2 text-sm text-zinc-400">
                                                    {sourceUrl && sourcePreviewUnavailable
                                                        ? 'MOV/H.265 уже принят helper. Можно резать таймлайн и запускать экспорт без превью.'
                                                        : 'После загрузки появятся просмотр и навигация по стыкам.'}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

                                    <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4">
                                        <div className="rounded-2xl border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        data-testid="preview-prev-cut"
                                                        type="button"
                                                        onClick={() => seekToNearestCut('prev')}
                                                        disabled={!sourceUrl}
                                                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        <ArrowLeft size={18} />
                                                    </button>
                                                    <button
                                                        data-testid="preview-play-toggle"
                                                        type="button"
                                                        onClick={() => void togglePlayback()}
                                                        disabled={!sourceUrl || sourcePreviewUnavailable}
                                                        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white text-black transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                                                    </button>
                                                    <button
                                                        data-testid="preview-next-cut"
                                                        type="button"
                                                        onClick={() => seekToNearestCut('next')}
                                                        disabled={!sourceUrl}
                                                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        <ArrowRight size={18} />
                                                    </button>
                                                </div>

                                                <div className="text-right">
                                                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Пробел</p>
                                                    <p className="mt-1 text-sm text-zinc-100">{isPlaying ? 'Пауза' : 'Пуск'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
