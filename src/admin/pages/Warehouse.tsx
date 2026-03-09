import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

type WarehouseItem = {
    id: string;
    temp_id: string;
    public_token: string;
    photo_url: string;
    status: string;
    created_at: string;
};

type WarehouseBatch = {
    id: string;
    status: string;
    created_at: string;
    owner?: {
        id?: string;
        name?: string;
        email?: string;
    };
    items: WarehouseItem[];
};

type WarehouseItemRow = WarehouseItem & {
    batch_id: string;
    batch_status: string;
    batch_created_at: string;
    owner_name: string;
    owner_email: string;
};

type WarehouseGroup = {
    batch_id: string;
    batch_status: string;
    batch_created_at: string;
    owner_name: string;
    owner_email: string;
    items: WarehouseItemRow[];
};

type SaleFilter = 'ALL' | 'SOLD' | 'UNSOLD';
type ScopeFilter = 'SITE' | 'ALL';
type SortBy = 'NEWEST' | 'OLDEST' | 'TEMP_ASC' | 'TEMP_DESC' | 'BATCH_ASC' | 'BATCH_DESC';
type RequestFilter = 'ALL' | 'ACTIVE' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

type UserOption = {
    id: string;
    name: string;
    email: string;
    role: string;
};

type CollectionRequest = {
    id: string;
    title: string;
    note: string | null;
    requested_qty: number;
    status: string;
    created_at: string;
    updated_at: string;
    created_by_user: {
        id: string;
        name: string;
        email: string;
    };
    target_user: {
        id: string;
        name: string;
        email: string;
    } | null;
    metrics: {
        site_online_now: number;
        sold_now: number;
        collected_since_request: number;
        online_since_request: number;
        remaining_to_collect: number;
        progress_percent: number;
        site_gap: number;
    };
    recent_batches: Array<{
        id: string;
        status: string;
        created_at: string;
        items_count: number;
        online_items: number;
    }>;
};

type RequestForm = {
    title: string;
    requested_qty: string;
    target_user_id: string;
    note: string;
};

const SITE_STATUSES = new Set(['STOCK_ONLINE', 'SOLD_ONLINE', 'ACTIVATED']);
const SOLD_STATUSES = new Set(['SOLD_ONLINE', 'ACTIVATED']);

const itemStatusLabels: Record<string, string> = {
    NEW: 'НОВЫЙ',
    REJECTED: 'ОТКЛОНЕН',
    STOCK_HQ: 'СКЛАД HQ',
    STOCK_ONLINE: 'НА САЙТЕ',
    ON_CONSIGNMENT: 'КОНСИГНАЦИЯ',
    SOLD_ONLINE: 'ПРОДАН ОНЛАЙН',
    ACTIVATED: 'АКТИВИРОВАН',
};

const itemStatusColors: Record<string, string> = {
    NEW: 'bg-gray-700/70 text-gray-200',
    REJECTED: 'bg-red-500/20 text-red-300 border border-red-500/40',
    STOCK_HQ: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
    STOCK_ONLINE: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
    ON_CONSIGNMENT: 'bg-violet-500/20 text-violet-300 border border-violet-500/40',
    SOLD_ONLINE: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
    ACTIVATED: 'bg-green-500/20 text-green-200 border border-green-500/40',
};

const requestStatusLabels: Record<string, string> = {
    OPEN: 'ОТКРЫТА',
    IN_PROGRESS: 'В РАБОТЕ',
    FULFILLED: 'ЗАКРЫТА',
    CANCELLED: 'ОТМЕНЕНА',
};

const requestStatusColors: Record<string, string> = {
    OPEN: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
    IN_PROGRESS: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
    FULFILLED: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
    CANCELLED: 'bg-red-500/20 text-red-300 border border-red-500/40',
};

