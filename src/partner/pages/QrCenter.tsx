import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, QrCode, Printer, Download } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

type BatchOption = {
    id: string;
    status: string;
    created_at: string;
    items: { id: string }[];
};

type QrPackItem = {
    id: string;
    temp_id: string;
    public_token: string;
    status: string;
    photo_url: string;
    created_at: string;
    clone_url: string;
    qr_url: string;
};

type QrPackBatch = {
    id: string;
    status: string;
    created_at: string;
    gps_lat: number | null;
    gps_lng: number | null;
    video_url: string | null;
};

type QrPackResponse = {
    batch: QrPackBatch;
    items: QrPackItem[];
};

const PAGE_SIZE = 50;

const formatTimestamp = (value: string) => {
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
};

const csvEscape = (value: string | number | null | undefined): string => {
    const raw = value == null ? '' : String(value);
    return `"${raw.replace(/"/g, '""')}"`;
};

export function QrCenter() {
    const [batches, setBatches] = useState<BatchOption[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [pack, setPack] = useState<QrPackResponse | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [loadingBatches, setLoadingBatches] = useState(false);
    const [loadingPack, setLoadingPack] = useState(false);
    const [error, setError] = useState('');
    const [copiedId, setCopiedId] = useState('');
    const [qrPreview, setQrPreview] = useState<QrPackItem | null>(null);

    useEffect(() => {
        const loadBatches = async () => {
            setLoadingBatches(true);
            setError('');
            try {
                const res = await authFetch('/api/batches');

                if (!res.ok) {
                    setError(res.status === 401 || res.status === 403 ? 'Сессия истекла. Войдите снова.' : 'Не удалось загрузить партии.');
                    return;
                }

                const data = await res.json() as BatchOption[];
                setBatches(data);

                if (data.length > 0) {
                    const firstBatchId = data[0].id;
                    setSelectedBatchId(firstBatchId);
                }
            } catch (_error) {
                setError('Ошибка загрузки партий.');
            } finally {
                setLoadingBatches(false);
            }
        };

        void loadBatches();
    }, []);

    useEffect(() => {
        const loadPack = async () => {
            if (!selectedBatchId) {
                setPack(null);
                setSelectedIds([]);
                return;
            }

            setLoadingPack(true);
            setError('');
            setPage(1);
            try {
                const res = await authFetch(`/api/batches/${selectedBatchId}/qr-pack`);

                if (res.status === 403) {
                    setError('Нет доступа к выбранной партии.');
                    setPack(null);
                    setSelectedIds([]);
                    return;
                }
                if (res.status === 404) {
                    setError('Партия не найдена.');
                    setPack(null);
                    setSelectedIds([]);
                    return;
                }
                if (!res.ok) {
                    setError('Не удалось загрузить QR-пакет.');
                    setPack(null);
                    setSelectedIds([]);
                    return;
                }

                const data = await res.json() as QrPackResponse;
                setPack(data);
                setSelectedIds([]);
            } catch (_error) {
                setError('Сетевая ошибка при загрузке QR-пакета.');
                setPack(null);
                setSelectedIds([]);
            } finally {
                setLoadingPack(false);
            }
        };

        void loadPack();
    }, [selectedBatchId]);

    const filteredItems = useMemo(() => {
        const allItems = pack?.items ?? [];
        const term = query.trim().toLowerCase();
        if (!term) return allItems;
        return allItems.filter((item) =>
            item.temp_id.toLowerCase().includes(term)
            || item.public_token.toLowerCase().includes(term)
            || item.id.toLowerCase().includes(term)
        );
    }, [pack?.items, query]);

    const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

    const pagedItems = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filteredItems.slice(start, start + PAGE_SIZE);
    }, [filteredItems, page]);

    useEffect(() => {
        if (page > pageCount) {
            setPage(pageCount);
        }
    }, [page, pageCount]);

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedItems = useMemo(() => (pack?.items ?? []).filter((item) => selectedSet.has(item.id)), [pack?.items, selectedSet]);

    const toggleItem = (id: string) => {
        setSelectedIds((prev) => (
            prev.includes(id)
                ? prev.filter((value) => value !== id)
                : [...prev, id]
        ));
    };

    const selectVisible = () => {
        const visibleIds = pagedItems.map((item) => item.id);
        setSelectedIds((prev) => {
            const merged = new Set([...prev, ...visibleIds]);
            return [...merged];
        });
    };

    const clearSelection = () => setSelectedIds([]);

    const selectAllInBatch = () => {
        setSelectedIds((pack?.items ?? []).map((item) => item.id));
    };

    const handleCopyCloneLink = async (item: QrPackItem) => {
        try {
            await navigator.clipboard.writeText(item.clone_url);
            setCopiedId(item.id);
            setTimeout(() => setCopiedId(''), 1600);
        } catch (_error) {
            setCopiedId('');
        }
    };

    const buildPrintUrl = (allItems: boolean) => {
        if (!selectedBatchId) return '';
        const params = new URLSearchParams({ batchId: selectedBatchId });
        if (!allItems) {
            params.set('ids', selectedIds.join(','));
        }
        return `/partner/qr/print?${params.toString()}`;
    };

    const handlePrintAll = () => {
        if (!pack || pack.items.length === 0) {
            setError('В партии нет позиций для печати.');
            return;
        }
        window.open(buildPrintUrl(true), '_blank', 'noopener,noreferrer');
    };

    const handlePrintSelected = () => {
        if (selectedIds.length === 0) {
            setError('Выберите позиции для печати.');
            return;
        }
        window.open(buildPrintUrl(false), '_blank', 'noopener,noreferrer');
    };

    const handleCsvExport = () => {
        if (!selectedBatchId) {
            setError('Сначала выберите партию.');
            return;
        }
        if (selectedItems.length === 0) {
            setError('Выберите позиции для экспорта CSV.');
            return;
        }

        const header = 'batch_id,temp_id,public_token,status,clone_url,qr_url,photo_url,created_at';
        const rows = selectedItems.map((item) => [
            csvEscape(selectedBatchId),
            csvEscape(item.temp_id),
            csvEscape(item.public_token),
            csvEscape(item.status),
            csvEscape(item.clone_url),
            csvEscape(item.qr_url),
            csvEscape(item.photo_url),
            csvEscape(item.created_at)
        ].join(','));

        const csv = `\uFEFF${header}\n${rows.join('\n')}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const filename = `qr-pack-${selectedBatchId}-${formatTimestamp(new Date().toISOString())}.csv`;

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="app-shell-light space-y-6">
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">QR-пакеты</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Выберите партию, отметьте позиции и распечатайте QR или выгрузите CSV.
                    </p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 shadow-sm shadow-blue-100/60">
                    Выбрано: <strong>{selectedIds.length}</strong>
                </div>
            </header>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
                <section className="space-y-4">
                    <div className="ui-card p-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Партия</label>
                        <select
                            value={selectedBatchId}
                            onChange={(event) => setSelectedBatchId(event.target.value)}
                            className="ui-select"
                            disabled={loadingBatches}
                        >
                            {batches.length === 0 && <option value="">Партии не найдены</option>}
                            {batches.map((batch) => (
                                <option key={batch.id} value={batch.id}>
                                    {batch.id.slice(0, 8)}... ({batch.items.length} шт.)
                                </option>
                            ))}
                        </select>

                        {pack && (
                            <div className="mt-3 text-xs text-gray-500 space-y-1">
                                <p>Статус: {pack.batch.status}</p>
                                <p>Дата: {new Date(pack.batch.created_at).toLocaleString('ru-RU')}</p>
                            </div>
                        )}
                    </div>

                    <div className="ui-card p-4 space-y-2.5">
                        <button
                            onClick={handlePrintSelected}
                            disabled={selectedIds.length === 0}
                            className="ui-btn ui-btn-primary w-full"
                        >
                            <Printer size={16} /> Печать выбранных
                        </button>
                        <button
                            onClick={handlePrintAll}
                            disabled={!pack || pack.items.length === 0}
                            className="ui-btn ui-btn-secondary w-full"
                        >
                            <Printer size={16} /> Печать всей партии
                        </button>
                        <button
                            onClick={handleCsvExport}
                            disabled={selectedIds.length === 0}
                            className="ui-btn ui-btn-ghost w-full"
                        >
                            <Download size={16} /> CSV выбранных
                        </button>
                    </div>
                </section>

                <section className="ui-card overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <input
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setPage(1);
                            }}
                            placeholder="Поиск по № упаковки, token или id"
                            className="ui-input w-full md:w-80"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={selectVisible} className="ui-btn ui-btn-secondary ui-btn-sm">Выбрать видимые</button>
                            <button onClick={selectAllInBatch} className="ui-btn ui-btn-secondary ui-btn-sm">Выбрать все</button>
                            <button onClick={clearSelection} className="ui-btn ui-btn-ghost ui-btn-sm">Сбросить</button>
                        </div>
                    </div>

                    {loadingPack && (
                        <div className="p-10 text-center text-sm text-gray-500">Загрузка QR-пакета...</div>
                    )}

                    {!loadingPack && (!pack || pack.items.length === 0) && (
                        <div className="p-10 text-center text-sm text-gray-500">
                            В этой партии пока нет позиций для QR.
                        </div>
                    )}

                    {!loadingPack && pack && pack.items.length > 0 && (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                        <tr>
                                            <th className="p-3">
                                                <span className="sr-only">Выбор</span>
                                            </th>
                                            <th className="p-3">Позиция</th>
                                            <th className="p-3">Статус</th>
                                            <th className="p-3">QR</th>
                                            <th className="p-3">Ссылка</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {pagedItems.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50">
                                                <td className="p-3 align-top">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedSet.has(item.id)}
                                                        onChange={() => toggleItem(item.id)}
                                                        className="mt-1"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-3">
                                                        <img src={item.photo_url} alt="" className="w-10 h-10 rounded object-cover bg-gray-200" />
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-800">#{item.temp_id}</p>
                                                            <p className="text-xs text-gray-500 font-mono">{item.public_token}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-sm text-gray-700">{item.status}</td>
                                                <td className="p-3">
                                                    <button
                                                        onClick={() => setQrPreview(item)}
                                                        className="ui-btn ui-btn-secondary ui-btn-sm"
                                                    >
                                                        <QrCode size={14} /> Показать
                                                    </button>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => void handleCopyCloneLink(item)}
                                                            className="ui-btn ui-btn-secondary ui-btn-sm"
                                                        >
                                                            <Copy size={14} /> {copiedId === item.id ? 'Скопировано' : 'Копировать'}
                                                        </button>
                                                        <a
                                                            href={item.clone_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="ui-btn ui-btn-ghost ui-btn-sm"
                                                        >
                                                            <ExternalLink size={14} /> Открыть
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="p-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                                <span>Стр. {page} / {pageCount}. Всего позиций: {filteredItems.length}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                                        disabled={page === 1}
                                        className="ui-btn ui-btn-secondary ui-btn-sm"
                                    >
                                        Назад
                                    </button>
                                    <button
                                        onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                                        disabled={page === pageCount}
                                        className="ui-btn ui-btn-secondary ui-btn-sm"
                                    >
                                        Вперед
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>

            {qrPreview && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setQrPreview(null)}>
                    <div className="bg-white rounded-xl p-5 max-w-sm w-full shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-between items-start gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-gray-800">QR позиции #{qrPreview.temp_id}</h2>
                                <p className="text-xs text-gray-500 font-mono">{qrPreview.public_token}</p>
                            </div>
                            <button onClick={() => setQrPreview(null)} className="text-gray-400 hover:text-gray-700">✕</button>
                        </div>
                        <img src={qrPreview.qr_url} alt="QR" className="w-56 h-56 mx-auto mt-4" />
                    </div>
                </div>
            )}
        </div>
    );
}
