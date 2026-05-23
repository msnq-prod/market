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

export const buildHelperIssueMessage = (rawMessage?: string) => {
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    const currentOrigin = typeof window !== 'undefined'
        ? window.location.origin
        : ZAGARAMI_PRODUCTION_ORIGIN;
    const expectedOrigin = currentOrigin.includes('zagarami.com')
        ? currentOrigin
        : ZAGARAMI_PRODUCTION_ORIGIN;

    if (message.includes('Origin helper запроса не разрешён') || message.includes('Mutating helper requests требуют разрешённый Origin.')) {
        return `Этот helper собран не для ${expectedOrigin}. Закройте старый Stones Video Helper, скачайте актуальный DMG с ${expectedOrigin}, откройте ZAGARAMI Video Helper снова и перепроверьте статус.`;
    }

    if (message.includes('Helper принимает запросы только с loopback-интерфейса.')) {
        return `Браузер не смог обратиться к helper через localhost. Откройте систему через ${expectedOrigin} и перепроверьте статус helper.`;
    }

    if (message.includes('Failed to fetch') || message.includes('Load failed') || message.includes('NetworkError')) {
        if (!VIDEO_EXPORT_HELPER_URL_CANDIDATES.some(helperUsesLoopback)) {
            return 'Локальный helper не отвечает. Перезапустите приложение и перепроверьте статус.';
        }

        return browserLooksLikeSafari()
            ? `Safari блокирует HTTP-доступ ${expectedOrigin} к локальному helper. Для монтажа откройте эту страницу в Chrome или Яндекс Браузере.`
            : `Браузер заблокировал доступ к локальному helper. Нажмите «Разрешить доступ» и подтвердите доступ ${expectedOrigin} к локальной сети.`;
    }

    return message || 'Локальный helper не отвечает. Перезапустите приложение и перепроверьте статус.';
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
