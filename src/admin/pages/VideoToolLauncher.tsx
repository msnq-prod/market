import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, Camera, HardDriveDownload, RefreshCw, Video } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { isStonesDesktop } from '../../utils/desktop';

type HqMediaView = 'queue' | 'photo' | 'video' | 'status' | 'diagnostics';

type MediaBatchItem = {
    id: string;
    temp_id: string;
    serial_number: string | null;
    item_photo_url?: string | null;
    item_video_url?: string | null;
    status: string;
};

type MediaBatch = {
    id: string;
    status: string;
    created_at: string;
    daily_batch_seq?: number | null;
    owner?: {
        name: string;
        email: string;
    } | null;
    product?: {
        translations?: Array<{
            language_id: number;
            name: string;
        }>;
        location?: {
            translations?: Array<{
                language_id: number;
                name: string;
            }>;
        } | null;
    } | null;
    items: MediaBatchItem[];
};

type MediaRow = {
    batch: MediaBatch;
    total: number;
    photoReady: number;
    videoReady: number;
    serialReady: number;
    productName: string;
    locationName: string;
    missingPhoto: number;
    missingVideo: number;
    missingSerial: number;
};

type MediaSummary = {
    batches: number;
    items: number;
    photoGaps: number;
    videoGaps: number;
    serialGaps: number;
};

const hqMediaViewMeta: Record<HqMediaView, {
    label: string;
    title: string;
    description: string;
}> = {
    queue: {
        label: 'Очередь',
        title: 'Очередь медиа',
        description: 'Партии с неполным фото, видео или серийниками и быстрый вход в инструменты обработки.'
    },
    photo: {
        label: 'Фото',
        title: 'Готовность фото',
        description: 'Партии с недостающими фото позиций и вход в локальный инструмент.'
    },
    video: {
        label: 'Видео',
        title: 'Готовность видео',
        description: 'Партии с недостающими видео позиций и вход в локальный инструмент.'
    },
    status: {
        label: 'Среда',
        title: 'Среда обработки',
        description: 'Сводка доступности локальной среды и инструментов обработки.'
    },
    diagnostics: {
        label: 'Диагностика',
        title: 'Диагностика партий',
        description: 'Блокеры медиа-подготовки: пустые партии, нет фото, нет видео, нет серийников.'
    }
};

const getDefaultTranslationValue = (translations: Array<{ language_id: number; name: string }> | undefined) => {
    const translation = translations?.find((item) => item.language_id === 2)
        || translations?.find((item) => item.language_id === 1)
        || translations?.[0];
    return translation?.name || '';
};

const hqMediaViewRoutes: Record<HqMediaView, string> = {
    queue: '/admin/media',
    photo: '/admin/media/photo',
    video: '/admin/media/video',
    status: '/admin/media/runtime',
    diagnostics: '/admin/media/diagnostics'
};

export function VideoToolLauncher() {
    return <HqMediaQueueWorkspace />;
}

export function HqMediaQueueWorkspace() {
    return <VideoToolWorkspace routeView="queue" />;
}

export function HqPhotoReadinessWorkspace() {
    return <VideoToolWorkspace routeView="photo" />;
}

export function HqVideoReadinessWorkspace() {
    return <VideoToolWorkspace routeView="video" />;
}

export function HqMediaRuntimeWorkspace() {
    return <VideoToolWorkspace routeView="status" />;
}

export function HqMediaDiagnosticsWorkspace() {
    return <VideoToolWorkspace routeView="diagnostics" />;
}

