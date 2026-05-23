import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Activity,
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
    X
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

const emptyQueue: StonesMediaQueueSnapshot = {
    jobs: [],
    counts: {}
};

const emptyWorkflowSnapshot: StonesMediaWorkflowSnapshot = {
    workflows: [],
    counts: {}
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
    queueing_uploads: 'Постановка upload',
    verifying_uploads: 'Проверка upload',
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
    const desktop = getStonesDesktop();
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<StatusTab>('overview');
    const [diagnostics, setDiagnostics] = useState<StonesDesktopDiagnostics | null>(null);
    const [queue, setQueue] = useState<StonesMediaQueueSnapshot>(emptyQueue);
    const [workflowSnapshot, setWorkflowSnapshot] = useState<StonesMediaWorkflowSnapshot>(emptyWorkflowSnapshot);
    const [update, setUpdate] = useState<StonesHqUpdateInfo | StonesHqUpdateDownloadResult | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [downloadingUpdate, setDownloadingUpdate] = useState(false);
    const [actionError, setActionError] = useState('');
    const [exportedDiagnosticsPath, setExportedDiagnosticsPath] = useState('');
    const [batchDiagnosticsLog, setBatchDiagnosticsLog] = useState<BatchDiagnosticsLog>({
        status: 'idle',
        steps: [],
        mediaDiagnostics: []
    });

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
    }, [activeVideoUploads, activeWorkflowCount, diagnostics, failedWorkflowCount, queueCounts.active, queueCounts.blockedAuth, queueCounts.failed, queueCounts.stuck, updateAvailable, updateVersion]);

    const refresh = useCallback(async () => {
        if (!desktop) {
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
    }, [desktop]);

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

    const exportDiagnostics = useCallback(async () => {
        if (!desktop) {
            return;
        }

        try {
            const nextDiagnostics = await desktop.getDesktopDiagnostics();
            const result = await desktop.exportDiagnosticsMarkdown(buildDiagnosticsExportPayload(nextDiagnostics));
            setDiagnostics(nextDiagnostics);
            setExportedDiagnosticsPath(result.path);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Не удалось экспортировать диагностику.');
        }
    }, [buildDiagnosticsExportPayload, desktop]);

    const runBatchDiagnostics = useCallback(async () => {
        if (!desktop) {
            return;
        }

        setActionError('');
        setExportedDiagnosticsPath('');
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

    useEffect(() => {
        if (!isStonesDesktop() || !desktop) {
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
            setActiveTab(detail?.tab || 'diagnostics');
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
    }, [checkUpdate, desktop, refresh]);

    if (!isStonesDesktop()) {
        return null;
    }

    const tabs: Array<{ id: StatusTab; label: string; icon: ReactNode }> = [
        { id: 'overview', label: 'Обзор', icon: <Activity size={14} /> },
        { id: 'queue', label: 'Загрузки', icon: <UploadCloud size={14} /> },
        { id: 'helper', label: 'Видео helper', icon: <Video size={14} /> },
        { id: 'updates', label: 'Обновления', icon: <Download size={14} /> },
        { id: 'diagnostics', label: 'Диагностика', icon: <Download size={14} /> }
    ];

    return (
        <>
            <div className="inline-flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition ${statusToneClass[
                        !diagnostics
                            ? 'checking'
                            : queueCounts.failed > 0 || !diagnostics.helper.ok
                            ? 'error'
                            : !diagnostics.network.apiReachable
                                ? 'warning'
                                : queueCounts.active > 0 || refreshing
                                    ? 'checking'
                                    : 'ok'
                    ]}`}
                >
                    {refreshing ? <LoaderCircle size={15} className="animate-spin" /> : <Activity size={15} />}
                    <span className="text-left">
                        <span className="block leading-4">Status Center</span>
                        <span className="block text-[10px] font-normal opacity-75">{headerSummary}</span>
                    </span>
                </button>
                {backgroundProgress.map((item) => (
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
                                    <h2 className="mt-1 text-xl font-semibold text-white">Desktop Status Center</h2>
                                    <p className="mt-1 text-sm text-gray-400">Сеть, helper, загрузки, обновления и диагностика приложения.</p>
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
                                <StatusBadge tone={networkTone}>
                                    <Wifi size={13} />
                                    {diagnostics?.network.apiReachable ? 'API доступен' : 'API недоступен'}
                                </StatusBadge>
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
                                </div>
                            ) : null}

                            {activeTab === 'queue' ? (
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

                            {activeTab === 'helper' ? (
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

                            {activeTab === 'updates' ? (
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

                            {activeTab === 'diagnostics' ? (
                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                                        <div className="flex items-start gap-3">
                                            <TestTube2 className="mt-0.5 text-emerald-200" size={18} />
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-sm font-semibold text-white">Проверка создания партии</h3>
                                                <p className="mt-1 text-sm leading-6 text-gray-400">
                                                    Создает e2e-партию на 10 камней, загружает фото и видео, проверяет QR и публичный паспорт.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void runBatchDiagnostics()}
                                                disabled={batchDiagnosticsLog.status === 'running'}
                                                data-testid="batch-diagnostics-run"
                                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {batchDiagnosticsLog.status === 'running' ? <LoaderCircle size={16} className="animate-spin" /> : <TestTube2 size={16} />}
                                                Проверка создания партии
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void exportDiagnostics()}
                                                disabled={batchDiagnosticsLog.steps.length === 0 && batchDiagnosticsLog.mediaDiagnostics.length === 0}
                                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold text-gray-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <Download size={16} />
                                                Экспорт .md
                                            </button>
                                        </div>
                                        <div className="mt-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-gray-300" data-testid="batch-diagnostics-status">
                                            Статус: {batchDiagnosticsLog.status === 'idle'
                                                ? 'не запускалась'
                                                : batchDiagnosticsLog.status === 'running'
                                                    ? 'выполняется'
                                                    : batchDiagnosticsLog.status === 'success'
                                                        ? 'успешно'
                                                        : 'ошибка'}
                                            {batchDiagnosticsLog.batchId ? ` · партия ${batchDiagnosticsLog.batchId}` : ''}
                                            {batchDiagnosticsLog.serialNumber ? ` · serial ${batchDiagnosticsLog.serialNumber}` : ''}
                                        </div>
                                        {batchDiagnosticsLog.error ? (
                                            <p className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-xs leading-5 text-red-100/85">
                                                {batchDiagnosticsLog.error}
                                            </p>
                                        ) : null}
                                        {batchDiagnosticsLog.steps.length > 0 ? (
                                            <div className="mt-3 max-h-56 overflow-auto rounded-xl border border-white/8 bg-black/20">
                                                {batchDiagnosticsLog.steps.map((step) => (
                                                    <div key={step.key} className="flex items-start justify-between gap-3 border-b border-white/6 px-3 py-2 last:border-b-0">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-xs font-medium text-white">{step.label}</p>
                                                            {step.error ? <p className="mt-1 text-xs text-red-100/85">{step.error}</p> : null}
                                                        </div>
                                                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${
                                                            step.status === 'ok'
                                                                ? 'bg-emerald-400/10 text-emerald-100'
                                                                : step.status === 'failed'
                                                                    ? 'bg-red-500/10 text-red-100'
                                                                    : 'bg-sky-400/10 text-sky-100'
                                                        }`}>
                                                            {step.status === 'ok' ? 'ok' : step.status === 'failed' ? 'error' : 'run'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                                        <div className="flex items-start gap-3">
                                            <Info className="mt-0.5 text-sky-200" size={18} />
                                            <div>
                                                <h3 className="text-sm font-semibold text-white">Общая диагностика</h3>
                                                <p className="mt-1 text-sm leading-6 text-gray-400">
                                                    Экспортируйте Markdown-отчет в Downloads для разбора проблем с сетью, helper, очередью или обновлениями.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void exportDiagnostics()}
                                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
                                    >
                                        <Download size={16} />
                                        Экспортировать диагностику .md
                                    </button>
                                    {exportedDiagnosticsPath ? (
                                        <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs leading-5 text-emerald-100">
                                            Отчет сохранен: {exportedDiagnosticsPath}
                                        </p>
                                    ) : null}
                                    <pre className="max-h-[420px] overflow-auto rounded-2xl border border-white/8 bg-black/30 p-3 text-[11px] leading-5 text-gray-300">
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
