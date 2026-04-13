import type { Product, ProductTranslation } from '@prisma/client';

export const STAFF_ROLES = new Set(['ADMIN', 'MANAGER']);
export const SALES_STAFF_ROLES = new Set(['ADMIN', 'SALES_MANAGER']);
export const COLLECTION_STATUSES = new Set([
    'OPEN',
    'IN_PROGRESS',
    'IN_TRANSIT',
    'RECEIVED',
    'IN_STOCK',
    'CANCELLED'
]);
export const PUBLIC_PASSPORT_BATCH_STATUSES = new Set(['RECEIVED', 'FINISHED']);
const LEGACY_ITEM_SERIAL_PATTERNS = [
    /^e2e-token-/i,
    /^[0-9a-f]{20,}$/i,
];

export const isStaffRole = (role?: string): boolean => STAFF_ROLES.has(role || '');
export const isSalesStaffRole = (role?: string): boolean => SALES_STAFF_ROLES.has(role || '');
export const isPublicPassportAvailable = (itemStatus?: string | null, batchStatus?: string | null): boolean =>
    PUBLIC_PASSPORT_BATCH_STATUSES.has(batchStatus || '') && itemStatus !== 'REJECTED';
export const looksLikeLegacyItemSerial = (value?: string | null): boolean => {
    const normalized = value?.trim();
    if (!normalized) {
        return false;
    }

    return LEGACY_ITEM_SERIAL_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const normalizeCode = (value: string, fallback: string, maxLength: number): string => {
    const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalized) return fallback;
    return normalized.slice(0, maxLength);
};

export const normalizeTimeValue = (value: string): string | null => {
    const normalized = value.trim();
    if (!/^\d{2}:\d{2}$/.test(normalized)) return null;

    const [hours, minutes] = normalized.split(':').map(Number);
    if (hours > 23 || minutes > 59) return null;
    return normalized;
};

export const toCollectionDate = (value: string): Date | null => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
};

export const formatBatchTempId = (sequence: number): string => String(sequence).padStart(3, '0');
export const formatItemSeq = (sequence: number): string => String(sequence).padStart(3, '0');

export const formatSerialDate = (date: Date): string => {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = String(date.getUTCFullYear()).slice(-2);
    return `${day}${month}${year}`;
};

export const buildSerialNumber = (
    product: Pick<Product, 'country_code' | 'location_code' | 'item_code'>,
    collectedDate: Date,
    itemSeq: number,
    dailyBatchSeq: number
): string => {
    const base = `${normalizeCode(product.country_code, 'RUS', 3)}${normalizeCode(product.location_code, 'LOC', 3)}${normalizeCode(product.item_code, '00', 8)}${formatSerialDate(collectedDate)}${formatItemSeq(itemSeq)}`;
    return dailyBatchSeq > 1 ? `${dailyBatchSeq}${base}` : base;
};

export const getDefaultProductTranslation = <T extends Pick<ProductTranslation, 'language_id' | 'name' | 'description'>>(
    translations: T[]
): T | null => {
    return translations.find((translation) => translation.language_id === 2)
        || translations.find((translation) => translation.language_id === 1)
        || translations[0]
        || null;
};

export const hasAllBatchMedia = (items: Array<{ item_photo_url: string | null; item_video_url: string | null }>): boolean =>
    items.every((item) => Boolean(item.item_photo_url) && Boolean(item.item_video_url));