function VideoToolWorkspace({ routeView }: { routeView?: HqMediaView } = {}) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const view = routeView || viewParamToHqMediaView(searchParams.get('view'));
    const [batches, setBatches] = useState<MediaBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const isDesktop = isStonesDesktop();

    const loadBatches = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await authFetch('/api/batches');
            const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить медиа-очередь.' }));
            if (!response.ok) {
                throw new Error(payload.error || 'Не удалось загрузить медиа-очередь.');
            }

            setBatches(payload as MediaBatch[]);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить медиа-очередь.');
            setBatches([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadBatches();
    }, []);

    const mediaRows = useMemo<MediaRow[]>(() => (
        batches
            .map((batch) => {
                const total = batch.items.length;
                const photoReady = batch.items.filter((item) => Boolean(item.item_photo_url)).length;
                const videoReady = batch.items.filter((item) => Boolean(item.item_video_url)).length;
                const serialReady = batch.items.filter((item) => Boolean(item.serial_number)).length;
                const productName = getDefaultTranslationValue(batch.product?.translations) || 'Без товара';
                const locationName = getDefaultTranslationValue(batch.product?.location?.translations) || 'Без локации';

                return {
                    batch,
                    total,
                    photoReady,
                    videoReady,
                    serialReady,
                    productName,
                    locationName,
                    missingPhoto: Math.max(total - photoReady, 0),
                    missingVideo: Math.max(total - videoReady, 0),
                    missingSerial: Math.max(total - serialReady, 0)
                };
            })
            .filter((row) => row.total > 0)
            .sort((left, right) => right.batch.created_at.localeCompare(left.batch.created_at))
    ), [batches]);

    const visibleRows = useMemo(() => mediaRows.filter((row) => {
        if (view === 'photo') return row.missingPhoto > 0;
        if (view === 'video') return row.missingVideo > 0;
        if (view === 'diagnostics') return row.missingPhoto > 0 || row.missingVideo > 0 || row.missingSerial > 0 || row.total === 0;
        return true;
    }), [mediaRows, view]);

    const summary = useMemo<MediaSummary>(() => ({
        batches: mediaRows.length,
        items: mediaRows.reduce((sum, row) => sum + row.total, 0),
        photoGaps: mediaRows.reduce((sum, row) => sum + row.missingPhoto, 0),
        videoGaps: mediaRows.reduce((sum, row) => sum + row.missingVideo, 0),
        serialGaps: mediaRows.reduce((sum, row) => sum + row.missingSerial, 0)
    }), [mediaRows]);

    const setView = (nextView: HqMediaView) => {
        if (routeView) {
            navigate(hqMediaViewRoutes[nextView]);
            return;
        }

        if (nextView === 'queue') {
            setSearchParams({});
            return;
        }

        setSearchParams({ view: nextView });
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px] 2xl:grid-cols-[300px_minmax(0,1fr)_340px]">
            <MediaWorkspaceNav
                activeView={view}
                loading={loading}
                summary={summary}
                onRefresh={loadBatches}
                onViewChange={setView}
            />

            <div className="min-w-0 space-y-4">
                {!isDesktop ? (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                        Инструменты обработки запускаются только в HQ Desktop. В web-режиме доступен обзор очереди.
                    </div>
                ) : null}

                {error ? (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {error}
                    </div>
                ) : null}

                {view === 'status' ? (
                    <StatusWorkspace isDesktop={isDesktop} loading={loading} summary={summary} />
                ) : (
                    <MediaRowsPanel
                        isDesktop={isDesktop}
                        loading={loading}
                        rows={visibleRows}
                        view={view}
                    />
                )}
            </div>

            <MediaWorkspaceInspector
                activeView={view}
                isDesktop={isDesktop}
                loading={loading}
                summary={summary}
                visibleRows={visibleRows}
            />
        </div>
    );
}

