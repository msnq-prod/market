import { useEffect, useState } from 'react';
import { UserPlus, User as UserIcon, RefreshCw, X } from 'lucide-react';
import { formatRub } from '../../utils/currency';
import { authFetch } from '../../utils/authFetch';

type UserRow = {
    id: string;
    name: string;
    email: string | null;
    role: 'ADMIN' | 'MANAGER' | 'SALES_MANAGER' | 'FRANCHISEE' | string;
    balance?: string;
};

type CreateUserForm = {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'MANAGER' | 'SALES_MANAGER' | 'FRANCHISEE';
};

const initialForm: CreateUserForm = {
    name: '',
    email: '',
    password: '',
    role: 'FRANCHISEE',
};

export function Users() {
    const currentRole = localStorage.getItem('userRole');
    const canCreateAdmin = currentRole === 'ADMIN';
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState<CreateUserForm>(initialForm);

    const fetchUsers = async () => {
        setLoading(true);
        setError('');

        try {
            const res = await authFetch('/api/users');

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось загрузить пользователей');
            }

            const data = await res.json();
            setUsers(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить пользователей');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchUsers();
    }, []);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError('');

        try {
            const res = await authFetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось создать пользователя');
            }

            setIsCreateOpen(false);
            setForm(initialForm);
            await fetchUsers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось создать пользователя');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap gap-3 justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Управление пользователями</h1>
                    <p className="text-gray-500">Управляйте доступами и франчайзи.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => void fetchUsers()}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                    >
                        <RefreshCw size={16} /> Обновить
                    </button>
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                    >
                        <UserPlus size={18} /> Добавить пользователя
                    </button>
                </div>
            </header>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3">
                    {error}
                </div>
            )}

            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="p-4">Пользователь</th>
                            <th className="p-4">Роль</th>
                            <th className="p-4">Баланс</th>
                            <th className="p-4">Статус</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-gray-500">Загрузка пользователей...</td>
                            </tr>
                        )}

                        {!loading && users.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-gray-500">Пользователи не найдены.</td>
                            </tr>
                        )}

                        {!loading && users.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-800/50">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gray-800 rounded-full"><UserIcon size={16} className="text-gray-400" /></div>
                                        <div>
                                            <div className="text-white font-medium">{user.name}</div>
                                            <div className="text-xs text-gray-500">{user.email || 'email не указан'}</div>
                                            <div className="text-[10px] text-gray-600 font-mono mt-1">{user.id.slice(0, 8)}...</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${roleColor(user.role)}`}>{roleLabel(user.role)}</span>
                                </td>
                                <td className="p-4 text-gray-300">{formatRub(user.balance ?? '0')}</td>
                                <td className="p-4"><span className="text-green-500 text-sm">Активен</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isCreateOpen && (
                <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-xl font-semibold text-white">Создать пользователя</h2>
                            <button onClick={() => setIsCreateOpen(false)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <form className="space-y-4" onSubmit={handleCreateUser}>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Имя</label>
                                <input
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                                    placeholder="Иван Иванов"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                                    placeholder="user@stones.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Пароль</label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Роль</label>
                                <select
                                    value={form.role}
                                    onChange={(e) => setForm({ ...form, role: e.target.value as CreateUserForm['role'] })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                                >
                                    <option value="FRANCHISEE">ФРАНЧАЙЗИ</option>
                                    {canCreateAdmin && <option value="MANAGER">МЕНЕДЖЕР</option>}
                                    <option value="SALES_MANAGER">МЕНЕДЖЕР ПРОДАЖ</option>
                                    {canCreateAdmin && <option value="ADMIN">АДМИН</option>}
                                </select>
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateOpen(false)}
                                    className="flex-1 border border-gray-700 rounded-lg px-4 py-2 text-gray-300 hover:bg-gray-800"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded-lg px-4 py-2 text-white font-medium"
                                >
                                    {creating ? 'Создание...' : 'Создать'}
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
    if (role === 'FRANCHISEE') return 'ФРАНЧАЙЗИ';
    return role;
}
