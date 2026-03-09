import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';

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

const CARDS_PER_PAGE = 8;

const splitByPages = <T,>(items: T[], size: number): T[][] => {
    const pages: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        pages.push(items.slice(index, index + size));
    }
    return pages;
};

const shortToken = (value: string) => {
    if (value.length <= 12) return value;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const shortCloneUrl = (value: string) => {
    try {
        const parsed = new URL(value);
        return `${parsed.host}${parsed.pathname}`;
    } catch {
        return value;
    }
};

export function QrPrint() {
    const [searchParams] = useSearchParams();
    const [pack, setPack] = useState<QrPackResponse | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const batchId = searchParams.get('batchId')?.trim() ?? '';
    const requestedIds = useMemo(() => {
        const ids = searchParams.get('ids');
        if (!ids) return null;
        return new Set(
            ids
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
        );
    }, [searchParams]);

    useEffect(() => {
        const loadPack = async () => {
            if (!batchId) {
                setError('Не указан batchId для печати QR-пакета.');
                setLoading(false);
                return;
            }

            setLoading(true);
            setError('');

            try {
                const token = localStorage.getItem('accessToken');
                const response = await fetch(`/api/batches/${batchId}/qr-pack`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (response.status === 403) {
                    setError('Нет прав доступа к выбранной партии.');
                    setPack(null);
                    return;
                }
                if (response.status === 404) {
                    setError('Партия не найдена.');
                    setPack(null);
                    return;
                }
                if (!response.ok) {
                    setError('Не удалось загрузить данные для печати.');
                    setPack(null);
                    return;
                }

                const data = await response.json() as QrPackResponse;
                setPack(data);
            } catch {
                setError('Сетевая ошибка при загрузке QR-пакета.');
                setPack(null);
            } finally {
                setLoading(false);
            }
        };

        void loadPack();
    }, [batchId]);

    const printableItems = useMemo(() => {
        if (!pack) return [];
        if (!requestedIds) return pack.items;
        return pack.items.filter((item) => requestedIds.has(item.id));
    }, [pack, requestedIds]);

    const pages = useMemo(() => splitByPages(printableItems, CARDS_PER_PAGE), [printableItems]);

    return (
        <div className="print-shell min-h-screen bg-slate-900 p-4 md:p-6">
            <style>
                {`
                    @page {
                        size: A4;
                        margin: 10mm;
                    }

                    @media print {
                        html, body {
                            background: #ffffff !important;
                        }

                        body {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        .print-controls {
                            display: none !important;
                        }

                        .print-shell {
                            background: #ffffff !important;
                            padding: 0 !important;
                        }

                        .print-page {
                            width: 190mm;
                            min-height: 277mm;
                            margin: 0 auto;
                            page-break-after: always;
                            break-after: page;
                        }

                        .print-page:last-child {
                            page-break-after: auto;
                            break-after: auto;
                        }

                        .print-grid {
                            display: grid !important;
                            grid-template-columns: 1fr 1fr;
                            grid-template-rows: repeat(4, minmax(0, 1fr));
                            gap: 6mm;
                            min-height: 277mm;
                        }

                        .print-card {
                            border: 1px solid #d1d5db !important;
                            border-radius: 10px !important;
                            background: #ffffff !important;
                            color: #111827 !important;
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }
                    }
                `}
            </style>

            <div className="print-controls max-w-5xl mx-auto mb-4 md:mb-6 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-4 py-4 md:px-6 md:py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold">Печать QR-пакета</h1>
                    {pack && (
                        <p className="text-sm text-slate-300 mt-1">
                            Партия {pack.batch.id.slice(0, 8)}... | Позиций к печати: {printableItems.length}
                        </p>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => window.print()}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-2"
                    >
                        <Printer size={16} />
                        Печать / PDF
                    </button>
                    <Link
                        to="/partner/qr"
                        className="rounded-lg border border-slate-500 px-4 py-2 text-sm hover:bg-slate-700"
                    >
                        Назад в QR-центр
                    </Link>
                </div>
            </div>

            {loading && (
                <div className="text-slate-200 text-center py-16">Загрузка данных для печати...</div>
            )}

            {!loading && error && (
                <div className="max-w-3xl mx-auto rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-3">
                    {error}
                </div>
            )}

            {!loading && !error && printableItems.length === 0 && (
                <div className="max-w-3xl mx-auto rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3">
                    Для печати не выбрано ни одной позиции.
                </div>
            )}

            {!loading && !error && pages.length > 0 && (
                <div className="space-y-6">
                    {pages.map((pageItems, pageIndex) => (
                        <section
                            key={`print-page-${pageIndex}`}
                            className="print-page max-w-[210mm] mx-auto rounded-xl bg-white p-3 md:p-4 shadow-xl"
                        >
                            <div className="print-grid grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                                {pageItems.map((item) => (
                                    <article
                                        key={item.id}
                                        className="print-card border border-slate-200 rounded-xl p-3 md:p-4 bg-white text-slate-900 flex flex-col gap-3"
                                    >
                                        <header className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold">Позиция #{item.temp_id}</p>
                                                <p className="text-xs text-slate-500">Token: {shortToken(item.public_token)}</p>
                                            </div>
                                            <img src={item.photo_url} alt="" className="w-14 h-14 rounded-md object-cover border border-slate-200" />
                                        </header>

                                        <div className="flex-1 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-3">
                                            <img src={item.qr_url} alt={`QR ${item.temp_id}`} className="w-40 h-40 object-contain" />
                                        </div>

                                        <footer className="space-y-1">
                                            <p className="text-[11px] font-medium text-slate-700 break-all">
                                                Ссылка клона: {shortCloneUrl(item.clone_url)}
                                            </p>
                                            <p className="text-[10px] text-slate-500 break-all">{item.clone_url}</p>
                                        </footer>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
