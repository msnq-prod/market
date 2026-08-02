import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { MessageSquare, RefreshCw, User as UserIcon, UserPlus, X } from 'lucide-react';
import { formatRub } from '../../utils/currency';
import { authFetch } from '../../utils/authFetch';
import { isAdminRole } from '../../../shared/domain/policy';
import type { UserRole as DomainUserRole } from '../../../shared/domain/policy';
import {
    AdminAction,
    AdminInlineError,
    AdminSearchField,
    AdminSelect,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState,
    adminFieldClassName
} from '../components/AdminWorkspaceUI';

type UserRole = DomainUserRole | string;

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

type RoleFilter = 'ALL' | 'ADMIN' | 'MANAGER' | 'SALES_MANAGER' | 'FRANCHISEE';

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

const roleFilters: Array<{ value: RoleFilter; label: string }> = [
    { value: 'ALL', label: 'Все роли' },
    { value: 'ADMIN', label: 'Админы' },
    { value: 'MANAGER', label: 'Менеджеры HQ' },
    { value: 'SALES_MANAGER', label: 'Продажи' },
    { value: 'FRANCHISEE', label: 'Партнёры' }
];

const formatDateTime = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
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
    const canCreateAdmin = isAdminRole(currentRole);
    const canEditTelegram = isAdminRole(currentRole);

    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

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
            const response = await authFetch('/api/users');
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось загрузить пользователей.');
            }
            setUsers(await response.json() as UserRow[]);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить пользователей.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchUsers();
    }, []);

    const filteredUsers = useMemo(() => {
        const query = searchQuery.trim().toLocaleLowerCase('ru');
        return users.filter((user) => {
            if (roleFilter !== 'ALL' && user.role !== roleFilter) return false;
            if (!query) return true;
            return [user.name, user.email || '', user.telegram_username || '', user.telegram_chat_id || '']
                .some((value) => value.toLocaleLowerCase('ru').includes(query));
        });
    }, [roleFilter, searchQuery, users]);

    const handleCreateUser = async (event: FormEvent) => {
        event.preventDefault();
        setCreating(true);
        setError('');
        setNotice('');

        try {
            const response = await authFetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createForm)
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось создать пользователя.');
            }
            setIsCreateOpen(false);
            setCreateForm(initialCreateForm);
            setNotice('Пользователь создан.');
            await fetchUsers();
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : 'Не удалось создать пользователя.');
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
        if (!telegramForm.userId) return;
        setSavingTelegram(true);
        setError('');
        setNotice('');

        try {
            const response = await authFetch(`/api/users/${telegramForm.userId}/telegram`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_chat_id: telegramForm.chatId.trim() || null,
                    telegram_username: telegramForm.username.trim() || null
                })
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось сохранить Telegram-привязку.');
            }
            setIsTelegramOpen(false);
            setTelegramForm(initialTelegramForm);
            setNotice('Telegram-привязка сохранена.');
            await fetchUsers();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить Telegram-привязку.');
        } finally {
            setSavingTelegram(false);
        }
    };

    return (
        <AdminWorkspace data-testid="users-workspace">
            <AdminWorkspaceHeader title="Пользователи" count={`Найдено: ${filteredUsers.length}`}>
                <AdminSearchField
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Имя, email или Telegram"
                    ariaLabel="Поиск пользователей"
                    className="ml-auto w-full max-w-[420px]"
                />
                <AdminSelect
                    label="Роль"
                    value={roleFilter}
                    onChange={(value) => setRoleFilter(value as RoleFilter)}
                    options={roleFilters}
                    className="w-[170px]"
                />
                <AdminAction tone="secondary" onClick={() => void fetchUsers()} aria-label="Обновить пользователей" className="h-11 w-11 px-0">
                    <RefreshCw size={16} />
                </AdminAction>
                <AdminAction onClick={() => setIsCreateOpen(true)} className="h-11 shrink-0">
                    <UserPlus size={16} />
                    Добавить
                </AdminAction>
            </AdminWorkspaceHeader>

            {error ? <AdminInlineError>{error}</AdminInlineError> : null}
            {notice ? (
                <div className="rounded-lg border border-[#1fa65a]/50 bg-[#10251b] px-4 py-2.5 text-sm text-[#73e9a3]">{notice}</div>
            ) : null}

            <AdminTableSurface minWidth={980}>
                <table className="w-full border-collapse text-left" data-testid="users-table">
                    <thead className="bg-[#10151b] text-[12px] font-medium text-[#8f98a4]">
                        <tr className="h-12 border-b border-[#2a3039]">
                            <th className="px-4 font-medium">Пользователь</th>
                            <th className="px-4 font-medium">Роль</th>
                            <th className="px-4 font-medium">Баланс</th>
                            <th className="px-4 font-medium">Telegram</th>
                            {canEditTelegram ? <th className="px-4 text-right font-medium">Действие</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={canEditTelegram ? 5 : 4}><AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState></td></tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr><td colSpan={canEditTelegram ? 5 : 4}><AdminWorkspaceState state="empty">Пользователи не найдены</AdminWorkspaceState></td></tr>
                        ) : filteredUsers.map((user) => (
                            <tr key={user.id} data-testid={`user-row-${user.id}`} className="h-[70px] border-b border-[#272d35] bg-[#141a21] text-[13px] last:border-b-0 hover:bg-[#171e26]">
                                <td className="px-4">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#303842] bg-[#1b222b] text-[#c8d0d9]"><UserIcon size={16} /></span>
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-[#eef2f6]">{user.name}</div>
                                            <div className="mt-0.5 truncate text-[12px] text-[#7f8895]">{user.email || 'Email не указан'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4"><AdminStatus label={roleLabel(user.role)} tone={roleTone(user.role)} /></td>
                                <td className="px-4 tabular-nums text-[#d9dee4]">{formatRub(user.balance ?? '0')}</td>
                                <td className="px-4">{telegramCell(user)}</td>
                                {canEditTelegram ? (
                                    <td className="px-4 text-right">
                                        <AdminAction tone="secondary" onClick={() => openTelegramModal(user)}>
                                            <MessageSquare size={15} />
                                            Telegram
                                        </AdminAction>
                                    </td>
                                ) : null}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </AdminTableSurface>

            {isCreateOpen ? (
                <AdminModal title="Создать пользователя" onClose={() => setIsCreateOpen(false)}>
                    <form className="space-y-4" onSubmit={handleCreateUser} data-testid="create-user-form">
                        <Field label="Имя">
                            <input required value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} className={`${adminFieldClassName} w-full px-3`} autoFocus />
                        </Field>
                        <Field label="Email">
                            <input type="email" required value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} className={`${adminFieldClassName} w-full px-3`} />
                        </Field>
                        <Field label="Пароль">
                            <input type="password" required minLength={8} value={createForm.password} onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))} className={`${adminFieldClassName} w-full px-3`} />
                        </Field>
                        <Field label="Роль">
                            <select value={createForm.role} onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value as CreateUserForm['role'] }))} className={`${adminFieldClassName} w-full px-3`}>
                                <option value="FRANCHISEE">Партнёр</option>
                                {canCreateAdmin ? <option value="MANAGER">Менеджер HQ</option> : null}
                                <option value="SALES_MANAGER">Менеджер продаж</option>
                                {canCreateAdmin ? <option value="ADMIN">Администратор</option> : null}
                            </select>
                        </Field>
                        <ModalActions onCancel={() => setIsCreateOpen(false)} loading={creating} submitLabel="Создать" loadingLabel="Создаём…" />
                    </form>
                </AdminModal>
            ) : null}

            {isTelegramOpen ? (
                <AdminModal title={`Telegram · ${telegramForm.userName}`} onClose={() => setIsTelegramOpen(false)}>
                    <form className="space-y-4" onSubmit={handleSaveTelegram} data-testid="telegram-user-form">
                        <Field label="Chat ID">
                            <input value={telegramForm.chatId} onChange={(event) => setTelegramForm((current) => ({ ...current, chatId: event.target.value }))} className={`${adminFieldClassName} w-full px-3 font-mono`} autoFocus />
                        </Field>
                        <Field label="Username">
                            <input value={telegramForm.username} onChange={(event) => setTelegramForm((current) => ({ ...current, username: event.target.value }))} className={`${adminFieldClassName} w-full px-3`} placeholder="@username" />
                        </Field>
                        <ModalActions onCancel={() => setIsTelegramOpen(false)} loading={savingTelegram} submitLabel="Сохранить" loadingLabel="Сохраняем…" />
                    </form>
                </AdminModal>
            ) : null}
        </AdminWorkspace>
    );
}

