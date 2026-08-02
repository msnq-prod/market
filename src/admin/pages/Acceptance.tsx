import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
    AlertTriangle,
    Box,
    CalendarDays,
    Camera,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Search,
    Video
} from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { canFinalizeBatch, canReceiveBatch } from '../../../shared/domain/policy';

type BatchItem = {
    id: string;
    item_photo_url?: string | null;
    item_video_url?: string | null;
};

type BatchView = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    owner?: {
        id: string;
        name: string;
        email: string;
    };
    product?: {
        id: string;
        country_code: string;
        location_code: string;
        item_code: string;
        location_description?: string | null;
        translations: Array<{
            language_id: number;
            name: string;
            description: string;
        }>;
        location?: {
            id: string;
            translations: Array<{
                language_id: number;
                name: string;
                country: string;
                description?: string | null;
            }>;
        } | null;
    } | null;
    items: BatchItem[];
};

type MediaCounts = {
    total: number;
    photoReady: number;
    videoReady: number;
};

const PAGE_SIZE = 10;
const PIPELINE_COLUMNS = '430px repeat(4, minmax(190px, 1fr))';

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const getProductName = (batch: BatchView) => (
    batch.product ? getDefaultTranslationValue(batch.product.translations, 'name') : 'Товар не указан'
);

const getLocationName = (batch: BatchView) => {
    if (!batch.product) return 'Локация не указана';

    const locationName = batch.product.location
        ? getDefaultTranslationValue(batch.product.location.translations, 'name')
        : '';
    return locationName || batch.product.location_description || batch.product.location_code || 'Локация не указана';
};

const getProductCode = (batch: BatchView) => {
    if (!batch.product) return '';
    return [batch.product.country_code, batch.product.location_code, batch.product.item_code]
        .filter(Boolean)
        .join(' · ');
};

const getMediaCounts = (batch: BatchView): MediaCounts => {
    let photoReady = 0;
    let videoReady = 0;

    batch.items.forEach((item) => {
        if (item.item_photo_url) photoReady += 1;
        if (item.item_video_url) videoReady += 1;
    });

    return {
        total: batch.items.length,
        photoReady,
        videoReady
    };
};

const getPipelinePriority = (batch: BatchView) => {
    if (batch.status === 'ERROR') return 0;
    if (canReceiveBatch(batch.status)) return 1;
    if (canFinalizeBatch(batch.status)) {
        const counts = getMediaCounts(batch);
        if (counts.photoReady < counts.total) return 2;
        if (counts.videoReady < counts.total) return 3;
        return 4;
    }
    if (batch.status === 'FINISHED') return 5;
    return 6;
};

const sortPipelineBatches = (left: BatchView, right: BatchView) => {
    const priority = getPipelinePriority(left) - getPipelinePriority(right);
    if (priority !== 0) return priority;
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
};

const normalizeDate = (value: string) => value.slice(0, 10);

const formatDate = (value: string) => {
    const [year, month, day] = value.split('-');
    return [day, month, year].filter(Boolean).join('.');
};

export function Acceptance() {
    return <BatchPipeline />;
}

export function AcceptanceBatchesWorkspace() {
    return <BatchPipeline />;
}

export function AcceptanceMediaWorkspace() {
    return <Navigate to="/admin/acceptance/batches" replace />;
}

export function AcceptanceReadyWorkspace() {
    return <Navigate to="/admin/acceptance/batches" replace />;
}

