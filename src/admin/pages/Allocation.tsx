import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { Button, Modal } from '../components/ui';
import {
    AdminAction,
    AdminInlineError,
    AdminSearchField,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState
} from '../components/AdminWorkspaceUI';

type Translation = {
    language_id: number;
    name: string;
    description?: string | null;
    country?: string | null;
};

type StockItem = {
    id: string;
    batch_id: string;
    product_id: string | null;
    temp_id: string;
    serial_number: string | null;
    photo_url?: string | null;
    status: string;
    is_sold: boolean;
};

type BatchWithItems = {
    id: string;
    status: string;
    created_at: string;
    product?: {
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
    } | null;
    items: StockItem[];
};

type AllocationBatchGroup = {
    batchId: string;
    createdAt: string;
    productName: string;
    locationName: string;
    productCode: string;
    items: StockItem[];
};

type VisibleAllocationGroup = AllocationBatchGroup & {
    visibleItems: StockItem[];
};

const PAGE_SIZE = 10;
const GROUP_COLUMNS = 'minmax(420px, 1.8fr) 140px 140px minmax(300px, 1fr)';
const ITEM_COLUMNS = '52px minmax(260px, 1.2fr) minmax(260px, 1fr) 150px';

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const normalize = (value: string) => value.trim().toLocaleLowerCase('ru');

const getProductName = (batch: BatchWithItems) => (
    batch.product
        ? getDefaultTranslationValue(batch.product.translations, 'name') || 'Без названия'
        : 'Без товара'
);

const getLocationName = (batch: BatchWithItems) => {
    if (!batch.product) return 'Без локации';
    const name = batch.product.location
        ? getDefaultTranslationValue(batch.product.location.translations, 'name')
        : '';
    return name || batch.product.location_description || batch.product.location_code || 'Без локации';
};

const getProductCode = (batch: BatchWithItems) => (
    batch.product
        ? [batch.product.country_code, batch.product.location_code, batch.product.item_code].filter(Boolean).join(' · ')
        : 'LEGACY'
);

const formatDate = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('ru-RU');
};

