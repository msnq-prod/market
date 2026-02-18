import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { formatRub } from '../../utils/currency';

type LedgerEntry = {
    id: string;
    operation: string;
    amount: string;
    timestamp: string;
    item?: {
        id: string;
        temp_id: string;
    } | null;
};

type Profile = {
    name: string;
    balance: string;
};

export function Finance() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [operationFilter, setOperationFilter] = useState<string>('ALL');

    const loadData = async () => {
        setLoading(true);
        setError('');

        try {
            const token = localStorage.getItem('accessToken');
            const headers = { Authorization: `Bearer ${token}` };

            const [profileRes, ledgerRes] = await Promise.all([
                fetch('/api/financials/me', { headers }),
                fetch('/api/financials/ledger', { headers })
            ]);

            if (!profileRes.ok) throw new Error('Не удалось загрузить профиль');
            if (!ledgerRes.ok) throw new Error('Не удалось загрузить проводки');

            setProfile(await profileRes.json());
            setTransactions(await ledgerRes.json());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить финансовые данные');
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

    const filteredTransactions = useMemo(
        () => (operationFilter === 'ALL'
            ? transactions
            : transactions.filter((entry) => entry.operation === operationFilter)),
        [transactions, operationFilter]
    );

    const totals = useMemo(() => {
        return filteredTransactions.reduce(
            (acc, entry) => {
                const amount = Number(entry.amount);
                if (amount >= 0) acc.income += amount;
                else acc.expense += Math.abs(amount);
                return acc;
            },
            { income: 0, expense: 0 }
        );
    }, [filteredTransactions]);

    const operationLabel = (operation: string) => {
        if (operation === 'ALL') return 'Все';
        if (operation === 'ROYALTY_CHARGE') return 'Списание роялти';
        if (operation === 'SALES_PAYOUT') return 'Выплата с продажи';
        if (operation === 'WITHDRAWAL') return 'Вывод';
        if (operation === 'MANUAL_ADJ') return 'Ручная корректировка';
        return operation;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Финансовые отчёты</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Текущий баланс: <span className="font-semibold text-gray-900">{formatRub(profile?.balance ?? '0')}</span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void loadData()}
                        className="flex items-center gap-2 bg-white border border-gray-300 px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                        <RefreshCw size={18} />
                        Обновить
                    </button>
                    <button className="flex items-center gap-2 bg-white border border-gray-300 px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50">
                        <Download size={18} />
                        Скачать отчёт за месяц
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Записи</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{filteredTransactions.length}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Доход</p>
                    <p className="text-2xl font-semibold text-green-600 mt-1">+{formatRub(totals.income)}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Расход</p>
                    <p className="text-2xl font-semibold text-red-600 mt-1">-{formatRub(totals.expense)}</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
                    <h2 className="font-bold text-gray-800">История операций</h2>
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-500">Операция</label>
                        <select
                            value={operationFilter}
                            onChange={(e) => setOperationFilter(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        >
                            {operationOptions.map((option) => (
                                <option key={option} value={option}>
                                    {operationLabel(option)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 text-sm">
                        <tr>
                            <th className="p-4 font-medium">Дата</th>
                            <th className="p-4 font-medium">Описание</th>
                            <th className="p-4 font-medium">Тип</th>
                            <th className="p-4 font-medium text-right">Сумма</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-gray-500">Загрузка...</td>
                            </tr>
                        )}

                        {!loading && !error && filteredTransactions.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-gray-500">
                                    По выбранному фильтру операций не найдено.
                                </td>
                            </tr>
                        )}

                        {!loading && !error && filteredTransactions.map((entry) => (
                            <tr key={entry.id}>
                                <td className="p-4 text-sm text-gray-600">{new Date(entry.timestamp).toLocaleString('ru-RU')}</td>
                                <td className="p-4 text-sm text-gray-700">
                                    {entry.item?.temp_id ? `Позиция #${entry.item.temp_id}` : 'Системная операция'}
                                </td>
                                <td className="p-4 text-sm text-gray-700">{operationLabel(entry.operation)}</td>
                                <td className={`p-4 text-sm text-right font-semibold ${Number(entry.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {Number(entry.amount) >= 0 ? '+' : '-'}{formatRub(Math.abs(Number(entry.amount)))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
