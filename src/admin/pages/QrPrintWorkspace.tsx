import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ListChecks, Printer, QrCode } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { getLocalizedValue } from '../../utils/language';
import {
    AdminInlineError,
    AdminSearchField,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState
} from '../components/AdminWorkspaceUI';

const BASE_LANGUAGE_ID = 2;
const PAGE_SIZE = 10;
const QR_COLUMNS = 'minmax(240px, 1.15fr) minmax(220px, 1fr) 120px 80px 100px 300px';

type Translation = {
    language_id: number;
    name: string;
    description?: string;
    country?: string;
};

type ProductBatchSummary = {
    id: string;
    status: string;
    created_at: string;
    items_count: number;
};

type ProductSummary = {
    id: string;
    country_code: string;
    location_code: string;
    item_code: string;
    location_description?: string | null;
    translations: Translation[];
    location?: {
        id: string;
        translations: Translation[];
    } | null;
    batches: ProductBatchSummary[];
};

type BatchRow = ProductBatchSummary & {
    productId: string;
    productName: string;
    locationName: string;
    productCode: string;
};

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const statusMeta: Record<string, { label: string; tone: StatusTone }> = {
    DRAFT: { label: 'Черновик', tone: 'warning' },
    TRANSIT: { label: 'В пути', tone: 'info' },
    RECEIVED: { label: 'Принята', tone: 'info' },
    ERROR: { label: 'Ошибка', tone: 'danger' },
    FINISHED: { label: 'Завершена', tone: 'success' }
};

const getProductName = (product: ProductSummary) => (
    getLocalizedValue(product, 'name', BASE_LANGUAGE_ID) || 'Без названия'
);

const getLocationName = (product: ProductSummary) => {
    const translated = product.location
        ? getLocalizedValue(product.location, 'name', BASE_LANGUAGE_ID)
        : '';
    return translated || product.location_description || product.location_code || 'Без локации';
};

const getProductCode = (product: ProductSummary) => (
    [product.country_code, product.location_code, product.item_code].filter(Boolean).join(' · ')
);

const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ru-RU');
};

const buildPrintUrl = (batchId: string, mode: 'all' | 'selected') => (
    `/admin/qr/print?batchId=${encodeURIComponent(batchId)}&mode=${mode}`
);

