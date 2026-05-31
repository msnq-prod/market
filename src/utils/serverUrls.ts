const normalizeOrigin = (value?: string | null) => {
    if (!value) {
        return '';
    }

    try {
        return new URL(value).origin;
    } catch {
        return '';
    }
};

export const resolveServerUrl = (
    value: string | null | undefined,
    options: { serverOrigin?: string | null; currentOrigin?: string | null } = {}
) => {
    if (!value) {
        return null;
    }

    try {
        return new URL(value).toString();
    } catch {
        // Relative URL, resolve below.
    }

    if (!value.startsWith('/')) {
        return value;
    }

    const origin = normalizeOrigin(options.serverOrigin) || normalizeOrigin(options.currentOrigin) || (
        typeof window !== 'undefined' ? window.location.origin : ''
    );

    return origin ? new URL(value, origin).toString() : value;
};
