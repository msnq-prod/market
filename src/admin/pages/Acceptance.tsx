import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, PackageCheck, Printer, QrCode, Search, Video } from 'lucide-react';
import { Button } from '../components/ui';
import { authFetch } from '../../utils/authFetch';

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

type VideoProcessingState = {
    job_id: string;
    status: string;
    version: number;
    source_count: number;
    output_count: number;
    processed_output_count: number;
    error_message: string | null;
    started_at: string | null;
    finished_at: string | null;
};

type VideoExportState = {
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
    video_processing?: VideoProcessingState | null;
    video_export?: VideoExportState | null;
    product?: {
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
    items: BatchItem[];
};

const statusLabel: Record<string, string> = {
    TRANSIT: 'В пути',
    RECEIVED: 'Принята',
    FINISHED: 'Завершена',
    ERROR: 'Ошибка'
};

const statusClass: Record<string, string> = {
    TRANSIT: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
    RECEIVED: 'bg-violet-500/15 text-violet-200 border border-violet-500/30',
    FINISHED: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
    ERROR: 'bg-red-500/15 text-red-200 border border-red-500/30'
};

const itemStatusLabel: Record<string, string> = {
    NEW: 'Новый',
    REJECTED: 'Отклонен',
    STOCK_HQ: 'На складе HQ',
    STOCK_ONLINE: 'Готов к продаже',
    ON_CONSIGNMENT: 'На консигнации',
    SOLD_ONLINE: 'Продан онлайн',
    ACTIVATED: 'Активирован'
};

const itemStatusClass: Record<string, string> = {
    NEW: 'bg-gray-800 text-gray-300',
    REJECTED: 'bg-red-500/15 text-red-200',
    STOCK_HQ: 'bg-emerald-500/15 text-emerald-200',
    STOCK_ONLINE: 'bg-emerald-500/15 text-emerald-200',
    ON_CONSIGNMENT: 'bg-amber-500/15 text-amber-200',
    SOLD_ONLINE: 'bg-blue-500/15 text-blue-200',
    ACTIVATED: 'bg-violet-500/15 text-violet-200'
};

const videoProcessingLabel: Record<string, string> = {
    UPLOADED: 'Загружено',
    QUEUED: 'В очереди',
    PROCESSING: 'Обработка',
    COMPLETED: 'Готово',
    FAILED: 'Ошибка'
};

const videoProcessingClass: Record<string, string> = {
    UPLOADED: 'bg-gray-500/15 text-gray-200 border border-gray-500/30',
    QUEUED: 'bg-blue-500/15 text-blue-200 border border-blue-500/30',
    PROCESSING: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
    COMPLETED: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
    FAILED: 'bg-red-500/15 text-red-200 border border-red-500/30'
};

const videoExportLabel: Record<string, string> = {
    OPEN: 'Черновик',
    UPLOADING: 'Загрузка',
    COMPLETED: 'Готово',
    FAILED: 'Ошибка',
    CANCELLED: 'Отменено',
    ABANDONED: 'Зависло'
};

const videoExportClass: Record<string, string> = {
    OPEN: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
    UPLOADING: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
    COMPLETED: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
    FAILED: 'bg-red-500/15 text-red-200 border border-red-500/30',
    CANCELLED: 'bg-gray-500/15 text-gray-200 border border-gray-500/30',
    ABANDONED: 'bg-orange-500/15 text-orange-200 border border-orange-500/30'
};

const activeVideoProcessingStatuses = new Set(['QUEUED', 'PROCESSING']);
const activeVideoExportStatuses = new Set(['OPEN', 'UPLOADING']);
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

export function Acceptance() {
    const [batches, setBatches] = useState<BatchView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [selectedQrItemIds, setSelectedQrItemIds] = useState<string[]>([]);
    const [batchQuery, setBatchQuery] = useState('');
    const [updatingBatchId, setUpdatingBatchId] = useState('');

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
        () => batches.filter((batch) => batch.status === 'TRANSIT' || batch.status === 'RECEIVED'),
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
            const nextBatch = relevantBatches.find((batch) => batch.status === 'TRANSIT') || relevantBatches[0];
            setSelectedBatchId(nextBatch.id);
        }
    }, [relevantBatches, selectedBatchId]);

    useEffect(() => {
        const hasActiveVideoWork = relevantBatches.some((batch) =>
            (batch.video_processing && activeVideoProcessingStatuses.has(batch.video_processing.status))
            || (batch.video_export && activeVideoExportStatuses.has(batch.video_export.status))
        );
        if (!hasActiveVideoWork) {
            return;
        }

        const intervalId = window.setInterval(() => {
            void loadBatches(false);
        }, 4000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [relevantBatches]);

    const filteredBatches = useMemo(() => {
        const normalizedQuery = batchQuery.trim().toLowerCase();
        if (!normalizedQuery) {
            return relevantBatches;
        }

        return relevantBatches.filter((batch) => {
            const ownerMatch = batch.owner?.name?.toLowerCase().includes(normalizedQuery);
            const productName = batch.product ? getDefaultTranslationValue(batch.product.translations, 'name').toLowerCase() : '';
            return batch.id.toLowerCase().includes(normalizedQuery)
                || productName.includes(normalizedQuery)
                || Boolean(ownerMatch);
        });
    }, [batchQuery, relevantBatches]);

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
    const hasActiveVideoJob = Boolean(
        selectedBatch?.video_processing && activeVideoProcessingStatuses.has(selectedBatch.video_processing.status)
    );
    const hasActiveVideoExport = Boolean(
        selectedBatch?.video_export && activeVideoExportStatuses.has(selectedBatch.video_export.status)
    );
    const canFinalize = Boolean(
        selectedBatch
        && selectedBatch.status === 'RECEIVED'
        && !hasActiveVideoJob
        && !hasActiveVideoExport
        && missingMediaCount === 0
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
            setError('Для печати нет публичных QR-позиций.');
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
            setError('Выберите позиции для печати QR.');
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
        <div className="space-y-8">
            <header className="space-y-2">
                <h1 className="text-2xl font-bold text-white">Складская приемка</h1>
                <p className="text-gray-500">
                    Единый экран приемки HQ: выбор партии, перевод в статус получено, media-полнота и перевод на склад без legacy-операций.
                </p>
            </header>

            {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
                    {error}
                </div>
            )}

            <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                <MetricCard title="В пути" value={relevantBatches.filter((batch) => batch.status === 'TRANSIT').length} />
                <MetricCard title="Приняты" value={relevantBatches.filter((batch) => batch.status === 'RECEIVED').length} />
                <MetricCard title="Фото готовы" value={relevantBatches.reduce((sum, batch) => sum + batch.items.filter((item) => Boolean(item.item_photo_url)).length, 0)} />
                <MetricCard title="Видео готовы" value={relevantBatches.reduce((sum, batch) => sum + batch.items.filter((item) => Boolean(item.item_video_url)).length, 0)} />
            </section>

            <div className="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
                <section className="rounded-2xl border border-gray-800 bg-gray-900">
                    <div className="border-b border-gray-800 px-5 py-4">
                        <div className="flex items-center gap-2">
                            <PackageCheck size={18} className="text-blue-300" />
                            <h2 className="text-lg font-semibold text-white">Партии приемки</h2>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">Показываются только партии в стадиях `TRANSIT` и `RECEIVED`.</p>
                    </div>

                    <div className="border-b border-gray-800 px-5 py-4">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Поиск партии</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 text-gray-500" size={18} />
                            <input
                                value={batchQuery}
                                onChange={(event) => setBatchQuery(event.target.value)}
                                placeholder="ID партии, товар или партнер"
                                className="w-full rounded-xl border border-gray-700 bg-gray-950 py-2.5 pl-10 pr-4 text-white outline-none transition focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div className="max-h-[720px] overflow-y-auto p-3">
                        {loading ? (
                            <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-sm text-gray-400">
                                Загружаем партии приемки...
                            </div>
                        ) : filteredBatches.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-800 bg-gray-950 px-4 py-8 text-sm text-gray-500">
                                По текущему фильтру нет партий для приемки.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredBatches.map((batch) => {
                                    const productName = batch.product ? getDefaultTranslationValue(batch.product.translations, 'name') : 'Без привязки к товару';
                                    const counts = countBatchMedia(batch);
                                    const isSelected = batch.id === selectedBatchId;

                                    return (
                                        <button
                                            key={batch.id}
                                            type="button"
                                            onClick={() => handleSelectBatch(batch.id)}
                                            className={`w-full rounded-2xl border p-4 text-left transition ${isSelected
                                                ? 'border-blue-500/40 bg-blue-500/10 shadow-[0_0_24px_rgba(59,130,246,0.12)]'
                                                : 'border-gray-800 bg-gray-950 hover:border-gray-700 hover:bg-gray-900'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold text-white">{productName}</p>
                                                    <p className="mt-1 truncate font-mono text-xs text-gray-500">{batch.id}</p>
                                                </div>
                                                <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[batch.status] || 'bg-gray-700 text-gray-200'}`}>
                                                    {statusLabel[batch.status] || batch.status}
                                                </span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                                                <span className="rounded-full border border-gray-700 px-2.5 py-1">
                                                    {batch.owner?.name || 'Без партнера'}
                                                </span>
                                                <span className="rounded-full border border-gray-700 px-2.5 py-1">
                                                    Камней: {batch.items.length}
                                                </span>
                                                <span className="rounded-full border border-gray-700 px-2.5 py-1">
                                                    Media: {counts.fullyReady}/{counts.total}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                <section className="space-y-6">
                    {!selectedBatch ? (
                        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900 px-6 py-12 text-center text-gray-500">
                            Выберите партию слева, чтобы открыть рабочее место приемки.
                        </div>
                    ) : (
                        <>
                            <article className="rounded-2xl border border-gray-800 bg-gray-900">
                                <div className="border-b border-gray-800 px-6 py-5">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="space-y-3 min-w-0">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <h2 className="text-xl font-semibold text-white">
                                                    {selectedBatch.product
                                                        ? getDefaultTranslationValue(selectedBatch.product.translations, 'name')
                                                        : 'Партия без карточки товара'}
                                                </h2>
                                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusClass[selectedBatch.status] || 'bg-gray-700 text-gray-200'}`}>
                                                    {statusLabel[selectedBatch.status] || selectedBatch.status}
                                                </span>
                                                {selectedBatch.video_export && (
                                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${videoExportClass[selectedBatch.video_export.status] || 'bg-gray-700 text-gray-200'}`}>
                                                        Монтаж: {videoExportLabel[selectedBatch.video_export.status] || selectedBatch.video_export.status}
                                                    </span>
                                                )}
                                                {selectedBatch.video_processing && (
                                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${videoProcessingClass[selectedBatch.video_processing.status] || 'bg-gray-700 text-gray-200'}`}>
                                                        Legacy: {videoProcessingLabel[selectedBatch.video_processing.status] || selectedBatch.video_processing.status}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="space-y-1 text-sm text-gray-400">
                                                <p className="font-mono text-xs text-gray-500">{selectedBatch.id}</p>
                                                <p>Партнер: {selectedBatch.owner?.name || 'Не назначен'}{selectedBatch.owner?.email ? ` • ${selectedBatch.owner.email}` : ''}</p>
                                                <p>Позиций в партии: {selectedBatch.items.length}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 lg:justify-end">
                                            {selectedBatch.status === 'TRANSIT' && (
                                                <Button
                                                    onClick={() => void handleReceiveBatch(selectedBatch.id)}
                                                    disabled={updatingBatchId === selectedBatch.id}
                                                >
                                                    Принять партию
                                                </Button>
                                            )}

                                            {selectedBatch.status === 'RECEIVED' && (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        onClick={handlePrintSelectedQr}
                                                        disabled={selectedQrItemIds.length === 0}
                                                    >
                                                        <Printer size={16} />
                                                        Печать выбранных QR
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        onClick={handlePrintAllQr}
                                                        disabled={!hasPrintableItems}
                                                    >
                                                        <Printer size={16} />
                                                        Печать всех QR
                                                    </Button>
                                                    <Link
                                                        to={`/admin/photo-tool/${encodeURIComponent(selectedBatch.id)}`}
                                                        className="inline-flex items-center gap-2 rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/10"
                                                    >
                                                        <Camera size={16} />
                                                        Photo Tool
                                                    </Link>
                                                    <Link
                                                        to={`/admin/video-tool/${encodeURIComponent(selectedBatch.id)}`}
                                                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/10"
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

                                {selectedBatch.status === 'RECEIVED' && (
                                    <div className="border-t border-gray-800 px-6 py-5">
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
                                                    : hasActiveVideoJob || hasActiveVideoExport
                                                    ? 'Активная видео-обработка еще идет. Перевод на склад временно заблокирован.'
                                                    : `Не хватает media для ${missingMediaCount} позиций.`}
                                                tone={canFinalize ? 'success' : 'warning'}
                                            />
                                        </div>
                                        {selectedBatch.status === 'RECEIVED' && (
                                            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                                <span>Публичные QR: {printableItemIds.length}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedQrItemIds(printableItemIds)}
                                                    className="rounded-full border border-gray-700 px-3 py-1 hover:bg-gray-800"
                                                >
                                                    Выбрать все
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedQrItemIds([])}
                                                    className="rounded-full border border-gray-700 px-3 py-1 hover:bg-gray-800"
                                                >
                                                    Сбросить выбор
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </article>

                            <article className="rounded-2xl border border-gray-800 bg-gray-900">
                                    <div className="border-b border-gray-800 px-6 py-4">
                                        <h3 className="text-lg font-semibold text-white">Позиции партии</h3>
                                        <p className="mt-1 text-sm text-gray-500">Здесь находится вся приемка товара на склад: серийники, media-статус и быстрые ссылки.</p>
                                    </div>

                                    <div className="divide-y divide-gray-800">
                                        {selectedBatch.items.map((item) => (
                                        <div key={item.id} className="flex flex-col gap-4 px-6 py-4 xl:flex-row xl:items-center xl:justify-between">
                                            <div className="min-w-0 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {selectedBatch.status === 'RECEIVED' && (
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedQrItemIds.includes(item.id)}
                                                            onChange={() => toggleQrItem(item.id)}
                                                            disabled={!isPublicPassportItem(selectedBatch.status, item.status)}
                                                            className="h-4 w-4 rounded border-gray-600 bg-gray-900"
                                                        />
                                                    )}
                                                    <p className="font-semibold text-white">{item.serial_number || item.temp_id}</p>
                                                    <span className={`rounded-full px-2.5 py-1 text-xs ${itemStatusClass[item.status] || 'bg-gray-800 text-gray-300'}`}>
                                                        {itemStatusLabel[item.status] || item.status}
                                                    </span>
                                                    {isPublicPassportItem(selectedBatch.status, item.status) ? (
                                                        <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs text-blue-200">
                                                            Публичный паспорт доступен
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-400">
                                                            QR недоступен
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                                    <span className="rounded-full border border-gray-700 px-2.5 py-1">Пакет: {item.temp_id}</span>
                                                    {item.item_seq != null && (
                                                        <span className="rounded-full border border-gray-700 px-2.5 py-1">Позиция: {String(item.item_seq).padStart(3, '0')}</span>
                                                    )}
                                                    <span className="rounded-full border border-gray-700 px-2.5 py-1">{item.is_sold ? 'Продан' : 'Не продан'}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-xs">
                                                    <span className={`rounded-full px-2.5 py-1 ${item.item_photo_url ? 'bg-emerald-500/15 text-emerald-200' : 'bg-gray-800 text-gray-400'}`}>
                                                        Фото {item.item_photo_url ? 'есть' : 'нет'}
                                                    </span>
                                                    <span className={`rounded-full px-2.5 py-1 ${item.item_video_url ? 'bg-emerald-500/15 text-emerald-200' : 'bg-gray-800 text-gray-400'}`}>
                                                        Видео {item.item_video_url ? 'есть' : 'нет'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {isPublicPassportItem(selectedBatch.status, item.status) ? (
                                                    <>
                                                        <a
                                                            href={item.qr_url || '#'}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            aria-disabled={!item.qr_url}
                                                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500"
                                                        >
                                                            <QrCode size={16} />
                                                            QR
                                                        </a>
                                                        {createClonePath(item.serial_number) && (
                                                            <a
                                                                href={createClonePath(item.serial_number) || '#'}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
                                                            >
                                                                Просмотр
                                                            </a>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-500">
                                                        Паспорт появится после публикации
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </article>

                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

function MetricCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-4">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
    );
}

function InfoTile({ title, value, note }: { title: string; value: string; note: string }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-4">
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
        : 'border-gray-800 bg-gray-950';

    return (
        <div className={`rounded-2xl border px-4 py-4 ${toneClass}`}>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="mt-2 text-sm text-gray-400">{text}</p>
        </div>
    );
}
