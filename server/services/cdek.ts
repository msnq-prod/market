type CdekTokenResponse = {
    access_token?: string;
    expires_in?: number;
};

type CdekStatusSnapshot = {
    code: string | null;
    label: string | null;
    occurredAt: string | null;
    raw: unknown;
};

export type CdekOrderSnapshot = {
    trackingNumber: string;
    status: CdekStatusSnapshot | null;
    payload: unknown;
};

export type CdekMappedOrderProgress = {
    targetStatus: 'SHIPPED' | 'RECEIVED' | 'RETURN_REQUESTED' | 'RETURN_IN_TRANSIT' | 'RETURNED' | null;
    returnReason: 'REFUSED_BY_CUSTOMER' | 'NOT_PICKED_UP' | null;
};

type TokenCache = {
    token: string;
    expiresAt: number;
} | null;

const CDEK_API_BASE_URL = (process.env.CDEK_API_BASE_URL || 'https://api.cdek.ru').replace(/\/$/, '');
const CDEK_CLIENT_ID = process.env.CDEK_CLIENT_ID?.trim() || '';
const CDEK_CLIENT_SECRET = process.env.CDEK_CLIENT_SECRET?.trim() || '';

let tokenCache: TokenCache = null;

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const toText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const extractStatuses = (value: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(value)) {
        return value.filter(isObject);
    }
    if (isObject(value)) {
        if (Array.isArray(value.statuses)) {
            return value.statuses.filter(isObject);
        }
        if (Array.isArray(value.requests)) {
            return value.requests.flatMap((entry) => extractStatuses(entry));
        }
        if (Array.isArray(value.entities)) {
            return value.entities.flatMap((entry) => extractStatuses(entry));
        }
        if (Array.isArray(value.orders)) {
            return value.orders.flatMap((entry) => extractStatuses(entry));
        }
    }
    return [];
};

const toIsoStringOrNull = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const buildMockSnapshot = (trackingNumber: string): CdekOrderSnapshot | null => {
    const normalized = trackingNumber.trim().toUpperCase();
    const now = new Date().toISOString();

    if (normalized === 'MOCK-SHIPPED') {
        return {
            trackingNumber,
            status: {
                code: 'MOCK_SHIPPED',
                label: 'Посылка в пути',
                occurredAt: now,
                raw: { mock: true, status: 'SHIPPED' }
            },
            payload: { mock: true, status: 'SHIPPED' }
        };
    }

    if (normalized === 'MOCK-DELIVERED') {
        return {
            trackingNumber,
            status: {
                code: 'MOCK_DELIVERED',
                label: 'Заказ вручен получателю',
                occurredAt: now,
                raw: { mock: true, status: 'RECEIVED' }
            },
            payload: { mock: true, status: 'RECEIVED' }
        };
    }

    if (normalized === 'MOCK-RETURN-NOT-PICKED-UP') {
        return {
            trackingNumber,
            status: {
                code: 'MOCK_RETURNED',
                label: 'Не забран, отправление возвращено',
                occurredAt: now,
                raw: { mock: true, status: 'RETURNED', reason: 'NOT_PICKED_UP' }
            },
            payload: { mock: true, status: 'RETURNED', reason: 'NOT_PICKED_UP' }
        };
    }

    if (normalized === 'MOCK-RETURN-REFUSED') {
        return {
            trackingNumber,
            status: {
                code: 'MOCK_RETURN_REQUESTED',
                label: 'Клиент отказался от получения, возврат',
                occurredAt: now,
                raw: { mock: true, status: 'RETURN_REQUESTED', reason: 'REFUSED_BY_CUSTOMER' }
            },
            payload: { mock: true, status: 'RETURN_REQUESTED', reason: 'REFUSED_BY_CUSTOMER' }
        };
    }

    return null;
};

const normalizeStatusSnapshot = (status: Record<string, unknown>): CdekStatusSnapshot => ({
    code: toText(status.code) || toText(status.status_code),
    label: toText(status.name) || toText(status.description),
    occurredAt: toIsoStringOrNull(status.date_time) || toIsoStringOrNull(status.date) || toIsoStringOrNull(status.created_at),
    raw: status
});

