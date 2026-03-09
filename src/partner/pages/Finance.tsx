import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarRange, Download, Percent, RefreshCw, Search, Wallet } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';

type LedgerEntry = {
    id: string;
    operation: string;
    amount: string;
    timestamp: string;
    item?: {
        id: string;
        temp_id: string;
        public_token?: string;
    } | null;
};

type Profile = {
    name: string;
    balance: string;
    commission_rate?: string | number | null;
};

type PeriodFilter = '30D' | '90D' | '365D' | 'ALL';

const PERIOD_OPTIONS: Array<{ value: PeriodFilter; label: string }> = [
    { value: '30D', label: '30 дней' },
    { value: '90D', label: '90 дней' },
    { value: '365D', label: '12 месяцев' },
    { value: 'ALL', label: 'Все время' },
];

const OPERATION_LABELS: Record<string, string> = {
    ROYALTY_CHARGE: 'Списание роялти',
    SALES_PAYOUT: 'Выплата с продажи',
    WITHDRAWAL: 'Вывод средств',
    MANUAL_ADJ: 'Ручная корректировка',
    ALL: 'Все операции',
};

const OPERATION_DESCRIPTIONS: Record<string, string> = {
    ROYALTY_CHARGE: 'Комиссия HQ по завершенной продаже.',
    SALES_PAYOUT: 'Начисление партнерской выплаты.',
    WITHDRAWAL: 'Списание после запроса на вывод.',
    MANUAL_ADJ: 'Разовая корректировка по счету.',
};

const csvEscape = (value: string | number | null | undefined) => {
    const raw = value == null ? '' : String(value);
    return `"${raw.replace(/"/g, '""')}"`;
};

const formatDateTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Некорректная дата'
        : date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
};

const withinPeriod = (timestamp: string, period: PeriodFilter) => {
    if (period === 'ALL') return true;

    const createdAt = new Date(timestamp).getTime();
    if (Number.isNaN(createdAt)) return false;

    const now = Date.now();
    const days = period === '30D' ? 30 : period === '90D' ? 90 : 365;
    const threshold = now - (days * 24 * 60 * 60 * 1000);
    return createdAt >= threshold;
};

