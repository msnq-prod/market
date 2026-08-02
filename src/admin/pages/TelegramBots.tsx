import { useEffect, useState } from 'react';
import { useBeforeUnload, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Copy, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import {
    AdminAction,
    AdminInlineError,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState,
    adminFieldClassName
} from '../components/AdminWorkspaceUI';
import {
    TELEGRAM_EVENT_GROUPS,
    buildDefaultTelegramEventSettings,
    type TelegramEventSettings
} from './telegramBotsConfig';

type TelegramBotRecord = {
    id: string;
    name: string;
    bot_username: string | null;
    notify_admin: boolean;
    notify_sales_manager: boolean;
    notify_franchisee: boolean;
    event_settings: TelegramEventSettings;
    manual_recipients: string[];
    manual_recipients_text: string;
    low_stock_threshold: number;
    has_token: boolean;
    created_at: string;
    updated_at: string;
    token: string;
};

type TelegramBotContact = {
    id: string;
    chat_id: string;
    chat_type: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    started_at: string | null;
    last_seen_at: string;
};

type TokenValidationState = {
    status: 'idle' | 'loading' | 'success' | 'error';
    message: string;
};

type TelegramWorkspaceView = 'bots' | 'recipients' | 'events' | 'chats' | 'test';

const telegramViewMeta: Record<TelegramWorkspaceView, { label: string }> = {
    bots: { label: 'Боты' },
    recipients: { label: 'Получатели' },
    events: { label: 'События' },
    chats: { label: 'Чаты' },
    test: { label: 'Тест' }
};

const mapBot = (bot: Omit<TelegramBotRecord, 'manual_recipients_text' | 'token'>): TelegramBotRecord => ({
    ...bot,
    event_settings: {
        ...buildDefaultTelegramEventSettings(),
        ...bot.event_settings
    },
    manual_recipients_text: bot.manual_recipients.join('\n'),
    token: ''
});

const ROLE_TOGGLES = [
    {
        key: 'notify_admin',
        label: 'Администратор',
        description: 'Получает все системные события этого бота.'
    },
    {
        key: 'notify_sales_manager',
        label: 'Менеджер по продажам',
        description: 'Получает продажи и остальные включенные системные события.'
    },
    {
        key: 'notify_franchisee',
        label: 'Партнер',
        description: 'Получает только партнерские события по своим заявкам и партиям.'
    }
] as const;

const EMPTY_VALIDATION: TokenValidationState = {
    status: 'idle',
    message: ''
};

const formatDateTime = (value?: string | null) => {
    if (!value) return 'Нет данных';
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

const buildChatLabel = (chat: TelegramBotContact) => {
    const fullName = [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim();
    if (chat.username) {
        return `@${chat.username}`;
    }
    if (fullName) {
        return fullName;
    }
    return chat.chat_type;
};

const normalizeRecipients = (value: string) => value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n');

const serializeBotDraft = (bot: TelegramBotRecord) => {
    const eventSettings = {} as TelegramEventSettings;
    for (const group of TELEGRAM_EVENT_GROUPS) {
        for (const event of group.events) {
            eventSettings[event.key] = Boolean(bot.event_settings[event.key]);
        }
    }

    return JSON.stringify({
        name: bot.name.trim(),
        bot_username: bot.bot_username || '',
        notify_admin: bot.notify_admin,
        notify_sales_manager: bot.notify_sales_manager,
        notify_franchisee: bot.notify_franchisee,
        manual_recipients_text: normalizeRecipients(bot.manual_recipients_text),
        low_stock_threshold: Number(bot.low_stock_threshold || 0),
        token: bot.token.trim(),
        event_settings: eventSettings
    });
};

const getValidationTone = (state: TokenValidationState) => {
    if (state.status === 'success') {
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
    }
    if (state.status === 'error') {
        return 'border-red-500/30 bg-red-500/10 text-red-100';
    }
    return 'border-gray-800 bg-gray-950/70 text-gray-300';
};

const telegramViewRoutes: Record<TelegramWorkspaceView, string> = {
    bots: '/admin/telegram',
    recipients: '/admin/telegram/recipients',
    events: '/admin/telegram/events',
    chats: '/admin/telegram/chats',
    test: '/admin/telegram/test'
};

export const TelegramBots = TelegramBotsWorkspace;
export const TelegramRecipientsWorkspace = TelegramBotsWorkspace;
export const TelegramEventsWorkspace = TelegramBotsWorkspace;
export const TelegramChatsWorkspace = TelegramBotsWorkspace;
export const TelegramTestWorkspace = TelegramBotsWorkspace;

function TelegramBotsWorkspace() {
    const navigate = useNavigate();
    const location = useLocation();
    const telegramView = pathToTelegramView(location.pathname);
    const [bots, setBots] = useState<TelegramBotRecord[]>([]);
    const [savedBotsById, setSavedBotsById] = useState<Record<string, TelegramBotRecord>>({});
    const [activeBotId, setActiveBotId] = useState<string | null>(null);
    const [recentChatsByBot, setRecentChatsByBot] = useState<Record<string, TelegramBotContact[]>>({});
    const [tokenValidationByBot, setTokenValidationByBot] = useState<Record<string, TokenValidationState>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [loadingChats, setLoadingChats] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const activeBot = bots.find((bot) => bot.id === activeBotId) || null;
    const recentChats = activeBotId ? (recentChatsByBot[activeBotId] || []) : [];
    const tokenValidation = activeBotId ? (tokenValidationByBot[activeBotId] || EMPTY_VALIDATION) : EMPTY_VALIDATION;

    const isBotDirty = (bot: TelegramBotRecord) => {
        const baseline = savedBotsById[bot.id];
        if (!baseline) {
            return false;
        }
        return serializeBotDraft(bot) !== serializeBotDraft(baseline);
    };

    const dirtyBotIds = new Set(bots.filter((bot) => isBotDirty(bot)).map((bot) => bot.id));
    const hasUnsavedChanges = dirtyBotIds.size > 0;
    const activeBotDirty = activeBot ? dirtyBotIds.has(activeBot.id) : false;

    useBeforeUnload((event) => {
        if (!hasUnsavedChanges) {
            return;
        }

        event.preventDefault();
        event.returnValue = '';
    });

    useEffect(() => {
        if (!hasUnsavedChanges) {
            return;
        }

        const handleDocumentClick = (event: MouseEvent) => {
            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return;
            }

            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            const anchor = target.closest('a[href]');
            if (!(anchor instanceof HTMLAnchorElement)) {
                return;
            }

            if (anchor.target === '_blank' || anchor.hasAttribute('download')) {
                return;
            }

            const href = anchor.getAttribute('href');
            if (!href || href.startsWith('#')) {
                return;
            }

            const nextUrl = new URL(anchor.href, window.location.href);
            const currentUrl = new URL(window.location.href);
            if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search && nextUrl.hash === currentUrl.hash) {
                return;
            }

            const confirmed = window.confirm('Есть несохраненные изменения. Уйти со страницы без сохранения?');
            if (confirmed) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        };

        document.addEventListener('click', handleDocumentClick, true);
        return () => {
            document.removeEventListener('click', handleDocumentClick, true);
        };
    }, [hasUnsavedChanges]);

    const setTokenValidation = (botId: string, next: TokenValidationState) => {
        setTokenValidationByBot((current) => ({
            ...current,
            [botId]: next
        }));
    };

    const fetchBots = async (mode: 'initial' | 'refresh' = 'initial') => {
        if (mode === 'initial') {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        setError('');

        try {
            const res = await authFetch('/api/telegram/bots');
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось загрузить Telegram-ботов.');
            }

            const payload = await res.json() as Array<Omit<TelegramBotRecord, 'manual_recipients_text' | 'token'>>;
            const nextBots = payload.map(mapBot);
            setBots(nextBots);
            setSavedBotsById(Object.fromEntries(nextBots.map((bot) => [bot.id, bot])));
            setTokenValidationByBot((current) => {
                const nextEntries = nextBots.map((bot) => [bot.id, current[bot.id] || EMPTY_VALIDATION] as const);
                return Object.fromEntries(nextEntries);
            });
            setActiveBotId((current) => {
                if (current && nextBots.some((bot) => bot.id === current)) {
                    return current;
                }
                return nextBots[0]?.id || null;
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить Telegram-ботов.');
        } finally {
            if (mode === 'initial') {
                setLoading(false);
            } else {
                setRefreshing(false);
            }
        }
    };

    const loadRecentChats = async (botId: string) => {
        setLoadingChats(true);
        try {
            const res = await authFetch(`/api/telegram/bots/${botId}/recent-chats`);
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось загрузить недавние чаты.');
            }

            const payload = await res.json() as TelegramBotContact[];
            setRecentChatsByBot((current) => ({
                ...current,
                [botId]: payload
            }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить недавние чаты.');
        } finally {
            setLoadingChats(false);
        }
    };

    useEffect(() => {
        void fetchBots();
    }, []);

    useEffect(() => {
        if (!activeBotId) {
            return;
        }

        void loadRecentChats(activeBotId);
    }, [activeBotId]);

    const patchActiveBot = (patch: Partial<TelegramBotRecord>, options?: { resetValidation?: boolean }) => {
        if (!activeBotId) {
            return;
        }

        setBots((current) => current.map((bot) => bot.id === activeBotId ? { ...bot, ...patch } : bot));
        if (options?.resetValidation) {
            setTokenValidation(activeBotId, EMPTY_VALIDATION);
        }
    };

    const handleSelectBot = (botId: string) => {
        if (botId === activeBotId) {
            return;
        }

        if (activeBot && activeBotDirty) {
            const confirmed = window.confirm('Есть несохраненные изменения. Переключить бота без сохранения?');
            if (!confirmed) {
                return;
            }
        }

        setActiveBotId(botId);
        setError('');
        setNotice('');
    };

    const handleCreateBot = async () => {
        setCreating(true);
        setError('');
        setNotice('');

        try {
            const res = await authFetch('/api/telegram/bots', {
                method: 'POST'
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось создать Telegram-бота.');
            }

            const payload = await res.json() as Omit<TelegramBotRecord, 'manual_recipients_text' | 'token'>;
            const createdBot = mapBot(payload);
            setBots((current) => [...current, createdBot]);
            setSavedBotsById((current) => ({
                ...current,
                [createdBot.id]: createdBot
            }));
            setTokenValidation(createdBot.id, EMPTY_VALIDATION);
            setActiveBotId(createdBot.id);
            setNotice('Создан новый бот. Заполните токен и выберите получателей уведомлений.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось создать Telegram-бота.');
        } finally {
            setCreating(false);
        }
    };

    const handleResetActiveBot = () => {
        if (!activeBot) {
            return;
        }

        const baseline = savedBotsById[activeBot.id];
        if (!baseline) {
            return;
        }

        setBots((current) => current.map((bot) => bot.id === activeBot.id ? { ...baseline } : bot));
        setTokenValidation(activeBot.id, EMPTY_VALIDATION);
        setNotice('Изменения сброшены к последнему сохраненному состоянию.');
        setError('');
    };

    const handleRefresh = async () => {
        if (hasUnsavedChanges) {
            const confirmed = window.confirm('Обновление сбросит несохраненные изменения. Продолжить?');
            if (!confirmed) {
                return;
            }
        }

        setNotice('');
        await fetchBots('refresh');
    };

    const handleSaveBot = async () => {
        if (!activeBot) {
            return;
        }

        setSaving(true);
        setError('');
        setNotice('');

        try {
            const res = await authFetch(`/api/telegram/bots/${activeBot.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: activeBot.name,
                    token: activeBot.token,
                    notify_admin: activeBot.notify_admin,
                    notify_sales_manager: activeBot.notify_sales_manager,
                    notify_franchisee: activeBot.notify_franchisee,
                    event_settings: activeBot.event_settings,
                    manual_recipients: activeBot.manual_recipients_text,
                    low_stock_threshold: activeBot.low_stock_threshold
                })
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось сохранить Telegram-бота.');
            }

            const payload = await res.json() as Omit<TelegramBotRecord, 'manual_recipients_text' | 'token'>;
            const savedBot = mapBot(payload);
            setBots((current) => current.map((bot) => bot.id === savedBot.id ? savedBot : bot));
            setSavedBotsById((current) => ({
                ...current,
                [savedBot.id]: savedBot
            }));
            setTokenValidation(savedBot.id, savedBot.bot_username
                ? { status: 'success', message: `Токен валиден. Имя бота: @${savedBot.bot_username}` }
                : EMPTY_VALIDATION);
            setNotice('Настройки Telegram-бота сохранены.');
            await loadRecentChats(savedBot.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось сохранить Telegram-бота.');
        } finally {
            setSaving(false);
        }
    };

    const handleValidateBot = async () => {
        if (!activeBot) {
            return;
        }

        setError('');
        setNotice('');
        setTokenValidation(activeBot.id, {
            status: 'loading',
            message: 'Проверка токена…'
        });

        try {
            const res = await authFetch(`/api/telegram/bots/${activeBot.id}/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(activeBot.token.trim() ? { token: activeBot.token.trim() } : {})
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось проверить Telegram токен.');
            }

            const payload = await res.json() as { username?: string | null };
            patchActiveBot({
                bot_username: payload.username || activeBot.bot_username
            });
            setTokenValidation(activeBot.id, {
                status: 'success',
                message: payload.username
                    ? `Токен валиден. Имя бота: @${payload.username}`
                    : 'Токен валиден.'
            });
        } catch (err) {
            setTokenValidation(activeBot.id, {
                status: 'error',
                message: err instanceof Error ? err.message : 'Не удалось проверить Telegram токен.'
            });
        }
    };

    const handleDeleteBot = async () => {
        if (!activeBot) {
            return;
        }

        const confirmed = window.confirm(`Удалить бота «${activeBot.name}»? Очередь уведомлений этого бота тоже будет удалена.`);
        if (!confirmed) {
            return;
        }

        setDeleting(true);
        setError('');
        setNotice('');

        try {
            const res = await authFetch(`/api/telegram/bots/${activeBot.id}`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось удалить Telegram-бота.');
            }

            setBots((current) => {
                const next = current.filter((bot) => bot.id !== activeBot.id);
                setActiveBotId(next[0]?.id || null);
                return next;
            });
            setSavedBotsById((current) => {
                const next = { ...current };
                delete next[activeBot.id];
                return next;
            });
            setTokenValidationByBot((current) => {
                const next = { ...current };
                delete next[activeBot.id];
                return next;
            });
            setRecentChatsByBot((current) => {
                const next = { ...current };
                delete next[activeBot.id];
                return next;
            });
            setNotice('Telegram-бот удален.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось удалить Telegram-бота.');
        } finally {
            setDeleting(false);
        }
    };

    const handleCopyChatId = async (chatId: string) => {
        try {
            await navigator.clipboard.writeText(chatId);
            setNotice(`chat_id ${chatId} скопирован.`);
            setError('');
        } catch {
            setError('Не удалось скопировать chat_id.');
        }
    };

    const handleToggleRole = (key: keyof Pick<TelegramBotRecord, 'notify_admin' | 'notify_sales_manager' | 'notify_franchisee'>) => {
        if (!activeBot) {
            return;
        }

        patchActiveBot({ [key]: !activeBot[key] } as Partial<TelegramBotRecord>);
    };

    const handleToggleEvent = (eventKey: keyof TelegramEventSettings) => {
        if (!activeBot) {
            return;
        }

        patchActiveBot({
            event_settings: {
                ...activeBot.event_settings,
                [eventKey]: !activeBot.event_settings[eventKey]
            }
        });
    };

    const handleSetGroupEvents = (groupKey: string, enabled: boolean) => {
        if (!activeBot) {
            return;
        }

        const group = TELEGRAM_EVENT_GROUPS.find((item) => item.key === groupKey);
        if (!group) {
            return;
        }

        const nextSettings = { ...activeBot.event_settings };
        for (const event of group.events) {
            nextSettings[event.key] = enabled;
        }

        patchActiveBot({ event_settings: nextSettings });
    };

    const setTelegramView = (nextView: TelegramWorkspaceView) => {
        navigate(telegramViewRoutes[nextView]);
    };

    return (
        <AdminWorkspace data-testid="telegram-workspace" className="pb-24">
            <AdminWorkspaceHeader title="Telegram">
                <div className="ml-auto flex min-w-0 items-center gap-2">
                    <label className="relative min-w-[220px] max-w-[360px] flex-1">
                        <span className="sr-only">Активный бот</span>
                        <select
                            aria-label="Активный бот"
                            value={activeBotId || ''}
                            onChange={(event) => handleSelectBot(event.target.value)}
                            disabled={loading || bots.length === 0}
                            className={adminFieldClassName + ' w-full truncate px-3'}
                        >
                            {bots.length === 0 ? <option value="">Нет ботов</option> : null}
                            {bots.map((bot) => (
                                <option key={bot.id} value={bot.id}>
                                    {bot.name + (dirtyBotIds.has(bot.id) ? ' • изменён' : '')}
                                </option>
                            ))}
                        </select>
                    </label>
                    <AdminAction
                        onClick={() => void handleCreateBot()}
                        disabled={creating}
                        className="shrink-0"
                    >
                        <Plus size={15} aria-hidden="true" />
                        {creating ? 'Создание…' : 'Новый бот'}
                    </AdminAction>
                    <AdminAction
                        tone="secondary"
                        onClick={() => void handleRefresh()}
                        disabled={refreshing}
                        className="shrink-0"
                    >
                        <RefreshCw
                            size={15}
                            className={refreshing ? 'animate-spin' : ''}
                            aria-hidden="true"
                        />
                        {refreshing ? 'Обновление…' : 'Обновить'}
                    </AdminAction>
                </div>
            </AdminWorkspaceHeader>

            <nav
                aria-label="Разделы Telegram"
                className="flex min-w-0 gap-1 overflow-x-auto border-b border-[#2a3039]"
            >
                {(Object.keys(telegramViewMeta) as TelegramWorkspaceView[]).map((view) => {
                    const selected = telegramView === view;
                    return (
                        <button
                            key={view}
                            type="button"
                            onClick={() => setTelegramView(view)}
                            aria-current={selected ? 'page' : undefined}
                            className={
                                selected
                                    ? 'min-h-10 shrink-0 border-b-2 border-[#5ca0f4] px-4 text-[13px] font-medium text-[#8bc2ff]'
                                    : 'min-h-10 shrink-0 border-b-2 border-transparent px-4 text-[13px] font-medium text-[#8c95a1] transition hover:text-[#e7ebef]'
                            }
                        >
                            {telegramViewMeta[view].label}
                        </button>
                    );
                })}
            </nav>

            {error ? <AdminInlineError>{error}</AdminInlineError> : null}
            {notice ? (
                <div
                    aria-live="polite"
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-100"
                >
                    {notice}
                </div>
            ) : null}

            {loading ? (
                <AdminTableSurface>
                    <AdminWorkspaceState state="loading">Загрузка Telegram…</AdminWorkspaceState>
                </AdminTableSurface>
            ) : !activeBot ? (
                <AdminTableSurface>
                    <AdminWorkspaceState state="empty">Нет созданных ботов.</AdminWorkspaceState>
                </AdminTableSurface>
            ) : (
                <>
                    <div data-testid={'telegram-' + telegramView + '-view'}>
                        {telegramView === 'bots' ? (
                            <TelegramBotSettings
                                bot={activeBot}
                                deleting={deleting}
                                onPatch={patchActiveBot}
                                onDelete={handleDeleteBot}
                            />
                        ) : null}

                        {telegramView === 'recipients' ? (
                            <TelegramRecipientsSettings
                                bot={activeBot}
                                onPatch={patchActiveBot}
                                onToggleRole={handleToggleRole}
                            />
                        ) : null}

                        {telegramView === 'events' ? (
                            <TelegramEventsTable
                                bot={activeBot}
                                onToggleEvent={handleToggleEvent}
                                onSetGroup={handleSetGroupEvents}
                            />
                        ) : null}

                        {telegramView === 'chats' ? (
                            <TelegramChatsTable
                                chats={recentChats}
                                loading={loadingChats}
                                onReload={() => activeBotId && void loadRecentChats(activeBotId)}
                                onCopy={handleCopyChatId}
                            />
                        ) : null}

                        {telegramView === 'test' ? (
                            <TelegramTokenTest
                                bot={activeBot}
                                validation={tokenValidation}
                                onValidate={handleValidateBot}
                            />
                        ) : null}
                    </div>

                    <TelegramSaveBar
                        dirty={activeBotDirty}
                        saving={saving}
                        onReset={handleResetActiveBot}
                        onSave={handleSaveBot}
                    />
                </>
            )}
        </AdminWorkspace>
    );
}

type PatchTelegramBot = (
    patch: Partial<TelegramBotRecord>,
    options?: { resetValidation?: boolean }
) => void;

function TelegramBotSettings({
    bot,
    deleting,
    onPatch,
    onDelete
}: {
    bot: TelegramBotRecord;
    deleting: boolean;
    onPatch: PatchTelegramBot;
    onDelete: () => void | Promise<void>;
}) {
    return (
        <AdminTableSurface className="overflow-hidden">
            <header className="flex min-h-14 items-center justify-between gap-4 border-b border-[#2a3039] px-4">
                <h2 className="text-[15px] font-semibold text-[#f2f5f7]">Настройки бота</h2>
                <div className="flex items-center gap-2">
                    <AdminStatus
                        label={bot.has_token ? 'Токен сохранён' : 'Без токена'}
                        tone={bot.has_token ? 'success' : 'warning'}
                    />
                    <AdminStatus
                        label={bot.bot_username ? '@' + bot.bot_username : 'Не проверен'}
                        tone={bot.bot_username ? 'info' : 'neutral'}
                    />
                </div>
            </header>

            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(220px,0.42fr)_minmax(360px,1fr)]">
                <label className="space-y-1.5">
                    <span className="text-[12px] font-medium text-[#aeb6c0]">Название бота</span>
                    <input
                        aria-label="Название бота"
                        name="bot_name"
                        autoComplete="off"
                        value={bot.name}
                        onChange={(event) => onPatch({ name: event.target.value })}
                        className={adminFieldClassName + ' w-full px-3'}
                    />
                </label>

                <label className="space-y-1.5">
                    <span className="text-[12px] font-medium text-[#aeb6c0]">Токен бота</span>
                    <input
                        aria-label="Токен бота"
                        name="bot_token"
                        autoComplete="off"
                        spellCheck={false}
                        value={bot.token}
                        onChange={(event) => onPatch(
                            { token: event.target.value },
                            { resetValidation: true }
                        )}
                        placeholder={bot.has_token ? 'Введите новый токен для замены' : '123456:AA…'}
                        className={adminFieldClassName + ' w-full px-3 font-mono'}
                    />
                </label>
            </div>

            <footer className="flex min-h-14 items-center justify-between gap-4 border-t border-[#2a3039] px-4">
                <span className="text-[12px] text-[#7f8894]">
                    Обновлён {formatDateTime(bot.updated_at)}
                </span>
                <AdminAction
                    tone="danger"
                    onClick={() => void onDelete()}
                    disabled={deleting}
                >
                    <Trash2 size={15} aria-hidden="true" />
                    {deleting ? 'Удаление…' : 'Удалить бота'}
                </AdminAction>
            </footer>
        </AdminTableSurface>
    );
}

function TelegramRecipientsSettings({
    bot,
    onPatch,
    onToggleRole
}: {
    bot: TelegramBotRecord;
    onPatch: PatchTelegramBot;
    onToggleRole: (
        key: keyof Pick<
            TelegramBotRecord,
            'notify_admin' | 'notify_sales_manager' | 'notify_franchisee'
        >
    ) => void;
}) {
    return (
        <AdminTableSurface minWidth={760}>
            <header className="flex min-h-14 items-center border-b border-[#2a3039] px-4">
                <h2 className="text-[15px] font-semibold text-[#f2f5f7]">Получатели</h2>
            </header>

            <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-[#151a21] text-[11px] uppercase tracking-[0.08em] text-[#7f8894]">
                    <tr>
                        <th className="h-10 px-4 font-medium">Роль</th>
                        <th className="h-10 w-[170px] px-4 text-right font-medium">Уведомления</th>
                    </tr>
                </thead>
                <tbody>
                    {ROLE_TOGGLES.map((toggle) => (
                        <tr key={toggle.key} className="border-t border-[#252c35]">
                            <td className="h-14 px-4 font-medium text-[#e8ebef]">{toggle.label}</td>
                            <td className="h-14 px-4">
                                <div className="flex justify-end">
                                    <TelegramSwitch
                                        label={toggle.label}
                                        checked={bot[toggle.key]}
                                        onToggle={() => onToggleRole(toggle.key)}
                                    />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="grid gap-4 border-t border-[#2a3039] p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <label className="space-y-1.5">
                    <span className="text-[12px] font-medium text-[#aeb6c0]">Ручные получатели</span>
                    <textarea
                        aria-label="Ручные получатели"
                        name="manual_recipients"
                        autoComplete="off"
                        spellCheck={false}
                        value={bot.manual_recipients_text}
                        onChange={(event) => onPatch({ manual_recipients_text: event.target.value })}
                        rows={5}
                        placeholder={'123456789\n-1001234567890\n@my_group'}
                        className="w-full resize-y rounded-lg border border-[#2a3039] bg-[#151a21] px-3 py-3 text-[13px] text-[#eef2f6] outline-none transition placeholder:text-[#727b88] focus:border-[#4c91f3]"
                    />
                </label>
                <label className="space-y-1.5">
                    <span className="text-[12px] font-medium text-[#aeb6c0]">Порог низкого остатка</span>
                    <input
                        aria-label="Порог low-stock"
                        name="low_stock_threshold"
                        type="number"
                        min={0}
                        max={999999}
                        inputMode="numeric"
                        value={bot.low_stock_threshold}
                        onChange={(event) => onPatch({
                            low_stock_threshold: Number(event.target.value || 0)
                        })}
                        className={adminFieldClassName + ' w-full px-3'}
                    />
                </label>
            </div>
        </AdminTableSurface>
    );
}

function TelegramEventsTable({
    bot,
    onToggleEvent,
    onSetGroup
}: {
    bot: TelegramBotRecord;
    onToggleEvent: (eventKey: keyof TelegramEventSettings) => void;
    onSetGroup: (groupKey: string, enabled: boolean) => void;
}) {
    const enabledEvents = Object.values(bot.event_settings).filter(Boolean).length;
    const totalEvents = Object.values(bot.event_settings).length;

    return (
        <AdminTableSurface minWidth={840}>
            <header className="flex min-h-14 items-center justify-between gap-4 border-b border-[#2a3039] px-4">
                <h2 className="text-[15px] font-semibold text-[#f2f5f7]">События</h2>
                <AdminStatus
                    label={String(enabledEvents) + ' из ' + String(totalEvents)}
                    tone={enabledEvents > 0 ? 'info' : 'neutral'}
                />
            </header>

            <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-[#151a21] text-[11px] uppercase tracking-[0.08em] text-[#7f8894]">
                    <tr>
                        <th className="h-10 w-[260px] px-4 font-medium">Раздел</th>
                        <th className="h-10 px-4 font-medium">Событие</th>
                        <th className="h-10 w-[150px] px-4 text-right font-medium">Уведомление</th>
                    </tr>
                </thead>
                <tbody>
                    {TELEGRAM_EVENT_GROUPS.flatMap((group) => {
                        const enabledCount = group.events.filter(
                            (event) => bot.event_settings[event.key]
                        ).length;

                        return group.events.map((event, index) => (
                            <tr key={event.key} className="border-t border-[#252c35]">
                                {index === 0 ? (
                                    <td
                                        rowSpan={group.events.length}
                                        className="border-r border-[#252c35] px-4 py-3 align-top"
                                    >
                                        <div className="font-medium text-[#eef2f6]">{group.label}</div>
                                        <div className="mt-1 text-[12px] text-[#7f8894]">
                                            {String(enabledCount) + ' / ' + String(group.events.length)}
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => onSetGroup(group.key, true)}
                                                className="h-8 rounded-md border border-[#333b46] bg-[#191f27] px-2.5 text-[12px] font-medium text-[#d5dae0] transition hover:border-[#4a5562] hover:bg-[#202832]"
                                            >
                                                Вкл. все
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onSetGroup(group.key, false)}
                                                className="h-8 rounded-md border border-[#333b46] bg-[#191f27] px-2.5 text-[12px] font-medium text-[#d5dae0] transition hover:border-[#4a5562] hover:bg-[#202832]"
                                            >
                                                Выкл. все
                                            </button>
                                        </div>
                                    </td>
                                ) : null}
                                <td className="h-12 px-4 text-[#dce1e6]">{event.label}</td>
                                <td className="h-12 px-4">
                                    <div className="flex justify-end">
                                        <TelegramSwitch
                                            label={event.label}
                                            checked={bot.event_settings[event.key]}
                                            onToggle={() => onToggleEvent(event.key)}
                                        />
                                    </div>
                                </td>
                            </tr>
                        ));
                    })}
                </tbody>
            </table>
        </AdminTableSurface>
    );
}

function TelegramChatsTable({
    chats,
    loading,
    onReload,
    onCopy
}: {
    chats: TelegramBotContact[];
    loading: boolean;
    onReload: () => void;
    onCopy: (chatId: string) => void | Promise<void>;
}) {
    return (
        <div className="space-y-3">
            <div className="flex min-h-10 items-center justify-between gap-4 px-1">
                <h2 className="text-[15px] font-semibold text-[#f2f5f7]">Недавние чаты</h2>
                <AdminAction tone="secondary" onClick={onReload} disabled={loading}>
                    <RefreshCw
                        size={15}
                        className={loading ? 'animate-spin' : ''}
                        aria-hidden="true"
                    />
                    {loading ? 'Обновление…' : 'Обновить чаты'}
                </AdminAction>
            </div>

            <AdminTableSurface minWidth={940}>
                {loading && chats.length === 0 ? (
                    <AdminWorkspaceState state="loading">Загрузка чатов…</AdminWorkspaceState>
                ) : chats.length === 0 ? (
                    <AdminWorkspaceState state="empty">Нет чатов.</AdminWorkspaceState>
                ) : (
                    <table className="w-full border-collapse text-left text-[13px]">
                        <thead className="bg-[#151a21] text-[11px] uppercase tracking-[0.08em] text-[#7f8894]">
                            <tr>
                                <th className="h-10 px-4 font-medium">Чат</th>
                                <th className="h-10 w-[130px] px-4 font-medium">Тип</th>
                                <th className="h-10 w-[190px] px-4 font-medium">Chat ID</th>
                                <th className="h-10 w-[180px] px-4 font-medium">Начало</th>
                                <th className="h-10 w-[180px] px-4 font-medium">Активность</th>
                                <th className="h-10 w-[64px] px-4"><span className="sr-only">Действия</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {chats.map((chat) => (
                                <tr
                                    key={chat.id}
                                    className="border-t border-[#252c35] transition hover:bg-[#151b23]"
                                >
                                    <td className="h-14 px-4">
                                        <div className="font-medium text-[#eef2f6]">{buildChatLabel(chat)}</div>
                                    </td>
                                    <td className="h-14 px-4 text-[#aeb6c0]">{chat.chat_type}</td>
                                    <td className="h-14 px-4 font-mono text-[12px] text-[#dce1e6]">
                                        {chat.chat_id}
                                    </td>
                                    <td className="h-14 px-4 text-[#aeb6c0]">
                                        {formatDateTime(chat.started_at)}
                                    </td>
                                    <td className="h-14 px-4 text-[#aeb6c0]">
                                        {formatDateTime(chat.last_seen_at)}
                                    </td>
                                    <td className="h-14 px-4 text-right">
                                        <button
                                            type="button"
                                            onClick={() => void onCopy(chat.chat_id)}
                                            aria-label={'Скопировать chat_id ' + chat.chat_id}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#333b46] bg-[#191f27] text-[#aeb6c0] transition hover:border-[#4a5562] hover:text-white"
                                        >
                                            <Copy size={15} aria-hidden="true" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </AdminTableSurface>
        </div>
    );
}

function TelegramTokenTest({
    bot,
    validation,
    onValidate
}: {
    bot: TelegramBotRecord;
    validation: TokenValidationState;
    onValidate: () => void | Promise<void>;
}) {
    const tokenState = bot.token.trim()
        ? 'Новый токен'
        : bot.has_token
            ? 'Сохранённый токен'
            : 'Токен не задан';

    return (
        <AdminTableSurface>
            <header className="flex min-h-14 items-center justify-between gap-4 border-b border-[#2a3039] px-4">
                <h2 className="text-[15px] font-semibold text-[#f2f5f7]">Проверка токена</h2>
                <AdminStatus
                    label={tokenState}
                    tone={bot.token.trim() || bot.has_token ? 'info' : 'warning'}
                />
            </header>
            <div className="grid min-h-[240px] items-center gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div
                    aria-live="polite"
                    className={'rounded-lg border px-4 py-4 text-sm ' + getValidationTone(validation)}
                >
                    <div className="font-medium">
                        {validation.message || 'Проверка ещё не запускалась.'}
                    </div>
                    <div className="mt-2 text-[12px] opacity-70">
                        {bot.bot_username ? '@' + bot.bot_username : bot.name}
                    </div>
                </div>
                <AdminAction
                    onClick={() => void onValidate()}
                    disabled={validation.status === 'loading'}
                    className="min-w-[190px]"
                >
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {validation.status === 'loading' ? 'Проверка…' : 'Проверить токен'}
                </AdminAction>
            </div>
        </AdminTableSurface>
    );
}

function TelegramSaveBar({
    dirty,
    saving,
    onReset,
    onSave
}: {
    dirty: boolean;
    saving: boolean;
    onReset: () => void;
    onSave: () => void | Promise<void>;
}) {
    return (
        <section
            data-testid="telegram-save-bar"
            className="sticky bottom-3 z-20 flex min-h-16 items-center justify-between gap-4 rounded-lg border border-[#3e6f9f] bg-[#121d29]/95 px-4 shadow-[0_18px_50px_rgba(0,0,0,0.38)] backdrop-blur"
        >
            <AdminStatus
                label={dirty ? 'Есть несохранённые изменения' : 'Изменения сохранены'}
                tone={dirty ? 'warning' : 'success'}
            />
            <div className="flex items-center gap-2">
                <AdminAction
                    tone="secondary"
                    onClick={onReset}
                    disabled={!dirty || saving}
                >
                    <RotateCcw size={15} aria-hidden="true" />
                    Сбросить
                </AdminAction>
                <AdminAction
                    onClick={() => void onSave()}
                    disabled={!dirty || saving}
                    className="min-w-[190px]"
                >
                    <Save size={15} aria-hidden="true" />
                    {saving ? 'Сохранение…' : 'Сохранить изменения'}
                </AdminAction>
            </div>
        </section>
    );
}

function TelegramSwitch({
    label,
    checked,
    onToggle
}: {
    label: string;
    checked: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-label={label}
            aria-checked={checked}
            onClick={onToggle}
            className={
                checked
                    ? 'relative inline-flex h-7 w-12 shrink-0 rounded-full bg-[#397dca] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6aaef7]'
                    : 'relative inline-flex h-7 w-12 shrink-0 rounded-full bg-[#343c47] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6aaef7]'
            }
        >
            <span
                aria-hidden="true"
                className={
                    checked
                        ? 'absolute left-0.5 top-0.5 h-6 w-6 translate-x-5 rounded-full bg-white shadow transition-transform'
                        : 'absolute left-0.5 top-0.5 h-6 w-6 translate-x-0 rounded-full bg-white shadow transition-transform'
                }
            />
        </button>
    );
}

function pathToTelegramView(pathname: string): TelegramWorkspaceView {
    if (pathname.endsWith('/recipients')) {
        return 'recipients';
    }
    if (pathname.endsWith('/events')) {
        return 'events';
    }
    if (pathname.endsWith('/chats')) {
        return 'chats';
    }
    if (pathname.endsWith('/test')) {
        return 'test';
    }
    return 'bots';
}
