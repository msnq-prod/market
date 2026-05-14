import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Scissors, Trash2, Upload, RefreshCw, Play, Pause, HardDriveDownload, Ban, Minus, Plus, Maximize2, RotateCcw, Clipboard } from 'lucide-react';
import { Button } from '../components/ui';
import { authFetch } from '../../utils/authFetch';

const normalizeHelperUrl = (value: string) => value.trim().replace(/\/+$/, '');

const VIDEO_EXPORT_HELPER_URL = normalizeHelperUrl(import.meta.env.VITE_VIDEO_EXPORT_HELPER_URL || 'http://127.0.0.1:3012');
const VIDEO_EXPORT_HELPER_PROTOCOL_VERSION = 'stones-video-export-helper-v3';
const HELPER_HEALTH_TIMEOUT_MS = 2500;
const DEFAULT_VIDEO_HELPER_DOWNLOAD_URL = '/uploads/downloads/ZAGARAMI-Video-Helper.dmg';
const DEFAULT_VIDEO_HELPER_DOWNLOAD_URL_ARM64 = '/uploads/downloads/ZAGARAMI-Video-Helper-arm64.dmg';
const VIDEO_HELPER_DOWNLOAD_URL = (import.meta.env.VITE_VIDEO_HELPER_DOWNLOAD_URL || DEFAULT_VIDEO_HELPER_DOWNLOAD_URL).trim();
const VIDEO_HELPER_DOWNLOAD_URL_ARM64 = (import.meta.env.VITE_VIDEO_HELPER_DOWNLOAD_URL_ARM64 || DEFAULT_VIDEO_HELPER_DOWNLOAD_URL_ARM64).trim();
const ZAGARAMI_PRODUCTION_ORIGIN = 'https://zagarami.com';
const MIN_SEGMENT_DURATION_MS = 200;
const CROSSFADE_MS = 200;
const TIMELINE_ZOOM_STEP = 1.2;
const PREVIEW_PANEL_WIDTH_STORAGE_KEY = 'video-tool-preview-panel-width';
const PREVIEW_PANEL_MIN_WIDTH = 280;
const PREVIEW_PANEL_DEFAULT_WIDTH = 390;
const PREVIEW_PANEL_MAX_WIDTH = 760;
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

type HelperRequestInit = RequestInit & {
    targetAddressSpace?: 'local';
};

type HelperFetchOptions = {
    useTargetAddressSpace?: boolean;
};

const helperUrlHostname = (helperUrl: string) => {
    try {
        return new URL(helperUrl).hostname;
    } catch {
        return '';
    }
};

const helperUsesLoopback = (helperUrl: string) => {
    const hostname = helperUrlHostname(helperUrl);
    return hostname === '127.0.0.1'
        || hostname === 'localhost'
        || hostname === '::1'
        || hostname === '[::1]';
};

const buildHelperUrlCandidates = () => {
    const candidates = [VIDEO_EXPORT_HELPER_URL];
    try {
        const helperUrl = new URL(VIDEO_EXPORT_HELPER_URL);
        if (['127.0.0.1', 'localhost', '[::1]', '::1'].includes(helperUrl.hostname)) {
            for (const hostname of ['127.0.0.1', 'localhost', '[::1]']) {
                const nextUrl = new URL(helperUrl.toString());
                nextUrl.hostname = hostname;
                candidates.push(normalizeHelperUrl(nextUrl.toString()));
            }
        }
    } catch {
        // Keep the configured helper URL as-is.
    }

    return Array.from(new Set(candidates));
};

const VIDEO_EXPORT_HELPER_URL_CANDIDATES = buildHelperUrlCandidates();

const browserLooksLikeSafari = () => {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const userAgent = navigator.userAgent;
    return userAgent.includes('Safari/')
        && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|YaBrowser)\//.test(userAgent);
};

const buildHelperIssueMessage = (rawMessage?: string) => {
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    const currentOrigin = typeof window !== 'undefined'
        ? window.location.origin
        : ZAGARAMI_PRODUCTION_ORIGIN;
    const expectedOrigin = currentOrigin.includes('zagarami.com')
        ? currentOrigin
        : ZAGARAMI_PRODUCTION_ORIGIN;

    if (message.includes('Origin helper запроса не разрешён') || message.includes('Mutating helper requests требуют разрешённый Origin.')) {
        return `Этот helper собран не для ${expectedOrigin}. Закройте старый Stones Video Helper, скачайте актуальный DMG с ${expectedOrigin}, откройте ZAGARAMI Video Helper снова и перепроверьте статус.`;
    }

    if (message.includes('Helper принимает запросы только с loopback-интерфейса.')) {
        return `Браузер не смог обратиться к helper через localhost. Откройте систему через ${expectedOrigin} и перепроверьте статус helper.`;
    }

    if (message.includes('Failed to fetch') || message.includes('Load failed') || message.includes('NetworkError')) {
        if (!VIDEO_EXPORT_HELPER_URL_CANDIDATES.some(helperUsesLoopback)) {
            return 'Локальный helper не отвечает. Перезапустите приложение и перепроверьте статус.';
        }

        return browserLooksLikeSafari()
            ? `Safari блокирует HTTP-доступ ${expectedOrigin} к локальному helper. Для монтажа откройте эту страницу в Chrome или Яндекс Браузере.`
            : `Браузер заблокировал доступ к локальному helper. Нажмите «Разрешить доступ» и подтвердите доступ ${expectedOrigin} к локальной сети.`;
    }

    return message || 'Локальный helper не отвечает. Перезапустите приложение и перепроверьте статус.';
};

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
    manifest_version?: number;
    sources?: Array<{
        source_index: number;
        role: 'WITH_INTRO' | 'NO_INTRO';
        fingerprint: SourceFingerprint;
    }>;
    segments: Array<{
        sequence: number;
        source_index?: number;
        start_ms: number;
        end_ms: number;
    }>;
    outputs: Array<{
        segment_seq: number;
        serial_number: string;
        item_id: string;
    }>;
    intro_asset?: VideoExportIntroAsset | null;
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
    sourceIndex: number;
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

type VideoExportIntroAsset = {
    file_name: string;
    relative_path: string;
    public_url: string;
    uploaded_at: string;
};

type SourceRole = 'WITH_INTRO' | 'NO_INTRO';

type WorkingSource = SourceFingerprint & {
    sourceIndex: number;
    role: SourceRole;
    file: File | null;
    helperSourceId: string;
    previewUrl: string;
    previewUnavailable: boolean;
};

type VideoToolDraft = {
    version: 2;
    batchId: string;
    sources: Array<{
        sourceIndex: number;
        role: SourceRole;
        fingerprint: SourceFingerprint;
        helperSourceId: string | null;
    }>;
    segments: Segment[];
    sessionId: string | null;
    sessionVersion: number | null;
    pendingSerials: string[];
    introHelperSourceId: string | null;
};

type ExportPhase = 'idle' | 'preparing' | 'retrying' | 'rendering' | 'uploading' | 'completed' | 'cancelled' | 'error';
type HelperStatus = 'checking' | 'ready' | 'unavailable' | 'version_mismatch';

type HelperHealthPayload = {
    ok: boolean;
    helper_version?: string;
    protocol_version?: string;
    listen_hosts?: string[];
    storage_root?: string;
    free_bytes?: number;
    allowed_origins?: string[];
    queued_jobs?: number;
    error?: string;
};

type HelperDiagnosticStatus = 'ok' | 'blocked' | 'connection failed' | 'bad protocol' | 'cors/pna failed';

