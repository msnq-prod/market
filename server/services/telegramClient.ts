type TelegramApiResult<T> = {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
    parameters?: {
        retry_after?: number;
    };
};

type TelegramGetMeResponse = {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
};

export type TelegramUpdate = {
    update_id: number;
    message?: {
        text?: string;
        chat: {
            id: number | string;
            type: string;
            username?: string;
            first_name?: string;
            last_name?: string;
        };
        date?: number;
    };
};

export class TelegramApiError extends Error {
    statusCode: number;
    telegramCode: number | null;
    retryAfterSeconds: number | null;

    constructor(message: string, statusCode: number, telegramCode: number | null = null, retryAfterSeconds: number | null = null) {
        super(message);
        this.name = 'TelegramApiError';
        this.statusCode = statusCode;
        this.telegramCode = telegramCode;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

const buildTelegramApiUrl = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

const callTelegramApi = async <T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> => {
    const response = await fetch(buildTelegramApiUrl(token, method), {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => null) as TelegramApiResult<T> | null;

    if (!response.ok || !payload?.ok || typeof payload.result === 'undefined') {
        throw new TelegramApiError(
            payload?.description || `Telegram API error for ${method}`,
            response.status,
            payload?.error_code ?? null,
            payload?.parameters?.retry_after ?? null
        );
    }

    return payload.result;
};

export const validateTelegramBotToken = async (token: string): Promise<{ username: string | null; firstName: string }> => {
    const result = await callTelegramApi<TelegramGetMeResponse>(token.trim(), 'getMe');
    return {
        username: result.username?.trim() || null,
        firstName: result.first_name
    };
};

export const sendTelegramTextMessage = async (token: string, recipientTarget: string, text: string): Promise<void> => {
    await callTelegramApi(token.trim(), 'sendMessage', {
        chat_id: recipientTarget,
        text,
        disable_web_page_preview: true
    });
};

export const getTelegramUpdates = async (token: string, options: { offset: number; timeoutSeconds: number }) => {
    return callTelegramApi<TelegramUpdate[]>(token.trim(), 'getUpdates', {
        offset: options.offset,
        timeout: options.timeoutSeconds,
        allowed_updates: ['message']
    });
};

export const isRetryableTelegramApiError = (error: unknown): boolean => {
    if (!(error instanceof TelegramApiError)) {
        return true;
    }

    if (error.retryAfterSeconds && error.retryAfterSeconds > 0) {
        return true;
    }

    return error.statusCode >= 500 || error.statusCode === 429;
};
