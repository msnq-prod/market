import crypto from 'crypto';
import nodeFs from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import type { AuthRequest } from '../../middleware/auth.ts';
import { buildCloneUrl, buildQrUrl } from '../../utils/cloneUrls.ts';
import { formatItemSeq } from '../../utils/collectionWorkflow.ts';
import { resolveProjectPath } from '../../utils/projectPaths.ts';
import { serializeVideoProcessingJob } from '../../services/videoProcessing.ts';
import { prisma } from '../../services/prisma.ts';

export { prisma };
export const ACTIVE_VIDEO_JOB_STATUSES: Array<'QUEUED' | 'PROCESSING'> = ['QUEUED', 'PROCESSING'];
export const PHOTO_TOOL_PUBLIC_OUTPUT_ROOT = resolveProjectPath('public', 'uploads', 'photos');
export const PHOTO_TOOL_PUBLIC_URL_ROOT = '/uploads/photos';

export type PrismaDbClient = PrismaClient | Prisma.TransactionClient;

export const BATCH_INCLUDE = Prisma.validator<Prisma.BatchInclude>()({
    owner: {
        select: {
            id: true,
            name: true,
            email: true
        }
    },
    product: {
        include: {
            translations: true,
            location: {
                include: {
                    translations: true
                }
            }
        }
    },
    collection_request: {
        select: {
            id: true,
            status: true,
            requested_qty: true
        }
    },
    items: {
        where: {
            deleted_at: null
        },
        orderBy: { item_seq: 'asc' }
    },
    video_processing_jobs: {
        orderBy: { created_at: 'desc' },
        take: 1
    },
});

export type BatchRecord = Prisma.BatchGetPayload<{ include: typeof BATCH_INCLUDE }>;

export const serializeBatch = (req: AuthRequest, batch: BatchRecord) => ({
    id: batch.id,
    status: batch.status,
    created_at: batch.created_at,
    updated_at: batch.updated_at,
    collected_date: batch.collected_date,
    collected_time: batch.collected_time,
    gps_lat: batch.gps_lat,
    gps_lng: batch.gps_lng,
    video_url: batch.video_url,
    daily_batch_seq: batch.daily_batch_seq,
    owner: batch.owner,
    collection_request: batch.collection_request,
    video_processing: serializeVideoProcessingJob(batch.video_processing_jobs[0]),
    product: batch.product ? {
        id: batch.product.id,
        price: Number(batch.product.price),
        image: batch.product.image,
        country_code: batch.product.country_code,
        location_code: batch.product.location_code,
        item_code: batch.product.item_code,
        location_description: batch.product.location_description,
        is_published: batch.product.is_published,
        translations: batch.product.translations,
        location: batch.product.location
    } : null,
    items: batch.items.map((item) => ({
        id: item.id,
        batch_id: item.batch_id,
        product_id: item.product_id,
        temp_id: item.temp_id,
        serial_number: item.serial_number,
        status: item.status,
        is_sold: item.is_sold,
        sales_channel: item.sales_channel,
        photo_url: item.item_photo_url || item.photo_url,
        source_photo_url: item.photo_url,
        item_photo_url: item.item_photo_url,
        item_video_url: item.item_video_url,
        item_seq: item.item_seq,
        activation_date: item.activation_date,
        price_sold: item.price_sold == null ? null : Number(item.price_sold),
        commission_hq: item.commission_hq == null ? null : Number(item.commission_hq),
        collected_date: item.collected_date,
        collected_time: item.collected_time,
        created_at: item.created_at,
        updated_at: item.updated_at,
        clone_url: buildCloneUrl(req, item.serial_number),
        qr_url: buildQrUrl(item.serial_number)
    }))
});

export const createHttpError = (message: string, statusCode: number) =>
    Object.assign(new Error(message), { statusCode });

export const createCodedHttpError = (message: string, statusCode: number, code: string) =>
    Object.assign(new Error(message), { statusCode, code });

export const getErrorStatusCode = (error: unknown) =>
    typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

export const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

export const getErrorCode = (error: unknown) =>
    typeof (error as { code?: unknown })?.code === 'string'
        ? String((error as { code: string }).code)
        : undefined;