const compareStatusDates = (left: CdekStatusSnapshot, right: CdekStatusSnapshot) => {
    const leftTs = left.occurredAt ? new Date(left.occurredAt).getTime() : 0;
    const rightTs = right.occurredAt ? new Date(right.occurredAt).getTime() : 0;
    return rightTs - leftTs;
};

const getBearerToken = async (): Promise<string> => {
    if (!CDEK_CLIENT_ID || !CDEK_CLIENT_SECRET) {
        throw new Error('CDEK credentials are not configured.');
    }

    if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
        return tokenCache.token;
    }

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CDEK_CLIENT_ID,
        client_secret: CDEK_CLIENT_SECRET
    });

    const response = await fetch(`${CDEK_API_BASE_URL}/v2/oauth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    if (!response.ok) {
        const payload = await response.text().catch(() => '');
        throw new Error(`CDEK auth failed: ${response.status} ${payload}`);
    }

    const data = await response.json() as CdekTokenResponse;
    if (!data.access_token || !data.expires_in) {
        throw new Error('CDEK auth response is missing access_token.');
    }

    tokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000)
    };

    return data.access_token;
};

const fetchOrderCandidates = async (token: string, trackingNumber: string) => {
    const queryParamCandidates = ['cdek_number', 'number', 'im_number'];

    for (const queryParam of queryParamCandidates) {
        const params = new URLSearchParams({ [queryParam]: trackingNumber });
        const response = await fetch(`${CDEK_API_BASE_URL}/v2/orders?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const payload = await response.text().catch(() => '');
            throw new Error(`CDEK tracking failed: ${response.status} ${payload}`);
        }

        const payload = await response.json() as unknown;
        if (Array.isArray(payload) && payload.length > 0) {
            return payload;
        }

        if (isObject(payload) && Array.isArray(payload.orders) && payload.orders.length > 0) {
            return payload.orders;
        }
    }

    return [];
};

export const fetchCdekOrderSnapshot = async (trackingNumber: string): Promise<CdekOrderSnapshot> => {
    const trimmedTrackingNumber = trackingNumber.trim();
    if (!trimmedTrackingNumber) {
        throw new Error('Tracking number is required.');
    }

    const mockSnapshot = buildMockSnapshot(trimmedTrackingNumber);
    if (mockSnapshot) {
        return mockSnapshot;
    }

    const token = await getBearerToken();
    const candidates = await fetchOrderCandidates(token, trimmedTrackingNumber);
    const candidate = candidates.find(isObject) || null;
    const statuses = candidate ? extractStatuses(candidate).map(normalizeStatusSnapshot).sort(compareStatusDates) : [];

    return {
        trackingNumber: trimmedTrackingNumber,
        status: statuses[0] || null,
        payload: candidate
    };
};

export const mapCdekSnapshotToOrderProgress = (snapshot: CdekOrderSnapshot): CdekMappedOrderProgress => {
    const combined = `${snapshot.status?.code || ''} ${snapshot.status?.label || ''}`.trim().toLowerCase();

    if (!combined) {
        return { targetStatus: null, returnReason: null };
    }

    if (
        combined.includes('вручен')
        || combined.includes('выдан')
        || combined.includes('delivered')
        || combined.includes('received')
    ) {
        return { targetStatus: 'RECEIVED', returnReason: null };
    }

    if (
        combined.includes('возвращен')
        || combined.includes('return complete')
        || combined.includes('returned')
    ) {
        return {
            targetStatus: 'RETURNED',
            returnReason: combined.includes('не вручен') || combined.includes('не забран') ? 'NOT_PICKED_UP' : 'REFUSED_BY_CUSTOMER'
        };
    }

    if (
        combined.includes('возврат')
        || combined.includes('return')
    ) {
        return {
            targetStatus: combined.includes('транзит') || combined.includes('transit') ? 'RETURN_IN_TRANSIT' : 'RETURN_REQUESTED',
            returnReason: combined.includes('не забран') || combined.includes('истек срок') ? 'NOT_PICKED_UP' : 'REFUSED_BY_CUSTOMER'
        };
    }

    if (
        combined.includes('доставк')
        || combined.includes('delivery')
        || combined.includes('транзит')
        || combined.includes('transit')
    ) {
        return { targetStatus: 'SHIPPED', returnReason: null };
    }

    return { targetStatus: null, returnReason: null };
};
