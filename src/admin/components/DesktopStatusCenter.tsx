import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Activity,
    BadgeInfo,
    Download,
    HardDrive,
    Info,
    LoaderCircle,
    RefreshCw,
    Server,
    TestTube2,
    UploadCloud,
    Video,
    Wifi,
    X,
    CheckCircle2,
    AlertCircle,
    Terminal,
    Copy,
    ExternalLink,
    Sparkles
} from 'lucide-react';
import {
    getStonesDesktop,
    isStonesDesktop,
    type StonesDesktopDiagnostics,
    type StonesHqUpdateDownloadResult,
    type StonesHqUpdateInfo,
    type StonesMediaQueueJob,
    type StonesMediaQueueSnapshot,
    type StonesMediaWorkflow,
    type StonesMediaWorkflowSnapshot
} from '../../utils/desktop';
import { apiFetch } from '../../utils/apiFetch';
import { getBufferedClientLogs } from '../../utils/clientLogger';
import { runBatchCreationDiagnostics, type BatchDiagnosticsLog } from '../services/batchDiagnostics';

type StatusTone = 'ok' | 'warning' | 'error' | 'checking' | 'offline';
type StatusTab = 'overview' | 'queue' | 'helper' | 'updates' | 'diagnostics';
type OpenStatusCenterDetail = {
    tab?: StatusTab;
    focus?: {
        type: 'queue-job' | 'workflow';
        id: string;
    };
};

type WebStatusSnapshot = {
    online: boolean;
    apiReachable: boolean;
    checkedAt: string | null;
    apiError: string;
};

const emptyQueue: StonesMediaQueueSnapshot = {
    jobs: [],
    counts: {}
};

const emptyWorkflowSnapshot: StonesMediaWorkflowSnapshot = {
    workflows: [],
    counts: {}
};

const emptyWebStatus: WebStatusSnapshot = {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    apiReachable: false,
    checkedAt: null,
    apiError: ''
};

const statusToneClass: Record<StatusTone, string> = {
    ok: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
    warning: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
    error: 'border-red-400/30 bg-red-500/10 text-red-100',
    checking: 'border-sky-300/25 bg-sky-400/10 text-sky-100',
    offline: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-200'
};

const jobStatusLabel: Record<string, string> = {
    staging: 'Подготовка',
    queued: 'В очереди',
    uploading: 'Загрузка',
    retrying: 'Повтор',
    failed: 'Ошибка',
    done: 'Готово',
    cancelled: 'Отменено',
    auth_required: 'Нужен вход'
};

const jobTypeLabel: Record<string, string> = {
    PHOTO_TOOL_APPLY: 'Photo Tool',
    VIDEO_INTRO_UPLOAD: 'Video intro',
    VIDEO_RENDER_UPLOAD: 'Video render'
};

const workflowPhaseLabel: Record<string, string> = {
    queued: 'В очереди',
    converting: 'Конвертация',
    uploading: 'Загрузка',
    verifying: 'Проверка',
    preparing_session: 'Подготовка session',
    importing_sources: 'Импорт source',
    rendering_intro: 'Сборка intro',
    rendering_outputs: 'Рендер',
    uploading_outputs: 'Загрузка MP4',
    paused_offline: 'Пауза: нет связи',
    auth_required: 'Нужен вход',
    failed: 'Ошибка',
    completed: 'Готово',
    cancelled: 'Отменено'
};

const normalizeQueueOrWorkflowError = (value: string | null | undefined) => {
    const message = String(value || '').trim();
    if (!message) {
        return '';
    }

    if (/fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|ENETUNREACH|network|offline|timeout/i.test(message)) {
        return 'Сервер недоступен. Задача продолжит работу после восстановления связи.';
    }

    if (/401|403|auth|token|войти/i.test(message)) {
        return 'Нужно войти в HQ заново. После входа задача продолжит работу.';
    }

    return message;
};

const formatBytes = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 'Не указан';
    }

    if (value <= 0) {
        return '0 KB';
    }

    if (value < 1024 * 1024) {
        return `${Math.round(value / 1024)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const getQueueCounts = (queue: StonesMediaQueueSnapshot) => {
    const active = (queue.counts.queued || 0)
        + (queue.counts.uploading || 0)
        + (queue.counts.retrying || 0);
    const failed = queue.counts.failed || 0;
    const done = queue.counts.done || 0;
    const blockedAuth = queue.counts.auth_required || 0;
    const cancelled = queue.counts.cancelled || 0;
    const stuck = queue.jobs.filter((job) => job.stuck).length;
    return { active, failed, done, blockedAuth, cancelled, stuck };
};

const activeQueueStatuses = new Set(['queued', 'uploading', 'retrying']);

type VideoUploadGroup = {
    id: string;
    title: string;
    total: number;
    done: number;
    active: number;
    failed: number;
    blockedAuth: number;
    jobs: StonesMediaQueueJob[];
};

const getVideoUploadGroups = (jobs: StonesMediaQueueJob[]) => {
    const groups = new Map<string, VideoUploadGroup>();
    for (const job of jobs) {
        const summary = job.summary;
        if (job.type !== 'VIDEO_RENDER_UPLOAD' || summary?.groupKind !== 'VIDEO_EXPORT_UPLOAD' || !summary.groupId) {
            continue;
        }

        const group = groups.get(summary.groupId) || {
            id: summary.groupId,
            title: summary.groupTitle || 'Видео партии',
            total: summary.groupTotal || 0,
            done: 0,
            active: 0,
            failed: 0,
            blockedAuth: 0,
            jobs: []
        };
        group.jobs.push(job);
        group.total = Math.max(group.total, group.jobs.length);
        if (job.status === 'done') {
            group.done += 1;
        }
        if (activeQueueStatuses.has(job.status)) {
            group.active += 1;
        }
        if (job.status === 'failed') {
            group.failed += 1;
        }
        if (job.status === 'auth_required') {
            group.blockedAuth += 1;
        }
        groups.set(summary.groupId, group);
    }

    return Array.from(groups.values()).sort((left, right) => {
        const leftUpdated = left.jobs[0]?.updatedAt || '';
        const rightUpdated = right.jobs[0]?.updatedAt || '';
        return rightUpdated.localeCompare(leftUpdated);
    });
};

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
    return (
        <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium ${statusToneClass[tone]}`}>
            {children}
        </span>
    );
}

function StatusCard({
    icon,
    title,
    value,
    detail,
    tone = 'ok'
}: {
    icon: ReactNode;
    title: string;
    value: string;
    detail?: string;
    tone?: StatusTone;
}) {
    return (
        <div className={`rounded-2xl border p-3 ${statusToneClass[tone]}`}>
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20">
                    {icon}
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.16em] opacity-65">{title}</p>
                    <p className="mt-1 truncate text-sm font-semibold">{value}</p>
                    {detail ? <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-75">{detail}</p> : null}
                </div>
            </div>
        </div>
    );
}

