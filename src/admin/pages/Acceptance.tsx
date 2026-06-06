import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Download, MapPin, PackageCheck, QrCode, Search, Video } from 'lucide-react';
import { Button, Modal } from '../components/ui';
import { authFetch } from '../../utils/authFetch';
import {
    canFinalizeBatch,
    canReceiveBatch,
    getBatchStatusMeta,
    getItemStatusMeta
} from '../../../shared/domain/policy';

type BatchItem = {
    id: string;
    temp_id: string;
    serial_number: string | null;
    status: string;
    is_sold: boolean;
    photo_url?: string | null;
    item_photo_url?: string | null;
    item_video_url?: string | null;
    item_seq?: number | null;
    created_at: string;
    clone_url: string | null;
    qr_url: string | null;
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
    collection_request?: {
        id: string;
        status: string;
        requested_qty: number;
    } | null;
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

type BatchLocationInfo = {
    key: string;
    label: string;
    code: string;
    country: string;
};

type BatchLocationGroup = BatchLocationInfo & {
    batches: BatchView[];
    itemCount: number;
};

const isPublicPassportItem = (batchStatus: string, itemStatus: string) =>
    (batchStatus === 'RECEIVED' || batchStatus === 'FINISHED') && itemStatus !== 'REJECTED';

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const createClonePath = (serialNumber: string | null) => serialNumber ? `/clone/${encodeURIComponent(serialNumber)}` : null;

const countBatchMedia = (batch: BatchView | null) => {
    if (!batch) {
        return {
            total: 0,
            photoReady: 0,
            videoReady: 0,
            fullyReady: 0
        };
    }

    const photoReady = batch.items.filter((item) => Boolean(item.item_photo_url)).length;
    const videoReady = batch.items.filter((item) => Boolean(item.item_video_url)).length;
    const fullyReady = batch.items.filter((item) => Boolean(item.item_photo_url) && Boolean(item.item_video_url)).length;

    return {
        total: batch.items.length,
        photoReady,
        videoReady,
        fullyReady
    };
};

const getProductName = (batch: BatchView) => (
    batch.product ? getDefaultTranslationValue(batch.product.translations, 'name') : 'Без привязки к товару'
);

const getBatchLocationInfo = (batch: BatchView): BatchLocationInfo => {
    if (!batch.product) {
        return {
            key: 'no-location',
            label: 'Без локации',
            code: '—',
            country: 'Партии без карточки товара'
        };
    }

    const locationName = batch.product.location
        ? getDefaultTranslationValue(batch.product.location.translations, 'name')
        : '';
    const countryName = batch.product.location
        ? getDefaultTranslationValue(batch.product.location.translations, 'country')
        : '';
    const code = `${batch.product.country_code}${batch.product.location_code}`;

    return {
        key: batch.product.location?.id || code,
        label: locationName || batch.product.location_description || `Локация ${batch.product.location_code}`,
        code,
        country: countryName || batch.product.country_code
    };
};

const compareText = (left: string, right: string) => left.localeCompare(right, 'ru');

const sortBatchesForAcceptance = (left: BatchView, right: BatchView) => {
    const leftLocation = getBatchLocationInfo(left);
    const rightLocation = getBatchLocationInfo(right);
    const locationOrder = compareText(leftLocation.label, rightLocation.label);
    if (locationOrder !== 0) {
        return locationOrder;
    }

    const statusOrder = Number(canReceiveBatch(right.status)) - Number(canReceiveBatch(left.status));
    if (statusOrder !== 0) {
        return statusOrder;
    }

    const createdOrder = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    if (createdOrder !== 0) {
        return createdOrder;
    }

    return compareText(getProductName(left), getProductName(right));
};

export function Acceptance() {
    const [batches, setBatches] = useState<BatchView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [selectedQrItemIds, setSelectedQrItemIds] = useState<string[]>([]);
    const [batchQuery, setBatchQuery] = useState('');
    const [updatingBatchId, setUpdatingBatchId] = useState('');
    const [receivingBatchId, setReceivingBatchId] = useState('');
    const [receivedCount, setReceivedCount] = useState('');

    const loadBatches = async (showSpinner = true) => {
        if (showSpinner) {
            setLoading(true);
        }
        setError('');

        try {
            const response = await authFetch('/api/batches');
            if (!response.ok) {
                throw new Error('Не удалось загрузить партии для приемки.');
            }

            const payload = await response.json() as BatchView[];
            setBatches(payload);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить партии для приемки.');
        } finally {
            if (showSpinner) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        void loadBatches();
    }, []);

    const relevantBatches = useMemo(
        () => batches.filter((batch) => canReceiveBatch(batch.status) || canFinalizeBatch(batch.status)),
        [batches]
    );

    useEffect(() => {
        if (relevantBatches.length === 0) {
            if (selectedBatchId) {
                setSelectedBatchId('');
            }
            return;
        }

        const exists = relevantBatches.some((batch) => batch.id === selectedBatchId);
        if (!selectedBatchId || !exists) {
            const nextBatch = relevantBatches.find((batch) => canReceiveBatch(batch.status)) || relevantBatches[0];
            setSelectedBatchId(nextBatch.id);
        }
    }, [relevantBatches, selectedBatchId]);

    const filteredBatches = useMemo(() => {
        const normalizedQuery = batchQuery.trim().toLowerCase();
        if (!normalizedQuery) {
            return relevantBatches;
        }

        return relevantBatches.filter((batch) => {
            const ownerMatch = batch.owner?.name?.toLowerCase().includes(normalizedQuery);
            const productName = getProductName(batch).toLowerCase();
            const location = getBatchLocationInfo(batch);
            const locationMatch = `${location.label} ${location.code} ${location.country}`.toLowerCase().includes(normalizedQuery);
            return batch.id.toLowerCase().includes(normalizedQuery)
                || productName.includes(normalizedQuery)
                || locationMatch
                || Boolean(ownerMatch);
        });
    }, [batchQuery, relevantBatches]);

    const filteredBatchGroups = useMemo(() => {
        const groups = new Map<string, BatchLocationGroup>();

        [...filteredBatches].sort(sortBatchesForAcceptance).forEach((batch) => {
            const location = getBatchLocationInfo(batch);
            const existing = groups.get(location.key);
            if (existing) {
                existing.batches.push(batch);
                existing.itemCount += batch.items.length;
                return;
            }

            groups.set(location.key, {
                ...location,
                batches: [batch],
                itemCount: batch.items.length
            });
        });

        return Array.from(groups.values()).sort((left, right) => compareText(left.label, right.label));
    }, [filteredBatches]);

    const selectedBatch = useMemo(
        () => relevantBatches.find((batch) => batch.id === selectedBatchId) || null,
        [relevantBatches, selectedBatchId]
    );
    const printableItemIds = useMemo(
        () => selectedBatch
            ? selectedBatch.items
                .filter((item) => isPublicPassportItem(selectedBatch.status, item.status))
                .map((item) => item.id)
            : [],
        [selectedBatch]
    );
    const printableItemIdSet = useMemo(() => new Set(printableItemIds), [printableItemIds]);
    const hasPrintableItems = printableItemIds.length > 0;

    const mediaStats = useMemo(() => countBatchMedia(selectedBatch), [selectedBatch]);
    const missingMediaCount = Math.max(0, mediaStats.total - mediaStats.fullyReady);
    const canFinalize = Boolean(
        selectedBatch
        && canFinalizeBatch(selectedBatch.status)
        && missingMediaCount === 0
    );
    const selectedBatchLocation = useMemo(
        () => selectedBatch ? getBatchLocationInfo(selectedBatch) : null,
        [selectedBatch]
    );

    useEffect(() => {
        setSelectedQrItemIds((current) => current.filter((itemId) => printableItemIdSet.has(itemId)));
    }, [printableItemIdSet, selectedBatchId]);

    const refreshAndKeepBatch = async (batchId: string) => {
        await loadBatches(false);
        setSelectedBatchId(batchId);
    };

    const handleSelectBatch = (batchId: string) => {
        setSelectedBatchId(batchId);
        setError('');
    };

    const handleReceiveBatch = async (batchId: string) => {
        setUpdatingBatchId(batchId);
        setError('');

        try {
            const response = await authFetch(`/api/batches/${batchId}/receive`, { method: 'POST' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось принять партию.' }));
                throw new Error(payload.error || 'Не удалось принять партию.');
            }

            await refreshAndKeepBatch(batchId);
        } catch (receiveError) {
            console.error(receiveError);
            setError(receiveError instanceof Error ? receiveError.message : 'Не удалось принять партию.');
        } finally {
            setUpdatingBatchId('');
        }
    };

    const handleFinalizeBatch = async (batchId: string) => {
        setUpdatingBatchId(batchId);
        setError('');

        try {
            const response = await authFetch(`/api/batches/${batchId}/finalize`, { method: 'POST' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось перевести партию на склад.' }));
                throw new Error(payload.error || 'Не удалось перевести партию на склад.');
            }

            await loadBatches(false);
        } catch (finalizeError) {
            console.error(finalizeError);
            setError(finalizeError instanceof Error ? finalizeError.message : 'Не удалось перевести партию на склад.');
        } finally {
            setUpdatingBatchId('');
        }
    };

    const toggleQrItem = (itemId: string) => {
        if (!printableItemIdSet.has(itemId)) {
            return;
        }

        setSelectedQrItemIds((current) => (
            current.includes(itemId)
                ? current.filter((value) => value !== itemId)
                : [...current, itemId]
        ));
    };

    const handlePrintAllQr = () => {
        if (!selectedBatch || !hasPrintableItems) {
            setError('Для QR PDF нет публичных позиций.');
            return;
        }

        const params = new URLSearchParams({
            batchId: selectedBatch.id,
            mode: 'all'
        });
        window.open(`/admin/qr/print?${params.toString()}`, '_blank', 'noopener,noreferrer');
    };

    const handlePrintSelectedQr = () => {
        if (!selectedBatch || selectedQrItemIds.length === 0) {
            setError('Выберите позиции для QR PDF.');
            return;
        }

        const params = new URLSearchParams({
            batchId: selectedBatch.id,
            mode: 'selected',
            ids: selectedQrItemIds.join(',')
        });
        window.open(`/admin/qr/print?${params.toString()}`, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="space-y-5">
            {error && (
                <div className="rounded-[24px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                <MetricCard title="В пути" value={relevantBatches.filter((batch) => canReceiveBatch(batch.status)).length} />
                <MetricCard title="Приняты" value={relevantBatches.filter((batch) => canFinalizeBatch(batch.status)).length} />
                <MetricCard title="Фото готовы" value={relevantBatches.reduce((sum, batch) => sum + batch.items.filter((item) => Boolean(item.item_photo_url)).length, 0)} />
                <MetricCard title="Видео готовы" value={relevantBatches.reduce((sum, batch) => sum + batch.items.filter((item) => Boolean(item.item_video_url)).length, 0)} />
            </section>

            <section className="admin-panel overflow-hidden rounded-[24px]">
                <div className="border-b border-white/6 px-5 py-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-blue-100">
                                    <PackageCheck size={18} />
                                </span>
                                <h2 className="text-lg font-semibold text-white">Партии приемки</h2>
                            </div>
                            <p className="mt-1 text-sm text-gray-500">Показываются только партии в стадиях `TRANSIT` и `RECEIVED`, сгруппированные по локациям.</p>
                        </div>

                        <div className="w-full xl:max-w-xl">
                            <label className="mb-2 block text-sm font-medium text-gray-400">Поиск партии</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-500" size={18} />
                                <input
                                    value={batchQuery}
                                    onChange={(event) => setBatchQuery(event.target.value)}
                                    placeholder="ID партии, товар или партнер"
                                    className="h-11 w-full rounded-xl border border-white/8 bg-[#11141a] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-300/60"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    {loading ? (
                        <div className="admin-panel-soft rounded-2xl px-4 py-6 text-sm text-gray-400">
                            Загружаем партии приемки...
                        </div>
                    ) : filteredBatches.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/8 bg-[#11141a] px-4 py-8 text-sm text-gray-500">
                            По текущему фильтру нет партий для приемки.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredBatchGroups.map((group) => (
                                <section key={group.key} className="overflow-hidden rounded-[22px] border border-white/6 bg-[#11141a]/70">
                                    <div className="flex flex-col gap-3 border-b border-white/6 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-cyan-100">
                                                <MapPin size={17} />
                                            </span>
                                            <div className="min-w-0">
                                                <h3 className="truncate text-base font-semibold text-white">{group.label}</h3>
                                                <p className="mt-0.5 text-xs text-gray-500">{group.country} · {group.code}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">Партий: {group.batches.length}</span>
                                            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">Позиций: {group.itemCount}</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-3">
                                        {group.batches.map((batch) => {
                                            const productName = getProductName(batch);
                                            const counts = countBatchMedia(batch);
                                            const isSelected = batch.id === selectedBatchId;

                                            return (
                                                <button
                                                    key={batch.id}
                                                    type="button"
                                                    aria-pressed={isSelected}
                                                    onClick={() => handleSelectBatch(batch.id)}
                                                    className={`flex min-h-[178px] w-full flex-col justify-between rounded-2xl border p-4 text-left transition ${isSelected
                                                        ? 'border-blue-400/40 bg-blue-500/10 shadow-[0_0_24px_rgba(147,197,253,0.12)]'
                                                        : 'border-white/6 bg-black/10 hover:border-white/12 hover:bg-white/[0.035]'
                                                        }`}
                                                >
                                                    <div className="space-y-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <p className="min-w-0 text-base font-semibold leading-snug text-white">{productName}</p>
                                                            <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${getBatchStatusMeta(batch.status).className}`}>
                                                                {getBatchStatusMeta(batch.status).label}
                                                            </span>
                                                        </div>
                                                        <p className="break-all font-mono text-[11px] leading-5 text-gray-500">{batch.id}</p>
                                                    </div>

                                                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
                                                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">
                                                            {batch.owner?.name || 'Без партнера'}
                                                        </span>
                                                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">
                                                            Камней: {batch.items.length}
                                                        </span>
                                                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">
                                                            Media: {counts.fullyReady}/{counts.total}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <section className="space-y-6">
                {!selectedBatch ? (
                    <div className="admin-panel rounded-[24px] border-dashed px-6 py-12 text-center text-gray-500">
                        Выберите партию выше, чтобы открыть рабочее место приемки.
                    </div>
                ) : (
                    <>
                        <article className="admin-panel overflow-hidden rounded-[24px]">
                            <div className="border-b border-white/6 px-6 py-5">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0 space-y-3">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <h2 className="text-xl font-semibold text-white">
                                                {getProductName(selectedBatch)}
                                            </h2>
                                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getBatchStatusMeta(selectedBatch.status).className}`}>
                                                {getBatchStatusMeta(selectedBatch.status).label}
                                            </span>
                                        </div>

                                        <div className="space-y-1 text-sm text-gray-400">
                                            <p className="font-mono text-xs text-gray-500">{selectedBatch.id}</p>
                                            {selectedBatchLocation && (
                                                <p className="inline-flex items-center gap-2">
                                                    <MapPin size={14} />
                                                    {selectedBatchLocation.label} · {selectedBatchLocation.code}
                                                </p>
                                            )}
                                            <p>Партнер: {selectedBatch.owner?.name || 'Не назначен'}{selectedBatch.owner?.email ? ` • ${selectedBatch.owner.email}` : ''}</p>
                                            <p>Позиций в партии: {selectedBatch.items.length}</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 lg:justify-end">
                                        {canReceiveBatch(selectedBatch.status) && (
                                            <Button
                                                onClick={() => setReceivingBatchId(selectedBatch.id)}
                                                disabled={updatingBatchId === selectedBatch.id}
                                            >
                                                Принять партию
                                            </Button>
                                        )}

                                        {canFinalizeBatch(selectedBatch.status) && (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    onClick={handlePrintSelectedQr}
                                                    disabled={selectedQrItemIds.length === 0}
                                                >
                                                    <Download size={16} />
                                                    PDF выбранных QR
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    onClick={handlePrintAllQr}
                                                    disabled={!hasPrintableItems}
                                                >
                                                    <Download size={16} />
                                                    PDF всех QR
                                                </Button>
                                                <Link
                                                    to={`/admin/photo-tool/${encodeURIComponent(selectedBatch.id)}`}
                                                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-white/[0.07] hover:text-white"
                                                >
                                                    <Camera size={16} />
                                                    Photo Tool
                                                </Link>
                                                <Link
                                                    to={`/admin/video-tool/${encodeURIComponent(selectedBatch.id)}`}
                                                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-white/[0.07] hover:text-white"
                                                >
                                                    <Video size={16} />
                                                    Монтаж видео
                                                </Link>
                                                <Button
                                                    onClick={() => void handleFinalizeBatch(selectedBatch.id)}
                                                    disabled={updatingBatchId === selectedBatch.id || !canFinalize}
                                                >
                                                    На склад
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
                                <InfoTile title="Фото готовы" value={`${mediaStats.photoReady}/${mediaStats.total}`} note="Назначения через Photo Tool" />
                                <InfoTile title="Видео готовы" value={`${mediaStats.videoReady}/${mediaStats.total}`} note="Финальные ролики по item" />
                                <InfoTile title="Media полностью" value={`${mediaStats.fullyReady}/${mediaStats.total}`} note="Готово к переводу на склад" />
                                <InfoTile title="Позиции в партии" value={`${mediaStats.total}`} note="Все экземпляры текущей партии" />
                            </div>

                            {canFinalizeBatch(selectedBatch.status) && (
                                <div className="border-t border-white/6 px-6 py-5">
                                    <div className="grid gap-4 lg:grid-cols-3">
                                        <NoticeCard
                                            title="Фото"
                                            text="Фото назначаются отдельным Photo Tool по позициям `001`, `002`, `003` с ручной корректировкой и проверкой полного покрытия партии."
                                        />
                                        <NoticeCard
                                            title="Видео"
                                            text="Монтаж запускается отдельным инструментом. В приемке остается только точка входа и контроль прогресса."
                                        />
                                        <NoticeCard
                                            title="Готовность к складу"
                                            text={canFinalize
                                                ? 'Все позиции укомплектованы. Партию можно переводить на склад.'
                                                : `Не хватает media для ${missingMediaCount} позиций.`}
                                            tone={canFinalize ? 'success' : 'warning'}
                                        />
                                    </div>
                                    {canFinalizeBatch(selectedBatch.status) && (
                                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                            <span>Публичные QR: {printableItemIds.length}</span>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedQrItemIds(printableItemIds)}
                                                className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 transition hover:bg-white/[0.07] hover:text-white"
                                            >
                                                Выбрать все
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedQrItemIds([])}
                                                className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 transition hover:bg-white/[0.07] hover:text-white"
                                            >
                                                Сбросить выбор
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </article>

                        <article className="admin-panel overflow-hidden rounded-[24px]">
                            <div className="border-b border-white/6 px-6 py-4">
                                <h3 className="text-lg font-semibold text-white">Позиции партии</h3>
                                <p className="mt-1 text-sm text-gray-500">Плитки по item: серийники, media-статус и быстрые ссылки.</p>
                            </div>

                            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-4">
                                {selectedBatch.items.map((item) => {
                                    const clonePath = createClonePath(item.serial_number);
                                    const publicPassportAvailable = isPublicPassportItem(selectedBatch.status, item.status);

                                    return (
                                        <article key={item.id} className="flex min-h-[230px] flex-col justify-between rounded-2xl border border-white/6 bg-[#11141a] p-4 transition hover:border-white/12 hover:bg-[#171a20]">
                                            <div className="space-y-3">
                                                <div className="flex items-start gap-3">
                                                    {canFinalizeBatch(selectedBatch.status) && (
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedQrItemIds.includes(item.id)}
                                                            onChange={() => toggleQrItem(item.id)}
                                                            disabled={!publicPassportAvailable}
                                                            aria-label={`Выбрать QR ${item.serial_number || item.temp_id}`}
                                                            className="mt-1 h-4 w-4 rounded border-white/10 bg-[#11141a] accent-blue-300"
                                                        />
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <p className="break-words font-semibold leading-snug text-white">{item.serial_number || item.temp_id}</p>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            <span className={`rounded-full border px-2.5 py-1 text-xs ${getItemStatusMeta(item.status).className}`}>
                                                                {getItemStatusMeta(item.status).label}
                                                            </span>
                                                            <span className={`rounded-full border px-2.5 py-1 text-xs ${publicPassportAvailable ? 'border-blue-500/30 bg-blue-500/15 text-blue-200' : 'border-white/8 bg-white/[0.04] text-gray-400'}`}>
                                                                {publicPassportAvailable ? 'Паспорт доступен' : 'QR недоступен'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                                                    <span className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">Пакет<br /><strong className="font-mono font-medium text-gray-300">{item.temp_id}</strong></span>
                                                    <span className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">Позиция<br /><strong className="font-medium text-gray-300">{item.item_seq != null ? String(item.item_seq).padStart(3, '0') : '—'}</strong></span>
                                                    <span className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">Фото<br /><strong className={item.item_photo_url ? 'font-medium text-emerald-200' : 'font-medium text-gray-400'}>{item.item_photo_url ? 'есть' : 'нет'}</strong></span>
                                                    <span className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">Видео<br /><strong className={item.item_video_url ? 'font-medium text-emerald-200' : 'font-medium text-gray-400'}>{item.item_video_url ? 'есть' : 'нет'}</strong></span>
                                                </div>

                                                <span className="inline-flex rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs text-gray-500">
                                                    {item.is_sold ? 'Продан' : 'Не продан'}
                                                </span>
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {publicPassportAvailable ? (
                                                    <>
                                                        <a
                                                            href={item.qr_url || '#'}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            aria-disabled={!item.qr_url}
                                                            className="inline-flex items-center gap-2 rounded-xl border border-blue-400/20 bg-blue-500/20 px-3 py-2 text-sm font-medium text-blue-100 transition hover:bg-blue-500/30"
                                                        >
                                                            <QrCode size={16} />
                                                            QR
                                                        </a>
                                                        {clonePath && (
                                                            <a
                                                                href={clonePath}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/[0.07] hover:text-white"
                                                            >
                                                                Просмотр
                                                            </a>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2 text-sm text-gray-500">
                                                        Паспорт появится после публикации
                                                    </span>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </article>
                    </>
                )}
            </section>

            <Modal
                isOpen={Boolean(receivingBatchId)}
                onClose={() => { setReceivingBatchId(''); setReceivedCount(''); }}
                title="Подтверждение приемки"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-300">
                        Пожалуйста, пересчитайте физически приехавшие позиции и введите их количество для сверки с системой.
                    </p>
                    <input
                        type="number"
                        value={receivedCount}
                        onChange={(e) => setReceivedCount(e.target.value)}
                        placeholder={`Ожидается: ${selectedBatch?.items.length} шт.`}
                        className="w-full rounded-xl border border-white/10 bg-[#0f1217] px-4 py-3 text-white focus:border-blue-500/50 focus:outline-none"
                    />
                    <div className="mt-4 flex justify-end gap-3 border-t border-white/10 pt-4">
                        <Button variant="ghost" onClick={() => { setReceivingBatchId(''); setReceivedCount(''); }}>Отмена</Button>
                        <Button 
                            onClick={() => {
                                if (Number(receivedCount) === selectedBatch?.items.length) {
                                    void handleReceiveBatch(receivingBatchId);
                                    setReceivingBatchId('');
                                    setReceivedCount('');
                                } else {
                                    setError(`Ошибка приемки: Введенное количество (${receivedCount}) не совпадает с ожидаемым в партии (${selectedBatch?.items.length}).`);
                                    setReceivingBatchId('');
                                    setReceivedCount('');
                                }
                            }}
                        >
                            Подтвердить
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function MetricCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="admin-panel-soft rounded-[24px] px-5 py-4">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
    );
}

function InfoTile({ title, value, note }: { title: string; value: string; note: string }) {
    return (
        <div className="admin-panel-soft rounded-[24px] px-4 py-4">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="mt-2 text-xl font-semibold text-white">{value}</p>
            <p className="mt-2 text-xs text-gray-500">{note}</p>
        </div>
    );
}

function NoticeCard({ title, text, tone = 'default' }: { title: string; text: string; tone?: 'default' | 'success' | 'warning' }) {
    const toneClass = tone === 'success'
        ? 'border-emerald-500/20 bg-emerald-500/10'
        : tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/10'
        : 'border-white/6 bg-[#11141a]';

    return (
        <div className={`rounded-[24px] border px-4 py-4 ${toneClass}`}>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="mt-2 text-sm text-gray-400">{text}</p>
        </div>
    );
}
