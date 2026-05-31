import {
    ZAGARAMI_PRODUCTION_ORIGIN,
} from './constants';

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
        return `Внутренний video helper недоступен. Перезапустите ZAGARAMI admin.${buildHelperDebugSuffix(context)}`;
    }

    return `${message || 'Локальный helper не отвечает. Перезапустите приложение и перепроверьте статус.'}${buildHelperDebugSuffix(context)}`;
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