type HelperDiagnosticEntry = {
    url: string;
    status: HelperDiagnosticStatus;
    detail: string;
    mode?: 'standard' | 'pna';
    httpStatus?: number;
    protocolVersion?: string;
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

type HelperJobPayload = {
    job_id?: string;
    status?: string;
    processed_count?: number;
    total_count?: number;
    error?: string;
    error_message?: string;
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
const readStoredPreviewPanelWidth = () => {
    if (typeof window === 'undefined') {
        return PREVIEW_PANEL_DEFAULT_WIDTH;
    }

    const stored = Number(window.localStorage.getItem(PREVIEW_PANEL_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(stored)) {
        return PREVIEW_PANEL_DEFAULT_WIDTH;
    }

    return clamp(Math.round(stored), PREVIEW_PANEL_MIN_WIDTH, PREVIEW_PANEL_MAX_WIDTH);
};
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
            sourceIndex: Number.isFinite(segment.sourceIndex) ? Math.max(0, Math.round(segment.sourceIndex)) : 0,
            startMs: Math.round(segment.startMs),
            endMs: Math.round(segment.endMs),
            deleted: Boolean(segment.deleted)
        }))
        .sort((left, right) => left.startMs - right.startMs)
        .map((segment, index) => ({
            sequence: index,
            sourceIndex: segment.sourceIndex,
            startMs: segment.startMs,
            endMs: segment.endMs,
            deleted: segment.deleted
        }));

const createInitialSegments = (durationMs: number, sourceIndex = 0, startOffsetMs = 0) => normalizeSegments([{
    sourceIndex,
    startMs: startOffsetMs,
    endMs: startOffsetMs + durationMs
}]);

const getSourceTimelineStartMs = (sources: Array<Pick<WorkingSource, 'sourceIndex' | 'durationMs'>>, sourceIndex: number) =>
    sources
        .filter((source) => source.sourceIndex < sourceIndex)
        .reduce((sum, source) => sum + source.durationMs, 0);

const getTotalSourceDurationMs = (sources: Array<Pick<WorkingSource, 'durationMs'>>) =>
    sources.reduce((sum, source) => sum + source.durationMs, 0);

const getSourceForGlobalMs = (sources: WorkingSource[], globalMs: number) => {
    let offsetMs = 0;
    for (const source of sources) {
        const sourceEndMs = offsetMs + source.durationMs;
        if (globalMs >= offsetMs && globalMs <= sourceEndMs) {
            return {
                source,
                localMs: clamp(globalMs - offsetMs, 0, source.durationMs)
            };
        }
        offsetMs = sourceEndMs;
    }

    const fallbackSource = sources.at(-1) ?? null;
    return fallbackSource
        ? { source: fallbackSource, localMs: fallbackSource.durationMs }
        : null;
};

const hydrateSegmentsFromManifest = (manifest: VideoExportManifest | null, sources: WorkingSource[]) => {
    if (!manifest) {
        return [];
    }

    return normalizeSegments(manifest.segments.map((segment) => {
        const sourceIndex = segment.source_index ?? 0;
        const offsetMs = getSourceTimelineStartMs(sources, sourceIndex);
        return {
            sourceIndex,
            startMs: offsetMs + segment.start_ms,
            endMs: offsetMs + segment.end_ms
        };
    }));
};

const createSourceFromFingerprint = (
    sourceIndex: number,
    role: SourceRole,
    fingerprint: SourceFingerprint,
    options?: Partial<Pick<WorkingSource, 'file' | 'helperSourceId' | 'previewUrl' | 'previewUnavailable'>>
): WorkingSource => ({
    sourceIndex,
    role,
    name: fingerprint.name,
    size: fingerprint.size,
    lastModified: fingerprint.lastModified,
    durationMs: fingerprint.durationMs,
    file: options?.file ?? null,
    helperSourceId: options?.helperSourceId ?? '',
    previewUrl: options?.previewUrl ?? '',
    previewUnavailable: options?.previewUnavailable ?? false
});

const createSourcesFromManifest = (manifest: VideoExportManifest | null) => {
    if (!manifest?.sources?.length) {
        return [];
    }

    return manifest.sources
        .sort((left, right) => left.source_index - right.source_index)
        .map((source) => createSourceFromFingerprint(source.source_index, source.role, source.fingerprint));
};

const appendInitialSourceSegment = (segments: Segment[], source: WorkingSource, sources: WorkingSource[]) => {
    const startOffsetMs = getSourceTimelineStartMs(sources, source.sourceIndex);
    return normalizeSegments([
        ...segments,
        {
            sourceIndex: source.sourceIndex,
            startMs: startOffsetMs,
            endMs: startOffsetMs + source.durationMs
        }
    ]);
};

const createFirstSourceSegments = (source: WorkingSource) => createInitialSegments(source.durationMs, source.sourceIndex, 0);

const getSegmentLocalBounds = (segment: Segment, sources: WorkingSource[]) => {
    const offsetMs = getSourceTimelineStartMs(sources, segment.sourceIndex);
    return {
        startMs: Math.max(0, segment.startMs - offsetMs),
        endMs: Math.max(0, segment.endMs - offsetMs)
    };
};

const isSourceBoundaryBetween = (left: Segment | undefined, right: Segment | undefined) =>
    Boolean(left && right && left.sourceIndex !== right.sourceIndex);

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
        { sequence: target.sequence, sourceIndex: target.sourceIndex, startMs: target.startMs, endMs: playheadMs, deleted: target.deleted },
        { sequence: target.sequence + 1, sourceIndex: target.sourceIndex, startMs: playheadMs, endMs: target.endMs, deleted: target.deleted }
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