type BackgroundProgress = {
    key: 'photo' | 'video';
    label: string;
    detail: string;
    percent: number;
    active: number;
    failed: number;
    blocked: number;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const roleLabel: Record<string, string> = {
    ADMIN: 'Админ',
    MANAGER: 'Менеджер HQ',
    SALES_MANAGER: 'Продажи',
    FRANCHISEE: 'Партнер',
    USER: 'Пользователь'
};

const formatCheckedAt = (value: string | null | undefined) => {
    if (!value) {
        return 'Не проверялось';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Не проверялось';
    }

    return date.toLocaleString();
};

const getPhotoWorkflowStagePercent = (phase: StonesMediaWorkflow['phase']) => {
    if (phase === 'completed') {
        return 100;
    }
    if (phase === 'verifying') {
        return 82;
    }
    if (phase === 'uploading') {
        return 58;
    }
    if (phase === 'converting') {
        return 28;
    }
    if (phase === 'queued') {
        return 8;
    }
    return 0;
};

function MiniProgressStrip({ item }: { item: BackgroundProgress }) {
    const tone = item.failed > 0
        ? 'bg-red-300'
        : item.blocked > 0
            ? 'bg-amber-200'
            : 'bg-sky-200';

    return (
        <div className="min-w-[150px] rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="font-semibold uppercase tracking-[0.14em] text-gray-200">{item.label}</span>
                <span className="text-gray-400">{item.percent}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full transition-[width] ${tone}`} style={{ width: `${item.percent}%` }} />
            </div>
            <p className="mt-1 truncate text-[10px] text-gray-400">{item.detail}</p>
        </div>
    );
}

function JobRow({
    job,
    onRetry,
    onCancel,
    onOpenPhotoTool
}: {
    job: StonesMediaQueueJob;
    onRetry: (jobId: string) => void;
    onCancel: (jobId: string) => void;
    onOpenPhotoTool: (job: StonesMediaQueueJob) => void;
}) {
    const isPhotoToolStale = job.blockingReason === 'photo_tool_state_stale';
    const canRetry = !isPhotoToolStale && (job.status === 'failed' || job.status === 'auth_required');
    const canCancel = job.status === 'queued' || job.status === 'retrying' || job.status === 'failed' || job.status === 'auth_required';
    const normalizedLastError = normalizeQueueOrWorkflowError(job.lastError);

    return (
        <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{job.summary?.title || job.summary?.fileName || jobTypeLabel[job.type] || job.type}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gray-500">{jobStatusLabel[job.status] || job.status}</p>
                    <p className="mt-1 text-xs text-gray-400">
                        {[job.summary?.batchLabel || job.summary?.batchId, job.summary?.subtitle, job.summary?.fileName].filter(Boolean).join(' · ')}
                    </p>
                    {job.summary?.serialNumber ? (
                        <p className="mt-1 text-xs text-gray-400">Серийный номер: {job.summary.serialNumber}</p>
                    ) : null}
                    {job.nextAttemptAt ? (
                        <p className="mt-1 text-xs text-gray-500">Следующий retry: {new Date(job.nextAttemptAt).toLocaleString()}</p>
                    ) : null}
                    {job.stuck ? <p className="mt-1 text-xs font-semibold text-amber-100">Возможный stuck</p> : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                    {isPhotoToolStale ? (
                        <button
                            type="button"
                            onClick={() => onOpenPhotoTool(job)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-gray-200 transition hover:bg-white/5"
                        >
                            Открыть Photo Tool
                        </button>
                    ) : null}
                    {canRetry ? (
                        <button
                            type="button"
                            onClick={() => onRetry(job.id)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-gray-200 transition hover:bg-white/5"
                        >
                            <RefreshCw size={12} />
                            Повторить
                        </button>
                    ) : null}
                    {canCancel ? (
                        <button
                            type="button"
                            onClick={() => onCancel(job.id)}
                            className="inline-flex min-h-8 items-center rounded-lg border border-red-400/25 px-2.5 text-[11px] text-red-100 transition hover:bg-red-500/10"
                        >
                            {isPhotoToolStale ? 'Убрать' : 'Отменить'}
                        </button>
                    ) : null}
                </div>
            </div>
            {job.lastError ? (
                <p className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-xs leading-5 text-red-100/85">
                    {isPhotoToolStale
                        ? 'Партия была изменена после постановки этой фоновой задачи. Повтор этой задачи небезопасен: откройте Photo Tool, проверьте актуальные назначения и сохраните заново. Если задача больше не нужна, нажмите “Убрать”.'
                        : normalizedLastError}
                </p>
            ) : null}
        </div>
    );
}

function WorkflowRow({
    workflow,
    onRetry,
    onCancel,
    onOpen
}: {
    workflow: StonesMediaWorkflow;
    onRetry: (workflowId: string) => void;
    onCancel: (workflowId: string) => void;
    onOpen: (workflow: StonesMediaWorkflow) => void;
}) {
    const canRetry = workflow.phase === 'failed' || workflow.phase === 'auth_required' || workflow.phase === 'paused_offline';
    const canCancel = !['completed', 'cancelled'].includes(workflow.phase);
    const tone = workflow.phase === 'failed'
        ? 'border-red-400/25 bg-red-500/10'
        : workflow.phase === 'auth_required' || workflow.phase === 'paused_offline'
            ? 'border-amber-300/25 bg-amber-300/10'
            : workflow.phase === 'completed'
                ? 'border-emerald-400/20 bg-emerald-400/10'
                : 'border-sky-400/20 bg-sky-400/10';
    const total = Math.max(workflow.progress.total || 0, 0);
    const completed = Math.min(Math.max(workflow.progress.completed || 0, 0), total || workflow.progress.completed || 0);
    const left = Math.max(total - completed, 0);
    const detail = workflow.kind === 'VIDEO_EXPORT_WORKFLOW'
        ? `загружено ${completed}/${total}, осталось ${left}`
        : `${total} фото`;
    const normalizedLastError = normalizeQueueOrWorkflowError(workflow.lastError);

    return (
        <div className={`rounded-2xl border p-3 ${tone}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                        {workflow.summary?.title || (workflow.kind === 'VIDEO_EXPORT_WORKFLOW' ? 'Video workflow' : 'Photo workflow')}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gray-500">{workflowPhaseLabel[workflow.phase] || workflow.phase}</p>
                    <p className="mt-1 text-xs text-gray-300">
                        Batch: {workflow.summary?.batchLabel || workflow.batchId.slice(0, 8)} · {workflow.summary?.subtitle || detail}
                        {workflow.summary?.currentSerial ? ` · сейчас ${workflow.summary.currentSerial}` : ''}
                    </p>
                    {workflow.nextAttemptAt ? (
                        <p className="mt-1 text-xs text-gray-500">Следующая попытка: {new Date(workflow.nextAttemptAt).toLocaleString()}</p>
                    ) : null}
                    {workflow.stuck ? <p className="mt-1 text-xs font-semibold text-amber-100">Возможный stuck</p> : null}
                    {normalizedLastError ? (
                        <p className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-xs leading-5 text-red-100/85">
                            {normalizedLastError}
                        </p>
                    ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    <button
                        type="button"
                        onClick={() => onOpen(workflow)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-gray-200 transition hover:bg-white/5"
                    >
                        Открыть batch
                    </button>
                    {canRetry ? (
                        <button
                            type="button"
                            onClick={() => onRetry(workflow.id)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-gray-200 transition hover:bg-white/5"
                        >
                            <RefreshCw size={12} />
                            Повторить
                        </button>
                    ) : null}
                    {canCancel ? (
                        <button
                            type="button"
                            onClick={() => onCancel(workflow.id)}
                            className="inline-flex min-h-8 items-center rounded-lg border border-red-400/25 px-2.5 text-[11px] text-red-100 transition hover:bg-red-500/10"
                        >
                            Отменить
                        </button>
                    ) : null}
                </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
                <div className="h-full rounded-full bg-white/70 transition-[width]" style={{ width: `${workflow.progress.total > 0 ? Math.round((workflow.progress.completed / workflow.progress.total) * 100) : 0}%` }} />
            </div>
        </div>
    );
}

function VideoUploadGroupCard({
    group,
    onRetry,
    onCancel
}: {
    group: VideoUploadGroup;
    onRetry: (jobId: string) => void;
    onCancel: (jobId: string) => void;
}) {
    const progress = group.total > 0 ? Math.round((group.done / group.total) * 100) : 0;
    const activeJob = group.jobs.find((job) => job.status === 'uploading')
        || group.jobs.find((job) => activeQueueStatuses.has(job.status))
        || group.jobs.find((job) => job.status === 'failed' || job.status === 'auth_required')
        || group.jobs[0];
    const retryableJobs = group.jobs.filter((job) => job.status === 'failed' || job.status === 'auth_required');
    const cancellableJobs = group.jobs.filter((job) => job.status === 'queued' || job.status === 'retrying' || job.status === 'failed' || job.status === 'auth_required');
    const tone = group.failed > 0
        ? 'border-red-400/25 bg-red-500/10'
        : group.done === group.total
            ? 'border-emerald-400/20 bg-emerald-400/10'
            : 'border-sky-400/20 bg-sky-400/10';

    return (
        <div className={`rounded-2xl border p-3 ${tone}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{group.title}</p>
                    <p className="mt-1 text-xs text-gray-300">
                        Видео партии: {group.done}/{group.total} MP4
                        {group.active > 0 ? `, активных ${group.active}` : ''}
                        {group.failed > 0 ? `, ошибок ${group.failed}` : ''}
                        {group.blockedAuth > 0 ? `, нужен вход ${group.blockedAuth}` : ''}
                    </p>
                    {activeJob?.summary?.serialNumber ? (
                        <p className="mt-1 text-xs text-gray-400">
                            Текущий serial: {activeJob.summary.serialNumber} · {jobStatusLabel[activeJob.status] || activeJob.status}
                        </p>
                    ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {retryableJobs.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => retryableJobs.forEach((job) => onRetry(job.id))}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-gray-200 transition hover:bg-white/5"
                        >
                            <RefreshCw size={12} />
                            Повторить ошибки
                        </button>
                    ) : null}
                    {cancellableJobs.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => cancellableJobs.forEach((job) => onCancel(job.id))}
                            className="inline-flex min-h-8 items-center rounded-lg border border-red-400/25 px-2.5 text-[11px] text-red-100 transition hover:bg-red-500/10"
                        >
                            Отменить группу
                        </button>
                    ) : null}
                </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
                <div className="h-full rounded-full bg-white/70 transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            {group.jobs.some((job) => job.lastError) ? (
                <div className="mt-3 grid gap-2">
                    {group.jobs.filter((job) => job.lastError).slice(0, 3).map((job) => (
                        <p key={job.id} className="rounded-xl border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-xs leading-5 text-red-100/85">
                            {job.summary?.serialNumber ? `${job.summary.serialNumber}: ` : ''}{job.lastError}
                        </p>
                    ))}
                </div>
            ) : null}
            <p className="mt-2 text-[11px] text-gray-500">Показано {group.jobs.length} из {group.total}</p>
        </div>
    );
}

export function DesktopStatusCenter() {
    const location = useLocation();
    const desktop = getStonesDesktop();
    const isDesktopRuntime = isStonesDesktop() && Boolean(desktop);
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<StatusTab>('overview');
    const [diagnostics, setDiagnostics] = useState<StonesDesktopDiagnostics | null>(null);
    const [webStatus, setWebStatus] = useState<WebStatusSnapshot>(emptyWebStatus);
    const [queue, setQueue] = useState<StonesMediaQueueSnapshot>(emptyQueue);
    const [workflowSnapshot, setWorkflowSnapshot] = useState<StonesMediaWorkflowSnapshot>(emptyWorkflowSnapshot);
    const [update, setUpdate] = useState<StonesHqUpdateInfo | StonesHqUpdateDownloadResult | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [downloadingUpdate, setDownloadingUpdate] = useState(false);
    const [actionError, setActionError] = useState('');
    const [exportedDiagnosticsPath, setExportedDiagnosticsPath] = useState('');
    const [exportedLogsPath, setExportedLogsPath] = useState('');
    const [batchDiagnosticsLog, setBatchDiagnosticsLog] = useState<BatchDiagnosticsLog>({
        status: 'idle',
        steps: [],
        mediaDiagnostics: []
    });
    
    const consoleEndRef = useRef<HTMLDivElement | null>(null);
    
    useEffect(() => {
        if (consoleEndRef.current) {
            consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [batchDiagnosticsLog.mediaDiagnostics]);
    const currentRole = localStorage.getItem('userRole') || '';
    const currentRoleLabel = roleLabel[currentRole] || currentRole || 'Не определена';

    const queueCounts = useMemo(() => getQueueCounts(queue), [queue]);
    const workflows = workflowSnapshot.workflows;
    const activeWorkflowCount = workflows.filter((workflow) => !['completed', 'cancelled', 'failed'].includes(workflow.phase)).length;
    const failedWorkflowCount = workflows.filter((workflow) => workflow.phase === 'failed').length;
    const videoUploadGroups = useMemo(() => getVideoUploadGroups(queue.jobs), [queue.jobs]);
    const groupedJobIds = useMemo(() => new Set(videoUploadGroups.flatMap((group) => group.jobs.map((job) => job.id))), [videoUploadGroups]);
    const standaloneQueueJobs = useMemo(() => queue.jobs.filter((job) => !groupedJobIds.has(job.id)), [groupedJobIds, queue.jobs]);
    const networkTone: StatusTone = diagnostics?.network.apiReachable ? 'ok' : diagnostics?.network.online ? 'warning' : 'offline';
    const helperTone: StatusTone = diagnostics?.helper.ok ? 'ok' : 'error';
    const queueTone: StatusTone = queueCounts.failed > 0 || queueCounts.stuck > 0 ? 'error' : queueCounts.blockedAuth > 0 ? 'warning' : queueCounts.active > 0 ? 'checking' : 'ok';
    const workflowTone: StatusTone = failedWorkflowCount > 0 || (diagnostics?.workflows?.stuck || 0) > 0 ? 'error' : (diagnostics?.workflows?.blockedAuth || diagnostics?.workflows?.blockedOffline || 0) > 0 ? 'warning' : activeWorkflowCount > 0 ? 'checking' : 'ok';
    const cachedUpdate = diagnostics?.update || null;
    const updateChecked = Boolean(update || cachedUpdate?.checked);
    const updateAvailable = update?.updateAvailable ?? cachedUpdate?.updateAvailable ?? false;
    const updateVersion = update?.version ?? cachedUpdate?.version;
    const updateError = cachedUpdate?.error;
    const updateStatus = update?.status ?? cachedUpdate?.status;
    const isUpdateNotConfigured = updateStatus === 'not_configured';
    const isUpdateManifestMissing = updateStatus === 'manifest_missing';
    const isUpdateManifestInvalid = updateStatus === 'manifest_invalid';
    const isUpdateCheckFailed = updateStatus === 'check_failed';
    const isUpdateDownloadFailed = updateStatus === 'download_failed';
    const updateTone: StatusTone = updateError && !isUpdateNotConfigured
        ? 'error'
        : isUpdateNotConfigured || isUpdateManifestMissing
            ? 'warning'
            : updateAvailable
            ? 'warning'
            : updateChecked
                ? 'ok'
                : 'offline';
    const updateLabel = isUpdateNotConfigured
        ? 'Обновления не настроены'
        : isUpdateManifestMissing
        ? 'Manifest не найден'
        : isUpdateManifestInvalid
        ? 'Manifest битый'
        : isUpdateCheckFailed
        ? 'Проверка не удалась'
        : isUpdateDownloadFailed
        ? 'Скачивание не удалось'
        : updateAvailable
            ? `Версия ${updateVersion}`
            : updateChecked
                ? 'Актуально'
                : 'Не проверено';
    const activeVideoUploads = videoUploadGroups.reduce((total, group) => total + group.active, 0);
    const backgroundProgress = useMemo<BackgroundProgress[]>(() => {
        const photoQueueJobs = queue.jobs.filter((job) => job.type === 'PHOTO_TOOL_APPLY');
        const videoQueueJobs = queue.jobs.filter((job) => job.type === 'VIDEO_INTRO_UPLOAD');
        const photoWorkflows = workflows.filter((workflow) => workflow.kind === 'PHOTO_APPLY_WORKFLOW');
        const videoWorkflows = workflows.filter((workflow) => workflow.kind === 'VIDEO_EXPORT_WORKFLOW');

        const photoQueueTotal = photoQueueJobs.reduce((total, job) => total + Math.max(1, Number(job.summary?.total || 1)), 0);
        const photoQueueDone = photoQueueJobs.reduce((total, job) => total + (job.status === 'done' ? Math.max(1, Number(job.summary?.total || 1)) : 0), 0);
        const photoWorkflowTotal = photoWorkflows.reduce((total, workflow) => total + Math.max(1, workflow.progress.total || 1), 0);
        const photoWorkflowDone = photoWorkflows.reduce((total, workflow) => {
            const units = Math.max(1, workflow.progress.total || 1);
            return total + (units * getPhotoWorkflowStagePercent(workflow.phase) / 100);
        }, 0);
        const photoTotal = photoQueueTotal + photoWorkflowTotal;
        const photoDone = photoQueueDone + photoWorkflowDone;
        const photoActive = photoQueueJobs.filter((job) => activeQueueStatuses.has(job.status)).length
            + photoWorkflows.filter((workflow) => !['completed', 'cancelled', 'failed'].includes(workflow.phase)).length;
        const photoFailed = photoQueueJobs.filter((job) => job.status === 'failed').length
            + photoWorkflows.filter((workflow) => workflow.phase === 'failed').length;
        const photoBlocked = photoQueueJobs.filter((job) => job.status === 'auth_required').length
            + photoWorkflows.filter((workflow) => workflow.phase === 'auth_required' || workflow.phase === 'paused_offline').length;

        const videoGroupTotal = videoUploadGroups.reduce((total, group) => total + Math.max(group.total, group.jobs.length), 0);
        const videoGroupDone = videoUploadGroups.reduce((total, group) => total + group.done, 0);
        const videoQueueTotal = videoQueueJobs.length;
        const videoQueueDone = videoQueueJobs.filter((job) => job.status === 'done').length;
        const videoWorkflowTotal = videoWorkflows.reduce((total, workflow) => total + Math.max(1, workflow.progress.total || 1), 0);
        const videoWorkflowDone = videoWorkflows.reduce((total, workflow) => total + Math.min(Math.max(0, workflow.progress.completed), Math.max(1, workflow.progress.total || 1)), 0);
        const videoTotal = videoGroupTotal + videoQueueTotal + videoWorkflowTotal;
        const videoDone = videoGroupDone + videoQueueDone + videoWorkflowDone;
        const videoActive = videoQueueJobs.filter((job) => activeQueueStatuses.has(job.status)).length
            + videoUploadGroups.reduce((total, group) => total + group.active, 0)
            + videoWorkflows.filter((workflow) => !['completed', 'cancelled', 'failed'].includes(workflow.phase)).length;
        const videoFailed = videoQueueJobs.filter((job) => job.status === 'failed').length
            + videoUploadGroups.reduce((total, group) => total + group.failed, 0)
            + videoWorkflows.filter((workflow) => workflow.phase === 'failed').length;
        const videoBlocked = videoQueueJobs.filter((job) => job.status === 'auth_required').length
            + videoUploadGroups.reduce((total, group) => total + group.blockedAuth, 0)
            + videoWorkflows.filter((workflow) => workflow.phase === 'auth_required' || workflow.phase === 'paused_offline').length;

        return [
            {
                key: 'photo' as const,
                label: 'Фото',
                detail: photoFailed > 0 ? `ошибок ${photoFailed}` : photoBlocked > 0 ? `блокировок ${photoBlocked}` : photoActive > 0 ? `в работе ${photoActive}` : `готово ${Math.round(photoDone)}/${photoTotal}`,
                percent: photoTotal > 0 ? clampPercent((photoDone / photoTotal) * 100) : 0,
                active: photoActive,
                failed: photoFailed,
                blocked: photoBlocked
            },
            {
                key: 'video' as const,
                label: 'Видео',
                detail: videoFailed > 0 ? `ошибок ${videoFailed}` : videoBlocked > 0 ? `блокировок ${videoBlocked}` : videoActive > 0 ? `в работе ${videoActive}` : `готово ${videoDone}/${videoTotal}`,
                percent: videoTotal > 0 ? clampPercent((videoDone / videoTotal) * 100) : 0,
                active: videoActive,
                failed: videoFailed,
                blocked: videoBlocked
            }
        ].filter((item) => item.active > 0 || item.failed > 0 || item.blocked > 0 || item.percent > 0);
    }, [queue.jobs, videoUploadGroups, workflows]);

    const headerSummary = useMemo(() => {
        if (!isDesktopRuntime) {
            if (!webStatus.online) {
                return 'Web: offline';
            }
            if (!webStatus.apiReachable) {
                return 'Web: API недоступен';
            }
            return `${currentRoleLabel} · API доступен`;
        }
        if (!diagnostics) {
            return 'Проверяем приложение';
        }
        if (queueCounts.blockedAuth > 0 || (diagnostics.workflows?.blockedAuth || diagnostics.workflows?.authRequired || 0) > 0) {
            return `Нужен вход: ${queueCounts.blockedAuth + (diagnostics.workflows?.blockedAuth || diagnostics.workflows?.authRequired || 0)}`;
        }
        if (!diagnostics?.network.online || !diagnostics?.network.apiReachable || (diagnostics.workflows?.blockedOffline || diagnostics.workflows?.offline || 0) > 0) {
            return 'Offline/API недоступен';
        }
        if (queueCounts.failed > 0) {
            return `Ошибки загрузки: ${queueCounts.failed}`;
        }
        if (failedWorkflowCount > 0) {
            return `Workflow ошибки: ${failedWorkflowCount}`;
        }
        if (queueCounts.stuck > 0 || (diagnostics.workflows?.stuck || 0) > 0) {
            return `Stuck: ${queueCounts.stuck + (diagnostics.workflows?.stuck || 0)}`;
        }
        if (!diagnostics?.helper.ok) {
            return 'Helper требует внимания';
        }
        if (activeVideoUploads > 0) {
            return `Видео в фоне: ${activeVideoUploads}`;
        }
        if (activeWorkflowCount > 0) {
            return `Workflow: ${activeWorkflowCount}`;
        }
        if (queueCounts.active > 0) {
            return `Загрузки: ${queueCounts.active}`;
        }
        if (updateAvailable) {
            return `Доступна ${updateVersion}`;
        }
        return 'Все системы в норме';
    }, [activeVideoUploads, activeWorkflowCount, currentRoleLabel, diagnostics, failedWorkflowCount, isDesktopRuntime, queueCounts.active, queueCounts.blockedAuth, queueCounts.failed, queueCounts.stuck, updateAvailable, updateVersion, webStatus.apiReachable, webStatus.online]);

    const refresh = useCallback(async () => {
        if (!desktop || !isDesktopRuntime) {
            return;
        }

        setRefreshing(true);
        setActionError('');
        try {
            const [nextDiagnostics, nextQueue, nextWorkflows] = await Promise.all([
                desktop.getDesktopDiagnostics(),
                desktop.getMediaQueueSnapshot(),
                desktop.getMediaWorkflowSnapshot()
            ]);
            setDiagnostics(nextDiagnostics);
            setQueue(nextQueue);
            setWorkflowSnapshot(nextWorkflows);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Не удалось обновить desktop-статус.');
        } finally {
            setRefreshing(false);
        }
    }, [desktop, isDesktopRuntime]);

    const refreshWebStatus = useCallback(async () => {
        if (isDesktopRuntime) {
            return;
        }

        const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
        try {
            const response = await apiFetch('/healthz', {
                method: 'GET',
                cache: 'no-store'
            });
            const payload = await response.json().catch(() => null) as { status?: string; error?: string } | null;
            setWebStatus({
                online,
                apiReachable: response.ok && payload?.status === 'ok',
                checkedAt: new Date().toISOString(),
                apiError: response.ok ? '' : payload?.error || `HTTP ${response.status}`
            });
        } catch (error) {
            setWebStatus({
                online,
                apiReachable: false,
                checkedAt: new Date().toISOString(),
                apiError: error instanceof Error ? error.message : 'Healthcheck недоступен'
            });
        }
    }, [isDesktopRuntime]);

    const checkUpdate = useCallback(async () => {
        if (!desktop) {
            return;
        }

        setCheckingUpdate(true);
        setActionError('');
        try {
            const nextUpdate = await desktop.checkHqUpdate();
            setUpdate(nextUpdate);
            await refresh();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Не удалось проверить обновление.');
        } finally {
            setCheckingUpdate(false);
        }
    }, [desktop, refresh]);

    const downloadUpdate = useCallback(async () => {
        if (!desktop) {
            return;
        }

        setDownloadingUpdate(true);
        setActionError('');
        try {
            const result = await desktop.downloadHqUpdate();
            setUpdate(result);
            await refresh();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Не удалось скачать обновление.');
        } finally {
            setDownloadingUpdate(false);
        }
    }, [desktop, refresh]);

    const retryJob = useCallback((jobId: string) => {
        if (!desktop) {
            return;
        }

        void desktop.retryMediaQueueJob(jobId).then(setQueue).catch((error) => {
            setActionError(error instanceof Error ? error.message : 'Не удалось повторить задачу.');
        });
    }, [desktop]);

    const cancelJob = useCallback((jobId: string) => {
        if (!desktop) {
            return;
        }

        void desktop.cancelMediaQueueJob(jobId).then(setQueue).catch((error) => {
            setActionError(error instanceof Error ? error.message : 'Не удалось отменить задачу.');
        });
    }, [desktop]);

    const openPhotoToolJob = useCallback((job: StonesMediaQueueJob) => {
        const batchId = job.summary?.batchId;
        if (!batchId) {
            setActionError('У задачи нет batchId для открытия Photo Tool.');
            return;
        }

        window.location.assign(`/admin/photo-tool/${encodeURIComponent(batchId)}`);
        setOpen(false);
    }, []);

    const clearCompleted = useCallback(() => {
        if (!desktop) {
            return;
        }

        void desktop.clearCompletedMediaQueueJobs().then(setQueue).catch((error) => {
            setActionError(error instanceof Error ? error.message : 'Не удалось очистить завершенные задачи.');
        });
    }, [desktop]);

    const retryWorkflow = useCallback((workflowId: string) => {
        if (!desktop) {
            return;
        }

        void desktop.retryMediaWorkflow(workflowId).then(setWorkflowSnapshot).catch((error) => {
            setActionError(error instanceof Error ? error.message : 'Не удалось повторить workflow.');
        });
    }, [desktop]);

    const cancelWorkflow = useCallback((workflowId: string) => {
        if (!desktop) {
            return;
        }

        void desktop.cancelMediaWorkflow(workflowId).then(setWorkflowSnapshot).catch((error) => {
            setActionError(error instanceof Error ? error.message : 'Не удалось отменить workflow.');
        });
    }, [desktop]);

    const openWorkflowBatch = useCallback((workflow: StonesMediaWorkflow) => {
        window.location.assign(workflow.routePath);
        setOpen(false);
    }, []);

    const cleanupHelper = useCallback(() => {
        if (!desktop) {
            return;
        }

        setActionError('');
        void desktop.cleanupVideoHelper()
            .then(() => refresh())
            .catch((error) => setActionError(error instanceof Error ? error.message : 'Не удалось очистить helper.'));
    }, [desktop, refresh]);

    const buildDiagnosticsExportPayload = useCallback((nextDiagnostics: StonesDesktopDiagnostics | null = diagnostics) => ({
        diagnostics: nextDiagnostics,
        update: update || nextDiagnostics?.update || null,
        queue: nextDiagnostics?.queue || diagnostics?.queue || null,
        workflows: workflowSnapshot,
        queueGroups: videoUploadGroups.map((group) => ({
            id: group.id,
            title: group.title,
            total: group.total,
            done: group.done,
            active: group.active,
            failed: group.failed,
            serialNumbers: group.jobs.map((job) => job.summary?.serialNumber).filter(Boolean)
        })),
        queueJobs: queue.jobs,
        batchDiagnosticsLog
    }), [batchDiagnosticsLog, diagnostics, queue.jobs, update, videoUploadGroups, workflowSnapshot]);

    const buildStatusCenterLogsPayload = useCallback((nextDiagnostics: StonesDesktopDiagnostics | null = diagnostics) => ({
        diagnostics: nextDiagnostics,
        update: update || nextDiagnostics?.update || null,
        queue: nextDiagnostics?.queue || diagnostics?.queue || null,
        workflows: workflowSnapshot,
        queueGroups: videoUploadGroups.map((group) => ({
            id: group.id,
            title: group.title,
            total: group.total,
            done: group.done,
            active: group.active,
            failed: group.failed,
            blockedAuth: group.blockedAuth,
            serialNumbers: group.jobs.map((job) => job.summary?.serialNumber).filter(Boolean)
        })),
        queueJobs: queue.jobs,
        batchDiagnosticsLog,
        clientLogs: getBufferedClientLogs(),
        ui: {
            route: location.pathname,
            activeTab
        }
    }), [activeTab, batchDiagnosticsLog, diagnostics, location.pathname, queue.jobs, update, videoUploadGroups, workflowSnapshot]);

    const exportDiagnostics = useCallback(async () => {
        if (!desktop) {
            return;
        }

        try {
            const nextDiagnostics = await desktop.getDesktopDiagnostics();
            const result = await desktop.exportDiagnosticsMarkdown(buildDiagnosticsExportPayload(nextDiagnostics));
            setDiagnostics(nextDiagnostics);
            setExportedDiagnosticsPath(result.path);
            setExportedLogsPath('');
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Не удалось экспортировать диагностику.');
        }
    }, [buildDiagnosticsExportPayload, desktop]);

    const exportStatusCenterLogs = useCallback(async () => {
        if (!desktop) {
            return;
        }

        setActionError('');
        try {
            const nextDiagnostics = await desktop.getDesktopDiagnostics();
            const result = await desktop.exportStatusCenterLogs(buildStatusCenterLogsPayload(nextDiagnostics));
            setDiagnostics(nextDiagnostics);
            setExportedLogsPath(result.path);
            setExportedDiagnosticsPath('');
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Не удалось сохранить логи.');
        }
    }, [buildStatusCenterLogsPayload, desktop]);

    const runBatchDiagnostics = useCallback(async () => {
        if (!desktop) {
            return;
        }

        setActionError('');
        setExportedDiagnosticsPath('');
        setExportedLogsPath('');
        setBatchDiagnosticsLog({
            status: 'running',
            startedAt: new Date().toISOString(),
            steps: [],
            mediaDiagnostics: ['Открываем выбор папки.']
        });

        try {
            const selected = await desktop.selectBatchDiagnosticsMediaFolder();
            if (selected.cancelled) {
                setBatchDiagnosticsLog({
                    status: 'idle',
                    steps: [],
                    mediaDiagnostics: selected.diagnostics
                });
                return;
            }

            setBatchDiagnosticsLog((current) => ({
                ...current,
                mediaDiagnostics: selected.diagnostics
            }));
            await runBatchCreationDiagnostics(selected.files, {
                onLog: setBatchDiagnosticsLog
            });
            await refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось выполнить проверку создания партии.';
            setActionError(message);
            setBatchDiagnosticsLog((current) => ({
                ...current,
                status: 'failed',
                finishedAt: new Date().toISOString(),
                error: message
            }));
        }
    }, [desktop, refresh]);

    const copyTerminalLogs = useCallback(() => {
        const text = batchDiagnosticsLog.mediaDiagnostics.join('\n');
        void navigator.clipboard.writeText(text);
    }, [batchDiagnosticsLog.mediaDiagnostics]);

    useEffect(() => {
        if (!isDesktopRuntime || !desktop) {
            return;
        }

        void refresh();
        void checkUpdate();
        const unsubscribeQueue = desktop.subscribeMediaQueue(setQueue);
        const unsubscribeWorkflows = desktop.subscribeMediaWorkflows(setWorkflowSnapshot);
        const refreshTimer = window.setInterval(() => void refresh(), 20000);
        const updateTimer = window.setInterval(() => void checkUpdate(), 5 * 60_000);
        const openListener = (event: Event) => {
            const detail = event instanceof CustomEvent ? event.detail as OpenStatusCenterDetail | undefined : undefined;
            setOpen(true);
            setActiveTab(detail?.tab || (detail?.focus ? 'queue' : 'diagnostics'));
            void refresh();
        };
        window.addEventListener('stones:open-status-center', openListener);

        return () => {
            unsubscribeQueue();
            unsubscribeWorkflows();
            window.clearInterval(refreshTimer);
            window.clearInterval(updateTimer);
            window.removeEventListener('stones:open-status-center', openListener);
        };
    }, [checkUpdate, desktop, isDesktopRuntime, refresh]);

    useEffect(() => {
        if (isDesktopRuntime) {
            return;
        }

        void refreshWebStatus();
        const syncOnlineStatus = () => {
            setWebStatus((current) => ({
                ...current,
                online: navigator.onLine
            }));
            void refreshWebStatus();
        };
        const openListener = () => {
            setOpen(true);
            setActiveTab('overview');
            void refreshWebStatus();
        };

        const refreshTimer = window.setInterval(() => void refreshWebStatus(), 30000);
        window.addEventListener('online', syncOnlineStatus);
        window.addEventListener('offline', syncOnlineStatus);
        window.addEventListener('stones:open-status-center', openListener);

        return () => {
            window.clearInterval(refreshTimer);
            window.removeEventListener('online', syncOnlineStatus);
            window.removeEventListener('offline', syncOnlineStatus);
            window.removeEventListener('stones:open-status-center', openListener);
        };
    }, [isDesktopRuntime, refreshWebStatus]);

    const tabs: Array<{ id: StatusTab; label: string; icon: ReactNode }> = [
        { id: 'overview', label: 'Обзор', icon: <Activity size={14} /> },
        ...(isDesktopRuntime ? [
            { id: 'queue' as StatusTab, label: 'Загрузки', icon: <UploadCloud size={14} /> },
            { id: 'helper' as StatusTab, label: 'Видео helper', icon: <Video size={14} /> },
            { id: 'updates' as StatusTab, label: 'Обновления', icon: <Download size={14} /> },
            { id: 'diagnostics' as StatusTab, label: 'Диагностика', icon: <Download size={14} /> }
        ] : [])
    ];

    const triggerTone: StatusTone = !isDesktopRuntime
        ? !webStatus.checkedAt
            ? 'checking'
            : !webStatus.online
                ? 'offline'
                : !webStatus.apiReachable
                    ? 'warning'
                    : 'ok'
        : !diagnostics
            ? 'checking'
            : queueCounts.failed > 0 || !diagnostics.helper.ok
                ? 'error'
                : !diagnostics.network.apiReachable
                    ? 'warning'
                    : queueCounts.active > 0 || refreshing
                        ? 'checking'
                        : 'ok';

    return (
        <>
            <div className="inline-flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition ${statusToneClass[triggerTone]}`}
                >
                    {refreshing ? <LoaderCircle size={15} className="animate-spin" /> : <Activity size={15} />}
                    <span className="text-left">
                        <span className="block leading-4">Status Center</span>
                        <span className="block text-[10px] font-normal opacity-75">{headerSummary}</span>
                    </span>
                </button>
                {isDesktopRuntime && backgroundProgress.map((item) => (
                    <MiniProgressStrip key={item.key} item={item} />
                ))}
            </div>

            {open ? (
                <div className="fixed inset-0 z-50">
                    <button
                        type="button"
                        aria-label="Закрыть Status Center"
                        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                        onClick={() => setOpen(false)}
                    />
                    <aside className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col border-l border-white/10 bg-[#101216] shadow-2xl">
                        <header className="shrink-0 border-b border-white/8 px-5 py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.22em] text-gray-500">ZAGARAMI admin</p>
                                    <h2 className="mt-1 text-xl font-semibold text-white">Status Center</h2>
                                    <p className="mt-1 text-sm text-gray-400">
                                        {isDesktopRuntime
                                            ? 'Сеть, helper, загрузки, обновления и диагностика приложения.'
                                            : 'Состояние web-сессии, API и текущего рабочего контекста.'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-white/5 hover:text-white"
                                    aria-label="Закрыть"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                <StatusBadge tone={isDesktopRuntime ? networkTone : (webStatus.apiReachable ? 'ok' : webStatus.online ? 'warning' : 'offline')}>
                                    <Wifi size={13} />
                                    {isDesktopRuntime
                                        ? diagnostics?.network.apiReachable ? 'API доступен' : 'API недоступен'
                                        : webStatus.apiReachable ? 'API доступен' : 'API недоступен'}
                                </StatusBadge>
                                {isDesktopRuntime ? (
                                    <>
                                        <StatusBadge tone={helperTone}>
                                            <Video size={13} />
                                            {diagnostics?.helper.ok ? 'Helper готов' : 'Helper ошибка'}
                                        </StatusBadge>
                                        <StatusBadge tone={queueTone}>
                                            <UploadCloud size={13} />
                                            {queueCounts.blockedAuth > 0 ? `Нужен вход: ${queueCounts.blockedAuth}` : queueCounts.failed > 0 ? `Ошибки загрузки: ${queueCounts.failed}` : queueCounts.stuck > 0 ? `Stuck: ${queueCounts.stuck}` : queueCounts.active > 0 ? `В работе: ${queueCounts.active}` : 'Очередь чистая'}
                                        </StatusBadge>
                                        <StatusBadge tone={workflowTone}>
                                            <Activity size={13} />
                                            {(diagnostics?.workflows?.blockedAuth || 0) > 0 ? `Нужен вход: ${diagnostics?.workflows?.blockedAuth}` : (diagnostics?.workflows?.blockedOffline || 0) > 0 ? `Offline: ${diagnostics?.workflows?.blockedOffline}` : failedWorkflowCount > 0 ? `Workflow ошибки: ${failedWorkflowCount}` : (diagnostics?.workflows?.stuck || 0) > 0 ? `Stuck: ${diagnostics?.workflows?.stuck}` : activeWorkflowCount > 0 ? `Workflow: ${activeWorkflowCount}` : 'Workflow чисты'}
                                        </StatusBadge>
                                        <StatusBadge tone={updateTone}>
                                            <Download size={13} />
                                            {updateLabel}
                                        </StatusBadge>
                                    </>
                                ) : (
                                    <>
                                        <StatusBadge tone="ok">
                                            <BadgeInfo size={13} />
                                            {currentRoleLabel}
                                        </StatusBadge>
                                        <StatusBadge tone="checking">
                                            <Info size={13} />
                                            {location.pathname}
                                        </StatusBadge>
                                        <StatusBadge tone="warning">
                                            <HardDrive size={13} />
                                            Desktop-фон недоступен
                                        </StatusBadge>
                                    </>
                                )}
                            </div>
                        </header>

                        <nav className="shrink-0 border-b border-white/8 px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium transition ${
                                            activeTab === tab.id
                                                ? 'bg-white text-zinc-950'
                                                : 'text-gray-400 hover:bg-white/[0.05] hover:text-white'
                                        }`}
                                    >
                                        {tab.icon}
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </nav>

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                            {actionError ? (
                                <div className="mb-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                    {actionError}
                                </div>
                            ) : null}

                            {activeTab === 'overview' ? (
                                <div className="grid gap-3">
                                    {isDesktopRuntime ? (
                                        <>
                                            <StatusCard
                                                icon={<Server size={18} />}
                                                title="Backend API"
                                                value={diagnostics?.network.apiReachable ? 'Доступен' : 'Недоступен'}
                                                detail={diagnostics?.network.error || diagnostics?.app.apiOrigin}
                                                tone={networkTone}
                                            />
                                            <StatusCard
                                                icon={<Video size={18} />}
                                                title="Видео helper"
                                                value={diagnostics?.helper.ok ? 'Встроенный helper готов' : 'Требует внимания'}
                                                detail={diagnostics?.helper.startup_error ? `Startup: ${diagnostics.helper.startup_error}` : diagnostics?.helper.error ? `Runtime: ${diagnostics.helper.error}` : diagnostics?.helper.helper_version}
                                                tone={helperTone}
                                            />
                                            <StatusCard
                                                icon={<Activity size={18} />}
                                                title="Media workflows"
                                                value={(diagnostics?.workflows?.blockedAuth || 0) > 0 ? `Ожидает вход: ${diagnostics?.workflows?.blockedAuth}` : (diagnostics?.workflows?.blockedOffline || 0) > 0 ? `Пауза offline: ${diagnostics?.workflows?.blockedOffline}` : activeWorkflowCount > 0 ? `В работе: ${activeWorkflowCount}` : failedWorkflowCount > 0 ? `Workflow с ошибкой: ${failedWorkflowCount}` : 'Фоновых workflow нет'}
                                                detail="Photo Tool и Video Tool продолжают работу после закрытия страницы и поднимаются после перезапуска HQ."
                                                tone={workflowTone}
                                            />
                                            <StatusCard
                                                icon={<UploadCloud size={18} />}
                                                title="Media uploads"
                                                value={queueCounts.blockedAuth > 0 ? `Ожидает вход: ${queueCounts.blockedAuth}` : queueCounts.active > 0 ? `В работе: ${queueCounts.active}` : queueCounts.failed > 0 ? `Ошибок: ${queueCounts.failed}` : 'Очередь без активных задач'}
                                                detail="Photo Tool и Video Tool загружают медиа через локальную очередь."
                                                tone={queueTone}
                                            />
                                            <StatusCard
                                                icon={<HardDrive size={18} />}
                                                title="Обновления"
                                                value={updateLabel}
                                                detail={isUpdateNotConfigured ? 'Manifest обновлений не опубликован.' : updateError || 'Проверка обновлений работает отдельно от API.'}
                                                tone={updateTone}
                                            />
                                            <StatusCard
                                                icon={<TestTube2 size={18} />}
                                                title="Диагностика партии"
                                                value={batchDiagnosticsLog.status === 'success' ? 'Последняя проверка успешна' : batchDiagnosticsLog.status === 'failed' ? 'Есть ошибка проверки' : batchDiagnosticsLog.status === 'running' ? 'Выполняется' : 'Готова к запуску'}
                                                detail={batchDiagnosticsLog.batchId || 'Проверяет заказ, партию, фото, видео, QR и clone.'}
                                                tone={batchDiagnosticsLog.status === 'failed' ? 'error' : batchDiagnosticsLog.status === 'running' ? 'checking' : 'ok'}
                                            />
                                            <StatusCard
                                                icon={<HardDrive size={18} />}
                                                title="Локальный render"
                                                value="Медиа/PDF собираются на Mac"
                                                detail="Сервер остается источником данных и файлов."
                                                tone="ok"
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <StatusCard
                                                icon={<Server size={18} />}
                                                title="Backend API"
                                                value={webStatus.apiReachable ? 'Доступен' : 'Недоступен'}
                                                detail={webStatus.apiError || `Последняя проверка: ${formatCheckedAt(webStatus.checkedAt)}`}
                                                tone={webStatus.apiReachable ? 'ok' : webStatus.online ? 'warning' : 'offline'}
                                            />
                                            <StatusCard
                                                icon={<BadgeInfo size={18} />}
                                                title="Текущая роль"
                                                value={currentRoleLabel}
                                                detail="Права и маршруты зависят от активной сессии."
                                                tone="ok"
                                            />
                                            <StatusCard
                                                icon={<Info size={18} />}
                                                title="Текущий раздел"
                                                value={location.pathname}
                                                detail="Показывает, где именно открыта админка."
                                                tone="checking"
                                            />
                                            <StatusCard
                                                icon={<HardDrive size={18} />}
                                                title="Режим запуска"
                                                value="Обычный браузер"
                                                detail="Фоновые desktop-очереди, helper и локальные workflow доступны только в HQ desktop app."
                                                tone="warning"
                                            />
                                        </>
                                    )}
                                </div>
                            ) : null}

                            {isDesktopRuntime && activeTab === 'queue' ? (
                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <div>
                                            <h3 className="text-base font-semibold text-white">Desktop workflows</h3>
                                            <p className="mt-1 text-sm text-gray-400">Сохраняют прогресс фото и видео между закрытием страниц, офлайном и перезапуском HQ.</p>
                                        </div>
                                        {workflows.length === 0 ? (
                                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-4 text-sm text-gray-400">
                                                Фоновых workflow нет.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Показано {Math.min(workflows.length, 20)} из {workflows.length}</p>
                                                {workflows.slice(0, 20).map((workflow) => (
                                                    <WorkflowRow
                                                        key={workflow.id}
                                                        workflow={workflow}
                                                        onRetry={retryWorkflow}
                                                        onCancel={cancelWorkflow}
                                                        onOpen={openWorkflowBatch}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h3 className="text-base font-semibold text-white">Локальные загрузки</h3>
                                            <p className="mt-1 text-sm text-gray-400">Очередь переживает перезапуск приложения и плохое соединение.</p>
                                        </div>
                                        {((queue.counts.done || 0) + (queue.counts.cancelled || 0)) > 0 ? (
                                            <button type="button" onClick={clearCompleted} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-200 transition hover:bg-white/5">
                                                Очистить готовые/отмененные
                                            </button>
                                        ) : null}
                                    </div>
                                    {queue.jobs.length === 0 ? (
                                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-4 text-sm text-gray-400">
                                            Активных и завершенных загрузок нет.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {videoUploadGroups.length > 0 ? (
                                                <div className="space-y-2">
                                                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Видео партии</p>
                                                    {videoUploadGroups.map((group) => (
                                                        <VideoUploadGroupCard key={group.id} group={group} onRetry={retryJob} onCancel={cancelJob} />
                                                    ))}
                                                </div>
                                            ) : null}
                                            {standaloneQueueJobs.length > 0 ? (
                                                <p className="pt-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">Остальные задачи · Показано {Math.min(standaloneQueueJobs.length, 30)} из {standaloneQueueJobs.length}</p>
                                            ) : null}
                                            {standaloneQueueJobs.slice(0, 30).map((job) => (
                                                <JobRow key={job.id} job={job} onRetry={retryJob} onCancel={cancelJob} onOpenPhotoTool={openPhotoToolJob} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            {isDesktopRuntime && activeTab === 'helper' ? (
                                <div className="space-y-3">
                                    <StatusCard
                                        icon={<Video size={18} />}
                                        title="Встроенный helper"
                                        value={diagnostics?.helper.ok ? 'Готов к монтажу' : 'Не запущен или недоступен'}
                                        detail={diagnostics?.helper.startup_error ? `Startup: ${diagnostics.helper.startup_error}` : diagnostics?.helper.error ? `Runtime: ${diagnostics.helper.error}` : 'Используется внутри ZAGARAMI admin.'}
                                        tone={helperTone}
                                    />
                                    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 rounded-2xl border border-white/8 bg-black/20 p-3 text-sm">
                                        <dt className="text-gray-500">Версия</dt>
                                        <dd className="truncate text-gray-200">{diagnostics?.helper.helper_version || 'Не определена'}</dd>
                                        <dt className="text-gray-500">Протокол</dt>
                                        <dd className="truncate text-gray-200">{diagnostics?.helper.protocol_version || 'Не определен'}</dd>
                                        <dt className="text-gray-500">Режим</dt>
                                        <dd className="truncate text-gray-200">{diagnostics?.helper.embedded ? 'Встроенный' : 'Совместимый процесс'}</dd>
                                        <dt className="text-gray-500">Свободно</dt>
                                        <dd className="truncate text-gray-200">{formatBytes(diagnostics?.helper.free_bytes)}</dd>
                                    </dl>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-200 transition hover:bg-white/5">
                                            <RefreshCw size={14} />
                                            Проверить
                                        </button>
                                        <button type="button" onClick={cleanupHelper} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-200 transition hover:bg-white/5">
                                            <HardDrive size={14} />
                                            Очистить cache
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void desktop?.showVideoHelperStorage()}
                                        className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 transition hover:bg-white/5 hover:text-white"
                                    >
                                        Открыть папку helper
                                    </button>
                                </div>
                            ) : null}

                            {isDesktopRuntime && activeTab === 'updates' ? (
                                <div className="space-y-3">
                                    <StatusCard
                                        icon={<Download size={18} />}
                                        title="Обновления"
                                        value={updateLabel}
                                        detail={isUpdateNotConfigured ? 'URL обновлений не настроен.' : isUpdateManifestMissing ? 'Файл ZAGARAMI-HQ-update.json отсутствует на сервере.' : updateError || 'Приложение скачивает DMG и открывает установщик. Замена .app выполняется вручную.'}
                                        tone={updateTone}
                                    />
                                    {update ? (
                                        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 rounded-2xl border border-white/8 bg-black/20 p-3 text-sm">
                                            <dt className="text-gray-500">Текущая</dt>
                                            <dd className="truncate text-gray-200">{update.currentVersion}</dd>
                                            <dt className="text-gray-500">Доступная</dt>
                                            <dd className="truncate text-gray-200">{update.version}</dd>
                                            <dt className="text-gray-500">Архитектура</dt>
                                            <dd className="truncate text-gray-200">{update.arch}</dd>
                                            <dt className="text-gray-500">Размер</dt>
                                            <dd className="truncate text-gray-200">{formatBytes(update.size)}</dd>
                                        </dl>
                                    ) : null}
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void checkUpdate()}
                                            disabled={checkingUpdate || downloadingUpdate}
                                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <RefreshCw size={14} className={checkingUpdate ? 'animate-spin' : ''} />
                                            Проверить
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void downloadUpdate()}
                                            disabled={!update?.updateAvailable || isUpdateNotConfigured || isUpdateManifestMissing || checkingUpdate || downloadingUpdate}
                                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 text-xs text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {downloadingUpdate ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
                                            Скачать и открыть DMG
                                        </button>
                                    </div>
                                    {isUpdateNotConfigured || isUpdateManifestMissing ? (
                                        <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
                                            {isUpdateNotConfigured ? 'Обновления не настроены.' : 'Manifest обновлений не опубликован. Status Center не считает это критической ошибкой.'}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}

                            {isDesktopRuntime && activeTab === 'diagnostics' ? (
                                <div className="space-y-4">
                                    {/* Header Banner */}
                                    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 backdrop-blur-md p-4 relative overflow-hidden shadow-xl">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                                <TestTube2 size={20} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                                    Диагностический стенд E2E
                                                    <span className="inline-flex items-center rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-400/20 animate-pulse">HQ</span>
                                                </h3>
                                                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                                                    Интерактивный запуск полной цепочки создания партии (10 товаров). Стенд загружает фото, выполняет физический рендеринг видео на helper, тестирует QR, публичные страницы и цифровые двойники.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Dynamic Status Grid */}
                                        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/8 pt-3">
                                            <div className="rounded-xl bg-white/3 border border-white/6 px-3 py-2">
                                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Текущий статус</p>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <span className={`h-2 w-2 rounded-full ${
                                                        batchDiagnosticsLog.status === 'success' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' :
                                                        batchDiagnosticsLog.status === 'failed' ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' :
                                                        batchDiagnosticsLog.status === 'running' ? 'bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-pulse' :
                                                        'bg-zinc-500'
                                                    }`} />
                                                    <span className="text-xs font-medium text-white uppercase" data-testid="batch-diagnostics-status">
                                                        {batchDiagnosticsLog.status === 'idle' ? 'Не запускалась' :
                                                         batchDiagnosticsLog.status === 'running' ? 'Выполняется' :
                                                         batchDiagnosticsLog.status === 'success' ? 'Успешно' : 'Ошибка'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="rounded-xl bg-white/3 border border-white/6 px-3 py-2">
                                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Серийный номер / Twin</p>
                                                {batchDiagnosticsLog.serialNumber ? (
                                                    <a
                                                        href={batchDiagnosticsLog.cloneUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                                                    >
                                                        {batchDiagnosticsLog.serialNumber}
                                                        <ExternalLink size={11} />
                                                    </a>
                                                ) : (
                                                    <p className="mt-1 text-xs text-gray-400">—</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Control Panel */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void runBatchDiagnostics()}
                                            disabled={batchDiagnosticsLog.status === 'running'}
                                            data-testid="batch-diagnostics-run"
                                            className="relative overflow-hidden inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-bold shadow-[0_4px_15px_rgba(16,185,129,0.25)] transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
                                        >
                                            {batchDiagnosticsLog.status === 'running' ? (
                                                <>
                                                    <LoaderCircle size={16} className="animate-spin text-white" />
                                                    <span>Проверка выполняется...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles size={16} />
                                                    <span>Запустить проверку партии</span>
                                                </>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void exportDiagnostics()}
                                            disabled={batchDiagnosticsLog.steps.length === 0 && batchDiagnosticsLog.mediaDiagnostics.length === 0}
                                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/3 px-4 text-sm font-bold text-gray-200 hover:bg-white/8 hover:text-white disabled:opacity-50 disabled:pointer-events-none transition-colors"
                                        >
                                            <Download size={16} />
                                            Экспортировать .md
                                        </button>
                                    </div>

                                    {/* Main Workspace: Steps (Pipeline) & Terminal Logs */}
                                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
                                        
                                        {/* Pipeline Stepper (5 columns) */}
                                        <div className="xl:col-span-5 flex flex-col rounded-2xl border border-white/8 bg-black/25 p-3 overflow-hidden min-h-[300px]">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-2.5">
                                                <Activity size={12} className="text-emerald-400" />
                                                Конвейер Шагов
                                            </h4>
                                            
                                            {batchDiagnosticsLog.steps.length === 0 ? (
                                                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                                                    <Activity size={24} className="text-zinc-600 animate-pulse" />
                                                    <p className="mt-2 text-xs text-gray-500 font-medium">Конвейер ожидает запуска проверки</p>
                                                </div>
                                            ) : (
                                                <div className="flex-1 space-y-2 overflow-y-auto max-h-[320px] pr-1">
                                                    {batchDiagnosticsLog.steps.map((step) => {
                                                        const isOk = step.status === 'ok';
                                                        const isFailed = step.status === 'failed';
                                                        const isRunning = step.status === 'running';
                                                        
                                                        return (
                                                            <div key={step.key} className="p-2 rounded-xl border border-white/5 bg-white/2 hover:bg-white/4 transition-colors">
                                                                <div className="flex items-start justify-between gap-2.5">
                                                                    <div className="flex items-start gap-2 min-w-0">
                                                                        <div className="mt-0.5 shrink-0">
                                                                            {isOk ? (
                                                                                <CheckCircle2 size={14} className="text-emerald-400" />
                                                                            ) : isFailed ? (
                                                                                <AlertCircle size={14} className="text-rose-500" />
                                                                            ) : isRunning ? (
                                                                                <LoaderCircle size={14} className="animate-spin text-sky-400" />
                                                                            ) : (
                                                                                <span className="block h-3.5 w-3.5 rounded-full border border-white/20" />
                                                                            )}
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <p className="text-xs font-semibold text-white truncate">{step.label}</p>
                                                                            {step.durationMs != null ? (
                                                                                <p className="text-[10px] text-zinc-500 font-medium">длительность: {(step.durationMs / 1000).toFixed(2)}с</p>
                                                                            ) : null}
                                                                        </div>
                                                                    </div>
                                                                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                                                        isOk ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' :
                                                                        isFailed ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                                                                        'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                                                    }`}>
                                                                        {isOk ? 'OK' : isFailed ? 'ERR' : 'RUN'}
                                                                    </span>
                                                                </div>
                                                                {step.error ? (
                                                                    <p className="mt-1.5 text-[10px] leading-relaxed text-rose-400 bg-rose-950/20 border border-rose-900/30 p-1.5 rounded-lg break-words">
                                                                        {step.error}
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Styled Terminal Console (7 columns) */}
                                        <div className="xl:col-span-7 flex flex-col rounded-2xl border border-white/8 bg-[#0a0a0a] shadow-2xl min-h-[300px] overflow-hidden">
                                            {/* Terminal Header */}
                                            <div className="flex items-center justify-between px-3 py-2 border-b border-white/6 bg-white/2 shrink-0">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex gap-1.5">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                                                        <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                                                        <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                                                        <Terminal size={10} className="text-zinc-500" />
                                                        stones-e2e-stdout
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={copyTerminalLogs}
                                                    disabled={batchDiagnosticsLog.mediaDiagnostics.length === 0}
                                                    className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                                                    title="Копировать логи"
                                                >
                                                    <Copy size={12} />
                                                </button>
                                            </div>

                                            {/* Terminal Output */}
                                            <div className="flex-1 p-3 overflow-y-auto max-h-[320px] scrollbar-thin scrollbar-thumb-white/10">
                                                {batchDiagnosticsLog.mediaDiagnostics.length === 0 ? (
                                                    <div className="h-full flex flex-col items-center justify-center text-center p-4">
                                                        <Terminal size={20} className="text-zinc-700" />
                                                        <p className="mt-1 text-[10px] font-mono text-zinc-600">СТАНДАРТНЫЙ ВЫВОД ПУСТ</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {batchDiagnosticsLog.mediaDiagnostics.map((line, index) => {
                                                            let color = 'text-zinc-400';
                                                            let text = line;
                                                            if (line.startsWith('[INFO]')) {
                                                                color = 'text-sky-300/90';
                                                                text = line.substring(6).trim();
                                                            } else if (line.startsWith('[SUCCESS]')) {
                                                                color = 'text-emerald-400 font-semibold';
                                                                text = line.substring(9).trim();
                                                            } else if (line.startsWith('[ERROR]')) {
                                                                color = 'text-rose-400 font-bold';
                                                                text = line.substring(7).trim();
                                                            } else if (line.startsWith('[PROCESS]')) {
                                                                color = 'text-yellow-300 font-medium';
                                                                text = line.substring(9).trim();
                                                            }
                                                            return (
                                                                <div key={index} className={`font-mono text-[10px] leading-relaxed pl-1.5 py-0.5 border-l border-white/5 break-words ${color}`}>
                                                                    {text}
                                                                </div>
                                                            );
                                                        })}
                                                        {batchDiagnosticsLog.status === 'running' && (
                                                            <div className="font-mono text-[10px] text-emerald-400 animate-pulse pl-1.5">
                                                                <span>Идёт выполнение</span>
                                                                <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-1">_</span>
                                                            </div>
                                                        )}
                                                        <div ref={consoleEndRef} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    </div>

                                    {/* Logs Export Row */}
                                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                                        <div className="flex items-start gap-3">
                                            <Info className="mt-0.5 text-sky-200" size={16} />
                                            <div>
                                                <h4 className="text-xs font-bold text-white">Экспорт отчетов & логов</h4>
                                                <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
                                                    При возникновении ошибок сети или проблем с рендерингом на helper экспортируйте полные логи для последующего аудита.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void exportDiagnostics()}
                                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-gray-200 hover:bg-white/5 transition-colors"
                                            >
                                                <Download size={14} />
                                                Экспортировать Markdown (.md)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void exportStatusCenterLogs()}
                                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-gray-200 hover:bg-white/5 transition-colors"
                                            >
                                                <Download size={14} />
                                                Экспортировать JSON (.json)
                                            </button>
                                        </div>
                                        {exportedDiagnosticsPath ? (
                                            <p className="mt-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] leading-relaxed text-emerald-400 font-medium">
                                                Markdown-отчет сохранен в папку Загрузки: {exportedDiagnosticsPath}
                                            </p>
                                        ) : null}
                                        {exportedLogsPath ? (
                                            <p className="mt-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] leading-relaxed text-emerald-400 font-medium">
                                                JSON-логи сохранены в папку Загрузки: {exportedLogsPath}
                                            </p>
                                        ) : null}
                                    </div>

                                    {/* Diagnostics JSON Dump */}
                                    <pre className="max-h-[140px] overflow-auto rounded-xl border border-white/8 bg-black/45 p-2.5 text-[10px] leading-normal text-zinc-500 font-mono">
                                        {JSON.stringify({
                                            app: diagnostics?.app,
                                            network: diagnostics?.network,
                                            helper: diagnostics?.helper,
                                            queue: diagnostics?.queue,
                                            queueGroups: videoUploadGroups.map((group) => ({
                                                id: group.id,
                                                title: group.title,
                                                total: group.total,
                                                done: group.done,
                                                active: group.active,
                                                failed: group.failed
                                            })),
                                            update: diagnostics?.update,
                                            queueJobs: queue.jobs
                                        }, null, 2)}
                                    </pre>
                                </div>
                            ) : null}
                        </div>

                        <footer className="shrink-0 border-t border-white/8 px-5 py-3">
                            <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                                <span>Версия {diagnostics?.app.version || '...'}</span>
                                <button
                                    type="button"
                                    onClick={() => void refresh()}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-gray-300 transition hover:bg-white/5 hover:text-white"
                                >
                                    {refreshing ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                    Обновить
                                </button>
                            </div>
                        </footer>
                    </aside>
                </div>
            ) : null}
        </>
    );
}