export function QrPrintWorkspace() {
    const [searchParams] = useSearchParams();
    const hasLoadedRef = useRef(false);
    const [products, setProducts] = useState<ProductSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState(() => searchParams.get('batchId') || '');
    const [page, setPage] = useState(1);

    const loadData = async () => {
        setIsLoading(true);
        setError('');

        try {
            const response = await authFetch('/api/products');
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'Не удалось загрузить партии.');
            setProducts(Array.isArray(payload) ? payload as ProductSummary[] : []);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить QR-данные.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (hasLoadedRef.current) return;
        hasLoadedRef.current = true;
        void loadData();
    }, []);

    useEffect(() => {
        setPage(1);
    }, [query]);

    const batchRows = useMemo<BatchRow[]>(() => products
        .flatMap((product) => product.batches.map((batch) => ({
            ...batch,
            productId: product.id,
            productName: getProductName(product),
            locationName: getLocationName(product),
            productCode: getProductCode(product)
        })))
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()), [products]);

    const filteredBatches = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase('ru');
        if (!normalizedQuery) return batchRows;

        return batchRows.filter((batch) => (
            [
                batch.id,
                batch.productName,
                batch.locationName,
                batch.productCode,
                batch.status,
                statusMeta[batch.status]?.label || ''
            ].join(' ').toLocaleLowerCase('ru').includes(normalizedQuery)
        ));
    }, [batchRows, query]);

    const pageCount = Math.max(1, Math.ceil(filteredBatches.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visibleBatches = filteredBatches.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    return (
        <AdminWorkspace data-testid="qr-print-workspace">
            <AdminWorkspaceHeader title="QR-печать" count={`Всего партий: ${filteredBatches.length}`}>
                <AdminSearchField
                    value={query}
                    onChange={setQuery}
                    placeholder="ID партии, товар или статус"
                    ariaLabel="Поиск партий для QR-печати"
                    className="ml-auto max-w-[640px] flex-1"
                />
            </AdminWorkspaceHeader>

            {error ? <AdminInlineError>{error}</AdminInlineError> : null}

            <AdminTableSurface minWidth={1080}>
                <div
                    className="grid min-h-[48px] border-b border-[#2a3039] bg-[#10151b] text-[12px] font-medium text-[#8f98a4]"
                    style={{ gridTemplateColumns: QR_COLUMNS }}
                >
                    {['Партия', 'Товар и локация', 'Статус', 'QR', 'Дата', 'Действия'].map((label, index) => (
                        <div key={label} className={`flex items-center px-4 ${index === 5 ? '' : 'border-r border-[#2a3039]'}`}>{label}</div>
                    ))}
                </div>

                {isLoading ? (
                    <AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState>
                ) : visibleBatches.length === 0 ? (
                    <AdminWorkspaceState state="empty">Партии не найдены</AdminWorkspaceState>
                ) : (
                    visibleBatches.map((batch) => {
                        const status = statusMeta[batch.status] || { label: batch.status, tone: 'neutral' as const };

                        return (
                            <div
                                key={batch.id}
                                data-testid={`qr-batch-row-${batch.id}`}
                                className="grid min-h-[72px] border-b border-[#272d35] bg-[#141a21] last:border-b-0 hover:bg-[#171e26]"
                                style={{ gridTemplateColumns: QR_COLUMNS }}
                            >
                                <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-3 border-r border-[#2a3039] px-4 py-2.5">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#29313a] bg-[#1d242c] text-[#d4dae1]">
                                        <QrCode size={17} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="truncate font-mono text-[13px] font-semibold leading-5 text-[#f1f4f7]">{batch.id}</div>
                                        <div className="mt-1 truncate text-[11px] text-[#7f8894]">{batch.productCode}</div>
                                    </div>
                                </div>
                                <div className="flex min-w-0 flex-col justify-center border-r border-[#2a3039] px-4 py-2">
                                    <div className="truncate text-[13px] font-medium text-[#e7ebef]">{batch.productName}</div>
                                    <div className="mt-1 truncate text-[11px] text-[#7f8894]">{batch.locationName}</div>
                                </div>
                                <div className="flex items-center border-r border-[#2a3039] px-3">
                                    <AdminStatus label={status.label} tone={status.tone} />
                                </div>
                                <div className="flex items-center justify-end border-r border-[#2a3039] px-4 text-[18px] font-semibold tabular-nums text-[#eef2f6]">
                                    {batch.items_count}
                                </div>
                                <div className="flex items-center border-r border-[#2a3039] px-4 text-[12px] text-[#a7afb9]">
                                    {formatDate(batch.created_at)}
                                </div>
                                <div className="flex items-center justify-end gap-2 px-3">
                                    <Link
                                        data-testid={`qr-print-all-${batch.id}`}
                                        to={buildPrintUrl(batch.id, 'all')}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#4b89d9] bg-[#152130] px-3 text-[13px] font-medium text-[#79b9ff] transition hover:border-[#67a5f4] hover:bg-[#192a3d]"
                                    >
                                        <Printer size={15} />
                                        Печатать все
                                    </Link>
                                    <Link
                                        data-testid={`qr-print-selected-${batch.id}`}
                                        to={buildPrintUrl(batch.id, 'selected')}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#333b46] bg-[#191f27] px-3 text-[13px] font-medium text-[#d5dae0] transition hover:border-[#4a5562] hover:bg-[#202832]"
                                    >
                                        <ListChecks size={15} />
                                        Выбрать QR
                                    </Link>
                                </div>
                            </div>
                        );
                    })
                )}
            </AdminTableSurface>

            <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
        </AdminWorkspace>
    );
}

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
    const visiblePages = Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
        const start = Math.min(Math.max(page - 2, 1), Math.max(pageCount - 4, 1));
        return start + index;
    });

    return (
        <nav className="flex items-center justify-center gap-2 py-1" aria-label="Страницы QR-печати">
            <PageButton label="Предыдущая страница" disabled={page === 1} onClick={() => onChange(Math.max(1, page - 1))}>
                <ChevronLeft size={15} />
            </PageButton>
            {visiblePages.map((value) => (
                <PageButton key={value} label={`Страница ${value}`} active={value === page} onClick={() => onChange(value)}>
                    {value}
                </PageButton>
            ))}
            <PageButton label="Следующая страница" disabled={page === pageCount} onClick={() => onChange(Math.min(pageCount, page + 1))}>
                <ChevronRight size={15} />
            </PageButton>
            <span className="ml-4 text-[12px] text-[#7f8894]">По {PAGE_SIZE} на странице</span>
        </nav>
    );
}

function PageButton({
    children,
    label,
    onClick,
    active = false,
    disabled = false
}: {
    children: ReactNode;
    label: string;
    onClick: () => void;
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