function telegramCell(user: UserRow) {
    if (!user.telegram_chat_id) return <span className="text-[#7f8895]">Не привязан</span>;
    return (
        <div className="min-w-0">
            <div className="truncate font-mono text-[12px] text-[#e1e5e9]">{user.telegram_chat_id}</div>
            <div className="mt-0.5 truncate text-[11px] text-[#7f8895]">
                {[user.telegram_username ? `@${user.telegram_username}` : '', formatDateTime(user.telegram_started_at)].filter(Boolean).join(' · ')}
            </div>
        </div>
    );
}

function AdminModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={onClose}>
            <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-lg border border-[#2a3039] bg-[#11161d] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                <header className="flex min-h-16 items-center justify-between border-b border-[#2a3039] px-5">
                    <h2 className="text-lg font-semibold text-[#f3f6f8]">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Закрыть" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#303842] bg-[#181e26] text-[#a8b0ba] hover:text-white"><X size={17} /></button>
                </header>
                <div className="p-5">{children}</div>
            </section>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-[#9aa3ae]">{label}</span>
            {children}
        </label>
    );
}

function ModalActions({
    onCancel,
    loading,
    submitLabel,
    loadingLabel
}: {
    onCancel: () => void;
    loading: boolean;
    submitLabel: string;
    loadingLabel: string;
}) {
    return (
        <div className="flex justify-end gap-2 border-t border-[#2a3039] pt-4">
            <AdminAction tone="secondary" onClick={onCancel}>Отмена</AdminAction>
            <AdminAction type="submit" disabled={loading}>{loading ? loadingLabel : submitLabel}</AdminAction>
        </div>
    );
}

function roleTone(role: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    if (role === 'ADMIN') return 'danger';
    if (role === 'MANAGER') return 'info';
    if (role === 'SALES_MANAGER') return 'warning';
    return 'neutral';
}

function roleLabel(role: string) {
    return {
        ADMIN: 'Администратор',
        MANAGER: 'Менеджер HQ',
        SALES_MANAGER: 'Продажи',
        FRANCHISEE: 'Партнёр',
        USER: 'Покупатель'
    }[role] || role;
}