const toAmount = (amount: string) => {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getOperationLabel = (operation: string) => OPERATION_LABELS[operation] || operation;

const getAmountTone = (amount: number) => {
    if (amount > 0) return 'text-emerald-700';
    if (amount < 0) return 'text-rose-700';
    return 'text-slate-700';
};

const getAmountBadgeTone = (amount: number) => {
    if (amount > 0) return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
    if (amount < 0) return 'bg-rose-50 text-rose-700 border border-rose-100';
    return 'bg-slate-100 text-slate-700 border border-slate-200';
};

const formatCommission = (value?: string | number | null) => {
    if (value == null) return 'Не задана';
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(numeric)) return 'Не задана';
    return `${numeric.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
};

export function Finance() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [operationFilter, setOperationFilter] = useState<string>('ALL');
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('90D');
    const [query, setQuery] = useState('');

    const loadData = async () => {
        setLoading(true);
        setError('');

        try {
            const [profileRes, ledgerRes] = await Promise.all([
                authFetch('/api/financials/me'),
                authFetch('/api/financials/ledger'),
            ]);

            if (!profileRes.ok) throw new Error('Не удалось загрузить профиль.');
            if (!ledgerRes.ok) throw new Error('Не удалось загрузить проводки.');

            setProfile(await profileRes.json() as Profile);
            setTransactions(await ledgerRes.json() as LedgerEntry[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить финансовые данные.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const operationOptions = useMemo(
        () => ['ALL', ...Array.from(new Set(transactions.map((entry) => entry.operation)))],
        [transactions]
    );

    const filteredTransactions = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return transactions.filter((entry) => {
            if (operationFilter !== 'ALL' && entry.operation !== operationFilter) {
                return false;
            }

            if (!withinPeriod(entry.timestamp, periodFilter)) {
                return false;
            }

            if (!normalizedQuery) {
                return true;
            }

            const label = getOperationLabel(entry.operation).toLowerCase();
            const itemTempId = entry.item?.temp_id?.toLowerCase() || '';
            const publicToken = entry.item?.public_token?.toLowerCase() || '';

            return (
                label.includes(normalizedQuery)
                || entry.id.toLowerCase().includes(normalizedQuery)
                || itemTempId.includes(normalizedQuery)
                || publicToken.includes(normalizedQuery)
            );
        });
    }, [operationFilter, periodFilter, query, transactions]);

    const totals = useMemo(() => {
        return filteredTransactions.reduce(
            (acc, entry) => {
                const amount = toAmount(entry.amount);
                if (amount > 0) acc.income += amount;
                if (amount < 0) acc.expense += Math.abs(amount);
                if (entry.item?.id) acc.itemLinked += 1;
                return acc;
            },
            { income: 0, expense: 0, itemLinked: 0 }
        );
    }, [filteredTransactions]);

    const latestTimestamp = filteredTransactions[0]?.timestamp || transactions[0]?.timestamp || '';

    const handleExportCsv = () => {
        if (filteredTransactions.length === 0) return;

        const header = 'timestamp,operation,operation_label,entry_id,item_temp_id,public_token,amount';
        const rows = filteredTransactions.map((entry) => [
            csvEscape(entry.timestamp),
            csvEscape(entry.operation),
            csvEscape(getOperationLabel(entry.operation)),
            csvEscape(entry.id),
            csvEscape(entry.item?.temp_id),
            csvEscape(entry.item?.public_token),
            csvEscape(entry.amount),
        ].join(','));

        const csv = `\uFEFF${header}\n${rows.join('\n')}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().slice(0, 10);

        const link = document.createElement('a');
        link.href = url;
        link.download = `finance-ledger-${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="app-shell-light space-y-6">
            <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Финансы</h1>
                    <p className="mt-1 max-w-2xl text-sm text-slate-500">
                        Баланс, начисления и история движений по счёту партнёра в одном месте.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button onClick={() => void loadData()} className="ui-btn ui-btn-secondary" disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Обновить
                    </button>
                    <button onClick={handleExportCsv} className="ui-btn ui-btn-primary" disabled={filteredTransactions.length === 0}>
                        <Download size={16} />
                        Скачать CSV
                    </button>
                </div>
            </header>

            {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 p-6 text-white shadow-xl shadow-blue-900/10">
                    <div className="flex items-start justify-between gap-4">
                        <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
                            <Wallet size={22} />
                        </div>
                        <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-medium text-blue-100">
                            {profile?.name || 'Партнер'}
                        </span>
                    </div>
                    <p className="mt-8 text-sm text-blue-100/90">Текущий баланс</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight">{formatRub(profile?.balance ?? '0')}</p>
                    <p className="mt-2 text-xs text-blue-100/80">
                        Последнее движение: {latestTimestamp ? formatDateTime(latestTimestamp) : 'пока нет операций'}
                    </p>
                </div>

                <MetricCard
                    title="Начислено"
                    value={formatRub(totals.income)}
                    note={`За период ${PERIOD_OPTIONS.find((option) => option.value === periodFilter)?.label.toLowerCase() || 'все время'}`}
                    icon={<ArrowDownLeft size={18} />}
                    iconTone="bg-emerald-50 text-emerald-700"
                    valueTone="text-emerald-700"
                />
                <MetricCard
                    title="Списано"
                    value={formatRub(totals.expense)}
                    note="Роялти, выводы и корректировки"
                    icon={<ArrowUpRight size={18} />}
                    iconTone="bg-rose-50 text-rose-700"
                    valueTone="text-rose-700"
                />
                <MetricCard
                    title="Комиссия HQ"
                    value={formatCommission(profile?.commission_rate)}
                    note={`Операций в выборке: ${filteredTransactions.length}`}
                    icon={<Percent size={18} />}
                    iconTone="bg-blue-50 text-blue-700"
                    valueTone="text-slate-900"
                />
            </section>

            <section className="ui-card p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="w-full xl:max-w-md">
                        <label className="mb-2 block text-sm font-medium text-slate-700">Поиск по item/token/операции</label>
                        <div className="relative">
                            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Например, ural102token или вывод"
                                className="ui-input pl-10 text-slate-900 bg-white"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:w-auto">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">Тип операции</label>
                            <select
                                value={operationFilter}
                                onChange={(event) => setOperationFilter(event.target.value)}
                                className="ui-select min-w-56 text-slate-900 bg-white"
                            >
                                {operationOptions.map((option) => (
                                    <option key={option} value={option}>
                                        {getOperationLabel(option)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                                <CalendarRange size={15} />
                                Период
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {PERIOD_OPTIONS.map((option) => {
                                    const active = periodFilter === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            onClick={() => setPeriodFilter(option.value)}
                                            className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${active
                                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                                                : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                                                }`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-3 py-1.5">Проводок: {filteredTransactions.length}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5">Связано с позициями: {totals.itemLinked}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5">Баланс сейчас: {formatRub(profile?.balance ?? '0')}</span>
                </div>
            </section>

            <section className="ui-card overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="text-lg font-bold text-slate-900">История операций</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Список последних проводок с указанием суммы, типа операции и связанной позиции.
                    </p>
                </div>

                {loading && (
                    <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-slate-500">
                        <RefreshCw size={16} className="animate-spin text-blue-600" />
                        Загрузка финансовых данных...
                    </div>
                )}

                {!loading && !error && filteredTransactions.length === 0 && (
                    <div className="px-6 py-16 text-center">
                        <p className="text-base font-semibold text-slate-800">Проводки не найдены</p>
                        <p className="mt-2 text-sm text-slate-500">
                            Измените фильтры или дождитесь новых движений по счету.
                        </p>
                    </div>
                )}

                {!loading && !error && filteredTransactions.length > 0 && (
                    <>
                        <div className="hidden overflow-x-auto xl:block">
                            <table className="w-full min-w-[980px] text-left">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">Дата</th>
                                        <th className="px-5 py-3 font-medium">Операция</th>
                                        <th className="px-5 py-3 font-medium">Связанный item</th>
                                        <th className="px-5 py-3 font-medium">ID проводки</th>
                                        <th className="px-5 py-3 text-right font-medium">Сумма</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredTransactions.map((entry) => {
                                        const amount = toAmount(entry.amount);
                                        return (
                                            <tr key={entry.id} className="hover:bg-slate-50/80">
                                                <td className="px-5 py-4 text-sm text-slate-600">
                                                    {formatDateTime(entry.timestamp)}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="space-y-1">
                                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getAmountBadgeTone(amount)}`}>
                                                            {getOperationLabel(entry.operation)}
                                                        </span>
                                                        <p className="text-xs text-slate-500">
                                                            {OPERATION_DESCRIPTIONS[entry.operation] || 'Операция по счету партнера.'}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-sm text-slate-700">
                                                    {entry.item ? (
                                                        <div>
                                                            <p className="font-semibold text-slate-800">#{entry.item.temp_id}</p>
                                                            <p className="font-mono text-xs text-slate-500">
                                                                {entry.item.public_token || entry.item.id}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-500">Системная операция</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 font-mono text-xs text-slate-500">
                                                    {entry.id}
                                                </td>
                                                <td className={`px-5 py-4 text-right text-sm font-semibold ${getAmountTone(amount)}`}>
                                                    {amount > 0 ? '+' : amount < 0 ? '-' : ''}{formatRub(Math.abs(amount))}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="divide-y divide-slate-100 xl:hidden">
                            {filteredTransactions.map((entry) => {
                                const amount = toAmount(entry.amount);
                                return (
                                    <article key={entry.id} className="space-y-3 px-5 py-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900">{getOperationLabel(entry.operation)}</p>
                                                <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.timestamp)}</p>
                                            </div>
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getAmountBadgeTone(amount)}`}>
                                                {amount > 0 ? '+' : amount < 0 ? '-' : ''}{formatRub(Math.abs(amount))}
                                            </span>
                                        </div>

                                        <p className="text-sm text-slate-600">
                                            {OPERATION_DESCRIPTIONS[entry.operation] || 'Операция по счету партнера.'}
                                        </p>

                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                            {entry.item ? (
                                                <>
                                                    <p className="font-semibold text-slate-900">Позиция #{entry.item.temp_id}</p>
                                                    <p className="mt-1 font-mono text-xs text-slate-500">
                                                        {entry.item.public_token || entry.item.id}
                                                    </p>
                                                </>
                                            ) : (
                                                <p>Системная операция без привязки к позиции.</p>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}

function MetricCard({
    title,
    value,
    note,
    icon,
    iconTone,
    valueTone,
}: {
    title: string;
    value: string;
    note: string;
    icon: ReactNode;
    iconTone: string;
    valueTone: string;
}) {
    return (
        <div className="ui-card p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-medium text-slate-500">{title}</p>
                    <p className={`mt-3 text-3xl font-bold tracking-tight ${valueTone}`}>{value}</p>
                </div>
                <div className={`rounded-2xl p-3 ${iconTone}`}>
                    {icon}
                </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">{note}</p>
        </div>
    );
}