function MediaWorkspaceNav({
    activeView,
    loading,
    summary,
    onRefresh,
    onViewChange
}: {
    activeView: HqMediaView;
    loading: boolean;
    summary: MediaSummary;
    onRefresh: () => void | Promise<void>;
    onViewChange: (view: HqMediaView) => void;
}) {
    const meta = hqMediaViewMeta[activeView];

    return (
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
            <section className="rounded-2xl border border-white/6 bg-[#14161b] p-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300/20 bg-slate-300/10 text-slate-100">
                        <HardDriveDownload size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Медиа HQ</p>
                        <h2 className="mt-1 text-base font-semibold text-white">{meta.title}</h2>
                    </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-gray-400">{meta.description}</p>

                <button
                    type="button"
                    onClick={() => void onRefresh()}
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 text-sm font-medium text-gray-200 transition hover:bg-white/[0.07] hover:text-white"
                >
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    Обновить очередь
                </button>

                <div className="mt-4 space-y-2">
                    {(Object.keys(hqMediaViewMeta) as HqMediaView[]).map((view) => (
                        <button
                            key={view}
                            type="button"
                            onClick={() => onViewChange(view)}
                            className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                activeView === view
                                    ? 'border-slate-300/30 bg-slate-300/10 text-slate-100'
                                    : 'border-white/8 bg-white/[0.035] text-gray-400 hover:bg-white/[0.06] hover:text-white'
                            }`}
                        >
                            <span className="mt-0.5 shrink-0">
                                {view === 'photo' ? <Camera size={16} /> : view === 'video' ? <Video size={16} /> : view === 'diagnostics' ? <AlertTriangle size={16} /> : <Activity size={16} />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">{hqMediaViewMeta[view].label}</span>
                                <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-gray-500">
                                    {hqMediaViewMeta[view].description}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/6 pt-4">
                    <MediaNavMetric label="Партии" value={loading ? '...' : summary.batches} />
                    <MediaNavMetric label="Позиции" value={loading ? '...' : summary.items} />
                    <MediaNavMetric label="Нет фото" value={loading ? '...' : summary.photoGaps} />
                    <MediaNavMetric label="Нет видео" value={loading ? '...' : summary.videoGaps} />
                </div>
            </section>
        </aside>
    );
}

function MediaRowsPanel({
    isDesktop,
    loading,
    rows,
    view
}: {
    isDesktop: boolean;
    loading: boolean;
    rows: MediaRow[];
    view: HqMediaView;
}) {
    return (
        <section className="admin-panel overflow-hidden rounded-[24px]">
            <div className="border-b border-white/6 px-5 py-4">
                <h3 className="text-lg font-semibold text-white">{hqMediaViewMeta[view].title}</h3>
                <p className="mt-1 text-sm text-gray-500">Показано партий: {rows.length}</p>
            </div>

            {loading ? (
                <div className="px-5 py-10 text-sm text-gray-400">Загрузка медиа-очереди...</div>
            ) : rows.length === 0 ? (
                <div className="px-5 py-10 text-sm text-gray-500">Партии для этого режима не найдены.</div>
            ) : (
                <div className="divide-y divide-white/6">
                    {rows.map((row) => (
                        <MediaBatchRow
                            key={row.batch.id}
                            row={row}
                            isDesktop={isDesktop}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function MediaWorkspaceInspector({
    activeView,
    isDesktop,
    loading,
    summary,
    visibleRows
}: {
    activeView: HqMediaView;
    isDesktop: boolean;
    loading: boolean;
    summary: MediaSummary;
    visibleRows: MediaRow[];
}) {
    const meta = hqMediaViewMeta[activeView];
    const blockers = summary.photoGaps + summary.videoGaps + summary.serialGaps;

    return (
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
            <div className="space-y-4">
                <section className="rounded-2xl border border-white/6 bg-[#14161b] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Текущий режим</p>
                    <h3 className="mt-2 text-base font-semibold text-white">{meta.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-400">{meta.description}</p>
                    <div className="mt-4 space-y-2">
                        <MediaInspectorRow label="Среда" value={isDesktop ? 'Доступна' : 'Только обзор'} />
                        <MediaInspectorRow label="Статус данных" value={loading ? 'Загрузка' : 'Загружено'} />
                        <MediaInspectorRow label="В режиме" value={visibleRows.length} />
                    </div>
                </section>

                <section className="grid grid-cols-2 gap-3">
                    <MediaMetric label="Партии" value={summary.batches} />
                    <MediaMetric label="Позиции" value={summary.items} />
                    <MediaMetric label="Нет фото" value={summary.photoGaps} tone="warning" />
                    <MediaMetric label="Нет видео" value={summary.videoGaps} tone="warning" />
                </section>

                <section className={`rounded-2xl border p-4 ${
                    blockers > 0
                        ? 'border-amber-500/20 bg-amber-500/10'
                        : 'border-emerald-500/20 bg-emerald-500/10'
                }`}>
                    <p className="text-sm font-semibold text-white">Блокеры медиа</p>
                    <div className="mt-3 space-y-2">
                        <MediaInspectorRow label="Фото" value={summary.photoGaps} />
                        <MediaInspectorRow label="Видео" value={summary.videoGaps} />
                        <MediaInspectorRow label="Серийники" value={summary.serialGaps} />
                    </div>
                </section>
            </div>
        </aside>
    );
}

function MediaNavMetric({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-xl border border-white/6 bg-[#0f1217] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{value}</p>
        </div>
    );
}

function MediaInspectorRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-[#0f1217] px-3 py-2 text-sm">
            <span className="min-w-0 text-gray-500">{label}</span>
            <span className="shrink-0 font-medium text-gray-100">{value}</span>
        </div>
    );
}

function MediaMetric({
    label,
    value,
    tone = 'neutral'
}: {
    label: string;
    value: number;
    tone?: 'neutral' | 'warning' | 'danger';
}) {
    const toneClass = tone === 'danger'
        ? 'text-red-200'
        : tone === 'warning'
            ? 'text-amber-200'
            : 'text-white';

    return (
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">{label}</div>
            <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
        </div>
    );
}

function MediaBatchRow({
    row,
    isDesktop
}: {
    row: MediaRow;
    isDesktop: boolean;
}) {
    return (
        <article className="px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                        <h4 className="font-semibold text-white">{row.productName}</h4>
                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-300">{row.batch.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                        {row.locationName} • {row.batch.owner?.name || 'Без владельца'} • {new Date(row.batch.created_at).toLocaleString('ru-RU')}
                    </p>
                    <p className="mt-2 break-all font-mono text-xs text-gray-600">{row.batch.id}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <ReadinessPill label="Позиции" value={row.total} total={row.total} />
                        <ReadinessPill label="Фото" value={row.photoReady} total={row.total} />
                        <ReadinessPill label="Видео" value={row.videoReady} total={row.total} />
                        <ReadinessPill label="Серийники" value={row.serialReady} total={row.total} />
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                    <DesktopToolLink
                        to={`/admin/photo-tool/${encodeURIComponent(row.batch.id)}`}
                        disabled={!isDesktop}
                        icon={<Camera size={15} />}
                    >
                        Фото-инструмент
                    </DesktopToolLink>
                    <DesktopToolLink
                        to={`/admin/video-tool/${encodeURIComponent(row.batch.id)}`}
                        disabled={!isDesktop}
                        icon={<Video size={15} />}
                    >
                        Видео-инструмент
                    </DesktopToolLink>
                </div>
            </div>
        </article>
    );
}

function ReadinessPill({ label, value, total }: { label: string; value: number; total: number }) {
    const ready = total > 0 && value >= total;

    return (
        <div className={`rounded-xl border px-3 py-2 text-sm ${
            ready
                ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                : 'border-amber-400/20 bg-amber-500/10 text-amber-100'
        }`}>
            <div className="text-xs opacity-70">{label}</div>
            <div className="mt-1 font-semibold">{value}/{total}</div>
        </div>
    );
}

function DesktopToolLink({
    to,
    disabled,
    icon,
    children
}: {
    to: string;
    disabled: boolean;
    icon: ReactNode;
    children: ReactNode;
}) {
    const className = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-sm font-medium text-gray-200 transition hover:bg-white/[0.07] hover:text-white';

    if (disabled) {
        return (
            <button type="button" disabled className={`${className} cursor-not-allowed opacity-45`}>
                {icon}
                {children}
            </button>
        );
    }

    return (
        <Link to={to} className={className}>
            {icon}
            {children}
        </Link>
    );
}

function StatusWorkspace({
    isDesktop,
    loading,
    summary
}: {
    isDesktop: boolean;
    loading: boolean;
    summary: {
        batches: number;
        items: number;
        photoGaps: number;
        videoGaps: number;
        serialGaps: number;
    };
}) {
    const rows = [
        {
            title: 'HQ Desktop',
            description: isDesktop ? 'Desktop API доступен для запуска инструментов обработки.' : 'В web-режиме запуск инструментов отключен.',
            ok: isDesktop
        },
        {
            title: 'API очереди',
            description: loading ? 'Очередь загружается.' : `Загружено партий: ${summary.batches}, позиций: ${summary.items}.`,
            ok: !loading
        },
        {
            title: 'Блокеры',
            description: `Фото: ${summary.photoGaps}, видео: ${summary.videoGaps}, серийники: ${summary.serialGaps}.`,
            ok: summary.photoGaps + summary.videoGaps + summary.serialGaps === 0
        }
    ];

    return (
        <section className="admin-panel rounded-[24px] px-5 py-5">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.045] text-gray-200">
                    <HardDriveDownload size={18} />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-white">Состояние среды</h3>
                    <p className="mt-1 text-sm text-gray-500">Сводка доступности для экрана медиа-очереди.</p>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
                {rows.map((row) => (
                    <div key={row.title} className={`rounded-2xl border px-4 py-4 ${
                        row.ok
                            ? 'border-emerald-400/20 bg-emerald-500/10'
                            : 'border-amber-400/20 bg-amber-500/10'
                    }`}>
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            {row.ok ? <Activity size={15} className="text-emerald-200" /> : <AlertTriangle size={15} className="text-amber-200" />}
                            {row.title}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-gray-300">{row.description}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function viewParamToHqMediaView(value: string | null): HqMediaView {
    if (value === 'photo' || value === 'video' || value === 'status' || value === 'diagnostics') {
        return value;
    }

    return 'queue';
}
