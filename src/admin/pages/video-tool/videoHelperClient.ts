import {
    VIDEO_EXPORT_HELPER_PROTOCOL_VERSION,
    VIDEO_EXPORT_HELPER_URL,
    ZAGARAMI_PRODUCTION_ORIGIN,
    normalizeHelperUrl
} from './constants';
import type { HelperDiagnosticStatus, HelperFetchOptions, HelperRequestInit } from './types';

export const helperUrlHostname = (helperUrl: string) => {
    try {
        return new URL(helperUrl).hostname;
    } catch {
        return '';
    }
};

export const helperUsesLoopback = (helperUrl: string) => {
    const hostname = helperUrlHostname(helperUrl);
    return hostname === '127.0.0.1'
        || hostname === 'localhost'
        || hostname === '::1'
        || hostname === '[::1]';
};

export const buildHelperUrlCandidates = () => {
    const candidates = [VIDEO_EXPORT_HELPER_URL];
    try {
        const helperUrl = new URL(VIDEO_EXPORT_HELPER_URL);
        if (['127.0.0.1', 'localhost', '[::1]', '::1'].includes(helperUrl.hostname)) {
            for (const hostname of ['127.0.0.1', 'localhost', '[::1]']) {
                const nextUrl = new URL(helperUrl.toString());
                nextUrl.hostname = hostname;
                candidates.push(normalizeHelperUrl(nextUrl.toString()));
            }
        }
    } catch {
        // Keep the configured helper URL as-is.
    }

    return Array.from(new Set(candidates));
};

export const VIDEO_EXPORT_HELPER_URL_CANDIDATES = buildHelperUrlCandidates();

export const browserLooksLikeSafari = () => {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const userAgent = navigator.userAgent;
    return userAgent.includes('Safari/')
        && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|YaBrowser)\//.test(userAgent);
};

type HelperIssueContext = {
    helperBaseUrl?: string;
    pageOrigin?: string;
    allowedOrigins?: string[];
    expectedPort?: number | null;
    discoveredPort?: number | null;
    storageRoot?: string | null;
};

const compactList = (values?: string[]) => {
    const filtered = Array.isArray(values) ? values.filter(Boolean) : [];
    return filtered.length > 0 ? filtered.join(', ') : 'нет данных';
};

const buildHelperDebugSuffix = (context?: HelperIssueContext) => {
    if (!context) {
        return '';
    }

    const details = [
        context.helperBaseUrl ? `endpoint=${context.helperBaseUrl}` : '',
        context.pageOrigin ? `pageOrigin=${context.pageOrigin}` : '',
        context.allowedOrigins ? `allowed_origins=[${compactList(context.allowedOrigins)}]` : '',
        context.expectedPort != null ? `expectedPort=${context.expectedPort}` : '',
        context.discoveredPort != null ? `discoveredPort=${context.discoveredPort}` : '',
        context.storageRoot ? `storage=${context.storageRoot}` : ''
    ].filter(Boolean);

    return details.length > 0 ? ` Диагностика: ${details.join('; ')}.` : '';
};

export const buildHelperIssueMessage = (rawMessage?: string, context?: HelperIssueContext) => {
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (message.includes('Диагностика:')) {
        return message;
    }

    const currentOrigin = typeof window !== 'undefined'
        ? window.location.origin
        : ZAGARAMI_PRODUCTION_ORIGIN;
    const expectedOrigin = currentOrigin.includes('zagarami.com')
        ? currentOrigin
        : ZAGARAMI_PRODUCTION_ORIGIN;

    if (message.includes('Origin helper запроса не разрешён') || message.includes('Mutating helper requests требуют разрешённый Origin.')) {
        return `Helper отклонил запрос из-за Origin: страница открыта не из списка разрешённых адресов helper-а. Обычно это старый внешний ZAGARAMI Video Helper или helper, запущенный до старта текущего ZAGARAMI admin. Закройте отдельный Video Helper, перезапустите ZAGARAMI admin и повторите загрузку.${buildHelperDebugSuffix(context)}`;
    }

    if (message.includes('Helper принимает запросы только с loopback-интерфейса.')) {
        return `Helper получил запрос не с локального интерфейса. Откройте систему через ${expectedOrigin} и перепроверьте статус helper.${buildHelperDebugSuffix(context)}`;
    }

    if (message.includes('Failed to fetch') || message.includes('Load failed') || message.includes('NetworkError')) {
        if (!VIDEO_EXPORT_HELPER_URL_CANDIDATES.some(helperUsesLoopback)) {
            return 'Локальный helper не отвечает. Перезапустите приложение и перепроверьте статус.';
        }

        return browserLooksLikeSafari()
            ? `Safari блокирует HTTP-доступ ${expectedOrigin} к локальному helper. Для монтажа откройте эту страницу в Chrome или Яндекс Браузере.${buildHelperDebugSuffix(context)}`
            : `Браузер заблокировал доступ к локальному helper. Нажмите «Разрешить доступ» и подтвердите доступ ${expectedOrigin} к локальной сети.${buildHelperDebugSuffix(context)}`;
    }

    return `${message || 'Локальный helper не отвечает. Перезапустите приложение и перепроверьте статус.'}${buildHelperDebugSuffix(context)}`;
};

export const helperFetch = async (helperUrl: string, input: string, init?: RequestInit, options?: HelperFetchOptions) => {
    const method = (init?.method || 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    if (method !== 'GET' && method !== 'HEAD') {
        headers.set('X-Stones-Video-Helper-Version', VIDEO_EXPORT_HELPER_PROTOCOL_VERSION);
    }

    const requestInit: HelperRequestInit = {
        ...init,
        headers
    };

    if (options?.useTargetAddressSpace && helperUsesLoopback(helperUrl)) {
        requestInit.targetAddressSpace = 'local';
    }

    const response = await fetch(`${helperUrl}${input}`, requestInit);
    return response;
};

export const classifyHelperFetchError = (error: unknown): HelperDiagnosticStatus => {
    if (error instanceof DOMException && error.name === 'AbortError') {
        return 'connection failed';
    }

    if (error instanceof TypeError) {
        return 'blocked';
    }

    return 'connection failed';
};

export const getHelperErrorDetail = (error: unknown) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'Запрос не выполнен.';
};

export const revokeObjectUrl = (value: string | null) => {
    if (value?.startsWith('blob:')) {
        URL.revokeObjectURL(value);
    }
};

export const isEditableHotkeyTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return target.isContentEditable
        || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};
