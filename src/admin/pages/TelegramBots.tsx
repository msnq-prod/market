import { useEffect, useState } from 'react';
import { useBeforeUnload } from 'react-router-dom';
import { CheckCircle2, Copy, Plus, RefreshCw, RotateCcw, Save, Shield, Trash2 } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
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

export function TelegramBots() {
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
            setNotice('Создан новый бот. Заполните token и выберите получателей уведомлений.');
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
                ? { status: 'success', message: `Token валиден. Username: @${savedBot.bot_username}` }
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
            message: 'Проверка token…'
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
                throw new Error(payload.error || 'Не удалось проверить Telegram token.');
            }

            const payload = await res.json() as { username?: string | null };
            patchActiveBot({
                bot_username: payload.username || activeBot.bot_username
            });
            setTokenValidation(activeBot.id, {
                status: 'success',
                message: payload.username
                    ? `Token валиден. Username: @${payload.username}`
                    : 'Token валиден.'
            });
        } catch (err) {
            setTokenValidation(activeBot.id, {
                status: 'error',
                message: err instanceof Error ? err.message : 'Не удалось проверить Telegram token.'
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

    if (loading) {
        return (
            <div className="rounded-2xl border border-gray-800 bg-[#101218] p-8 text-sm text-gray-300">
                Загрузка Telegram-ботов…
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-24">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="mb-1 inline-flex items-center gap-2 text-xs text-gray-400">
                        <Shield size={12} aria-hidden="true" />
                        ADMIN
                    </div>
                    <h1 className="text-2xl font-semibold text-white">Telegram-боты</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void handleRefresh()}
                        disabled={refreshing}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-700 bg-[#12161f] px-3.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:opacity-60"
                    >
                        <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
                        {refreshing ? 'Обновление…' : 'Обновить'}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleCreateBot()}
                        disabled={creating}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80 disabled:opacity-60"
                    >
                        <Plus size={15} aria-hidden="true" />
                        {creating ? 'Создание…' : 'Новый бот'}
                    </button>
                </div>
            </header>

            <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#0f131a]">
                <div className="flex items-end gap-1 overflow-x-auto px-3 pt-3">
                    {bots.map((bot) => {
                        const isActive = bot.id === activeBotId;
                        const isDirty = dirtyBotIds.has(bot.id);

                        return (
                            <button
                                key={bot.id}
                                type="button"
                                onClick={() => handleSelectBot(bot.id)}
                                className={`group relative min-w-[176px] max-w-[220px] shrink-0 rounded-t-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                                    isActive
                                        ? 'border-gray-700 border-b-[#11161f] bg-[#11161f] text-white'
                                        : 'border-gray-800 bg-[#0b0f15] text-gray-300 hover:bg-[#121722]'
                                }`}
                            >
                                <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent opacity-60" />
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">{bot.name}</div>
                                        <div className="truncate text-xs text-gray-500">
                                            {bot.bot_username ? `@${bot.bot_username}` : bot.has_token ? 'Token сохранен' : 'Без token'}
                                        </div>
                                    </div>
                                    {isDirty && (
                                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-label="Есть несохраненные изменения" />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => void handleCreateBot()}
                        disabled={creating}
                        aria-label="Добавить бота"
                        className="mb-px inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-t-xl border border-gray-800 bg-[#0b0f15] text-gray-300 transition-colors hover:bg-[#121722] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:opacity-60"
                    >
                        <Plus size={16} aria-hidden="true" />
                    </button>
                </div>
                <div className="border-t border-gray-800 bg-[#11161f] px-4 py-2 text-xs text-gray-500">
                    {hasUnsavedChanges ? 'Есть несохраненные изменения.' : 'Все изменения сохранены.'}
                </div>
            </div>

            {error && (
                <div aria-live="polite" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                </div>
            )}

            {notice && (
                <div aria-live="polite" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    {notice}
                </div>
            )}

            {!activeBot ? (
                <section className="rounded-2xl border border-gray-800 bg-[#101218] px-6 py-14 text-center text-sm text-gray-300">
                    Нет созданных ботов.
                </section>
            ) : (
                <div className="space-y-4">
                    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
                        <section className="rounded-2xl border border-gray-800 bg-[#101218] p-4 lg:p-5">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="truncate text-base font-semibold text-white">{activeBot.name}</h2>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                                        <span>{activeBot.bot_username ? `@${activeBot.bot_username}` : 'Username появится после проверки'}</span>
                                        <span>•</span>
                                        <span>Обновлен {formatDateTime(activeBot.updated_at)}</span>
                                    </div>
                                </div>
                                {activeBotDirty && (
                                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-100">
                                        Есть изменения
                                    </span>
                                )}
                            </div>

                            <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]">
                                <label className="space-y-1.5">
                                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Название</span>
                                    <input
                                        aria-label="Название вкладки"
                                        name="bot_name"
                                        autoComplete="off"
                                        value={activeBot.name}
                                        onChange={(event) => patchActiveBot({ name: event.target.value })}
                                        className="w-full rounded-xl border border-gray-700 bg-[#0b1016] px-3.5 py-2.5 text-sm text-white transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                                        placeholder="Бот продаж…"
                                    />
                                </label>
                                <label className="space-y-1.5">
                                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Token</span>
                                    <input
                                        aria-label="Token бота"
                                        name="bot_token"
                                        autoComplete="off"
                                        spellCheck={false}
                                        value={activeBot.token}
                                        onChange={(event) => patchActiveBot({ token: event.target.value }, { resetValidation: true })}
                                        className="w-full rounded-xl border border-gray-700 bg-[#0b1016] px-3.5 py-2.5 text-sm text-white transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                                        placeholder={activeBot.has_token ? 'Token сохранен. Введите новый при замене…' : '123456:AA…'}
                                    />
                                </label>
                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        onClick={() => void handleValidateBot()}
                                        disabled={tokenValidation.status === 'loading'}
                                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-700 bg-[#151b24] px-3.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:opacity-60"
                                    >
                                        {tokenValidation.status === 'loading' ? 'Проверка…' : 'Проверить token'}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <div className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-[#0b1016] px-3 py-1.5 text-sm text-gray-200">
                                    <span className="text-gray-500">Username:</span>
                                    <span translate="no">{activeBot.bot_username ? `@${activeBot.bot_username}` : 'не подтвержден'}</span>
                                    {activeBot.bot_username && <CheckCircle2 size={14} className="text-emerald-400" aria-hidden="true" />}
                                </div>
                                <div
                                    aria-live="polite"
                                    className={`rounded-full border px-3 py-1.5 text-sm ${getValidationTone(tokenValidation)}`}
                                >
                                    {tokenValidation.message || (activeBot.has_token && !activeBot.token.trim()
                                        ? 'Сохраненный token активен.'
                                        : 'Проверка token не запускалась.')}
                                </div>
                            </div>
                        </section>
                        <section className="rounded-2xl border border-gray-800 bg-[#101218] p-4 lg:p-5">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-300">Получатели</h3>
                                <div className="text-xs text-gray-500">Роли и ручные chat_id</div>
                            </div>

                            <div className="space-y-2">
                                {ROLE_TOGGLES.map((toggle) => (
                                    <SwitchRow
                                        key={toggle.key}
                                        label={toggle.label}
                                        checked={activeBot[toggle.key]}
                                        onToggle={() => handleToggleRole(toggle.key)}
                                    />
                                ))}
                            </div>

                            <div className="mt-4 grid gap-3">
                                <label className="space-y-1.5">
                                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Ручные получатели</span>
                                    <textarea
                                        aria-label="Ручные получатели"
                                        name="manual_recipients"
                                        autoComplete="off"
                                        spellCheck={false}
                                        value={activeBot.manual_recipients_text}
                                        onChange={(event) => patchActiveBot({ manual_recipients_text: event.target.value })}
                                        rows={5}
                                        className="w-full rounded-xl border border-gray-700 bg-[#0b1016] px-3.5 py-3 text-sm text-white transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                                        placeholder={'123456789\n-1001234567890\n@my_group'}
                                    />
                                </label>
                                <label className="space-y-1.5">
                                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Low-stock</span>
                                    <input
                                        aria-label="Порог low-stock"
                                        name="low_stock_threshold"
                                        type="number"
                                        min={0}
                                        max={999999}
                                        inputMode="numeric"
                                        value={activeBot.low_stock_threshold}
                                        onChange={(event) => patchActiveBot({ low_stock_threshold: Number(event.target.value || 0) })}
                                        className="w-full rounded-xl border border-gray-700 bg-[#0b1016] px-3.5 py-2.5 text-sm text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                                    />
                                </label>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-gray-800 bg-[#101218] p-4 lg:p-5">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-300">Недавние чаты</h3>
                                <button
                                    type="button"
                                    onClick={() => activeBotId && void loadRecentChats(activeBotId)}
                                    disabled={loadingChats}
                                    className="inline-flex min-h-8 items-center rounded-lg border border-gray-700 bg-[#141922] px-2.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:opacity-60"
                                >
                                    {loadingChats ? '…' : 'Обновить'}
                                </button>
                            </div>

                            <div className="space-y-2.5">
                                {recentChats.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-gray-700 bg-[#0b1016] px-3 py-4 text-sm text-gray-400">
                                        Нет чатов.
                                    </div>
                                )}

                                {recentChats.map((chat) => (
                                    <div key={chat.id} className="rounded-xl border border-gray-800 bg-[#0b1016] px-3 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-white">{buildChatLabel(chat)}</div>
                                                <div className="mt-1 text-xs text-gray-500">{formatDateTime(chat.last_seen_at)}</div>
                                                <div className="mt-2 break-all font-mono text-xs text-gray-200">{chat.chat_id}</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => void handleCopyChatId(chat.chat_id)}
                                                aria-label={`Скопировать chat_id ${chat.chat_id}`}
                                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-[#141922] text-gray-300 transition-colors hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                                            >
                                                <Copy size={14} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <section className="rounded-2xl border border-gray-800 bg-[#101218] p-4 lg:p-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-300">События</h3>
                                <span className="text-xs text-gray-500">
                                    {Object.values(activeBot.event_settings).filter(Boolean).length} / {Object.values(activeBot.event_settings).length}
                                </span>
                            </div>
                        </div>

                        <div className="grid gap-3 xl:grid-cols-2">
                            {TELEGRAM_EVENT_GROUPS.map((group) => {
                                const enabledCount = group.events.filter((event) => activeBot.event_settings[event.key]).length;

                                return (
                                    <section key={group.key} className="rounded-xl border border-gray-800 bg-[#0b1016] p-3">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-white">{group.label}</div>
                                                <div className="text-xs text-gray-500">{enabledCount}/{group.events.length}</div>
                                            </div>
                                            <div className="flex shrink-0 gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetGroupEvents(group.key, true)}
                                                    className="inline-flex h-8 items-center rounded-lg border border-gray-700 bg-[#141922] px-2.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                                                >
                                                    Все
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetGroupEvents(group.key, false)}
                                                    className="inline-flex h-8 items-center rounded-lg border border-gray-700 bg-[#141922] px-2.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                                                >
                                                    Сброс
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {group.events.map((event) => (
                                                <SwitchRow
                                                    key={event.key}
                                                    label={event.label}
                                                    checked={activeBot.event_settings[event.key]}
                                                    onToggle={() => handleToggleEvent(event.key)}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </section>
                </div>
            )}

            {activeBot && (
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-800 bg-[#0c0e13]/95 px-4 py-2.5 backdrop-blur">
                    <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-gray-300">
                            {activeBotDirty
                                ? 'Есть несохраненные изменения.'
                                : 'Изменений нет.'}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => handleDeleteBot()}
                                disabled={deleting}
                                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:opacity-60"
                            >
                                <Trash2 size={16} aria-hidden="true" />
                                {deleting ? 'Удаление…' : 'Удалить'}
                            </button>
                            <button
                                type="button"
                                onClick={handleResetActiveBot}
                                disabled={!activeBotDirty || saving}
                                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:opacity-60"
                            >
                                <RotateCcw size={16} aria-hidden="true" />
                                Отменить
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSaveBot()}
                                disabled={!activeBotDirty || saving}
                                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80 disabled:opacity-60"
                            >
                                <Save size={16} aria-hidden="true" />
                                {saving ? 'Сохранение…' : 'Сохранить изменения'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SwitchRow({
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
            aria-checked={checked}
            onClick={onToggle}
            className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                checked
                    ? 'border-blue-500/40 bg-blue-500/10'
                    : 'border-gray-800 bg-[#111318] hover:border-gray-700 hover:bg-gray-900'
            }`}
        >
            <span className="text-sm font-medium text-white">{label}</span>
            <SwitchKnob checked={checked} />
        </button>
    );
}

function SwitchKnob({ checked }: { checked: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                checked ? 'bg-blue-500' : 'bg-gray-700'
            }`}
        >
            <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    checked ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
            />
        </span>
    );
}
