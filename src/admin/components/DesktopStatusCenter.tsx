import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Activity,
    Clipboard,
    Download,
    HardDrive,
    Info,
    LoaderCircle,
    RefreshCw,
    Server,
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
    type StonesMediaQueueSnapshot
} from '../../utils/desktop';

type StatusTone = 'ok' | 'warning' | 'error' | 'checking' | 'offline';
type StatusTab = 'overview' | 'queue' | 'helper' | 'updates' | 'diagnostics';

const emptyQueue: StonesMediaQueueSnapshot = {
    jobs: [],
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

const formatBytes = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return 'Не указан';
    }

    if (value < 1024 * 1024) {
        return `${Math.round(value / 1024)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const getQueueCounts = (queue: StonesMediaQueueSnapshot) => {
    const active = (queue.counts.queued || 0)
        + (queue.counts.uploading || 0)
        + (queue.counts.retrying || 0)
        + (queue.counts.auth_required || 0);
    const failed = queue.counts.failed || 0;
    const done = queue.counts.done || 0;
    return { active, failed, done };
};

const activeQueueStatuses = new Set(['queued', 'uploading', 'retrying', 'auth_required']);

type VideoUploadGroup = {
    id: string;
    title: string;
    total: number;
    done: number;
    active: number;
    failed: number;
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
        if (job.status === 'failed' || job.status === 'auth_required') {
            group.failed += 1;
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

function JobRow({
    job,
    onRetry,
    onCancel
}: {
    job: StonesMediaQueueJob;
    onRetry: (jobId: string) => void;
    onCancel: (jobId: string) => void;
}) {
    const canRetry = job.status === 'failed' || job.status === 'auth_required';
    const canCancel = job.status === 'queued' || job.status === 'retrying' || job.status === 'failed' || job.status === 'auth_required';

    return (
        <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{job.summary?.title || jobTypeLabel[job.type] || job.type}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gray-500">{jobStatusLabel[job.status] || job.status}</p>
                    {job.summary?.serialNumber ? (
                        <p className="mt-1 text-xs text-gray-400">Серийный номер: {job.summary.serialNumber}</p>
                    ) : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
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
                            Отменить
                        </button>
                    ) : null}
                </div>
            </div>
            {job.lastError ? (
                <p className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-xs leading-5 text-red-100/85">
                    {job.lastError}
                </p>
            ) : null}
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
        </div>
    );
}

export function DesktopStatusCenter() {
    const desktop = getStonesDesktop();
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<StatusTab>('overview');
    const [diagnostics, setDiagnostics] = useState<StonesDesktopDiagnostics | null>(null);
    const [queue, setQueue] = useState<StonesMediaQueueSnapshot>(emptyQueue);
    const [update, setUpdate] = useState<StonesHqUpdateInfo | StonesHqUpdateDownloadResult | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [downloadingUpdate, setDownloadingUpdate] = useState(false);
    const [actionError, setActionError] = useState('');
    const [copied, setCopied] = useState(false);

    const queueCounts = useMemo(() => getQueueCounts(queue), [queue]);
    const videoUploadGroups = useMemo(() => getVideoUploadGroups(queue.jobs), [queue.jobs]);
    const groupedJobIds = useMemo(() => new Set(videoUploadGroups.flatMap((group) => group.jobs.map((job) => job.id))), [videoUploadGroups]);
    const standaloneQueueJobs = useMemo(() => queue.jobs.filter((job) => !groupedJobIds.has(job.id)), [groupedJobIds, queue.jobs]);
    const networkTone: StatusTone = diagnostics?.network.apiReachable ? 'ok' : diagnostics?.network.online ? 'warning' : 'offline';
    const helperTone: StatusTone = diagnostics?.helper.ok ? 'ok' : 'error';
    const queueTone: StatusTone = queueCounts.failed > 0 ? 'error' : queueCounts.active > 0 ? 'checking' : 'ok';
    const cachedUpdate = diagnostics?.update || null;
    const updateChecked = Boolean(update || cachedUpdate?.checked);
    const updateAvailable = update?.updateAvailable ?? cachedUpdate?.updateAvailable ?? false;
    const updateVersion = update?.version ?? cachedUpdate?.version;
    const updateError = cachedUpdate?.error;
    const updateTone: StatusTone = updateError
        ? 'error'
        : updateAvailable
            ? 'warning'
            : updateChecked
                ? 'ok'
                : 'offline';
    const activeVideoUploads = videoUploadGroups.reduce((total, group) => total + group.active, 0);

    const headerSummary = useMemo(() => {
        if (!diagnostics) {
            return 'Проверяем приложение';
        }
        if (queueCounts.failed > 0) {
            return `Ошибки загрузки: ${queueCounts.failed}`;
        }
        if (!diagnostics?.network.apiReachable) {
            return 'API недоступен';
        }
        if (!diagnostics?.helper.ok) {
            return 'Helper требует внимания';
        }
        if (updateAvailable) {
            return `Доступна ${updateVersion}`;
        }
        if (activeVideoUploads > 0) {
            return `Видео в фоне: ${activeVideoUploads}`;
        }
        if (queueCounts.active > 0) {
            return `Загрузки: ${queueCounts.active}`;
        }
        return 'Все системы в норме';
    }, [activeVideoUploads, diagnostics, queueCounts.active, queueCounts.failed, updateAvailable, updateVersion]);

    const refresh = useCallback(async () => {
        if (!desktop) {
            return;
        }

        setRefreshing(true);
        setActionError('');
        try {
            const [nextDiagnostics, nextQueue] = await Promise.all([
                desktop.getDesktopDiagnostics(),
                desktop.getMediaQueueSnapshot()
            ]);
            setDiagnostics(nextDiagnostics);
            setQueue(nextQueue);
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

    const clearCompleted = useCallback(() => {
        if (!desktop) {
            return;
        }

        void desktop.clearCompletedMediaQueueJobs().then(setQueue).catch((error) => {
            setActionError(error instanceof Error ? error.message : 'Не удалось очистить завершенные задачи.');
        });
    }, [desktop]);

    const cleanupHelper = useCallback(() => {
        if (!desktop) {
            return;
        }

        setActionError('');
        void desktop.cleanupVideoHelper()
            .then(() => refresh())
            .catch((error) => setActionError(error instanceof Error ? error.message : 'Не удалось очистить helper.'));
    }, [desktop, refresh]);

    const copyDiagnostics = useCallback(async () => {
        if (!desktop) {
            return;
        }

        try {
            const nextDiagnostics = await desktop.getDesktopDiagnostics();
            const payload = JSON.stringify({
                ...nextDiagnostics,
                queueGroups: videoUploadGroups.map((group) => ({
                    id: group.id,
                    title: group.title,
                    total: group.total,
                    done: group.done,
                    active: group.active,
                    failed: group.failed,
                    serialNumbers: group.jobs.map((job) => job.summary?.serialNumber).filter(Boolean)
                })),
                queueJobs: queue.jobs.slice(0, 20)
            }, null, 2);
            await navigator.clipboard.writeText(payload);
            setDiagnostics(nextDiagnostics);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Не удалось скопировать диагностику.');
        }
    }, [desktop, queue.jobs, videoUploadGroups]);

    useEffect(() => {
        if (!isStonesDesktop() || !desktop) {
            return;
        }

        void refresh();
        void checkUpdate();
        const unsubscribe = desktop.subscribeMediaQueue(setQueue);
        const refreshTimer = window.setInterval(() => void refresh(), 20000);
        const updateTimer = window.setInterval(() => void checkUpdate(), 5 * 60_000);
        const openListener = () => {
            setOpen(true);
            setActiveTab('diagnostics');
            void refresh();
        };
        window.addEventListener('stones:open-status-center', openListener);

        return () => {
            unsubscribe();
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
        { id: 'diagnostics', label: 'Диагностика', icon: <Clipboard size={14} /> }
    ];

    return (
        <>
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

            {open ? (
                <div className="fixed inset-0 z-50">
                    <button
                        type="button"
                        aria-label="Закрыть Status Center"
                        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                        onClick={() => setOpen(false)}
                    />
                    <aside className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-white/10 bg-[#101216] shadow-2xl">
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
                                    {queueCounts.active > 0 ? `Загрузки: ${queueCounts.active}` : queueCounts.failed > 0 ? `Ошибки: ${queueCounts.failed}` : 'Очередь чистая'}
                                </StatusBadge>
                                <StatusBadge tone={updateTone}>
                                    <Download size={13} />
                                    {updateAvailable ? `Версия ${updateVersion}` : updateChecked ? 'Актуально' : 'Не проверено'}
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
                                        detail={diagnostics?.app.apiOrigin || diagnostics?.network.error}
                                        tone={networkTone}
                                    />
                                    <StatusCard
                                        icon={<Video size={18} />}
                                        title="Видео helper"
                                        value={diagnostics?.helper.ok ? 'Встроенный helper готов' : 'Требует внимания'}
                                        detail={diagnostics?.helper.error || diagnostics?.helper.startup_error || diagnostics?.helper.helper_version}
                                        tone={helperTone}
                                    />
                                    <StatusCard
                                        icon={<UploadCloud size={18} />}
                                        title="Media uploads"
                                        value={queueCounts.active > 0 ? `Активных задач: ${queueCounts.active}` : queueCounts.failed > 0 ? `Ошибок: ${queueCounts.failed}` : 'Очередь без активных задач'}
                                        detail="Photo Tool и Video Tool загружают медиа через локальную очередь."
                                        tone={queueTone}
                                    />
                                    <StatusCard
                                        icon={<HardDrive size={18} />}
                                        title="Локальный render"
                                        value="Медиа/PDF собираются в приложении"
                                        detail="Сервер остается источником данных и файлов, но тяжелый render выполняется на Mac."
                                        tone="ok"
                                    />
                                </div>
                            ) : null}

                            {activeTab === 'queue' ? (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h3 className="text-base font-semibold text-white">Локальные загрузки</h3>
                                            <p className="mt-1 text-sm text-gray-400">Очередь переживает перезапуск приложения и плохое соединение.</p>
                                        </div>
                                        {(queue.counts.done || 0) > 0 ? (
                                            <button type="button" onClick={clearCompleted} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-200 transition hover:bg-white/5">
                                                Очистить готовые
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
                                                <p className="pt-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">Остальные задачи</p>
                                            ) : null}
                                            {standaloneQueueJobs.slice(0, 30).map((job) => (
                                                <JobRow key={job.id} job={job} onRetry={retryJob} onCancel={cancelJob} />
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
                                        detail={diagnostics?.helper.error || diagnostics?.helper.startup_error || 'Используется внутри ZAGARAMI admin.'}
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
                                        value={updateAvailable ? `Доступна версия ${updateVersion}` : updateChecked ? 'Установлена актуальная версия' : 'Проверка не выполнялась'}
                                        detail={updateError || 'Приложение скачивает DMG и открывает установщик. Замена .app выполняется вручную.'}
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
                                            disabled={!update?.updateAvailable || checkingUpdate || downloadingUpdate}
                                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 text-xs text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {downloadingUpdate ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
                                            Скачать и открыть DMG
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {activeTab === 'diagnostics' ? (
                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                                        <div className="flex items-start gap-3">
                                            <Info className="mt-0.5 text-sky-200" size={18} />
                                            <div>
                                                <h3 className="text-sm font-semibold text-white">Общая диагностика</h3>
                                                <p className="mt-1 text-sm leading-6 text-gray-400">
                                                    Скопируйте JSON для разбора проблем с сетью, helper, очередью или обновлениями.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void copyDiagnostics()}
                                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
                                    >
                                        <Clipboard size={16} />
                                        {copied ? 'Диагностика скопирована' : 'Скопировать диагностику'}
                                    </button>
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
                                            queueJobs: queue.jobs.slice(0, 5)
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
