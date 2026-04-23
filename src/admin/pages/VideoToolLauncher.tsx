import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageCheck, Search, Video } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

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
    items: Array<{
        id: string;
        item_video_url?: string | null;
        item_photo_url?: string | null;
    }>;
};

const statusLabel: Record<string, string> = {
    TRANSIT: 'В пути',
    RECEIVED: 'Принята'
};

const statusClass: Record<string, string> = {
    TRANSIT: 'border-sky-500/30 bg-sky-500/15 text-sky-200',
    RECEIVED: 'border-violet-500/30 bg-violet-500/15 text-violet-200'
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
    OPEN: 'border-sky-500/30 bg-sky-500/15 text-sky-200',
    UPLOADING: 'border-amber-500/30 bg-amber-500/15 text-amber-200',
    COMPLETED: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
    FAILED: 'border-red-500/30 bg-red-500/15 text-red-200',
    CANCELLED: 'border-gray-500/30 bg-gray-500/15 text-gray-200',
    ABANDONED: 'border-orange-500/30 bg-orange-500/15 text-orange-200'
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const countVideoReady = (batch: BatchView) => batch.items.filter((item) => Boolean(item.item_video_url)).length;
const countPhotoReady = (batch: BatchView) => batch.items.filter((item) => Boolean(item.item_photo_url)).length;

const formatDateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
}).format(new Date(value));

export function VideoToolLauncher() {
    const [batches, setBatches] = useState<BatchView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
        const loadBatches = async () => {
            setLoading(true);
            setError('');

            try {
                const response = await authFetch('/api/batches');
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить партии для Video Tool.' }));
                    throw new Error(payload.error || 'Не удалось загрузить партии для Video Tool.');
                }

                const payload = await response.json() as BatchView[];
                setBatches(payload);
            } catch (loadError) {
                console.error(loadError);
                setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить партии для Video Tool.');
            } finally {
                setLoading(false);
            }
        };

        void loadBatches();
    }, []);

    const relevantBatches = useMemo(
        () => batches.filter((batch) => batch.status === 'TRANSIT' || batch.status === 'RECEIVED'),
        [batches]
    );

    const filteredBatches = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return relevantBatches;
        }

        return relevantBatches.filter((batch) => {
            const productName = batch.product ? getDefaultTranslationValue(batch.product.translations, 'name').toLowerCase() : '';
            const ownerName = batch.owner?.name?.toLowerCase() || '';
            const ownerEmail = batch.owner?.email?.toLowerCase() || '';
            return batch.id.toLowerCase().includes(normalizedQuery)
                || productName.includes(normalizedQuery)
                || ownerName.includes(normalizedQuery)
                || ownerEmail.includes(normalizedQuery);
        });
    }, [query, relevantBatches]);

    const totalItems = relevantBatches.reduce((sum, batch) => sum + batch.items.length, 0);
    const totalVideoReady = relevantBatches.reduce((sum, batch) => sum + countVideoReady(batch), 0);

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
                            <Video size={20} />
                        </span>
                        <div>
                            <h1 className="text-3xl font-semibold tracking-tight text-white">Video Tool</h1>
                            <p className="mt-1 text-gray-500">Выберите товарную партию и откройте стандартный монтаж видео.</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
                    <Metric label="Партии" value={relevantBatches.length} />
                    <Metric label="Позиции" value={totalItems} />
                    <Metric label="Видео" value={`${totalVideoReady}/${totalItems}`} />
                </div>
            </header>

            {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
                    {error}
                </div>
            )}

            <section className="rounded-2xl border border-gray-800 bg-gray-900">
                <div className="flex flex-col gap-4 border-b border-gray-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <PackageCheck size={18} className="text-blue-300" />
                            <h2 className="text-lg font-semibold text-white">Партии с поставкой</h2>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">Доступны партии в статусах `TRANSIT` и `RECEIVED`.</p>
                    </div>

                    <label className="relative block w-full lg:max-w-sm">
                        <Search className="absolute left-3 top-3 text-gray-500" size={18} />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="ID партии, товар или партнер"
                            className="w-full rounded-xl border border-gray-700 bg-gray-950 py-2.5 pl-10 pr-4 text-white outline-none transition focus:border-blue-500"
                        />
                    </label>
                </div>

                <div className="p-4">
                    {loading ? (
                        <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-8 text-sm text-gray-400">
                            Загружаем партии для Video Tool...
                        </div>
                    ) : filteredBatches.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-800 bg-gray-950 px-4 py-10 text-sm text-gray-500">
                            Нет партий, подходящих под текущий фильтр.
                        </div>
                    ) : (
                        <div className="grid gap-4 xl:grid-cols-2">
                            {filteredBatches.map((batch) => {
                                const productName = batch.product ? getDefaultTranslationValue(batch.product.translations, 'name') : 'Партия без карточки товара';
                                const videoReady = countVideoReady(batch);
                                const photoReady = countPhotoReady(batch);

                                return (
                                    <article key={batch.id} className="rounded-2xl border border-gray-800 bg-gray-950 p-4 transition hover:border-gray-700">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0">
                                                <h3 className="truncate text-lg font-semibold text-white">{productName}</h3>
                                                <p className="mt-1 truncate font-mono text-xs text-gray-500">{batch.id}</p>
                                                <p className="mt-2 text-sm text-gray-400">
                                                    {batch.owner?.name || 'Без партнера'}{batch.owner?.email ? ` • ${batch.owner.email}` : ''}
                                                </p>
                                            </div>

                                            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass[batch.status] || 'border-gray-700 bg-gray-800 text-gray-300'}`}>
                                                    {statusLabel[batch.status] || batch.status}
                                                </span>
                                                {batch.video_export && (
                                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${videoExportClass[batch.video_export.status] || 'border-gray-700 bg-gray-800 text-gray-300'}`}>
                                                        Монтаж: {videoExportLabel[batch.video_export.status] || batch.video_export.status}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                                            <Info label="Позиций" value={batch.items.length} />
                                            <Info label="Фото" value={`${photoReady}/${batch.items.length}`} />
                                            <Info label="Видео" value={`${videoReady}/${batch.items.length}`} />
                                            <Info label="Создана" value={formatDateTime(batch.created_at)} />
                                        </div>

                                        <div className="mt-4 flex justify-end">
                                            <Link
                                                to={`/admin/video-tool/${encodeURIComponent(batch.id)}`}
                                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                                            >
                                                <Video size={16} />
                                                Открыть Video Tool
                                            </Link>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-right">
            <div className="text-lg font-semibold leading-none text-white">{value}</div>
            <div className="mt-1 text-xs text-gray-500">{label}</div>
        </div>
    );
}

function Info({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="mt-1 truncate text-sm font-medium text-gray-100">{value}</div>
        </div>
    );
}
