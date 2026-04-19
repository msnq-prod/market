import { useEffect, useState, type FormEvent } from 'react';
import { MessageSquare, RefreshCw, User as UserIcon, UserPlus, X } from 'lucide-react';
import { formatRub } from '../../utils/currency';
import { authFetch } from '../../utils/authFetch';

type UserRole = 'ADMIN' | 'MANAGER' | 'SALES_MANAGER' | 'FRANCHISEE' | string;

type UserRow = {
    id: string;
    name: string;
    email: string | null;
    role: UserRole;
    balance?: string;
    telegram_chat_id?: string | null;
    telegram_username?: string | null;
    telegram_started_at?: string | null;
};

type CreateUserForm = {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'MANAGER' | 'SALES_MANAGER' | 'FRANCHISEE';
};

type TelegramForm = {
    userId: string;
    userName: string;
    chatId: string;
    username: string;
};

const initialCreateForm: CreateUserForm = {
    name: '',
    email: '',
    password: '',
    role: 'FRANCHISEE'
};

const initialTelegramForm: TelegramForm = {
    userId: '',
    userName: '',
    chatId: '',
    username: ''
};

const formatDateTime = (value?: string | null) => {
    if (!value) {
        return 'Нет данных';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

export function Users() {
    const currentRole = localStorage.getItem('userRole');
    const canCreateAdmin = currentRole === 'ADMIN';
    const canEditTelegram = currentRole === 'ADMIN';

    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createForm, setCreateForm] = useState<CreateUserForm>(initialCreateForm);

    const [isTelegramOpen, setIsTelegramOpen] = useState(false);
    const [savingTelegram, setSavingTelegram] = useState(false);
    const [telegramForm, setTelegramForm] = useState<TelegramForm>(initialTelegramForm);

    const fetchUsers = async () => {
        setLoading(true);
        setError('');

        try {
            const res = await authFetch('/api/users');
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось загрузить пользователей.');
            }

            const data = await res.json() as UserRow[];
            setUsers(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить пользователей.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchUsers();
    }, []);

    const handleCreateUser = async (event: FormEvent) => {
        event.preventDefault();
        setCreating(true);
        setError('');
        setNotice('');

        try {
            const res = await authFetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createForm)
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось создать пользователя.');
            }

            setIsCreateOpen(false);
            setCreateForm(initialCreateForm);
            setNotice('Пользователь создан.');
            await fetchUsers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось создать пользователя.');
        } finally {
            setCreating(false);
        }
    };

    const openTelegramModal = (user: UserRow) => {
        setError('');
        setNotice('');
        setTelegramForm({
            userId: user.id,
            userName: user.name,
            chatId: user.telegram_chat_id || '',
            username: user.telegram_username ? `@${user.telegram_username}` : ''
        });
        setIsTelegramOpen(true);
    };

    const handleSaveTelegram = async (event: FormEvent) => {
        event.preventDefault();
        if (!telegramForm.userId) {
            return;
        }

        setSavingTelegram(true);
        setError('');
        setNotice('');

        try {
            const res = await authFetch(`/api/users/${telegramForm.userId}/telegram`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_chat_id: telegramForm.chatId.trim() || null,
                    telegram_username: telegramForm.username.trim() || null
                })
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось сохранить Telegram-привязку.');
            }

            setIsTelegramOpen(false);
            setTelegramForm(initialTelegramForm);
            setNotice('Telegram-привязка сохранена.');
            await fetchUsers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось сохранить Telegram-привязку.');
        } finally {
            setSavingTelegram(false);
        }
    };

    const telegramColumn = (user: UserRow) => {
        if (!user.telegram_chat_id) {
            return (
                <div className="space-y-1">
                    <div className="text-sm text-gray-400">Не привязан</div>
                    <div className="text-xs text-gray-600">Пользователь должен отправить боту /start</div>
                </div>
            );
        }

        return (
            <div className="space-y-1">
                <div className="font-mono text-sm text-white">{user.telegram_chat_id}</div>
                <div className="text-xs text-gray-400">
                    {user.telegram_username ? `@${user.telegram_username}` : 'username не указан'}
                </div>
                <div className="text-xs text-gray-600">
                    start: {formatDateTime(user.telegram_started_at)}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">Управление пользователями</h1>
                    <p className="text-gray-500">Доступы, роли и ручная Telegram-привязка получателей уведомлений.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => void fetchUsers()}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
                    >
                        <RefreshCw size={16} />
                        Обновить
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCreateOpen(true)}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
                    >
                        <UserPlus size={18} />
                        Добавить пользователя
                    </button>
                </div>
            </header>

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            )}

            {notice && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    {notice}
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
                <table className="w-full text-left">
                    <thead className="bg-gray-800 text-xs uppercase tracking-wider text-gray-400">
                        <tr>
                            <th className="p-4">Пользователь</th>
                            <th className="p-4">Роль</th>
                            <th className="p-4">Баланс</th>
                            <th className="p-4">Telegram</th>
                            <th className="p-4">Статус</th>
                            {canEditTelegram && <th className="p-4 text-right">Действия</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading && (
                            <tr>
                                <td colSpan={canEditTelegram ? 6 : 5} className="p-8 text-center text-gray-500">
                                    Загрузка пользователей...
                                </td>
                            </tr>
                        )}

                        {!loading && users.length === 0 && (
                            <tr>
                                <td colSpan={canEditTelegram ? 6 : 5} className="p-8 text-center text-gray-500">
                                    Пользователи не найдены.
                                </td>
                            </tr>
                        )}

                        {!loading && users.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-800/50">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-full bg-gray-800 p-2">
                                            <UserIcon size={16} className="text-gray-400" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-white">{user.name}</div>
                                            <div className="text-xs text-gray-500">{user.email || 'email не указан'}</div>
                                            <div className="mt-1 font-mono text-[10px] text-gray-600">{user.id.slice(0, 8)}...</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`rounded px-2 py-1 text-xs font-bold ${roleColor(user.role)}`}>
                                        {roleLabel(user.role)}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-300">{formatRub(user.balance ?? '0')}</td>
                                <td className="p-4">{telegramColumn(user)}</td>
                                <td className="p-4">
                                    <span className="text-sm text-green-500">Активен</span>
                                </td>
                                {canEditTelegram && (
                                    <td className="p-4 text-right">
                                        <button
                                            type="button"
                                            onClick={() => openTelegramModal(user)}
                                            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800"
                                        >
                                            <MessageSquare size={16} />
                                            Telegram
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isCreateOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6">
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-white">Создать пользователя</h2>
                            <button type="button" onClick={() => setIsCreateOpen(false)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <form className="space-y-4" onSubmit={handleCreateUser}>
                            <div>
                                <label className="mb-1 block text-sm text-gray-400">Имя</label>
                                <input
                                    required
                                    value={createForm.name}
                                    onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                                    placeholder="Иван Иванов"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-gray-400">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={createForm.email}
                                    onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                                    placeholder="user@stones.com"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-gray-400">Пароль</label>
                                <input
                                    type="password"
                                    required
                                    minLength={12}
                                    value={createForm.password}
                                    onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-gray-400">Роль</label>
                                <select
                                    value={createForm.role}
                                    onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value as CreateUserForm['role'] }))}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                                >
                                    <option value="FRANCHISEE">ФРАНЧАЙЗИ</option>
                                    {canCreateAdmin && <option value="MANAGER">МЕНЕДЖЕР</option>}
                                    <option value="SALES_MANAGER">МЕНЕДЖЕР ПРОДАЖ</option>
                                    {canCreateAdmin && <option value="ADMIN">АДМИН</option>}
                                </select>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateOpen(false)}
                                    className="flex-1 rounded-lg border border-gray-700 px-4 py-2 text-gray-300 hover:bg-gray-800"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                                >
                                    {creating ? 'Создание...' : 'Создать'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isTelegramOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6">
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-white">Telegram-привязка</h2>
                                <p className="text-sm text-gray-500">{telegramForm.userName}</p>
                            </div>
                            <button type="button" onClick={() => setIsTelegramOpen(false)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <form className="space-y-4" onSubmit={handleSaveTelegram}>
                            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                                Сначала пользователь должен написать боту <span className="font-mono">/start</span>, после чего admin может перенести numeric <span className="font-mono">chat_id</span> из вкладки Telegram.
                            </div>

                            <div>
                                <label htmlFor="telegram-chat-id" className="mb-1 block text-sm text-gray-400">Telegram chat_id</label>
                                <input
                                    id="telegram-chat-id"
                                    value={telegramForm.chatId}
                                    onChange={(event) => setTelegramForm((current) => ({ ...current, chatId: event.target.value }))}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-white"
                                    placeholder="123456789 или -1001234567890"
                                />
                            </div>

                            <div>
                                <label htmlFor="telegram-username" className="mb-1 block text-sm text-gray-400">Telegram username</label>
                                <input
                                    id="telegram-username"
                                    value={telegramForm.username}
                                    onChange={(event) => setTelegramForm((current) => ({ ...current, username: event.target.value }))}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                                    placeholder="@partner_name"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsTelegramOpen(false)}
                                    className="flex-1 rounded-lg border border-gray-700 px-4 py-2 text-gray-300 hover:bg-gray-800"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingTelegram}
                                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                                >
                                    {savingTelegram ? 'Сохранение...' : 'Сохранить'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function roleColor(role: string) {
    if (role === 'ADMIN') return 'bg-purple-900/50 text-purple-400';
    if (role === 'MANAGER') return 'bg-cyan-900/50 text-cyan-400';
    if (role === 'SALES_MANAGER') return 'bg-orange-900/50 text-orange-300';
    if (role === 'FRANCHISEE') return 'bg-blue-900/50 text-blue-400';
    return 'bg-gray-700 text-gray-300';
}

function roleLabel(role: string) {
    if (role === 'ADMIN') return 'АДМИН';
    if (role === 'MANAGER') return 'МЕНЕДЖЕР';
    if (role === 'SALES_MANAGER') return 'ПРОДАЖИ';
    if (role === 'FRANCHISEE') return 'ПАРТНЕР';
    return role;
}