export function Allocation() {
    const hasLoadedRef = useRef(false);
    const [batches, setBatches] = useState<BatchWithItems[]>([]);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);

    const loadStock = async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        setError('');

        try {
            const response = await authFetch('/api/batches');
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить складские позиции.' }));
                throw new Error(payload.error || 'Не удалось загрузить складские позиции.');
            }
            setBatches(await response.json() as BatchWithItems[]);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить складские позиции.');
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    useEffect(() => {
        if (hasLoadedRef.current) return;
        hasLoadedRef.current = true;
        void loadStock();
    }, []);

    useEffect(() => {
        setPage(1);
    }, [query]);

    const groups = useMemo<AllocationBatchGroup[]>(() => batches
        .map((batch) => ({
            batchId: batch.id,
            createdAt: batch.created_at,
            productName: getProductName(batch),
            locationName: getLocationName(batch),
            productCode: getProductCode(batch),
            items: batch.items.filter((item) => item.status === 'STOCK_HQ')
        }))
        .filter((group) => group.items.length > 0)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [batches]);

    const visibleGroups = useMemo<VisibleAllocationGroup[]>(() => {
        const normalizedQuery = normalize(query);
        if (!normalizedQuery) return groups.map((group) => ({ ...group, visibleItems: group.items }));

        return groups.flatMap((group) => {
            const groupHaystack = [group.batchId, group.productName, group.locationName, group.productCode]
                .join(' ')
                .toLocaleLowerCase('ru');
            const groupMatches = groupHaystack.includes(normalizedQuery);
            const visibleItems = groupMatches
                ? group.items
                : group.items.filter((item) => (
                    [item.id, item.temp_id, item.serial_number || '']
                        .join(' ')
                        .toLocaleLowerCase('ru')
                        .includes(normalizedQuery)
                ));

            return visibleItems.length > 0 ? [{ ...group, visibleItems }] : [];
        });
    }, [groups, query]);

    const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);
    const totalStock = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups]);
    const visibleItemIds = useMemo(() => (
        visibleGroups.flatMap((group) => group.visibleItems.map((item) => item.id))
    ), [visibleGroups]);
    const pageCount = Math.max(1, Math.ceil(visibleGroups.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const pagedGroups = visibleGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const toggleItem = (itemId: string) => {
        setSelectedItems((current) => (
            current.includes(itemId)
                ? current.filter((id) => id !== itemId)
                : [...current, itemId]
        ));
    };

    const toggleGroup = (items: StockItem[]) => {
        const ids = items.map((item) => item.id);
        const allSelected = ids.length > 0 && ids.every((id) => selectedSet.has(id));

        setSelectedItems((current) => {
            const next = new Set(current);
            ids.forEach((id) => {
                if (allSelected) next.delete(id);
                else next.add(id);
            });
            return [...next];
        });
    };

    const handleAllocate = async () => {
        if (selectedItems.length === 0) return;

        setLoading(true);
        setError('');
        setNotice('');
        try {
            const responses = await Promise.all(
                selectedItems.map((id) => authFetch(`/api/financials/items/${id}/allocate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channel: 'MARKETPLACE' })
                }))
            );

            const failed = responses.find((response) => !response.ok);
            if (failed) {
                const payload = await failed.json().catch(() => ({ error: 'Не удалось распределить позиции.' }));
                throw new Error(payload.error || 'Не удалось распределить позиции.');
            }

            const allocatedCount = selectedItems.length;
            setSelectedItems([]);
            setExpandedBatchIds({});
            await loadStock(false);
            setNotice(`Распределено позиций: ${allocatedCount}`);
        } catch (allocateError) {
            console.error(allocateError);
            setError(allocateError instanceof Error ? allocateError.message : 'Не удалось распределить позиции.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <AdminWorkspace data-testid="allocation-workspace">
                <AdminWorkspaceHeader title="Распределение" count={`На складе HQ: ${totalStock}`}>
                    <AdminSearchField
                        value={query}
                        onChange={setQuery}
                        placeholder="Партия, товар или позиция"
                        ariaLabel="Поиск позиций для распределения"
                        className="ml-auto max-w-[640px] flex-1"
                    />
                </AdminWorkspaceHeader>

                {error ? <AdminInlineError>{error}</AdminInlineError> : null}
                {notice ? (
                    <div className="flex items-center gap-2 rounded-lg border border-[#1fa65a]/40 bg-[#10251b] px-4 py-2.5 text-sm text-[#53dc8c]">
                        <CheckCircle2 size={16} />
                        {notice}
                    </div>
                ) : null}

                <AdminTableSurface minWidth={1120}>
                    <div
                        className="grid min-h-[48px] border-b border-[#2a3039] bg-[#10151b] text-[12px] font-medium text-[#8f98a4]"
                        style={{ gridTemplateColumns: GROUP_COLUMNS }}
                    >
                        {['Партия и товар', 'На складе HQ', 'Выбрано', 'Действия'].map((label, index) => (
                            <div key={label} className={`flex items-center px-4 ${index === 3 ? '' : 'border-r border-[#2a3039]'}`}>{label}</div>
                        ))}
                    </div>

                    {loading && batches.length === 0 ? (
                        <AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState>
                    ) : pagedGroups.length === 0 ? (
                        <AdminWorkspaceState state="empty">Позиции для распределения не найдены</AdminWorkspaceState>
                    ) : (
                        pagedGroups.map((group) => (
                            <AllocationGroupRow
                                key={group.batchId}
                                group={group}
                                expanded={Boolean(expandedBatchIds[group.batchId])}
                                selectedSet={selectedSet}
                                onToggleExpanded={() => setExpandedBatchIds((current) => ({
                                    ...current,
                                    [group.batchId]: !current[group.batchId]
                                }))}
                                onToggleGroup={() => toggleGroup(group.visibleItems)}
                                onToggleItem={toggleItem}
                            />
                        ))
                    )}
                </AdminTableSurface>

                <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />

                <div
                    data-testid="allocation-bulk-bar"
                    className="sticky bottom-3 z-20 flex min-h-[64px] items-center justify-between gap-4 rounded-lg border border-[#34404c] bg-[#151b22]/95 px-4 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur"
                >
                    <div className="flex items-center gap-3">
                        <div className="text-sm text-[#8f98a4]">
                            Выбрано: <span className="font-semibold tabular-nums text-[#f2f5f8]">{selectedItems.length}</span>
                        </div>
                        <AdminAction
                            data-testid="allocation-select-visible"
                            tone="secondary"
                            disabled={visibleItemIds.length === 0 || loading}
                            onClick={() => setSelectedItems((current) => [...new Set([...current, ...visibleItemIds])])}
                        >
                            Выбрать видимые
                        </AdminAction>
                        <AdminAction
                            data-testid="allocation-clear-selection"
                            tone="secondary"
                            disabled={selectedItems.length === 0 || loading}
                            onClick={() => setSelectedItems([])}
                        >
                            Сбросить
                        </AdminAction>
                    </div>
                    <AdminAction
                        data-testid="allocation-submit"
                        tone="primary"
                        disabled={selectedItems.length === 0 || loading}
                        onClick={() => setConfirmModalOpen(true)}
                        className="min-w-[250px]"
                    >
                        <Globe size={16} />
                        Распределить в маркетплейс
                    </AdminAction>
                </div>
            </AdminWorkspace>

            <Modal
                isOpen={confirmModalOpen}
                onClose={() => setConfirmModalOpen(false)}
                title="Подтверждение распределения"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-300">
                        Распределить в маркетплейс: {selectedItems.length} позиций?
                    </p>
                    <div className="flex justify-end gap-3 border-t border-white/10 pt-4">
                        <Button variant="ghost" onClick={() => setConfirmModalOpen(false)}>Отмена</Button>
                        <Button
                            data-testid="allocation-confirm"
                            disabled={loading}
                            onClick={() => {
                                setConfirmModalOpen(false);
                                void handleAllocate();
                            }}
                        >
                            Подтвердить
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

function AllocationGroupRow({
    group,
    expanded,
    selectedSet,
    onToggleExpanded,
    onToggleGroup,
    onToggleItem
}: {
    group: VisibleAllocationGroup;
    expanded: boolean;
    selectedSet: Set<string>;
    onToggleExpanded: () => void;
    onToggleGroup: () => void;
    onToggleItem: (itemId: string) => void;
}) {
    const selectedVisible = group.visibleItems.filter((item) => selectedSet.has(item.id)).length;
    const allVisibleSelected = group.visibleItems.length > 0 && selectedVisible === group.visibleItems.length;

    return (
        <article data-testid={`allocation-batch-row-${group.batchId}`} className="border-b border-[#272d35] bg-[#141a21] last:border-b-0">
            <div
                className="grid min-h-[72px] hover:bg-[#171e26]"
                style={{ gridTemplateColumns: GROUP_COLUMNS }}
            >
                <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-3 border-r border-[#2a3039] px-4 py-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#29313a] bg-[#1d242c] text-[#d4dae1]">
                        <Globe size={17} />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate font-mono text-[13px] font-semibold leading-5 text-[#f1f4f7]">{group.batchId}</div>
                        <div className="truncate text-[12px] leading-4 text-[#a7afb9]">{group.productName}</div>
                        <div className="truncate text-[11px] leading-4 text-[#7f8895]">{group.locationName} · {group.productCode} · {formatDate(group.createdAt)}</div>
                    </div>
                </div>
                <div className="flex items-center justify-end border-r border-[#2a3039] px-4 text-[18px] font-semibold tabular-nums text-[#53dc8c]">
                    {group.items.length}
                </div>
                <div className="flex items-center justify-end border-r border-[#2a3039] px-4 text-[16px] font-semibold tabular-nums text-[#eef2f6]">
                    {selectedVisible}/{group.visibleItems.length}
                </div>
                <div className="flex items-center justify-end gap-2 px-3">
                    <AdminAction
                        data-testid={`allocation-select-batch-${group.batchId}`}
                        tone={allVisibleSelected ? 'secondary' : 'primary'}
                        onClick={onToggleGroup}
                    >
                        {allVisibleSelected ? <Check size={15} /> : null}
                        {allVisibleSelected ? 'Снять выбор' : 'Выбрать'}
                    </AdminAction>
                    <AdminAction
                        data-testid={`allocation-expand-batch-${group.batchId}`}
                        tone="secondary"
                        aria-expanded={expanded}
                        onClick={onToggleExpanded}
                    >
                        Позиции
                        <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </AdminAction>
                </div>
            </div>

            {expanded ? (
                <div className="border-t border-[#2a3039] bg-[#10151b] px-4 py-3" data-testid={`allocation-items-${group.batchId}`}>
                    <div className="overflow-hidden rounded-md border border-[#2a3039]">
                        <div
                            className="grid min-h-[38px] bg-[#121820] text-[11px] font-medium text-[#7f8894]"
                            style={{ gridTemplateColumns: ITEM_COLUMNS }}
                        >
                            <div className="border-r border-[#2a3039]" />
                            <div className="flex items-center border-r border-[#2a3039] px-3">Позиция</div>
                            <div className="flex items-center border-r border-[#2a3039] px-3">ID</div>
                            <div className="flex items-center px-3">Статус</div>
                        </div>
                        {group.visibleItems.map((item) => {
                            const selected = selectedSet.has(item.id);
                            return (
                                <label
                                    key={item.id}
                                    data-testid={`allocation-item-row-${item.id}`}
                                    className="grid min-h-[48px] cursor-pointer border-t border-[#252c34] bg-[#151b22] hover:bg-[#19212a]"
                                    style={{ gridTemplateColumns: ITEM_COLUMNS }}
                                >
                                    <span className="flex items-center justify-center border-r border-[#2a3039]">
                                        <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => onToggleItem(item.id)}
                                            aria-label={`Выбрать ${item.serial_number || item.temp_id}`}
                                            className="h-4 w-4 rounded border-[#4a5562] bg-[#11161d] text-[#438eea]"
                                        />
                                    </span>
                                    <span className="flex min-w-0 flex-col justify-center border-r border-[#2a3039] px-3">
                                        <span className="truncate text-[13px] font-medium text-[#e9edf1]">{item.serial_number || item.temp_id}</span>
                                        <span className="truncate text-[11px] text-[#7f8894]">temp_id: {item.temp_id}</span>
                                    </span>
                                    <span className="flex min-w-0 items-center border-r border-[#2a3039] px-3 font-mono text-[11px] text-[#8f98a4]">
                                        <span className="truncate">{item.id}</span>
                                    </span>
                                    <span className="flex items-center px-3">
                                        <AdminStatus label="Склад HQ" tone="success" />
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </article>
    );
}

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
    const visiblePages = Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
        const start = Math.min(Math.max(page - 2, 1), Math.max(pageCount - 4, 1));
        return start + index;
    });

    return (
        <nav className="flex items-center justify-center gap-2 py-1" aria-label="Страницы распределения">
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
            <span className="ml-4 text-[12px] text-[#7f8894]">По {PAGE_SIZE} партий</span>
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