function BatchPipeline() {
    const hasLoadedRef = useRef(false);
    const [batches, setBatches] = useState<BatchView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [date, setDate] = useState('ALL');
    const [status, setStatus] = useState('ALL');
    const [location, setLocation] = useState('ALL');
    const [partner, setPartner] = useState('ALL');
    const [page, setPage] = useState(1);
    const [updatingBatchId, setUpdatingBatchId] = useState('');

    const loadBatches = async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        setError('');

        try {
            const response = await authFetch('/api/batches');
            if (!response.ok) throw new Error('Не удалось загрузить партии.');
            setBatches(await response.json() as BatchView[]);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить партии.');
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    useEffect(() => {
        if (hasLoadedRef.current) return;
        hasLoadedRef.current = true;
        void loadBatches();
    }, []);

    const locationOptions = useMemo(() => Array.from(new Set(
        batches.map(getLocationName).filter(Boolean)
    )).sort((left, right) => left.localeCompare(right, 'ru')), [batches]);

    const partnerOptions = useMemo(() => Array.from(new Set(
        batches.map((batch) => batch.owner?.name || '').filter(Boolean)
    )).sort((left, right) => left.localeCompare(right, 'ru')), [batches]);

    const dateOptions = useMemo(() => Array.from(new Set(
        batches.map((batch) => normalizeDate(batch.created_at)).filter(Boolean)
    )).sort((left, right) => right.localeCompare(left)), [batches]);

    const filteredBatches = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase('ru');

        return batches
            .filter((batch) => {
                if (status !== 'ALL' && batch.status !== status) return false;
                if (location !== 'ALL' && getLocationName(batch) !== location) return false;
                if (partner !== 'ALL' && (batch.owner?.name || '') !== partner) return false;
                if (date !== 'ALL' && normalizeDate(batch.created_at) !== date) return false;
                if (!normalizedQuery) return true;

                const haystack = [
                    batch.id,
                    getProductName(batch),
                    getLocationName(batch),
                    getProductCode(batch),
                    batch.owner?.name || ''
                ].join(' ').toLocaleLowerCase('ru');
                return haystack.includes(normalizedQuery);
            })
            .sort(sortPipelineBatches);
    }, [batches, date, location, partner, query, status]);

    useEffect(() => {
        setPage(1);
    }, [date, location, partner, query, status]);

    const pageCount = Math.max(1, Math.ceil(filteredBatches.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visibleBatches = filteredBatches.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const updateBatch = async (batchId: string, action: 'receive' | 'finalize') => {
        setUpdatingBatchId(batchId);
        setError('');

        try {
            const response = await authFetch(`/api/batches/${batchId}/${action}`, { method: 'POST' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось обновить партию.' }));
                throw new Error(payload.error || 'Не удалось обновить партию.');
            }
            await loadBatches(false);
        } catch (updateError) {
            console.error(updateError);
            setError(updateError instanceof Error ? updateError.message : 'Не удалось обновить партию.');
        } finally {
            setUpdatingBatchId('');
        }
    };

    return (
        <div className="mx-auto min-w-0 max-w-[1600px] space-y-3" data-testid="batch-pipeline">
            <header
                className="grid min-w-0 items-center gap-3 px-1"
                style={{ gridTemplateColumns: '200px minmax(220px, 1fr) 140px 140px 140px 140px' }}
            >
                <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em] text-[#f5f7fa]">
                    Партии
                </h1>

                <label className="relative block min-w-0">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#77808d]" size={17} />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Поиск по ID партии, товару или партнёру"
                        aria-label="Поиск партий"
                        className="h-11 w-full rounded-lg border border-[#2a3039] bg-[#151a21] pl-10 pr-3 text-[13px] text-[#eef2f6] outline-none transition placeholder:text-[#727b88] focus:border-[#4c91f3]"
                    />
                </label>

                <label className="relative block w-full min-w-0">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#79828f]" size={16} />
                    <select
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        aria-label="Дата партии"
                        className="h-11 w-full appearance-none rounded-lg border border-[#2a3039] bg-[#151a21] pl-9 pr-8 text-[13px] text-[#eef2f6] outline-none transition focus:border-[#4c91f3]"
                    >
                        <option value="ALL">Все даты</option>
                        {dateOptions.map((value) => (
                            <option key={value} value={value}>{formatDate(value)}</option>
                        ))}
                    </select>
                    <ChevronRight className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-[#727b87]" size={14} />
                </label>

                <FilterSelect label="Статус" value={status} onChange={setStatus} options={[
                    { value: 'ALL', label: 'Все' },
                    { value: 'TRANSIT', label: 'В пути' },
                    { value: 'RECEIVED', label: 'Приняты' },
                    { value: 'ERROR', label: 'Ошибка' },
                    { value: 'FINISHED', label: 'Завершены' }
                ]} />
                <FilterSelect
                    label="Локация"
                    value={location}
                    onChange={setLocation}
                    options={[{ value: 'ALL', label: 'Все' }, ...locationOptions.map((value) => ({ value, label: value }))]}
                />
                <FilterSelect
                    label="Партнер"
                    value={partner}
                    onChange={setPartner}
                    options={[{ value: 'ALL', label: 'Все' }, ...partnerOptions.map((value) => ({ value, label: value }))]}
                />

            </header>

            {error ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
                    <AlertTriangle size={16} />
                    {error}
                </div>
            ) : null}

            <section className="overflow-x-auto rounded-lg border border-[#2a3039] bg-[#11161d] shadow-[0_22px_50px_rgba(0,0,0,0.22)]">
                <div className="min-w-[1120px]">
                    <div
                        className="grid min-h-[48px] border-b border-[#2a3039] bg-[#10151b] text-[13px] font-semibold text-[#f1f4f7]"
                        style={{ gridTemplateColumns: PIPELINE_COLUMNS }}
                    >
                        <div className="flex items-center border-r border-[#2a3039] px-4 text-[12px] font-medium text-[#8f98a4]">
                            Партия / Товар и локация / Партнёр / Количество
                        </div>
                        <PipelineHeader icon={Box} label="Приёмка" />
                        <PipelineHeader icon={Camera} label="Фото" />
                        <PipelineHeader icon={Video} label="Видео" />
                        <PipelineHeader icon={CheckCircle2} label="Завершение" last />
                    </div>

                    {loading ? (
                        <div className="flex h-[420px] items-center justify-center text-sm text-[#7f8894]">Загрузка…</div>
                    ) : visibleBatches.length === 0 ? (
                        <div className="flex h-[420px] items-center justify-center text-sm text-[#7f8894]">Партии не найдены</div>
                    ) : (
                        visibleBatches.map((batch) => (
                            <BatchPipelineRow
                                key={batch.id}
                                batch={batch}
                                updating={updatingBatchId === batch.id}
                                onReceive={() => void updateBatch(batch.id, 'receive')}
                                onFinalize={() => void updateBatch(batch.id, 'finalize')}
                            />
                        ))
                    )}
                </div>
            </section>

            <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
        </div>
    );
}

function FilterSelect({
    label,
    value,
    onChange,
    options
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
}) {
    return (
        <label className="relative block w-full min-w-0">
            <span className="sr-only">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-label={label}
                className="h-11 w-full min-w-0 appearance-none truncate rounded-lg border border-[#2a3039] bg-[#151a21] pl-3 pr-8 text-[13px] text-[#e4e8ed] outline-none transition focus:border-[#4c91f3]"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>{label}: {option.label}</option>
                ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-[#727b87]" size={14} />
        </label>
    );
}

function PipelineHeader({
    icon: Icon,
    label,
    last = false
}: {
    icon: typeof Box;
    label: string;
    last?: boolean;
}) {
    return (
        <div className={`flex items-center justify-between gap-3 px-4 ${last ? '' : 'border-r border-[#2a3039]'}`}>
            <span className="inline-flex items-center gap-2">
                <Icon size={16} className="text-[#c9d0d8]" />
                {label}
            </span>
            {last ? null : <ChevronRight size={16} className="text-[#59616c]" />}
        </div>
    );
}

function BatchPipelineRow({
    batch,
    updating,
    onReceive,
    onFinalize
}: {
    batch: BatchView;
    updating: boolean;
    onReceive: () => void;
    onFinalize: () => void;
}) {
    const counts = getMediaCounts(batch);
    const received = batch.status === 'RECEIVED' || batch.status === 'FINISHED';
    const finished = batch.status === 'FINISHED';
    const photoComplete = finished || (counts.total > 0 && counts.photoReady === counts.total);
    const videoComplete = finished || (counts.total > 0 && counts.videoReady === counts.total);
    const hasError = batch.status === 'ERROR';
    const locationName = getLocationName(batch);
    const productCode = getProductCode(batch);

    return (
        <div
            data-testid={`batch-pipeline-row-${batch.id}`}
            className="grid min-h-[70px] border-b border-[#272d35] bg-[#141a21] last:border-b-0 hover:bg-[#171e26]"
            style={{ gridTemplateColumns: PIPELINE_COLUMNS }}
        >
            <div className="grid grid-cols-[36px_minmax(0,1fr)_56px] items-center gap-3 border-r border-[#2a3039] px-4 py-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#29313a] bg-[#1d242c] text-[#d4dae1]">
                    <Box size={17} />
                </span>
                <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold leading-5 text-[#f1f4f7]">{batch.id}</div>
                    <div className="truncate text-[12px] leading-4 text-[#a7afb9]">{getProductName(batch)}</div>
                    <div className="truncate text-[11px] leading-4 text-[#7f8895]">
                        {[locationName, batch.owner?.name || 'Партнер не указан', productCode].filter(Boolean).join(' · ')}
                    </div>
                </div>
                <span className="text-right text-[20px] font-semibold tabular-nums text-[#eef2f6]">{counts.total}</span>
            </div>

            <StageCell>
                {canReceiveBatch(batch.status) ? (
                    <StageButton onClick={onReceive} disabled={updating} icon={Box}>
                        {updating ? 'Принимаем…' : 'Принять партию'}
                    </StageButton>
                ) : received ? (
                    <CompleteState label="Принято" count={counts.total} />
                ) : hasError ? (
                    <ErrorState count={counts.total} />
                ) : (
                    <EmptyState />
                )}
            </StageCell>

            <StageCell>
                {received && photoComplete ? (
                    <CompleteState label="Готово" count={finished ? counts.total : counts.photoReady} />
                ) : batch.status === 'RECEIVED' ? (
                    <StageLink to={`/admin/photo-tool/${encodeURIComponent(batch.id)}`} icon={Camera}>
                        Открыть Photo Tool
                    </StageLink>
                ) : (
                    <EmptyState />
                )}
            </StageCell>

            <StageCell>
                {received && videoComplete ? (
                    <CompleteState label="Готово" count={finished ? counts.total : counts.videoReady} />
                ) : batch.status === 'RECEIVED' && photoComplete ? (
                    <StageLink to={`/admin/video-tool/${encodeURIComponent(batch.id)}`} icon={Video}>
                        Открыть Video Tool
                    </StageLink>
                ) : (
                    <EmptyState />
                )}
            </StageCell>

            <StageCell last>
                {finished ? (
                    <CompleteState label="Завершено" count={counts.total} />
                ) : canFinalizeBatch(batch.status) && photoComplete && videoComplete ? (
                    <StageButton onClick={onFinalize} disabled={updating} icon={CheckCircle2}>
                        {updating ? 'Завершаем…' : 'Завершить'}
                    </StageButton>
                ) : (
                    <EmptyState />
                )}
            </StageCell>
        </div>
    );
}

function StageCell({ children, last = false }: { children: React.ReactNode; last?: boolean }) {
    return (
        <div className={`flex min-w-0 items-center px-3 py-2 ${last ? '' : 'border-r border-[#2a3039]'}`}>
            {children}
        </div>
    );
}

function CompleteState({ label, count }: { label: string; count: number }) {
    return (
        <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1fa65a] text-[#31d474]">
                <Check size={15} strokeWidth={2.2} />
            </span>
            <div className="text-[12px] leading-4">
                <div className="text-[#8f98a5]">{label}</div>
                <div className="font-medium tabular-nums text-[#eef2f6]">{count}</div>
            </div>
        </div>
    );
}

function ErrorState({ count }: { count: number }) {
    return (
        <div className="flex items-center gap-3 text-red-300">
            <AlertTriangle size={21} />
            <div className="text-[12px] leading-4">
                <div>Ошибка</div>
                <div className="font-medium tabular-nums text-[#eef2f6]">{count}</div>
            </div>
        </div>
    );
}

function EmptyState() {
    return <span className="mx-auto text-[18px] text-[#69727e]">—</span>;
}

function StageButton({
    onClick,
    disabled,
    icon: Icon,
    children
}: {
    onClick: () => void;
    disabled: boolean;
    icon: typeof Box;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[#4b89d9] bg-[#152130] px-3 text-[13px] font-medium text-[#6eb2ff] transition hover:border-[#67a5f4] hover:bg-[#192a3d] disabled:cursor-wait disabled:opacity-60"
        >
            <Icon size={17} />
            {children}
        </button>
    );
}

function StageLink({
    to,
    icon: Icon,
    children
}: {
    to: string;
    icon: typeof Box;
    children: React.ReactNode;
}) {
    return (
        <Link
            to={to}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[#4b89d9] bg-[#152130] px-3 text-[13px] font-medium text-[#6eb2ff] transition hover:border-[#67a5f4] hover:bg-[#192a3d]"
        >
            <Icon size={17} />
            {children}
        </Link>
    );
}

function Pagination({
    page,
    pageCount,
    onChange
}: {
    page: number;
    pageCount: number;
    onChange: (page: number) => void;
}) {
    const visiblePages = Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
        const start = Math.min(Math.max(page - 2, 1), Math.max(pageCount - 4, 1));
        return start + index;
    });

    return (
        <nav className="flex items-center justify-center gap-2 py-1" aria-label="Страницы партий">
            <PageButton
                label="Предыдущая страница"
                disabled={page === 1}
                onClick={() => onChange(Math.max(1, page - 1))}
            >
                <ChevronLeft size={15} />
            </PageButton>
            {visiblePages.map((value) => (
                <PageButton key={value} active={value === page} onClick={() => onChange(value)} label={`Страница ${value}`}>
                    {value}
                </PageButton>
            ))}
            <PageButton
                label="Следующая страница"
                disabled={page === pageCount}
                onClick={() => onChange(Math.min(pageCount, page + 1))}
            >
                <ChevronRight size={15} />
            </PageButton>
            <span className="ml-4 text-[12px] text-[#7f8894]">По {PAGE_SIZE} на странице</span>
        </nav>
    );
}

function PageButton({
    children,
    onClick,
    label,
    active = false,
    disabled = false
}: {
    children: React.ReactNode;
    onClick: () => void;
    label: string;
    active?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={`flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-[12px] transition ${active
                ? 'border-[#4c91f3] bg-[#438eea] text-white shadow-[0_0_16px_rgba(76,145,243,0.26)]'
                : 'border-[#283039] bg-[#171d24] text-[#a4acb6] hover:border-[#46515e] hover:text-white disabled:cursor-default disabled:opacity-35'
            }`}
        >
            {children}
        </button>
    );
}