const normalizeDate = (value: string): number => {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const shortId = (value: string): string => {
    if (value.length <= 12) return value;
    return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

const itemComparator = (sortBy: SortBy) => {
    if (sortBy === 'TEMP_ASC') {
        return (a: WarehouseItemRow, b: WarehouseItemRow) => a.temp_id.localeCompare(b.temp_id, 'ru');
    }
    if (sortBy === 'TEMP_DESC') {
        return (a: WarehouseItemRow, b: WarehouseItemRow) => b.temp_id.localeCompare(a.temp_id, 'ru');
    }
    if (sortBy === 'OLDEST') {
        return (a: WarehouseItemRow, b: WarehouseItemRow) => normalizeDate(a.created_at) - normalizeDate(b.created_at);
    }
    return (a: WarehouseItemRow, b: WarehouseItemRow) => normalizeDate(b.created_at) - normalizeDate(a.created_at);
};

const batchComparator = (sortBy: SortBy) => {
    if (sortBy === 'BATCH_ASC') {
        return (a: WarehouseGroup, b: WarehouseGroup) => a.batch_id.localeCompare(b.batch_id, 'ru');
    }
    if (sortBy === 'BATCH_DESC') {
        return (a: WarehouseGroup, b: WarehouseGroup) => b.batch_id.localeCompare(a.batch_id, 'ru');
    }
    if (sortBy === 'OLDEST') {
        return (a: WarehouseGroup, b: WarehouseGroup) => normalizeDate(a.batch_created_at) - normalizeDate(b.batch_created_at);
    }
    return (a: WarehouseGroup, b: WarehouseGroup) => normalizeDate(b.batch_created_at) - normalizeDate(a.batch_created_at);
};

const createClonePath = (publicToken: string): string => `/clone/${encodeURIComponent(publicToken)}`;

const createCloneAbsoluteUrl = (publicToken: string): string =>
    `${window.location.origin}${createClonePath(publicToken)}`;

const isClosedRequest = (status: string): boolean => status === 'FULFILLED' || status === 'CANCELLED';
const authErrorText = 'Сессия истекла или нет доступа. Войдите снова.';
const missingEndpointText = 'Backend не обновлён (404). Перезапустите сервер.';

export function Warehouse() {
    const [batches, setBatches] = useState<WarehouseBatch[]>([]);
    const [loadingStock, setLoadingStock] = useState(true);
    const [stockError, setStockError] = useState('');
    const [query, setQuery] = useState('');
    const [saleFilter, setSaleFilter] = useState<SaleFilter>('ALL');
    const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('SITE');
    const [sortBy, setSortBy] = useState<SortBy>('NEWEST');
    const [expandedBatches, setExpandedBatches] = useState<string[]>([]);
    const [copiedItemId, setCopiedItemId] = useState('');

    const [franchisees, setFranchisees] = useState<UserOption[]>([]);
    const [requests, setRequests] = useState<CollectionRequest[]>([]);
    const [loadingRequests, setLoadingRequests] = useState(true);
    const [requestError, setRequestError] = useState('');
    const [requestFilter, setRequestFilter] = useState<RequestFilter>('ACTIVE');
    const [requestForm, setRequestForm] = useState<RequestForm>({
        title: '',
        requested_qty: '',
        target_user_id: '',
        note: ''
    });
    const [creatingRequest, setCreatingRequest] = useState(false);
    const [updatingRequestId, setUpdatingRequestId] = useState('');

    const loadStock = async () => {
        setLoadingStock(true);
        setStockError('');
        try {
            const response = await authFetch('/api/batches');

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    setStockError(authErrorText);
                } else if (response.status === 404) {
                    setStockError(missingEndpointText);
                } else {
                    setStockError('Не удалось загрузить складские данные.');
                }
                setBatches([]);
                return;
            }

            setBatches(await response.json() as WarehouseBatch[]);
        } catch (_error) {
            setStockError('Сетевая ошибка при загрузке склада.');
            setBatches([]);
        } finally {
            setLoadingStock(false);
        }
    };

    const loadRequests = async () => {
        setLoadingRequests(true);
        setRequestError('');
        try {
            const [requestRes, usersRes] = await Promise.all([
                authFetch('/api/collection-requests'),
                authFetch('/api/users')
            ]);

            if (!requestRes.ok) {
                if (requestRes.status === 401 || requestRes.status === 403) {
                    setRequestError(authErrorText);
                } else if (requestRes.status === 404) {
                    setRequestError(missingEndpointText);
                } else {
                    setRequestError('Не удалось загрузить заявки на сбор.');
                }
                setRequests([]);
            } else {
                setRequests(await requestRes.json() as CollectionRequest[]);
            }

            if (usersRes.ok) {
                const users = await usersRes.json() as UserOption[];
                setFranchisees(users.filter((user) => user.role === 'FRANCHISEE'));
            } else {
                setFranchisees([]);
            }
        } catch (_error) {
            setRequestError('Сетевая ошибка при загрузке заявок.');
            setRequests([]);
            setFranchisees([]);
        } finally {
            setLoadingRequests(false);
        }
    };

    useEffect(() => {
        void Promise.all([loadStock(), loadRequests()]);
    }, []);

    const allItems = useMemo<WarehouseItemRow[]>(() => {
        return batches.flatMap((batch) =>
            batch.items.map((item) => ({
                ...item,
                batch_id: batch.id,
                batch_status: batch.status,
                batch_created_at: batch.created_at,
                owner_name: batch.owner?.name || 'Без владельца',
                owner_email: batch.owner?.email || '—',
            }))
        );
    }, [batches]);

    const summary = useMemo(() => {
        const total = allItems.length;
        const onSite = allItems.filter((item) => SITE_STATUSES.has(item.status)).length;
        const sold = allItems.filter((item) => SOLD_STATUSES.has(item.status)).length;
        const unsold = total - sold;
        return { total, onSite, sold, unsold };
    }, [allItems]);

    const filteredItems = useMemo(() => {
        const term = query.trim().toLowerCase();

        return allItems.filter((item) => {
            if (scopeFilter === 'SITE' && !SITE_STATUSES.has(item.status)) {
                return false;
            }

            if (saleFilter === 'SOLD' && !SOLD_STATUSES.has(item.status)) {
                return false;
            }

            if (saleFilter === 'UNSOLD' && SOLD_STATUSES.has(item.status)) {
                return false;
            }

            if (!term) return true;

            return (
                item.temp_id.toLowerCase().includes(term) ||
                item.id.toLowerCase().includes(term) ||
                item.batch_id.toLowerCase().includes(term) ||
                item.public_token.toLowerCase().includes(term)
            );
        });
    }, [allItems, query, saleFilter, scopeFilter]);

    const groupedBatches = useMemo<WarehouseGroup[]>(() => {
        const groups = new Map<string, WarehouseGroup>();

        for (const item of filteredItems) {
            if (!groups.has(item.batch_id)) {
                groups.set(item.batch_id, {
                    batch_id: item.batch_id,
                    batch_status: item.batch_status,
                    batch_created_at: item.batch_created_at,
                    owner_name: item.owner_name,
                    owner_email: item.owner_email,
                    items: [],
                });
            }
            groups.get(item.batch_id)?.items.push(item);
        }

        const result = [...groups.values()];
        const compareItems = itemComparator(sortBy);

        for (const group of result) {
            if (sortBy === 'BATCH_ASC' || sortBy === 'BATCH_DESC') {
                group.items.sort(itemComparator('TEMP_ASC'));
            } else {
                group.items.sort(compareItems);
            }
        }

        result.sort(batchComparator(sortBy));
        return result;
    }, [filteredItems, sortBy]);

    const filteredRequests = useMemo(() => {
        if (requestFilter === 'ALL') return requests;
        if (requestFilter === 'OPEN') return requests.filter((request) => request.status === 'OPEN');
        if (requestFilter === 'IN_PROGRESS') return requests.filter((request) => request.status === 'IN_PROGRESS');
        if (requestFilter === 'CLOSED') return requests.filter((request) => isClosedRequest(request.status));
        return requests.filter((request) => !isClosedRequest(request.status));
    }, [requests, requestFilter]);

    const toggleBatch = (batchId: string) => {
        setExpandedBatches((prev) =>
            prev.includes(batchId)
                ? prev.filter((id) => id !== batchId)
                : [...prev, batchId]
        );
    };

    const handleCopyLink = async (item: WarehouseItemRow) => {
        try {
            await navigator.clipboard.writeText(createCloneAbsoluteUrl(item.public_token));
            setCopiedItemId(item.id);
            setTimeout(() => setCopiedItemId(''), 1500);
        } catch (_error) {
            setCopiedItemId('');
        }
    };

    const handleCreateRequest = async (event: FormEvent) => {
        event.preventDefault();
        setRequestError('');

        const requestedQty = Number(requestForm.requested_qty);
        if (!requestForm.title.trim()) {
            setRequestError('Введите название заявки.');
            return;
        }
        if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
            setRequestError('Количество должно быть положительным целым числом.');
            return;
        }

        setCreatingRequest(true);
        try {
            const response = await authFetch('/api/collection-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: requestForm.title.trim(),
                    requested_qty: requestedQty,
                    target_user_id: requestForm.target_user_id || null,
                    note: requestForm.note.trim() || null
                })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({ error: 'Не удалось создать заявку.' }));
                setRequestError(data.error || 'Не удалось создать заявку.');
                return;
            }

            const created = await response.json() as CollectionRequest;
            setRequests((prev) => [created, ...prev]);
            setRequestForm({
                title: '',
                requested_qty: '',
                target_user_id: '',
                note: ''
            });
        } catch (_error) {
            setRequestError('Сетевая ошибка при создании заявки.');
        } finally {
            setCreatingRequest(false);
        }
    };

    const handleUpdateRequestStatus = async (requestId: string, status: 'OPEN' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED') => {
        setUpdatingRequestId(requestId);
        setRequestError('');
        try {
            const response = await authFetch(`/api/collection-requests/${requestId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({ error: 'Не удалось обновить статус заявки.' }));
                setRequestError(data.error || 'Не удалось обновить статус заявки.');
                return;
            }

            const updated = await response.json() as CollectionRequest;
            setRequests((prev) => prev.map((item) => item.id === updated.id ? updated : item));
        } catch (_error) {
            setRequestError('Сетевая ошибка при обновлении заявки.');
        } finally {
            setUpdatingRequestId('');
        }
    };

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-white">Склад</h1>
                <p className="text-gray-500 mt-1">
                    Заявки на сбор партий и синхронный трекинг с позициями на сайте.
                </p>
            </header>

            {(stockError || requestError) && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3">
                    {stockError || requestError}
                </div>
            )}

            <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryCard title="Всего позиций" value={summary.total} />
                <SummaryCard title="Товары на сайте" value={summary.onSite} />
                <SummaryCard title="Проданные" value={summary.sold} />
                <SummaryCard title="Не проданные" value={summary.unsold} />
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
                <form onSubmit={handleCreateRequest} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
                    <h2 className="text-lg font-semibold text-white">Новая заявка на сбор партии</h2>
                    <input
                        value={requestForm.title}
                        onChange={(event) => setRequestForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="Например: Пополнить онлайн-витрину Якутии"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <input
                            value={requestForm.requested_qty}
                            onChange={(event) => setRequestForm((prev) => ({ ...prev, requested_qty: event.target.value }))}
                            placeholder="Кол-во"
                            inputMode="numeric"
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                        <select
                            value={requestForm.target_user_id}
                            onChange={(event) => setRequestForm((prev) => ({ ...prev, target_user_id: event.target.value }))}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                        >
                            <option value="">Все поставщики</option>
                            {franchisees.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <textarea
                        value={requestForm.note}
                        onChange={(event) => setRequestForm((prev) => ({ ...prev, note: event.target.value }))}
                        placeholder="Комментарий для поставщика (опционально)"
                        rows={3}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none"
                    />

                    <button
                        type="submit"
                        disabled={creatingRequest}
                        className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
                    >
                        {creatingRequest ? 'Создание...' : 'Создать заявку'}
                    </button>
                </form>

                <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <FilterButton active={requestFilter === 'ACTIVE'} onClick={() => setRequestFilter('ACTIVE')} label="Активные" />
                        <FilterButton active={requestFilter === 'OPEN'} onClick={() => setRequestFilter('OPEN')} label="Открытые" />
                        <FilterButton active={requestFilter === 'IN_PROGRESS'} onClick={() => setRequestFilter('IN_PROGRESS')} label="В работе" />
                        <FilterButton active={requestFilter === 'CLOSED'} onClick={() => setRequestFilter('CLOSED')} label="Закрытые" />
                        <FilterButton active={requestFilter === 'ALL'} onClick={() => setRequestFilter('ALL')} label="Все" />
                    </div>

                    {loadingRequests && (
                        <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 text-gray-400">
                            Загрузка заявок...
                        </div>
                    )}

                    {!loadingRequests && filteredRequests.length === 0 && (
                        <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 text-gray-400">
                            По выбранному фильтру заявок нет.
                        </div>
                    )}

                    {!loadingRequests && filteredRequests.map((request) => (
                        <article key={request.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-3">
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <h3 className="text-white font-semibold">{request.title}</h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {new Date(request.created_at).toLocaleString('ru-RU')} | назначено: {request.target_user?.name || 'всем поставщикам'}
                                    </p>
                                </div>
                                <RequestStatusBadge status={request.status} />
                            </div>

                            {request.note && (
                                <p className="text-sm text-gray-300 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                                    {request.note}
                                </p>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                <MetricChip label="Запрошено" value={request.requested_qty} />
                                <MetricChip label="Собрано с даты" value={request.metrics.collected_since_request} />
                                <MetricChip label="На сайте сейчас" value={request.metrics.site_online_now} />
                                <MetricChip label="Разрыв по сайту" value={request.metrics.site_gap} />
                            </div>

                            <div>
                                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                                    <span>Прогресс выполнения</span>
                                    <span>{request.metrics.progress_percent}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-2 bg-blue-500 rounded-full transition-all"
                                        style={{ width: `${Math.min(100, Math.max(0, request.metrics.progress_percent))}%` }}
                                    />
                                </div>
                            </div>

                            {request.recent_batches.length > 0 && (
                                <div className="text-xs text-gray-400">
                                    <p className="mb-1 text-gray-500">Новые партии после заявки:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {request.recent_batches.map((batch) => (
                                            <span key={batch.id} className="inline-flex items-center gap-1 bg-gray-900 border border-gray-800 rounded px-2 py-1">
                                                {shortId(batch.id)} ({batch.items_count} шт., сайт {batch.online_items})
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {request.status === 'OPEN' && (
                                    <button
                                        onClick={() => void handleUpdateRequestStatus(request.id, 'IN_PROGRESS')}
                                        disabled={updatingRequestId === request.id}
                                        className="px-3 py-1.5 rounded-lg text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white"
                                    >
                                        В работу
                                    </button>
                                )}
                                {(request.status === 'OPEN' || request.status === 'IN_PROGRESS') && (
                                    <button
                                        onClick={() => void handleUpdateRequestStatus(request.id, 'FULFILLED')}
                                        disabled={updatingRequestId === request.id}
                                        className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
                                    >
                                        Закрыть
                                    </button>
                                )}
                                {(request.status === 'OPEN' || request.status === 'IN_PROGRESS') && (
                                    <button
                                        onClick={() => void handleUpdateRequestStatus(request.id, 'CANCELLED')}
                                        disabled={updatingRequestId === request.id}
                                        className="px-3 py-1.5 rounded-lg text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white"
                                    >
                                        Отменить
                                    </button>
                                )}
                                {isClosedRequest(request.status) && (
                                    <button
                                        onClick={() => void handleUpdateRequestStatus(request.id, 'OPEN')}
                                        disabled={updatingRequestId === request.id}
                                        className="px-3 py-1.5 rounded-lg text-sm border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                                    >
                                        Переоткрыть
                                    </button>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Поиск: temp_id, item id, batch id, token"
                        className="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    />

                    <select
                        value={scopeFilter}
                        onChange={(event) => setScopeFilter(event.target.value as ScopeFilter)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    >
                        <option value="SITE">Только товары на сайте</option>
                        <option value="ALL">Все товары</option>
                    </select>

                    <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as SortBy)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    >
                        <option value="NEWEST">Сортировка: сначала новые</option>
                        <option value="OLDEST">Сортировка: сначала старые</option>
                        <option value="TEMP_ASC">Сортировка: temp_id A-Z</option>
                        <option value="TEMP_DESC">Сортировка: temp_id Z-A</option>
                        <option value="BATCH_ASC">Сортировка: партия A-Z</option>
                        <option value="BATCH_DESC">Сортировка: партия Z-A</option>
                    </select>
                </div>

                <div className="flex flex-wrap gap-2">
                    <FilterButton active={saleFilter === 'ALL'} onClick={() => setSaleFilter('ALL')} label="Все" />
                    <FilterButton active={saleFilter === 'SOLD'} onClick={() => setSaleFilter('SOLD')} label="Проданные" />
                    <FilterButton active={saleFilter === 'UNSOLD'} onClick={() => setSaleFilter('UNSOLD')} label="Не проданные" />
                </div>
            </section>

            <section className="space-y-4">
                {loadingStock && (
                    <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-5 text-gray-400">
                        Загрузка склада...
                    </div>
                )}

                {!loadingStock && groupedBatches.length === 0 && (
                    <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-5 text-gray-400">
                        По текущим фильтрам ничего не найдено.
                    </div>
                )}

                {!loadingStock && groupedBatches.map((group) => {
                    const expanded = expandedBatches.includes(group.batch_id);

                    return (
                        <article key={group.batch_id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                            <header className="px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className="text-white font-semibold">
                                        Партия {shortId(group.batch_id)}
                                    </h2>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {new Date(group.batch_created_at).toLocaleString('ru-RU')} | {group.owner_name} ({group.owner_email})
                                    </p>
                                    <div className="mt-2">
                                        <ItemStatusBadge status={group.batch_status} />
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-gray-400">
                                        Позиций: <span className="text-white font-semibold">{group.items.length}</span>
                                    </span>
                                    <button
                                        onClick={() => toggleBatch(group.batch_id)}
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
                                    >
                                        {expanded ? 'Скрыть' : 'Открыть'}
                                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                </div>
                            </header>

                            {expanded && (
                                <div className="border-t border-gray-800 divide-y divide-gray-800">
                                    {group.items.map((item) => (
                                        <div key={item.id} className="px-4 py-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="min-w-0">
                                                <p className="text-white font-medium">#{item.temp_id}</p>
                                                <p className="text-xs text-gray-500 truncate">Item ID: {item.id}</p>
                                                <p className="text-xs text-gray-500 truncate">Token: {item.public_token}</p>
                                                <div className="mt-2">
                                                    <ItemStatusBadge status={item.status} />
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={createClonePath(item.public_token)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm"
                                                >
                                                    <ExternalLink size={14} />
                                                    Открыть ссылку
                                                </a>
                                                <button
                                                    onClick={() => void handleCopyLink(item)}
                                                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
                                                >
                                                    <Copy size={14} />
                                                    {copiedItemId === item.id ? 'Скопировано' : 'Копировать'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </article>
                    );
                })}
            </section>
        </div>
    );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-white mt-2">{value}</p>
        </div>
    );
}

function MetricChip({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-1.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-sm text-white font-semibold mt-1">{value}</p>
        </div>
    );
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${active
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
        >
            {label}
        </button>
    );
}

function ItemStatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold ${itemStatusColors[status] || 'bg-gray-700/60 text-gray-200'}`}>
            {itemStatusLabels[status] || status}
        </span>
    );
}

function RequestStatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold ${requestStatusColors[status] || 'bg-gray-700/60 text-gray-200'}`}>
            {requestStatusLabels[status] || status}
        </span>
    );
}