const buildRenderManifest = (segments: Segment[], sources: WorkingSource[], items: VideoToolItem[]): VideoExportManifest => {
    const activeSegments = segments.filter((segment) => !segment.deleted);
    const outputItems = items.slice(0, Math.max(0, activeSegments.length - 1));
    return {
        manifest_version: 2,
        sources: sources.map((source) => ({
            source_index: source.sourceIndex,
            role: source.role,
            fingerprint: {
                name: source.name,
                size: source.size,
                lastModified: source.lastModified,
                durationMs: source.durationMs
            }
        })),
        segments: activeSegments.map((segment, index) => ({
            sequence: index,
            source_index: segment.sourceIndex,
            start_ms: getSegmentLocalBounds(segment, sources).startMs,
            end_ms: getSegmentLocalBounds(segment, sources).endMs
        })),
        outputs: outputItems.map((item, index) => {
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
            && segment.sourceIndex === compared.sourceIndex
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
        if (!parsed || parsed.batchId !== batchId || parsed.version !== 2 || !Array.isArray(parsed.sources) || !Array.isArray(parsed.segments)) {
            return null;
        }

        return {
            ...parsed,
            sources: parsed.sources.map((source) => ({
                sourceIndex: source.sourceIndex,
                role: source.role,
                fingerprint: source.fingerprint,
                helperSourceId: source.helperSourceId ?? null
            })),
            segments: normalizeSegments(parsed.segments)
        };
    } catch {
        return null;
    }
};

const helperFetch = async (helperUrl: string, input: string, init?: RequestInit, options?: HelperFetchOptions) => {
    const method = (init?.method || 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    if (method !== 'GET' && method !== 'HEAD') {
        headers.set('X-Stones-Video-Helper-Version', VIDEO_EXPORT_HELPER_PROTOCOL_VERSION);
    }

    const requestInit: HelperRequestInit = {
        ...init,
        headers
    };

    if (options?.useTargetAddressSpace && helperUsesLoopback(helperUrl)) {
        requestInit.targetAddressSpace = 'local';
    }

    const response = await fetch(`${helperUrl}${input}`, requestInit);
    return response;
};

const classifyHelperFetchError = (error: unknown): HelperDiagnosticStatus => {
    if (error instanceof DOMException && error.name === 'AbortError') {
        return 'connection failed';
    }

    if (error instanceof TypeError) {
        return 'blocked';
    }

    return 'connection failed';
};

const getHelperErrorDetail = (error: unknown) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'Запрос не выполнен.';
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
    const previewResizeRef = useRef<{ startClientX: number; startWidth: number } | null>(null);
    const segmentHistoryRef = useRef<Segment[][]>([]);
    const sourceObjectUrlsRef = useRef<Set<string>>(new Set());

    const [data, setData] = useState<VideoToolPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [helperStatus, setHelperStatus] = useState<HelperStatus>('checking');
    const [helperHealth, setHelperHealth] = useState<HelperHealthPayload | null>(null);
    const [helperIssueMessage, setHelperIssueMessage] = useState('');
    const [helperAccessRequesting, setHelperAccessRequesting] = useState(false);
    const [helperBaseUrl, setHelperBaseUrl] = useState(VIDEO_EXPORT_HELPER_URL);
    const [helperDiagnostics, setHelperDiagnostics] = useState<HelperDiagnosticEntry[]>([]);
    const [helperDiagnosticCopied, setHelperDiagnosticCopied] = useState(false);
    const [sources, setSources] = useState<WorkingSource[]>([]);
    const [activeSourceIndex, setActiveSourceIndex] = useState(0);
    const [introHelperSourceId, setIntroHelperSourceId] = useState('');
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
    const [playheadMs, setPlayheadMs] = useState(0);
    const [draft, setDraft] = useState<VideoToolDraft | null>(null);
    const [session, setSession] = useState<VideoExportSessionDetails | null>(null);
    const [pendingSerials, setPendingSerials] = useState<string[]>([]);
    const [_renderJobId, setRenderJobId] = useState('');
    const [exportPhase, setExportPhase] = useState<ExportPhase>('idle');
    const [exportMessage, setExportMessage] = useState('');
    const [renderProgress, setRenderProgress] = useState({ processed: 0, total: 0 });
    const [notice, setNotice] = useState<InlineNotice | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [previewPanelWidth, setPreviewPanelWidth] = useState(readStoredPreviewPanelWidth);
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
    const helperDownloadConfigured = Boolean(VIDEO_HELPER_DOWNLOAD_URL);
    const helperDownloadArm64Configured = Boolean(VIDEO_HELPER_DOWNLOAD_URL_ARM64);
    const helperIssueKind = helperStatus === 'version_mismatch'
        ? 'version'
        : helperIssueMessage.includes('Safari блокирует')
            ? 'safari'
        : helperIssueMessage.includes('заблокировал доступ') || helperIssueMessage.includes('доступ к localhost')
            ? 'browser'
            : helperIssueMessage.includes('старый Stones Video Helper') || helperIssueMessage.includes('собран не для')
                ? 'old'
                : 'missing';
    const helperNeedsDownload = !['browser', 'safari'].includes(helperIssueKind);
    const helperBlockReason = helperStatus === 'unavailable'
        ? helperIssueKind === 'safari'
            ? 'Откройте страницу в Chrome или Яндекс Браузере.'
            : helperIssueKind === 'browser'
            ? 'Разрешите доступ к localhost.'
            : 'Запустите ZAGARAMI Video Helper.'
        : helperStatus === 'version_mismatch'
            ? 'Обновите ZAGARAMI Video Helper.'
            : '';
    const exportBlockedReason = helperStatus === 'unavailable'
        ? helperBlockReason
        : helperStatus === 'version_mismatch'
            ? helperBlockReason
            : helperStatus !== 'ready'
                ? 'Проверяем ZAGARAMI Video Helper.'
        : sources.length === 0 || !durationMs
            ? 'Загрузите исходник.'
        : activeProductCount <= 0
            ? 'Нужен минимум один товарный фрагмент.'
        : activeProductCount > expectedOutputCount
            ? `Лишних товарных фрагментов: ${activeProductCount - expectedOutputCount}.`
        : session && activeProductCount < session.uploaded_count
            ? 'Нельзя удалить уже загруженные товарные фрагменты.'
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
    const handleTimelineWheel = useCallback((event: React.WheelEvent<HTMLElement>, rect: DOMRect) => {
        if (!durationMs || !visibleDurationMs) {
            return;
        }

        event.preventDefault();

        const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;

        if (event.ctrlKey || event.metaKey) {
            const anchorMs = timelineClientXToMs(event.clientX, rect);
            const zoomFactor = dominantDelta > 0 ? TIMELINE_ZOOM_STEP : 1 / TIMELINE_ZOOM_STEP;
            zoomTimelineTo(anchorMs, visibleDurationMs * zoomFactor);
            return;
        }

        updateTimelineViewport(
            visibleStartMs + ((dominantDelta / rect.width) * visibleDurationMs),
            visibleDurationMs,
            { isPanning: true }
        );
    }, [durationMs, timelineClientXToMs, updateTimelineViewport, visibleDurationMs, visibleStartMs, zoomTimelineTo]);
    const seekTimelineAtClientX = useCallback((clientX: number) => {
        if (!timelineRef.current || !durationMs) {
            return;
        }

        const rect = timelineRef.current.getBoundingClientRect();
        syncVideoTime(timelineClientXToMs(clientX, rect));
    }, [durationMs, syncVideoTime, timelineClientXToMs]);
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
                    const manifestSources = createSourcesFromManifest(sessionPayload.session.render_manifest);
                    if (manifestSources.length > 0) {
                        setSources(manifestSources);
                        setActiveSourceIndex(manifestSources[0]?.sourceIndex ?? 0);
                        const manifestSegments = hydrateSegmentsFromManifest(sessionPayload.session.render_manifest, manifestSources);
                        if (manifestSegments.length > 0) {
                            setSegments(manifestSegments);
                            setSelectedSegmentIndex(0);
                            setPlayheadMs(0);
                        }
                    }
                    const manifestOutputs = sessionPayload.session.render_manifest?.outputs ?? [];
                    const uploadedSerialSet = new Set(sessionPayload.session.uploaded_manifest.map((entry) => entry.serial_number));
                    setPendingSerials(manifestOutputs
                        .map((output) => output.serial_number)
                        .filter((serialNumber) => !uploadedSerialSet.has(serialNumber)));
                    if (sessionPayload.session.render_manifest?.intro_asset) {
                        setIntroHelperSourceId('');
                    }

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
            } else if (existingDraft?.sources.length) {
                const draftSources = existingDraft.sources.map((source) => createSourceFromFingerprint(
                    source.sourceIndex,
                    source.role,
                    source.fingerprint,
                    { helperSourceId: source.helperSourceId || '' }
                ));
                setSources(draftSources);
                setActiveSourceIndex(draftSources[0]?.sourceIndex ?? 0);
                setSegments(normalizeSegments(existingDraft.segments));
                setPendingSerials(existingDraft.pendingSerials);
                setIntroHelperSourceId(existingDraft.introHelperSourceId || '');
            }
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить данные инструмента.');
        } finally {
            setLoading(false);
        }
    });

    const helperUrlCandidates = useMemo(() => Array.from(new Set([
        helperBaseUrl,
        ...VIDEO_EXPORT_HELPER_URL_CANDIDATES
    ])), [helperBaseUrl]);

    const fetchHelperHealth = useCallback(async (init?: RequestInit) => {
        let lastError: unknown = null;
        const diagnostics: HelperDiagnosticEntry[] = [];

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
                        protocolVersion: payload.protocol_version
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
    }, [helperUrlCandidates]);

    const checkHelper = useCallback(async () => {
        setHelperStatus('checking');
        setHelperIssueMessage('');
        try {
            const { helperUrl, response, payload } = await fetchHelperHealth();
            if (!response.ok || !payload.ok) {
                throw new Error(buildHelperIssueMessage(payload.error || 'Helper ffmpeg недоступен.'));
            }

            setHelperBaseUrl(helperUrl);
            setHelperHealth(payload);
            if (payload.protocol_version !== VIDEO_EXPORT_HELPER_PROTOCOL_VERSION) {
                setHelperIssueMessage('Локальный helper устарел. Скачайте актуальную версию для zagarami.com и перепроверьте статус.');
                setHelperStatus('version_mismatch');
                return;
            }

            setHelperIssueMessage('');
            setHelperStatus('ready');
        } catch (helperError) {
            setHelperHealth(null);
            setHelperIssueMessage(buildHelperIssueMessage(helperError instanceof Error ? helperError.message : ''));
            setHelperStatus('unavailable');
            console.error(helperError);
        }
    }, [fetchHelperHealth]);
    const requestHelperBrowserAccess = async () => {
        setHelperAccessRequesting(true);
        setHelperStatus('checking');
        setHelperIssueMessage('');
        try {
            const { helperUrl, response, payload } = await fetchHelperHealth({ cache: 'no-store' });
            if (!response.ok || !payload.ok) {
                throw new Error(buildHelperIssueMessage(payload.error || 'Helper ffmpeg недоступен.'));
            }

            setHelperBaseUrl(helperUrl);
            setHelperHealth(payload);
            setHelperStatus(payload.protocol_version === VIDEO_EXPORT_HELPER_PROTOCOL_VERSION ? 'ready' : 'version_mismatch');
            setHelperIssueMessage(payload.protocol_version === VIDEO_EXPORT_HELPER_PROTOCOL_VERSION
                ? ''
                : 'Локальный helper устарел. Скачайте актуальную версию для zagarami.com и перепроверьте статус.');
        } catch (helperError) {
            setHelperHealth(null);
            setHelperIssueMessage(buildHelperIssueMessage(helperError instanceof Error ? helperError.message : ''));
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

    useEffect(() => {
        void loadPageData();
        void checkHelper();
    }, [batchId, checkHelper]);

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

        const nextDraft: VideoToolDraft = {
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
                helperSourceId: source.helperSourceId || null
            })),
            segments,
            sessionId: session?.session_id || null,
            sessionVersion: session?.version || null,
            pendingSerials,
            introHelperSourceId: introHelperSourceId || null
        };
        localStorage.setItem(draftKeyFor(batchId), JSON.stringify(nextDraft));
        setDraft(nextDraft);
    }, [batchId, introHelperSourceId, pendingSerials, segments, session?.session_id, session?.version, sources]);

    useEffect(() => {
        setPreviewPanelWidth((current) => clampPreviewPanelWidth(current));
    }, [clampPreviewPanelWidth]);

    useEffect(() => {
        localStorage.setItem(PREVIEW_PANEL_WIDTH_STORAGE_KEY, String(previewPanelWidth));
    }, [previewPanelWidth]);

    useEffect(() => {
        const handleResize = () => {
            setPreviewPanelWidth((current) => clampPreviewPanelWidth(current));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [clampPreviewPanelWidth]);

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
    }, [clampPreviewPanelWidth, durationMs, segments, syncVideoTime, timelineClientXToMs, updateTimelineViewport, visibleDurationMs]);

    const timelineCuts = useMemo(
        () => segments.slice(1).map((segment) => segment.startMs),
        [segments]
    );

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
    }, [applySegmentEdit, durationMs, hardDeleteSelectedSegment, playheadMs, restorePreviousSegments, selectedSegmentIndex, segments.length, syncVideoTime, timelineCuts, togglePlayback, zoomTimelineByFactor]);

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

    const handleSourcePicked = (file: File | null, mode: 'first' | 'append' = 'first') => {
        if (!file) {
            return;
        }

        const sourceIndex = mode === 'first' ? 0 : sources.length;
        const role: SourceRole = sourceIndex === 0 ? 'WITH_INTRO' : 'NO_INTRO';
        const nextObjectUrl = URL.createObjectURL(file);
        sourceObjectUrlsRef.current.add(nextObjectUrl);

        setError('');
        setExportPhase('idle');
        setExportMessage('');
        setRenderJobId('');
        setRenderProgress({ processed: 0, total: 0 });
        setIsPlaying(false);

        if (mode === 'first') {
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
        void importSourceIntoHelper(file, sourceIndex, role, nextObjectUrl);
    };

    const handleLoadedMetadata = () => {
        if (!activeSource || !videoRef.current || !Number.isFinite(videoRef.current.duration) || videoRef.current.duration <= 0) {
            return;
        }

        setSources((current) => current.map((source) => source.sourceIndex === activeSource.sourceIndex
            ? { ...source, previewUnavailable: false }
            : source));
    };

    const importSourceIntoHelper = async (
        file: File,
        sourceIndex: number,
        role: SourceRole,
        fallbackPreviewUrl = ''
    ) => {
        try {
            const form = new FormData();
            form.append('file', file);
            form.append('lastModified', String(file.lastModified));

            const response = await helperFetch(helperBaseUrl, '/sources', {
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
            let previewUrl = fallbackPreviewUrl;

            const codec = (payload.video_codec || '').toLowerCase();
            const formatName = (payload.format_name || '').toLowerCase();
            const isHevcMov = (codec === 'hevc' || codec === 'h265') && formatName.includes('mov');
            if (payload.preview_url) {
                try {
                    previewUrl = `${helperBaseUrl}${new URL(payload.preview_url).pathname}`;
                } catch {
                    previewUrl = payload.preview_url;
                }
            }

            const nextSource = createSourceFromFingerprint(sourceIndex, role, nextFingerprint, {
                file,
                helperSourceId: payload.source_id,
                previewUrl,
                previewUnavailable: false
            });

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
        localStorage.removeItem(draftKeyFor(batchId));
        setDraft(null);
        setSession(null);
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

    const ensureHelperSource = async (sourceIndex: number) => {
        const source = sources.find((entry) => entry.sourceIndex === sourceIndex);
        if (!source) {
            throw new Error(`Source ${sourceIndex} не найден.`);
        }

        if (source.helperSourceId) {
            return source.helperSourceId;
        }

        if (!source.file) {
            throw new Error(`Source ${sourceIndex} не загружен в helper. Добавьте исходник заново.`);
        }

        return importSourceIntoHelper(source.file, source.sourceIndex, source.role, source.previewUrl);
    };

    const createOrResumeServerSession = async (manifest: VideoExportManifest) => {
        if (!data || sources.length === 0) {
            throw new Error('Невозможно создать export-session без данных партии и source fingerprint.');
        }

        const response = await authFetch(`/api/batches/${data.batch.id}/video-export-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expected_count: data.batch.expected_output_count,
                crossfade_ms: CROSSFADE_MS,
                source_fingerprint: {
                    name: sources[0].name,
                    size: sources[0].size,
                    lastModified: sources[0].lastModified,
                    durationMs: sources[0].durationMs
                },
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
        const isAppendingCurrentSession = manifest.outputs.length > (session?.render_manifest?.outputs.length ?? 0);

        if (canRetryTail && !isAppendingCurrentSession) {
            setExportPhase('retrying');
            setExportMessage('Подготовка retry-tail для отсутствующих роликов...');
            return retryTailSession();
        }

        return createOrResumeServerSession(manifest);
    };

    const waitForHelperJobCompletion = async (jobId: string, endpointPrefix: '/render-jobs' | '/intro-jobs') => {
        while (true) {
            const response = await helperFetch(helperBaseUrl, `${endpointPrefix}/${jobId}`);
            const payload = await response.json().catch(() => ({ error: 'Не удалось получить статус helper job.' })) as HelperJobPayload;
            if (!response.ok) {
                throw new Error(payload.error || 'Не удалось получить статус helper job.');
            }

            const safeProcessed = typeof payload.processed_count === 'number' ? payload.processed_count : 0;
            const safeTotal = typeof payload.total_count === 'number' ? payload.total_count : 0;
            setRenderProgress({ processed: safeProcessed, total: safeTotal });

            if (payload.status === 'FAILED') {
                throw new Error(payload.error_message || 'Helper завершил job с ошибкой.');
            }

            if (payload.status === 'COMPLETED') {
                return;
            }

            await sleep(1200);
        }
    };

    const createIntroJobInHelper = async (manifest: VideoExportManifest) => {
        const introSegment = manifest.segments[0];
        if (!introSegment) {
            throw new Error('В манифесте нет intro-сегмента.');
        }

        const introSourceIndex = introSegment.source_index ?? 0;
        const sourceId = await ensureHelperSource(introSourceIndex);
        const response = await helperFetch(helperBaseUrl, '/intro-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sources: [{ source_index: introSourceIndex, source_id: sourceId }],
                segment: introSegment
            })
        });
        const payload = await response.json().catch(() => ({ error: 'Не удалось создать intro job в helper.' })) as HelperJobPayload;
        if (!response.ok || !payload.job_id) {
            throw new Error(payload.error || 'Не удалось создать intro job в helper.');
        }

        return payload.job_id;
    };

    const uploadIntroAsset = async (jobId: string, sessionId: string) => {
        if (!data) {
            throw new Error('Данные партии не загружены.');
        }

        const fileResponse = await helperFetch(helperBaseUrl, `/intro-jobs/${jobId}/file`);
        if (!fileResponse.ok) {
            const payload = await fileResponse.json().catch(() => ({ error: 'Не удалось получить intro-файл из helper.' }));
            throw new Error(payload.error || 'Не удалось получить intro-файл из helper.');
        }

        const fileBlob = await fileResponse.blob();
        const form = new FormData();
        form.append('file', fileBlob, 'intro.mp4');

        const uploadResponse = await authFetch(`/api/batches/${data.batch.id}/video-export-sessions/${sessionId}/intro-file`, {
            method: 'POST',
            body: form
        });
        const uploadPayload = await uploadResponse.json().catch(() => ({ error: 'Не удалось сохранить intro на сервере.' }));
        if (!uploadResponse.ok || !uploadPayload.session) {
            throw new Error(uploadPayload.error || 'Не удалось сохранить intro на сервере.');
        }

        const updatedSession = uploadPayload.session as VideoExportSessionDetails;
        setSession(updatedSession);
        return updatedSession;
    };

    const ensureIntroAsset = async (currentSession: VideoExportSessionDetails, manifest: VideoExportManifest) => {
        if (currentSession.render_manifest?.intro_asset) {
            return currentSession;
        }

        setExportPhase('rendering');
        setExportMessage('Helper сохраняет intro для будущих догрузок...');
        const introJobId = await createIntroJobInHelper(manifest);
        await waitForHelperJobCompletion(introJobId, '/intro-jobs');
        const updatedSession = await uploadIntroAsset(introJobId, currentSession.session_id);
        return updatedSession;
    };

    const ensureIntroHelperSource = async (introAsset: VideoExportIntroAsset) => {
        if (introHelperSourceId) {
            return introHelperSourceId;
        }

        const response = await fetch(introAsset.public_url);
        if (!response.ok) {
            throw new Error('Не удалось загрузить сохранённое intro с сервера.');
        }

        const blob = await response.blob();
        const form = new FormData();
        form.append('file', blob, introAsset.file_name || 'intro.mp4');
        form.append('lastModified', String(Date.parse(introAsset.uploaded_at) || Date.now()));

        const helperResponse = await helperFetch(helperBaseUrl, '/sources', {
            method: 'POST',
            body: form
        });
        const payload = await helperResponse.json().catch(() => ({ error: 'Не удалось импортировать intro в helper.' })) as Partial<HelperSourceUploadPayload> & { error?: string };
        if (!helperResponse.ok || !payload.source_id) {
            throw new Error(payload.error || 'Не удалось импортировать intro в helper.');
        }

        setIntroHelperSourceId(payload.source_id);
        return payload.source_id;
    };

    const createRenderJobInHelper = async (manifest: VideoExportManifest, pending: string[], introAsset: VideoExportIntroAsset) => {
        const renderOutputs = manifest.outputs.filter((output) => pending.includes(output.serial_number));
        const pendingSegmentSeqs = new Set(renderOutputs.map((output) => output.segment_seq));
        const pendingTailSegments = manifest.segments.filter((segment) => pendingSegmentSeqs.has(segment.sequence));
        const introSourceId = await ensureIntroHelperSource(introAsset);
        const requiredTailSourceIndexes = Array.from(new Set(pendingTailSegments.map((segment) => segment.source_index ?? 0)));
        const tailRenderSources = await Promise.all(requiredTailSourceIndexes.map(async (sourceIndex) => ({
            source_index: sourceIndex + 1,
            source_id: await ensureHelperSource(sourceIndex)
        })));
        const renderSources = [
            { source_index: 0, source_id: introSourceId },
            ...tailRenderSources
        ];
        const introSegment = manifest.segments[0];
        const introDurationMs = introSegment ? introSegment.end_ms - introSegment.start_ms : 0;
        const helperSegments = manifest.segments.map((segment) => (
            segment.sequence === 0
                ? {
                    ...segment,
                    source_index: 0,
                    start_ms: 0,
                    end_ms: introDurationMs
                }
                : {
                    ...segment,
                    source_index: (segment.source_index ?? 0) + 1
                }
        ));

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const renderResponse = await helperFetch(helperBaseUrl, '/render-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources: renderSources,
                    crossfade_ms: CROSSFADE_MS,
                    segments: helperSegments,
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
                setSources((current) => current.map((source) => requiredTailSourceIndexes.includes(source.sourceIndex)
                    ? { ...source, helperSourceId: '' }
                    : source));
                setIntroHelperSourceId('');
                continue;
            }

            throw new Error(message);
        }

        throw new Error('Не удалось создать render job в helper.');
    };

    const waitForRenderCompletion = async (jobId: string) => {
        return waitForHelperJobCompletion(jobId, '/render-jobs');
    };

    const uploadPendingFiles = async (jobId: string, sessionId: string, serials: string[]) => {
        if (!data) {
            throw new Error('Данные партии не загружены.');
        }

        let nextPending = [...serials];
        for (let index = 0; index < serials.length; index += 1) {
            const serialNumber = serials[index];
            setExportMessage(`Загрузка ${index + 1}/${serials.length}: ${serialNumber}.mp4`);

            const fileResponse = await helperFetch(helperBaseUrl, `/render-jobs/${jobId}/files/${encodeURIComponent(serialNumber)}`);
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

            const manifest = buildRenderManifest(segments, sources, data.items);
            const { session: preparedSession, pending } = await prepareServerSession(manifest);

            if (pending.length === 0) {
                setExportPhase('completed');
                setExportMessage('Все финальные ролики уже загружены для этой сессии.');
                if (preparedSession.status === 'COMPLETED') {
                    localStorage.removeItem(draftKeyFor(batchId));
                }
                return;
            }

            const nextSession = await ensureIntroAsset(preparedSession, manifest);
            const introAsset = nextSession.render_manifest?.intro_asset;
            if (!introAsset) {
                throw new Error('Intro сохранён некорректно: в session отсутствует intro_asset.');
            }

            if (pending.length !== manifest.outputs.length) {
                setExportPhase('retrying');
                setExportMessage(`Дозагрузка хвоста: осталось ${pending.length} из ${manifest.outputs.length} роликов.`);
            }

            const renderJob = await createRenderJobInHelper(manifest, pending, introAsset);
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

            const cleanupResponse = await helperFetch(helperBaseUrl, `/render-jobs/${renderJob.jobId}/cleanup`, {
                method: 'POST'
            });
            if (!cleanupResponse.ok) {
                throw new Error('Серверные файлы загружены, но helper не смог очистить локальный render job. Черновик сохранён.');
            }

            setRenderJobId('');
            setExportPhase('completed');
            setExportMessage(manifest.outputs.length === expectedOutputCount
                ? 'Экспорт завершён: все финальные ролики загружены.'
                : `Частичная выгрузка готова: ${manifest.outputs.length}/${expectedOutputCount}. Можно добавить ещё видео.`);

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
    const selectedSegmentLocked = Boolean(
        selectedSegmentRow?.isUploaded
        || (selectedSegmentRow?.role === 'intro' && session?.render_manifest?.intro_asset)
    );
    const helperNeedsAttention = helperStatus === 'unavailable' || helperStatus === 'version_mismatch';
    const helperSidebarStatus = helperStatus === 'checking'
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
    const helperProblemTitle = helperStatus === 'version_mismatch'
        ? 'Helper устарел'
        : helperIssueKind === 'safari'
            ? 'Safari не подходит для helper'
        : helperIssueKind === 'browser'
            ? 'Доступ к helper заблокирован'
            : helperIssueKind === 'old'
                ? 'Запущен старый helper'
                : 'Helper не запущен';
    const helperProblemDescription = helperStatus === 'version_mismatch'
        ? 'Скачайте актуальную версию для zagarami.com, откройте приложение и перепроверьте статус.'
        : helperIssueKind === 'safari'
            ? 'Safari блокирует локальный HTTP helper с production HTTPS-страницы. Для текущей версии инструмента используйте Chrome или Яндекс Браузер.'
        : helperIssueKind === 'browser'
            ? 'Нажмите «Разрешить доступ», подтвердите запрос браузера к локальной сети или localhost, затем перепроверьте статус.'
            : helperIssueKind === 'old'
                ? 'Закройте Stones Video Helper, удалите старое приложение и запустите ZAGARAMI Video Helper.'
                : 'Откройте ZAGARAMI Video Helper на Mac. Если приложения нет, скачайте подходящий DMG.';
    const helperSteps = helperIssueKind === 'safari'
        ? ['Откройте эту страницу в Chrome или Яндекс Браузере', 'Убедитесь, что ZAGARAMI Video Helper запущен', 'Нажмите «Проверить снова»']
        : helperIssueKind === 'browser'
        ? ['Нажмите «Разрешить доступ»', 'Подтвердите запрос браузера', 'Нажмите «Проверить снова»']
        : ['Откройте ZAGARAMI Video Helper', 'Нажмите «Проверить»', 'Загрузите вертикальный исходник'];
    const helperQuickActionTitle = helperStatus === 'version_mismatch'
        ? 'Обновите desktop helper'
        : helperIssueKind === 'safari'
            ? 'Safari блокирует helper'
        : helperIssueKind === 'browser'
            ? 'Helper не отвечает в браузере'
            : 'Нужен ZAGARAMI Video Helper';
    const helperQuickActionDescription = helperIssueKind === 'safari'
        ? 'Chrome уже поддерживает этот сценарий после последнего исправления. В Safari текущая HTTP-связка с локальным helper остаётся заблокированной.'
        : helperIssueKind === 'browser'
        ? 'Сайт может вызвать запрос доступа только по клику. Если браузер не покажет окно, разрешение уже заблокировано в настройках браузера или macOS.'
        : helperProblemDescription;
    const statusMessage = error
        || session?.error_message
        || exportMessage
        || notice?.message
        || helperIssueMessage
        || helperSidebarStatus;
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
                ? 'border-white/12 bg-white/[0.06] text-gray-100'
                : 'border-zinc-800 bg-zinc-950/80 text-zinc-300';
    const canCancelSession = Boolean(session && ['OPEN', 'UPLOADING', 'FAILED', 'ABANDONED'].includes(session.status));
    const helperDiagnosticReport = useMemo(() => JSON.stringify({
        page: typeof window === 'undefined' ? '' : window.location.href,
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        helperStatus,
        helperIssueMessage,
        helperBaseUrl,
        expectedProtocol: VIDEO_EXPORT_HELPER_PROTOCOL_VERSION,
        candidates: helperDiagnostics,
        health: helperHealth
            ? {
                helper_version: helperHealth.helper_version,
                protocol_version: helperHealth.protocol_version,
                listen_hosts: helperHealth.listen_hosts,
                allowed_origins: helperHealth.allowed_origins
            }
            : null
    }, null, 2), [helperBaseUrl, helperDiagnostics, helperHealth, helperIssueMessage, helperStatus]);
    const copyHelperDiagnostics = async () => {
        try {
            await navigator.clipboard.writeText(helperDiagnosticReport);
            setHelperDiagnosticCopied(true);
            window.setTimeout(() => setHelperDiagnosticCopied(false), 2200);
        } catch (copyError) {
            console.error(copyError);
            setNotice({
                tone: 'warning',
                message: 'Не удалось скопировать диагностику. Откройте DevTools и скопируйте ошибку из Console.'
            });
        }
    };
    const helperDiagnosticToneClass = (status: HelperDiagnosticStatus) => {
        if (status === 'ok') {
            return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100';
        }

        if (status === 'bad protocol') {
            return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
        }

        return 'border-red-400/25 bg-red-400/10 text-red-100';
    };

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
                <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-[#15161a] px-3 py-2">
                    <button
                        type="button"
                        onClick={() => navigate('/admin/warehouse')}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                        aria-label="Вернуться на склад"
                    >
                        <ArrowLeft size={14} />
                    </button>

                    <div className="min-w-0 flex-1">
                        <h1 data-testid="video-tool-heading" className="text-xs font-semibold text-zinc-100 sm:text-sm">
                            Монтаж видео партии
                        </h1>
                    </div>
                </header>

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

                <div
                    className="flex min-h-0 flex-1 flex-col overflow-y-auto transition-[grid-template-columns] duration-300 lg:grid lg:overflow-hidden"
                    style={{
                        gridTemplateColumns: `minmax(196px,224px) minmax(0,1fr) ${previewPanelWidth}px`
                    }}
                >
                        <aside className="min-h-0 overflow-hidden border-r border-zinc-800 bg-[#17181c] p-3">
                            <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pb-3 pr-1">
                                <section className="rounded-[20px] border border-zinc-800 bg-[#101115] p-4">
                                    <div className="min-w-0">
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Исходники</p>
                                        <p className="mt-1 text-sm font-medium text-zinc-200">
                                            {sources.length > 0 ? `${sources.length} видео` : 'Видео не выбрано'}
                                        </p>
                                    </div>

                                    {sources.length > 0 && (
                                        <div data-testid="source-list" className="mt-3 grid gap-2">
                                            {sources.map((source) => (
                                                <button
                                                    key={`source-${source.sourceIndex}`}
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveSourceIndex(source.sourceIndex);
                                                        syncVideoTime(getSourceTimelineStartMs(sources, source.sourceIndex));
                                                    }}
                                                    className={`rounded-xl border px-3 py-2 text-left transition ${
                                                        activeSourceIndex === source.sourceIndex
                                                            ? 'border-emerald-400/45 bg-emerald-400/10'
                                                            : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-600'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="min-w-0 truncate text-xs font-medium text-zinc-100">{source.name}</span>
                                                        <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-zinc-400">
                                                            {source.role === 'WITH_INTRO' ? 'с интро' : 'без интро'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-[11px] text-zinc-500">{formatDuration(source.durationMs)}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}

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
                                                handleSourcePicked(event.target.files?.[0] || null, 'first');
                                                event.currentTarget.value = '';
                                            }}
                                        />
                                    </label>

                                    {sources.length > 0 && (
                                        <label className="mt-2 inline-flex cursor-pointer items-center rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-100 transition hover:border-zinc-500">
                                            <Plus size={14} />
                                            <span className="ml-2">Добавить ещё видео</span>
                                            <input
                                                data-testid="append-source-input"
                                                aria-label="Добавить ещё видео без интро"
                                                type="file"
                                                accept="video/mp4,video/quicktime,.mov,video/x-m4v,video/webm,video/*"
                                                className="hidden"
                                                onChange={(event) => {
                                                    handleSourcePicked(event.target.files?.[0] || null, 'append');
                                                    event.currentTarget.value = '';
                                                }}
                                            />
                                        </label>
                                    )}

                                </section>

                                <section className="rounded-[20px] border border-zinc-800 bg-[#101115] p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Статус</p>
                                        <button
                                            type="button"
                                            onClick={() => void checkHelper()}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-[11px] text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                                        >
                                            <RefreshCw size={12} />
                                            Проверить
                                        </button>
                                    </div>

                                    <p className={`mt-4 rounded-2xl border px-3 py-3 text-sm leading-6 ${statusMessageToneClass}`}>
                                        {normalizedStatusMessage}
                                    </p>
                                    <p data-testid="blocking-status" className="mt-2 text-xs text-zinc-500">
                                        {exportBlockedReason || 'Готово к экспорту'}
                                    </p>

                                    {helperNeedsAttention && (
                                        <div
                                            data-testid="helper-install-panel"
                                            className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-3"
                                        >
                                            <p className="text-sm font-medium text-amber-50">{helperProblemTitle}</p>
                                            <p className="mt-2 text-sm leading-6 text-amber-100/90">{helperProblemDescription}</p>
                                            <ol className="mt-3 grid gap-2 text-xs text-amber-50/85">
                                                {helperSteps.map((step, index) => (
                                                    <li key={step} className="flex gap-2">
                                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200/15 text-[10px] text-amber-50">
                                                            {index + 1}
                                                        </span>
                                                        <span>{step}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                            <div className="mt-3 grid gap-2">
                                                {helperIssueKind === 'browser' && (
                                                    <button
                                                        type="button"
                                                        data-testid="helper-request-access"
                                                        onClick={() => void requestHelperBrowserAccess()}
                                                        disabled={helperAccessRequesting}
                                                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-200 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        <RefreshCw size={14} />
                                                        {helperAccessRequesting ? 'Запрашиваем доступ' : 'Разрешить доступ'}
                                                    </button>
                                                )}
                                                {helperNeedsDownload && helperDownloadConfigured && (
                                                    <button
                                                        type="button"
                                                        data-testid="helper-download"
                                                        onClick={openHelperDownload}
                                                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/20 px-3 py-2 text-xs font-medium text-amber-50 transition hover:bg-amber-300/25"
                                                    >
                                                        <HardDriveDownload size={14} />
                                                        Скачать для Intel
                                                    </button>
                                                )}
                                                {helperNeedsDownload && helperDownloadArm64Configured && (
                                                    <button
                                                        type="button"
                                                        data-testid="helper-download-arm64"
                                                        onClick={openHelperDownloadArm64}
                                                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/20 px-3 py-2 text-xs font-medium text-amber-50 transition hover:bg-amber-300/25"
                                                    >
                                                        <HardDriveDownload size={14} />
                                                        Скачать для Apple Silicon
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    data-testid="helper-recheck"
                                                    onClick={() => void checkHelper()}
                                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-100 transition hover:border-zinc-500 hover:text-white"
                                                >
                                                    <RefreshCw size={14} />
                                                    Проверить снова
                                                </button>
                                            </div>
                                            {helperDiagnostics.length > 0 && (
                                                <div
                                                    data-testid="helper-diagnostics"
                                                    className="mt-3 rounded-2xl border border-zinc-700/70 bg-zinc-950/70 p-3"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-xs font-medium text-zinc-100">Диагностика браузера</p>
                                                        <button
                                                            type="button"
                                                            data-testid="helper-copy-diagnostics"
                                                            onClick={() => void copyHelperDiagnostics()}
                                                            className="inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-[11px] text-zinc-100 transition hover:border-zinc-500"
                                                        >
                                                            <Clipboard size={13} />
                                                            {helperDiagnosticCopied ? 'Скопировано' : 'Скопировать'}
                                                        </button>
                                                    </div>
                                                    <div className="mt-3 grid gap-2">
                                                        {helperDiagnostics.map((entry) => (
                                                            <div
                                                                key={`${entry.url}-${entry.mode || 'standard'}`}
                                                                className={`rounded-xl border px-2.5 py-2 text-[11px] leading-5 ${helperDiagnosticToneClass(entry.status)}`}
                                                            >
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <span className="font-mono text-[10px]">{entry.url}{entry.mode ? ` (${entry.mode})` : ''}</span>
                                                                    <span className="uppercase tracking-[0.12em]">{entry.status}</span>
                                                                </div>
                                                                <p className="mt-1 text-zinc-300">
                                                                    {entry.httpStatus ? `HTTP ${entry.httpStatus}. ` : ''}
                                                                    {entry.protocolVersion ? `protocol ${entry.protocolVersion}. ` : ''}
                                                                    {entry.detail}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <p className="mt-3 break-words text-[10px] leading-4 text-zinc-500">
                                                        {typeof navigator === 'undefined' ? '' : navigator.userAgent}
                                                    </p>
                                                </div>
                                            )}
                                            {helperNeedsDownload && !helperDownloadConfigured && !helperDownloadArm64Configured && (
                                                <p className="mt-3 text-xs leading-5 text-amber-100/75">
                                                    Ссылка на production DMG ещё не настроена в `VITE_VIDEO_HELPER_DOWNLOAD_URL`.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {draft && (
                                        <div
                                            data-testid="draft-banner"
                                            className="mt-4 rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-3 text-sm text-gray-100"
                                        >
                                            <p>Найден локальный draft: {draft.segments.length} фрагментов.</p>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleDiscardDraft}
                                                className="mt-2 h-auto justify-start px-0 py-0 text-gray-100 hover:bg-transparent"
                                            >
                                                Сбросить черновик
                                            </Button>
                                        </div>
                                    )}

                                    <div className="mt-4 grid gap-2 text-xs text-zinc-300">
                                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
                                            Загружено: {session ? `${session.uploaded_count}/${session.expected_count}` : `0/${expectedOutputCount}`}
                                        </div>
                                        {(renderProgress.total > 0 || exportPhase === 'rendering' || exportPhase === 'uploading') && (
                                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
                                                {exportPhaseLabel[exportPhase]}: {renderProgress.total ? `${renderProgress.processed}/${renderProgress.total}` : '—'}
                                            </div>
                                        )}
                                        {session && (
                                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
                                                Сессия: {sessionStatusLabel[session.status] || session.status}
                                            </div>
                                        )}
                                        {helperHealth?.helper_version && (
                                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
                                                Версия helper: {helperHealth.helper_version}
                                            </div>
                                        )}
                                    </div>
                                </section>

                            </div>
                        </aside>

                    <section className="relative min-h-0 bg-[#131418] p-3">
                        <div className="flex h-full min-h-0 flex-col gap-3">
                            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-zinc-800 bg-[#17191e]">
                                <div className={`min-h-0 flex-1 p-3 ${segments.length === 0 ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                                    {segments.length === 0 ? (
                                        <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center text-sm text-zinc-500">
                                            <div className="max-w-xl">
                                                <p className="text-base font-medium text-zinc-200">Рабочая область появится после исходника</p>
                                                <p className="mt-2 leading-6">
                                                    Сначала решите статус helper’а, затем загрузите вертикальный ролик. После загрузки здесь появятся интро, товарные клипы и стыки.
                                                </p>
                                            </div>
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
                                                        ? 'bg-white/[0.06] text-gray-100'
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
                                                                    ? 'border-white/12 bg-white/[0.06]'
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
                                    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-800 px-3 py-2 whitespace-nowrap">
                                        <Button
                                            data-testid="action-cut"
                                            aria-label="Разрезать"
                                            size="sm"
                                            onClick={() => applySegmentEdit((current) => splitSegmentAt(current, playheadMs))}
                                            disabled={sources.length === 0 || !durationMs}
                                            variant="secondary"
                                            className="!h-8 !min-h-0 rounded-lg border-zinc-700 bg-zinc-900 px-2.5 py-0 text-[11px] text-zinc-100 shadow-none hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-40"
                                        >
                                            <Scissors size={14} />
                                            Разрезать
                                        </Button>
                                        <Button
                                            data-testid="action-delete"
                                            aria-label={selectedSegmentIsDeleted ? 'Вернуть фрагмент' : 'Удалить фрагмент'}
                                            variant={selectedSegmentIsDeleted ? 'ghost' : 'danger'}
                                            size="sm"
                                            onClick={() => applySegmentEdit((current) => toggleSegmentDeletedAt(current, selectedSegmentIndex))}
                                            disabled={!selectedSegment || selectedSegmentLocked}
                                            className={selectedSegmentIsDeleted
                                                ? '!h-8 !min-h-0 rounded-lg border border-emerald-400/40 bg-emerald-400/12 px-2.5 py-0 text-[11px] text-emerald-100 hover:bg-emerald-400/18 hover:text-emerald-50 disabled:opacity-40'
                                                : '!h-8 !min-h-0 rounded-lg px-2.5 py-0 text-[11px] shadow-none disabled:opacity-40'}
                                        >
                                            {selectedSegmentIsDeleted ? <RotateCcw size={14} /> : <Trash2 size={14} />}
                                            {selectedSegmentIsDeleted ? 'Вернуть' : 'Удалить'}
                                        </Button>
                                        <Button
                                            data-testid="action-export"
                                            aria-label="Экспорт"
                                            size="sm"
                                            onClick={() => void handleExport()}
                                            disabled={Boolean(exportBlockedReason) || exportPhase === 'preparing' || exportPhase === 'rendering' || exportPhase === 'uploading'}
                                            variant="primary"
                                            className="!h-8 !min-h-0 rounded-lg px-2.5 py-0 text-[11px] shadow-none disabled:opacity-40"
                                        >
                                            <HardDriveDownload size={14} />
                                            Экспорт
                                        </Button>
                                        {canCancelSession && (
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => void handleCancelSession()}
                                                disabled={exportPhase === 'rendering' || exportPhase === 'uploading'}
                                                className="!h-8 !min-h-0 rounded-lg px-2.5 py-0 text-[11px] shadow-none"
                                            >
                                                <Ban size={14} />
                                                Отменить
                                            </Button>
                                        )}
                                        <span
                                            data-testid="clip-counter"
                                            className="ml-1 rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-zinc-200"
                                        >
                                            {clipCounterText}
                                        </span>
                                        <span className="ml-auto text-[9px] text-zinc-500">Масштаб {timelineViewport.zoom.toFixed(1)}x</span>
                                        <button
                                            type="button"
                                            onClick={() => zoomTimelineByFactor(TIMELINE_ZOOM_STEP)}
                                            disabled={!durationMs || visibleDurationMs >= durationMs}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Minus size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => zoomTimelineByFactor(1 / TIMELINE_ZOOM_STEP)}
                                            disabled={!durationMs || visibleDurationMs <= getTimelineMinVisibleDuration(durationMs)}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Plus size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={fitTimelineToAll}
                                            disabled={!durationMs}
                                            className="inline-flex h-6 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[10px] text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Maximize2 size={12} />
                                            Показать всё
                                        </button>
                                    </div>

                                <div className="h-[268px] px-3 pb-3 pt-2.5">
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

                                                const rect = timelineRef.current.getBoundingClientRect();
                                                handleTimelineWheel(event, rect);
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

                                                const rect = event.currentTarget.getBoundingClientRect();
                                                handleTimelineWheel(event, rect);
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
                                                                    ? 'border-white/12 bg-white/[0.06] text-gray-100'
                                                                    : 'border-white/16 bg-white/[0.12] text-white hover:bg-white/[0.16]'
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

                                                if (isSourceBoundaryBetween(segment, segments[index + 1])) {
                                                    return (
                                                        <div
                                                            key={`source-boundary-${segment.sequence}`}
                                                            data-testid={`source-boundary-${segment.sequence}`}
                                                            className="pointer-events-none absolute inset-y-4 z-20 w-1 -translate-x-1/2 bg-amber-200/80 shadow-[0_0_14px_rgba(253,230,138,0.35)]"
                                                            style={{ left: `${((segment.endMs - visibleStartMs) / visibleDurationMs) * 100}%` }}
                                                        />
                                                    );
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
                                                className={`relative h-2 w-full rounded-full bg-zinc-900 ${timelineViewport.isPanning ? 'ring-1 ring-white/20' : ''}`}
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
                                                    className="absolute inset-y-0 rounded-full border border-white/25 bg-white/25 shadow-[0_0_20px_rgba(255,255,255,0.12)]"
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

                    <section className="relative min-h-0 border-l border-zinc-800 bg-[#121317] p-3">
                        <button
                            type="button"
                            className="absolute bottom-0 left-0 top-0 z-30 w-2 -translate-x-1/2 cursor-col-resize touch-none border-l border-transparent text-zinc-700 transition hover:border-emerald-300/70 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
                            onPointerDown={(event) => {
                                event.preventDefault();
                                previewResizeRef.current = {
                                    startClientX: event.clientX,
                                    startWidth: previewPanelWidth
                                };
                            }}
                            aria-label="Изменить ширину окна просмотра"
                            title="Потяните, чтобы изменить ширину просмотра"
                        >
                            <span className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                        </button>
                        <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden rounded-[28px] border border-zinc-800 bg-[#090a0d]">
                            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/65 via-black/25 to-transparent px-4 py-4 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
                                <span>Просмотр</span>
                                <span className="inline-flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPreviewPanelWidth(clampPreviewPanelWidth(PREVIEW_PANEL_DEFAULT_WIDTH))}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                                        aria-label="Сбросить ширину просмотра"
                                        title="Сбросить ширину просмотра"
                                    >
                                        <RotateCcw size={13} />
                                    </button>
                                    <span>{selectedSegmentRow?.displaySequence || (selectedSegmentRow?.isDeleted ? 'del' : '—')}</span>
                                </span>
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
                                            onTimeUpdate={(event) => {
                                                const offsetMs = activeSource
                                                    ? getSourceTimelineStartMs(sources, activeSource.sourceIndex)
                                                    : 0;
                                                setPlayheadMs(offsetMs + Math.round(event.currentTarget.currentTime * 1000));
                                            }}
                                            onError={() => {
                                                if (activeSource) {
                                                    setSources((current) => current.map((source) => source.sourceIndex === activeSource.sourceIndex
                                                        ? { ...source, previewUnavailable: true }
                                                        : source));
                                                }
                                                setIsPlaying(false);
                                                if (activeSource) {
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
                                                    {sourceUrl && sourcePreviewUnavailable
                                                        ? 'Превью недоступно'
                                                        : helperNeedsAttention
                                                            ? helperProblemTitle
                                                            : 'Загрузите вертикальный исходник'}
                                                </p>
                                                {helperNeedsAttention && !sourceUrl ? (
                                                    <ol className="mt-4 grid gap-2 text-left text-xs leading-5 text-zinc-300">
                                                        {helperSteps.map((step, index) => (
                                                            <li key={`preview-helper-step-${step}`} className="flex gap-2">
                                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] text-zinc-100">
                                                                    {index + 1}
                                                                </span>
                                                                <span>{step}</span>
                                                            </li>
                                                        ))}
                                                    </ol>
                                                ) : (
                                                    <p className="mt-2 text-sm text-zinc-400">
                                                        {sourceUrl && sourcePreviewUnavailable
                                                            ? 'MOV/H.265 уже принят helper. Можно резать таймлайн и запускать экспорт без превью.'
                                                            : 'После загрузки появятся просмотр и навигация по стыкам.'}
                                                    </p>
                                                )}
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