export const removeStagedVideoFiles = async (files: Express.Multer.File[] | undefined) => {
    if (!files || files.length === 0) {
        return;
    }

    await Promise.all(files.map(async (file) => {
        try {
            await fs.rm(file.path, { force: true });
        } catch (error) {
            console.error('Failed to remove staged video file', file.path, error);
        }
    }));
};

export const removeStagedFiles = async (files: Express.Multer.File[] | undefined) => {
    if (!files?.length) {
        return;
    }

    await Promise.all(files.map(async (file) => {
        if (!file.path) {
            return;
        }

        try {
            await fs.rm(file.path, { force: true });
        } catch (error) {
            console.error('Failed to remove staged file', file.path, error);
        }
    }));
};

export const removeStagedVideoFile = async (file: Express.Multer.File | undefined) => {
    if (!file?.path) {
        return;
    }

    try {
        await fs.rm(file.path, { force: true });
    } catch (error) {
        console.error('Failed to remove staged export video file', file.path, error);
    }
};

export const getFileType = (filename: string): 'photo' | 'video' | null => {
    const normalized = filename.trim().toLowerCase();
    if (/\.(jpg|jpeg|png|webp)$/i.test(normalized)) return 'photo';
    if (/\.(mov|mp4|m4v|webm)$/i.test(normalized)) return 'video';
    return null;
};

export const getSerialFromFilename = (filename: string): string => {
    const base = filename.trim().split('/').pop() || filename;
    return base.replace(/\.[^.]+$/, '').toUpperCase();
};

export const parseOptionalText = (value: unknown) => {
    if (value == null) {
        return null;
    }

    if (typeof value !== 'string') {
        throw createHttpError('Некорректное строковое значение.', 400);
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
};

export const parseNullableInteger = (value: unknown, fieldLabel: string, minimum = 0) => {
    if (value == null || value === '') {
        return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum) {
        throw createHttpError(`Поле ${fieldLabel} должно быть целым числом не меньше ${minimum}.`, 400);
    }

    return parsed;
};

export const sanitizePhotoToolFilenamePart = (value: string) => {
    const normalized = value
        .trim()
        .normalize('NFKD')
        .split('')
        .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) <= 126)
        .join('')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '');

    return normalized || 'photo';
};

export const buildPhotoToolFilename = (batchId: string, itemSeq: number, originalName: string, safeExtension?: string) => {
    const parsed = path.parse(originalName || '');
    const safeBaseName = sanitizePhotoToolFilenamePart(parsed.name || 'photo');
    const safeBatchId = sanitizePhotoToolFilenamePart(batchId);
    const normalizedExtension = typeof safeExtension === 'string' && /^[.][a-z0-9]{1,10}$/.test(safeExtension)
        ? safeExtension.toLowerCase()
        : '.jpg';

    return `batch-${safeBatchId}-item-${formatItemSeq(itemSeq)}-${safeBaseName}-${Date.now()}${normalizedExtension}`;
};

export const buildQueuedPhotoToolFilename = (
    batchId: string,
    itemSeq: number,
    originalName: string,
    queueJobId: string,
    queueFileId: string,
    safeExtension?: string
) => {
    const parsed = path.parse(originalName || '');
    const safeBaseName = sanitizePhotoToolFilenamePart(parsed.name || 'photo');
    const safeBatchId = sanitizePhotoToolFilenamePart(batchId);
    const safeQueueJobId = sanitizePhotoToolFilenamePart(queueJobId);
    const safeQueueFileId = sanitizePhotoToolFilenamePart(queueFileId);
    const normalizedExtension = typeof safeExtension === 'string' && /^[.][a-z0-9]{1,10}$/.test(safeExtension)
        ? safeExtension.toLowerCase()
        : '.jpg';

    return `batch-${safeBatchId}-item-${formatItemSeq(itemSeq)}-${safeBaseName}-queue-${safeQueueJobId}-${safeQueueFileId}${normalizedExtension}`;
};

export const sha256File = async (filePath: string) => new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = nodeFs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
});

export const parseChecksumSha256 = (value: unknown) => {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(trimmed) ? trimmed : undefined;
};
