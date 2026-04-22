import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarRange, Download, Loader2, Percent, RefreshCw, Search, Wallet } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import { Button, EmptyState, MetricTile, Panel, Select, StatusPill, partnerControlClassName, type PartnerTone } from '../components/ui';

type LedgerEntry = {
    id: string;
    operation: string;
    amount: string;
    timestamp: string;
    item?: {
        id: string;
        temp_id: string;
        serial_number?: string | null;
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

const getAmountTextTone = (amount: number) => {
    if (amount > 0) return 'text-emerald-300';
    if (amount < 0) return 'text-red-300';
    return 'text-gray-300';
};

const getAmountPillTone = (amount: number): PartnerTone => {
    if (amount > 0) return 'emerald';
    if (amount < 0) return 'red';
    return 'muted';
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
            const serialNumber = entry.item?.serial_number?.toLowerCase() || '';

            return (
                label.includes(normalizedQuery)
                || entry.id.toLowerCase().includes(normalizedQuery)
                || itemTempId.includes(normalizedQuery)
                || serialNumber.includes(normalizedQuery)
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

        const header = 'timestamp,operation,operation_label,entry_id,item_temp_id,serial_number,amount';
        const rows = filteredTransactions.map((entry) => [
            csvEscape(entry.timestamp),
            csvEscape(entry.operation),
            csvEscape(getOperationLabel(entry.operation)),
            csvEscape(entry.id),
            csvEscape(entry.item?.temp_id),
            csvEscape(entry.item?.serial_number),
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
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="admin-chip w-fit">Financial Ledger</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="secondary" onClick={() => void loadData()} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Обновить
                    </Button>
                    <Button type="button" onClick={handleExportCsv} disabled={filteredTransactions.length === 0}>
                        <Download size={16} />
                        Скачать CSV
                    </Button>
                </div>
            </div>

            {error ? (
                <Panel className="border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                </Panel>
            ) : null}

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Panel className="overflow-hidden p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3 text-blue-100">
                            <Wallet size={22} />
                        </div>
                        <StatusPill label={profile?.name || 'Партнер'} tone="blue" />
                    </div>
                    <p className="mt-8 text-sm text-gray-500">Текущий баланс</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{formatRub(profile?.balance ?? '0')}</p>
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                        Последнее движение: {latestTimestamp ? formatDateTime(latestTimestamp) : 'пока нет операций'}
                    </p>
                </Panel>

                <MetricTile
                    title="Начислено"
                    value={formatRub(totals.income)}
                    note={`За период ${PERIOD_OPTIONS.find((option) => option.value === periodFilter)?.label.toLowerCase() || 'все время'}`}
                    icon={<ArrowDownLeft size={18} />}
                    tone="emerald"
                />
                <MetricTile
                    title="Списано"
                    value={formatRub(totals.expense)}
                    note="Роялти, выводы и корректировки"
                    icon={<ArrowUpRight size={18} />}
                    tone="red"
                />
                <MetricTile
                    title="Комиссия HQ"
                    value={formatCommission(profile?.commission_rate)}
                    note={`Операций в выборке: ${filteredTransactions.length}`}
                    icon={<Percent size={18} />}
                    tone="blue"
                />
            </section>

            <Panel className="p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_240px_minmax(260px,auto)] xl:items-end">
                    <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-gray-400">Поиск по item/серийнику/операции</span>
                        <span className="relative block">
                            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Например, RUSABC001234 или вывод"
                                className={`${partnerControlClassName} pl-10`}
                            />
                        </span>
                    </label>

                    <Select
                        label="Тип операции"
                        value={operationFilter}
                        onChange={(event) => setOperationFilter(event.target.value)}
                    >
                        {operationOptions.map((option) => (
                            <option key={option} value={option}>
                                {getOperationLabel(option)}
                            </option>
                        ))}
                    </Select>

                    <div>
                        <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-400">
                            <CalendarRange size={15} />
                            Период
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {PERIOD_OPTIONS.map((option) => {
                                const active = periodFilter === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setPeriodFilter(option.value)}
                                        className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${active
                                            ? 'border-blue-400/20 bg-blue-500/20 text-blue-100'
                                            : 'border-white/8 bg-white/[0.04] text-gray-400 hover:bg-white/[0.07] hover:text-white'
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5">Проводок: {filteredTransactions.length}</span>
                    <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5">Связано с позициями: {totals.itemLinked}</span>
                    <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5">Баланс сейчас: {formatRub(profile?.balance ?? '0')}</span>
                </div>
            </Panel>

            <Panel className="overflow-hidden">
                <div className="border-b border-white/6 px-5 py-4">
                    <h2 className="text-lg font-semibold text-white">История операций</h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Последние проводки с суммой, типом операции и связанной позицией.
                    </p>
                </div>

                {loading ? (
                    <EmptyState icon={<Loader2 size={18} className="animate-spin" />} title="Загрузка финансовых данных" />
                ) : null}

                {!loading && !error && filteredTransactions.length === 0 ? (
                    <EmptyState
                        icon={<Wallet size={18} />}
                        title="Проводки не найдены"
                        description="Измените фильтры или дождитесь новых движений по счету."
                    />
                ) : null}

                {!loading && !error && filteredTransactions.length > 0 ? (
                    <>
                        <div className="hidden overflow-x-auto xl:block">
                            <table className="w-full min-w-[980px] text-left">
                                <thead className="border-b border-white/6 bg-white/[0.03] text-xs uppercase tracking-wider text-gray-500">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">Дата</th>
                                        <th className="px-5 py-3 font-medium">Операция</th>
                                        <th className="px-5 py-3 font-medium">Связанный item</th>
                                        <th className="px-5 py-3 font-medium">ID проводки</th>
                                        <th className="px-5 py-3 text-right font-medium">Сумма</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/6">
                                    {filteredTransactions.map((entry) => {
                                        const amount = toAmount(entry.amount);
                                        return (
                                            <tr key={entry.id} className="transition hover:bg-white/[0.03]">
                                                <td className="px-5 py-4 text-sm text-gray-400">
                                                    {formatDateTime(entry.timestamp)}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="space-y-1">
                                                        <StatusPill
                                                            label={getOperationLabel(entry.operation)}
                                                            tone={getAmountPillTone(amount)}
                                                        />
                                                        <p className="text-xs text-gray-500">
                                                            {OPERATION_DESCRIPTIONS[entry.operation] || 'Операция по счету партнера.'}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-sm text-gray-300">
                                                    {entry.item ? (
                                                        <div>
                                                            <p className="font-semibold text-white">#{entry.item.temp_id}</p>
                                                            <p className="font-mono text-xs text-gray-500">
                                                                {entry.item.serial_number || entry.item.id}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-500">Системная операция</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 font-mono text-xs text-gray-500">
                                                    {entry.id}
                                                </td>
                                                <td className={`px-5 py-4 text-right text-sm font-semibold ${getAmountTextTone(amount)}`}>
                                                    {amount > 0 ? '+' : amount < 0 ? '-' : ''}{formatRub(Math.abs(amount))}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="divide-y divide-white/6 xl:hidden">
                            {filteredTransactions.map((entry) => {
                                const amount = toAmount(entry.amount);
                                return (
                                    <article key={entry.id} className="space-y-3 px-5 py-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-white">{getOperationLabel(entry.operation)}</p>
                                                <p className="mt-1 text-xs text-gray-500">{formatDateTime(entry.timestamp)}</p>
                                            </div>
                                            <StatusPill
                                                label={`${amount > 0 ? '+' : amount < 0 ? '-' : ''}${formatRub(Math.abs(amount))}`}
                                                tone={getAmountPillTone(amount)}
                                            />
                                        </div>

                                        <p className="text-sm leading-6 text-gray-400">
                                            {OPERATION_DESCRIPTIONS[entry.operation] || 'Операция по счету партнера.'}
                                        </p>

                                        <div className="rounded-2xl border border-white/6 bg-black/20 px-3 py-2 text-sm text-gray-300">
                                            {entry.item ? (
                                                <>
                                                    <p className="font-semibold text-white">Позиция #{entry.item.temp_id}</p>
                                                    <p className="mt-1 font-mono text-xs text-gray-500">
                                                        {entry.item.serial_number || entry.item.id}
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
                ) : null}
            </Panel>
        </div>
    );
}
