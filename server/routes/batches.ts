import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import { upload } from '../middleware/upload.ts';
import { runVideoJobUpload } from '../middleware/videoJobUpload.ts';
import { runVideoExportUpload } from '../middleware/videoExportUpload.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import {
    buildVideoJobSourceDir,
    buildVideoJobSourceRelativePath,
    ensureVideoProcessingDirectories,
    serializeVideoProcessingJob,
    validateVideoBundleFiles
} from '../services/videoProcessing.ts';
import {
    ACTIVE_VIDEO_EXPORT_STATUSES,
    RECOVERABLE_VIDEO_EXPORT_STATUSES,
    buildVideoExportFilename,
    moveFileSafely,
    buildVideoExportPublicOutputDir,
    buildVideoExportPublicRelativePath,
    buildVideoExportPublicUrl,
    ensureVideoExportDirectories,
    parseUploadedVideoExportManifest,
    parseVideoExportManifest,
    parseVideoExportSourceFingerprint,
    VIDEO_EXPORT_ABANDONED_MESSAGE,
    VIDEO_EXPORT_CANCELLED_MESSAGE,
    sameVideoExportManifest,
    serializeBatchVideoExportSession,
    VIDEO_EXPORT_STALE_AFTER_MS,
    type UploadedVideoExportManifestEntry,
    type VideoExportManifest
} from '../services/videoExport.ts';
import { buildCloneUrl, buildQrUrl } from '../utils/cloneUrls.ts';
import { formatItemSeq, hasAllBatchMedia, isPublicPassportAvailable, isStaffRole } from '../utils/collectionWorkflow.ts';
import { resolveProjectPath } from '../utils/projectPaths.ts';
import { softDeleteBatch } from '../utils/softDelete.ts';

const router = express.Router();
const prisma = new PrismaClient();
const ACTIVE_VIDEO_JOB_STATUSES: Array<'QUEUED' | 'PROCESSING'> = ['QUEUED', 'PROCESSING'];
const VIDEO_EXPORT_LOCK_TIMEOUT_SECONDS = 15;
const PHOTO_TOOL_PUBLIC_OUTPUT_ROOT = resolveProjectPath('public', 'uploads', 'photos');
const PHOTO_TOOL_PUBLIC_URL_ROOT = '/uploads/photos';

ensureVideoProcessingDirectories();
ensureVideoExportDirectories();

const BATCH_INCLUDE = Prisma.validator<Prisma.BatchInclude>()({
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
    video_export_sessions: {
        orderBy: { created_at: 'desc' },
        take: 1
    }
});

type BatchRecord = Prisma.BatchGetPayload<{ include: typeof BATCH_INCLUDE }>;

const serializeBatch = (req: AuthRequest, batch: BatchRecord) => ({
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
    video_export: serializeBatchVideoExportSession(batch.video_export_sessions[0]),
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

const removeStagedVideoFiles = async (files: Express.Multer.File[] | undefined) => {
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

const getFileType = (filename: string): 'photo' | 'video' | null => {
    const normalized = filename.trim().toLowerCase();
    if (/\.(jpg|jpeg|png|webp)$/i.test(normalized)) return 'photo';
    if (/\.(mov|mp4|m4v|webm)$/i.test(normalized)) return 'video';
    return null;
};

const getSerialFromFilename = (filename: string): string => {
    const base = filename.trim().split('/').pop() || filename;
    return base.replace(/\.[^.]+$/, '').toUpperCase();
};

const createHttpError = (message: string, statusCode: number) =>
    Object.assign(new Error(message), { statusCode });

type PhotoToolApplyManifestEntry = {
    item_id: string;
    item_seq: number;
    source: 'existing' | 'upload';
    existing_url?: string;
    file_index?: number;
};

type PhotoToolBatchRecord = Prisma.BatchGetPayload<{
    include: {
        items: {
            where: { deleted_at: null };
            orderBy: { item_seq: 'asc' };
        };
    };
}>;

const parseOptionalText = (value: unknown) => {
    if (value == null) {
        return null;
    }

    if (typeof value !== 'string') {
        throw createHttpError('Некорректное строковое значение.', 400);
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
};

const parseNullableInteger = (value: unknown, fieldLabel: string, minimum = 0) => {
    if (value == null || value === '') {
        return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum) {
        throw createHttpError(`Поле ${fieldLabel} должно быть целым числом не меньше ${minimum}.`, 400);
    }

    return parsed;
};

const removeStagedFiles = async (files: Express.Multer.File[] | undefined) => {
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

const removeStagedVideoFile = async (file: Express.Multer.File | undefined) => {
    if (!file?.path) {
        return;
    }

    try {
        await fs.rm(file.path, { force: true });
    } catch (error) {
        console.error('Failed to remove staged export video file', file.path, error);
    }
};

const sanitizePhotoToolFilenamePart = (value: string) => {
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

const buildPhotoToolFilename = (batchId: string, itemSeq: number, originalName: string) => {
    const parsed = path.parse(originalName || '');
    const safeBaseName = sanitizePhotoToolFilenamePart(parsed.name || 'photo');
    const safeBatchId = sanitizePhotoToolFilenamePart(batchId);
    const rawExtension = (parsed.ext || '').toLowerCase();
    const safeExtension = rawExtension && /^[.][a-z0-9]{1,10}$/.test(rawExtension) ? rawExtension : '.jpg';

    return `batch-${safeBatchId}-item-${formatItemSeq(itemSeq)}-${safeBaseName}-${Date.now()}${safeExtension}`;
};

const getPhotoToolBatch = async (batchId: string) => prisma.batch.findFirst({
    where: {
        id: batchId,
        deleted_at: null
    },
    include: {
        items: {
            where: {
                deleted_at: null
            },
            orderBy: { item_seq: 'asc' }
        }
    }
});

const ensurePhotoToolBatchReady = (batch: PhotoToolBatchRecord | null) => {
    if (!batch) {
        throw createHttpError('Партия не найдена.', 404);
    }

    if (batch.status !== 'RECEIVED') {
        throw createHttpError('Назначение фото доступно только для партии в статусе RECEIVED.', 400);
    }

    if (batch.items.some((item) => item.item_seq == null)) {
        throw createHttpError('У некоторых Item отсутствует item_seq, назначение фото невозможно.', 400);
    }

    return batch as PhotoToolBatchRecord & { items: Array<PhotoToolBatchRecord['items'][number] & { item_seq: number }> };
};

const parsePhotoToolApplyManifest = (value: unknown, batch: PhotoToolBatchRecord) => {
    if (typeof value !== 'string') {
        throw createHttpError('Не передан manifest для photo-tool.', 400);
    }

    let parsedValue: unknown;
    try {
        parsedValue = JSON.parse(value);
    } catch {
        throw createHttpError('manifest photo-tool должен быть корректным JSON.', 400);
    }

    if (!Array.isArray(parsedValue)) {
        throw createHttpError('manifest photo-tool должен быть массивом.', 400);
    }

    if (parsedValue.length !== batch.items.length) {
        throw createHttpError('В manifest photo-tool должен быть полный набор Item партии.', 400);
    }

    const itemsById = new Map(batch.items.map((item) => [item.id, item]));
    const seenItemIds = new Set<string>();
    const seenSourceTokens = new Set<string>();

    return parsedValue.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw createHttpError(`manifest photo-tool: запись ${index + 1} должна быть объектом.`, 400);
        }

        const typedEntry = entry as Record<string, unknown>;
        const itemId = parseOptionalText(typedEntry.item_id);
        const itemSeq = parseNullableInteger(typedEntry.item_seq, 'item_seq', 1);
        const source = typedEntry.source;

        if (!itemId || itemSeq == null || (source !== 'existing' && source !== 'upload')) {
            throw createHttpError(`manifest photo-tool: запись ${index + 1} заполнена некорректно.`, 400);
        }

        if (seenItemIds.has(itemId)) {
            throw createHttpError('manifest photo-tool содержит дублирующиеся item_id.', 400);
        }

        const item = itemsById.get(itemId);
        if (!item || item.item_seq == null) {
            throw createHttpError('manifest photo-tool содержит item_id вне выбранной партии.', 400);
        }

        if (item.item_seq !== itemSeq) {
            throw createHttpError('manifest photo-tool содержит item_seq, не совпадающий с текущей партией.', 400);
        }

        let normalizedEntry: PhotoToolApplyManifestEntry;
        if (source === 'existing') {
            const existingUrl = parseOptionalText(typedEntry.existing_url);
            if (!existingUrl || !existingUrl.startsWith(`${PHOTO_TOOL_PUBLIC_URL_ROOT}/`)) {
                throw createHttpError('Для existing-фото разрешены только URL из /uploads/photos/.', 400);
            }

            const sourceToken = `existing:${existingUrl}`;
            if (seenSourceTokens.has(sourceToken)) {
                throw createHttpError('manifest photo-tool содержит повторное использование одной и той же фотографии.', 400);
            }

            seenSourceTokens.add(sourceToken);
            normalizedEntry = {
                item_id: itemId,
                item_seq: itemSeq,
                source,
                existing_url: existingUrl
            };
        } else {
            const fileIndex = parseNullableInteger(typedEntry.file_index, 'file_index', 0);
            if (fileIndex == null) {
                throw createHttpError('Для upload-фото обязателен file_index.', 400);
            }

            const sourceToken = `upload:${fileIndex}`;
            if (seenSourceTokens.has(sourceToken)) {
                throw createHttpError('manifest photo-tool содержит повторное использование одной и той же фотографии.', 400);
            }

            seenSourceTokens.add(sourceToken);
            normalizedEntry = {
                item_id: itemId,
                item_seq: itemSeq,
                source,
                file_index: fileIndex
            };
        }

        seenItemIds.add(itemId);
        return normalizedEntry;
    });
};

const buildVideoExportSessionInclude = Prisma.validator<Prisma.BatchVideoExportSessionInclude>()({
    batch: {
        include: {
            items: {
                where: {
                    deleted_at: null
                },
                orderBy: { item_seq: 'asc' }
            }
        }
    }
});

type VideoExportSessionRecord = Prisma.BatchVideoExportSessionGetPayload<{ include: typeof buildVideoExportSessionInclude }>;
type PrismaDbClient = PrismaClient | Prisma.TransactionClient;

const serializeVideoExportSessionDetails = (session: VideoExportSessionRecord) => ({
    session_id: session.id,
    status: session.status,
    version: session.version,
    expected_count: session.expected_count,
    uploaded_count: session.uploaded_count,
    crossfade_ms: session.crossfade_ms,
    source_fingerprint: parseVideoExportSourceFingerprint(session.source_fingerprint),
    render_manifest: parseVideoExportManifest(session.render_manifest),
    uploaded_manifest: parseUploadedVideoExportManifest(session.uploaded_manifest),
    error_message: session.error_message,
    started_at: session.started_at,
    finished_at: session.finished_at,
    created_at: session.created_at,
    updated_at: session.updated_at
});

const normalizeVideoExportManifest = (
    value: unknown,
    batchItems: Array<{ id: string; serial_number: string | null }>
): VideoExportManifest => {
    const parsed = parseVideoExportManifest((value ?? null) as Prisma.JsonValue | null);
    if (!parsed) {
        throw createHttpError('Не передан корректный render_manifest.', 400);
    }

    if (parsed.segments.length < 2) {
        throw createHttpError('Для экспорта нужен минимум фрагмент 000 и один товарный фрагмент.', 400);
    }

    const batchItemsWithSerial = batchItems.filter((item) => item.serial_number);
    if (batchItemsWithSerial.length !== batchItems.length) {
        throw createHttpError('У некоторых Item отсутствует serial_number, экспорт невозможен.', 400);
    }

    const sortedSegments = [...parsed.segments].sort((left, right) => left.sequence - right.sequence);
    sortedSegments.forEach((segment, index) => {
        if (segment.sequence !== index) {
            throw createHttpError('Нарушена последовательность segment.sequence в render_manifest.', 400);
        }

        if (!Number.isFinite(segment.start_ms) || !Number.isFinite(segment.end_ms) || segment.start_ms < 0 || segment.end_ms <= segment.start_ms) {
            throw createHttpError('Некорректные границы сегментов в render_manifest.', 400);
        }

        if (index > 0) {
            const previous = sortedSegments[index - 1];
            if ((previous.end_ms - segment.start_ms) > 1) {
                throw createHttpError('Сегменты render_manifest не должны пересекаться.', 400);
            }
        }
    });

    if (parsed.outputs.length !== batchItems.length || sortedSegments.length !== batchItems.length + 1) {
        throw createHttpError(`Количество товарных фрагментов должно совпадать с Item партии: ожидается ${batchItems.length}.`, 400);
    }

    const batchItemsById = new Map(batchItemsWithSerial.map((item) => [item.id, item]));
    const seenSegmentSeq = new Set<number>();
    const seenItemIds = new Set<string>();
    const seenSerials = new Set<string>();
    const outputs = parsed.outputs.map((output) => {
        const batchItem = batchItemsById.get(output.item_id);
        if (!batchItem || !batchItem.serial_number) {
            throw createHttpError('render_manifest содержит item_id вне выбранной партии.', 400);
        }

        if (output.serial_number !== batchItem.serial_number) {
            throw createHttpError('render_manifest.serial_number не совпадает с Item.serial_number.', 400);
        }

        if (output.segment_seq < 1 || output.segment_seq > batchItems.length) {
            throw createHttpError('render_manifest.segment_seq должен ссылаться на товарный фрагмент 001..NNN.', 400);
        }

        if (seenSegmentSeq.has(output.segment_seq) || seenItemIds.has(output.item_id) || seenSerials.has(output.serial_number)) {
            throw createHttpError('render_manifest содержит дублирующиеся item_id, serial_number или segment_seq.', 400);
        }

        seenSegmentSeq.add(output.segment_seq);
        seenItemIds.add(output.item_id);
        seenSerials.add(output.serial_number);

        return output;
    }).sort((left, right) => left.segment_seq - right.segment_seq);

    return {
        segments: sortedSegments,
        outputs
    };
};

const normalizeVideoExportSourceFingerprintInput = (value: unknown) => {
    const parsed = parseVideoExportSourceFingerprint((value ?? null) as Prisma.JsonValue | null);
    if (!parsed) {
        throw createHttpError('Не передан корректный source_fingerprint.', 400);
    }

    return parsed;
};

const loadVideoExportSession = async (db: PrismaDbClient, batchId: string, sessionId: string) => {
    return db.batchVideoExportSession.findFirst({
        where: {
            id: sessionId,
            batch_id: batchId,
            batch: {
                is: {
                    deleted_at: null
                }
            }
        },
        include: buildVideoExportSessionInclude
    });
};

const markStaleVideoExportSessions = async (db: PrismaDbClient, batchId: string) => {
    const staleThreshold = new Date(Date.now() - VIDEO_EXPORT_STALE_AFTER_MS);
    await db.batchVideoExportSession.updateMany({
        where: {
            batch_id: batchId,
            status: {
                in: [...ACTIVE_VIDEO_EXPORT_STATUSES] as Array<'OPEN' | 'UPLOADING'>
            },
            updated_at: {
                lt: staleThreshold
            }
        },
        data: {
            status: 'ABANDONED',
            error_message: VIDEO_EXPORT_ABANDONED_MESSAGE,
            finished_at: new Date()
        }
    });
};

const toLockNumber = (value: unknown) => {
    if (typeof value === 'number') {
        return value;
    }

    if (typeof value === 'bigint') {
        return Number(value);
    }

    return Number(value ?? 0);
};

const withVideoExportBatchLock = async <T>(batchId: string, handler: (tx: Prisma.TransactionClient) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
        const lockName = `video_export_batch_${batchId}`;
        const lockRows = await tx.$queryRaw<Array<{ acquired: number | bigint | null }>>`
            SELECT GET_LOCK(${lockName}, ${VIDEO_EXPORT_LOCK_TIMEOUT_SECONDS}) AS acquired
        `;
        const acquired = toLockNumber(lockRows[0]?.acquired);
        if (acquired !== 1) {
            throw createHttpError('Не удалось получить эксклюзивную блокировку для export-session партии. Повторите попытку.', 409);
        }

        try {
            return await handler(tx);
        } finally {
            await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`.catch(() => undefined);
        }
    });

const cleanupOlderCompletedVideoExports = async (batchId: string, keepVersion: number) => {
    const olderCompleted = await prisma.batchVideoExportSession.findMany({
        where: {
            batch_id: batchId,
            status: 'COMPLETED',
            version: {
                not: keepVersion
            }
        },
        select: {
            version: true
        }
    });

    await Promise.all(olderCompleted.map((session) =>
        fs.rm(buildVideoExportPublicOutputDir(batchId, session.version), { recursive: true, force: true }).catch(() => undefined)
    ));
};

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const where: Prisma.BatchWhereInput = {};
        if (req.user.role === 'FRANCHISEE') {
            where.owner_id = req.user.id;
        } else if (!isStaffRole(req.user.role)) {
            return res.sendStatus(403);
        } else {
            const staleThreshold = new Date(Date.now() - VIDEO_EXPORT_STALE_AFTER_MS);
            await prisma.batchVideoExportSession.updateMany({
                where: {
                    status: {
                        in: [...ACTIVE_VIDEO_EXPORT_STATUSES] as Array<'OPEN' | 'UPLOADING'>
                    },
                    updated_at: {
                        lt: staleThreshold
                    }
                },
                data: {
                    status: 'ABANDONED',
                    error_message: VIDEO_EXPORT_ABANDONED_MESSAGE,
                    finished_at: new Date()
                }
            });
        }

        const batches = await prisma.batch.findMany({
            where: {
                ...where,
                deleted_at: null
            },
            include: BATCH_INCLUDE,
            orderBy: { created_at: 'desc' }
        });

        res.json(batches.map((batch) => serializeBatch(req, batch)));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить партии.' });
    }
});

router.get('/:batchId/qr-pack', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.batchId,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        const serialized = serializeBatch(req, batch);
        res.json({
            batch: {
                id: serialized.id,
                status: serialized.status,
                created_at: serialized.created_at,
                collected_date: serialized.collected_date,
                collected_time: serialized.collected_time,
                gps_lat: serialized.gps_lat,
                gps_lng: serialized.gps_lng,
                video_url: serialized.video_url,
                daily_batch_seq: serialized.daily_batch_seq,
                video_processing: serialized.video_processing
            },
            product: serialized.product,
            items: serialized.items.filter((item) =>
                isPublicPassportAvailable(item.status, serialized.status)
                && Boolean(item.serial_number)
                && Boolean(item.clone_url)
                && Boolean(item.qr_url)
            )
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить QR-пакет партии.' });
    }
});

router.get('/:id/photo-tool', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const batch = ensurePhotoToolBatchReady(await getPhotoToolBatch(req.params.id));

        res.json({
            batch: {
                id: batch.id,
                status: batch.status,
                created_at: batch.created_at,
                updated_at: batch.updated_at,
                expected_photo_count: batch.items.length
            },
            items: batch.items.map((item) => ({
                id: item.id,
                temp_id: item.temp_id,
                item_seq: item.item_seq,
                serial_number: item.serial_number,
                item_photo_url: item.item_photo_url
            }))
        });
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Не удалось загрузить данные для photo-tool.';

        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/photo-tool/apply', authenticateToken, async (req: AuthRequest, res) => {
    let uploadedFiles: Express.Multer.File[] | undefined;
    const createdPaths: string[] = [];

    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await new Promise<void>((resolve, reject) => {
            upload.array('files')(req, res, (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
        if (uploadedFiles.some((file) => !file.mimetype.startsWith('image/'))) {
            throw createHttpError('Photo-tool принимает только image-файлы.', 400);
        }

        const batch = ensurePhotoToolBatchReady(await getPhotoToolBatch(req.params.id));
        const manifest = parsePhotoToolApplyManifest(req.body?.manifest, batch);
        const usedFileIndexes = manifest
            .filter((entry) => entry.source === 'upload')
            .map((entry) => entry.file_index as number)
            .sort((left, right) => left - right);

        if (usedFileIndexes.length !== uploadedFiles.length) {
            throw createHttpError('Количество upload-записей в manifest не совпадает с набором загруженных файлов.', 400);
        }

        usedFileIndexes.forEach((fileIndex, index) => {
            if (fileIndex !== index || !uploadedFiles?.[fileIndex]) {
                throw createHttpError('manifest photo-tool содержит некорректные file_index.', 400);
            }
        });

        const nextPhotoUrlByItemId = new Map<string, string>();

        for (const entry of manifest) {
            if (entry.source === 'existing') {
                nextPhotoUrlByItemId.set(entry.item_id, entry.existing_url as string);
                continue;
            }

            const uploadedFile = uploadedFiles[entry.file_index as number];
            if (!uploadedFile) {
                throw createHttpError('manifest photo-tool ссылается на отсутствующий файл.', 400);
            }

            const targetFilename = buildPhotoToolFilename(batch.id, entry.item_seq, uploadedFile.originalname);
            const targetPath = path.join(PHOTO_TOOL_PUBLIC_OUTPUT_ROOT, targetFilename);
            await moveFileSafely(uploadedFile.path, targetPath);
            createdPaths.push(targetPath);

            nextPhotoUrlByItemId.set(entry.item_id, `${PHOTO_TOOL_PUBLIC_URL_ROOT}/${targetFilename}`);
        }

        await prisma.$transaction(manifest.map((entry) =>
            prisma.item.update({
                where: { id: entry.item_id },
                data: {
                    item_photo_url: nextPhotoUrlByItemId.get(entry.item_id) || null
                }
            })
        ));

        const updatedBatch = ensurePhotoToolBatchReady(await getPhotoToolBatch(req.params.id));
        res.json({
            batch: {
                id: updatedBatch.id,
                status: updatedBatch.status,
                created_at: updatedBatch.created_at,
                updated_at: updatedBatch.updated_at,
                expected_photo_count: updatedBatch.items.length
            },
            items: updatedBatch.items.map((item) => ({
                id: item.id,
                temp_id: item.temp_id,
                item_seq: item.item_seq,
                serial_number: item.serial_number,
                item_photo_url: item.item_photo_url
            }))
        });
    } catch (error) {
        console.error(error);
        await Promise.all(createdPaths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)));
        await removeStagedFiles(uploadedFiles);

        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Не удалось применить назначения photo-tool.';

        res.status(statusCode).json({ error: message });
    }
});

router.get('/:id/video-tool', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await markStaleVideoExportSessions(prisma, req.params.id);

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        const serialized = serializeBatch(req, batch);
        res.json({
            batch: {
                id: serialized.id,
                status: serialized.status,
                created_at: serialized.created_at,
                updated_at: serialized.updated_at,
                collected_date: serialized.collected_date,
                collected_time: serialized.collected_time,
                daily_batch_seq: serialized.daily_batch_seq,
                expected_output_count: serialized.items.length,
                video_processing: serialized.video_processing,
                video_export: serialized.video_export
            },
            product: serialized.product
                ? {
                    id: serialized.product.id,
                    country_code: serialized.product.country_code,
                    location_code: serialized.product.location_code,
                    item_code: serialized.product.item_code,
                    translations: serialized.product.translations
                }
                : null,
            items: serialized.items.map((item) => ({
                id: item.id,
                temp_id: item.temp_id,
                item_seq: item.item_seq,
                serial_number: item.serial_number,
                item_video_url: item.item_video_url
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить данные для монтажного инструмента.' });
    }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const deleted = await prisma.$transaction((tx) => softDeleteBatch(tx, req.params.id));
        if (!deleted) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось удалить партию.' });
    }
});

router.post('/:id/receive', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: { collection_request: true }
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        if (batch.status !== 'TRANSIT') {
            return res.status(400).json({ error: 'В статус RECEIVED можно перевести только партию в статусе TRANSIT.' });
        }

        await prisma.$transaction([
            prisma.batch.update({
                where: { id: batch.id },
                data: { status: 'RECEIVED' }
            }),
            batch.collection_request_id
                ? prisma.collectionRequest.update({
                    where: { id: batch.collection_request_id },
                    data: { status: 'RECEIVED' }
                })
                : prisma.auditLog.create({
                    data: {
                        user_id: req.user.id,
                        action: 'BATCH_RECEIVED_WITHOUT_REQUEST',
                        details: { batchId: batch.id }
                    }
                })
        ]);

        const updated = await prisma.batch.findFirst({
            where: {
                id: batch.id,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });

        res.json(updated ? serializeBatch(req, updated) : { success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось перевести партию в RECEIVED.' });
    }
});

router.post('/:id/video-jobs', authenticateToken, async (req: AuthRequest, res) => {
    let uploadedFiles: Express.Multer.File[] | undefined;
    let sourceDir = '';
    let jobCreated = false;

    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await runVideoJobUpload(req, res);
        uploadedFiles = req.files as Express.Multer.File[] | undefined;

        if (!uploadedFiles || uploadedFiles.length === 0) {
            throw createHttpError('Не передан видео-комплект для обработки.', 400);
        }

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: {
                items: {
                    where: {
                        deleted_at: null
                    }
                },
                video_processing_jobs: {
                    where: {
                        status: {
                            in: ACTIVE_VIDEO_JOB_STATUSES
                        }
                    },
                    orderBy: { created_at: 'desc' },
                    take: 1
                }
            }
        });

        if (!batch) {
            throw createHttpError('Партия не найдена.', 404);
        }

        if (batch.status !== 'RECEIVED') {
            throw createHttpError('Автосклейка доступна только для партии в статусе RECEIVED.', 400);
        }

        if (batch.video_processing_jobs.length > 0) {
            throw createHttpError('Для партии уже выполняется обработка видео. Дождитесь завершения текущего задания.', 409);
        }

        const validatedBundle = validateVideoBundleFiles(
            uploadedFiles.map((file) => ({
                originalName: file.originalname,
                stagingPath: file.path
            })),
            batch.items.length
        );

        const latestVersionRecord = await prisma.videoProcessingJob.findFirst({
            where: { batch_id: batch.id },
            orderBy: { version: 'desc' },
            select: { version: true }
        });

        const jobId = crypto.randomUUID();
        const nextVersion = (latestVersionRecord?.version ?? 0) + 1;
        sourceDir = buildVideoJobSourceDir(jobId);
        await fs.mkdir(sourceDir, { recursive: true });

        const sourceManifest = [];
        for (const clip of validatedBundle.orderedFiles) {
            const storedName = clip.normalizedBaseName;
            const targetPath = path.join(sourceDir, storedName);
            await moveFileSafely(clip.stagingPath, targetPath);

            sourceManifest.push({
                sequence: clip.sequence,
                original_name: clip.originalName,
                stored_name: storedName,
                relative_path: buildVideoJobSourceRelativePath(jobId, storedName)
            });
        }

        const createdJob = await prisma.videoProcessingJob.create({
            data: {
                id: jobId,
                batch_id: batch.id,
                requested_by_user_id: req.user.id,
                status: 'QUEUED',
                version: nextVersion,
                source_count: validatedBundle.orderedFiles.length,
                output_count: batch.items.length,
                processed_output_count: 0,
                base_clip_name: validatedBundle.baseClip.originalName,
                source_manifest: sourceManifest as Prisma.InputJsonValue
            }
        });
        jobCreated = true;

        const updatedBatch = await prisma.batch.findFirst({
            where: {
                id: batch.id,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });

        res.status(202).json({
            job: serializeVideoProcessingJob(createdJob),
            batch: updatedBatch ? serializeBatch(req, updatedBatch) : null
        });
    } catch (error) {
        console.error(error);

        if (!jobCreated && sourceDir) {
            await fs.rm(sourceDir, { recursive: true, force: true }).catch((cleanupError) => {
                console.error('Failed to cleanup video job source directory', cleanupError);
            });
        }

        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Не удалось поставить видео-комплект в очередь обработки.';

        res.status(statusCode).json({ error: message });
    } finally {
        await removeStagedVideoFiles(uploadedFiles ?? (req.files as Express.Multer.File[] | undefined));
    }
});

router.post('/:id/video-export-sessions', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const {
            expected_count,
            crossfade_ms,
            source_fingerprint,
            render_manifest
        } = req.body as {
            expected_count?: number;
            crossfade_ms?: number;
            source_fingerprint?: unknown;
            render_manifest?: unknown;
        };

        const safeExpectedCount = typeof expected_count === 'number' ? expected_count : Number(expected_count);
        if (!Number.isFinite(safeExpectedCount)) {
            return res.status(400).json({ error: 'expected_count должен быть числом.' });
        }

        const safeCrossfadeMs = typeof crossfade_ms === 'number' ? crossfade_ms : Number(crossfade_ms);
        if (!Number.isFinite(safeCrossfadeMs) || safeCrossfadeMs < 0 || safeCrossfadeMs > 5000) {
            return res.status(400).json({ error: 'Длительность аудио-кроссфейда должна быть числом от 0 до 5000 мс.' });
        }

        const normalizedFingerprint = normalizeVideoExportSourceFingerprintInput(source_fingerprint);
        const result = await withVideoExportBatchLock(req.params.id, async (tx) => {
            await markStaleVideoExportSessions(tx, req.params.id);

            const batch = await tx.batch.findFirst({
                where: {
                    id: req.params.id,
                    deleted_at: null
                },
                include: {
                    items: {
                        where: {
                            deleted_at: null
                        },
                        orderBy: { item_seq: 'asc' }
                    }
                }
            });

            if (!batch) {
                throw createHttpError('Партия не найдена.', 404);
            }

            if (batch.status !== 'RECEIVED') {
                throw createHttpError('Монтаж видео доступен только для партии в статусе RECEIVED.', 400);
            }

            if (safeExpectedCount !== batch.items.length) {
                throw createHttpError(`Количество товарных фрагментов должно совпадать с количеством Item партии: ${batch.items.length}.`, 400);
            }

            const normalizedManifest = normalizeVideoExportManifest(render_manifest, batch.items);

            const latestReusable = await tx.batchVideoExportSession.findFirst({
                where: {
                    batch_id: batch.id,
                    status: {
                        in: [...RECOVERABLE_VIDEO_EXPORT_STATUSES] as Array<'OPEN' | 'UPLOADING' | 'FAILED' | 'ABANDONED'>
                    }
                },
                orderBy: { created_at: 'desc' },
                include: buildVideoExportSessionInclude
            });

            if (latestReusable) {
                const existingManifest = parseVideoExportManifest(latestReusable.render_manifest);
                const sameManifestConfig = sameVideoExportManifest(existingManifest, normalizedManifest)
                    && latestReusable.crossfade_ms === safeCrossfadeMs
                    && latestReusable.expected_count === batch.items.length;

                if (latestReusable.uploaded_count > 0 && !sameManifestConfig) {
                    throw createHttpError('Для незавершённой сессии уже загружены файлы. Продолжайте текущую сессию без изменения нарезки.', 409);
                }

                const updatedSession = latestReusable.uploaded_count === 0 || latestReusable.status !== 'OPEN'
                    ? await tx.batchVideoExportSession.update({
                        where: { id: latestReusable.id },
                        data: {
                            status: 'OPEN',
                            expected_count: batch.items.length,
                            crossfade_ms: safeCrossfadeMs,
                            source_fingerprint: normalizedFingerprint as Prisma.InputJsonValue,
                            render_manifest: normalizedManifest as Prisma.InputJsonValue,
                            error_message: null,
                            started_at: latestReusable.started_at ?? new Date(),
                            finished_at: null
                        },
                        include: buildVideoExportSessionInclude
                    })
                    : latestReusable;

                return {
                    statusCode: 200,
                    payload: {
                        session: serializeVideoExportSessionDetails(updatedSession),
                        resumed: true
                    }
                };
            }

            const latestVersionRecord = await tx.batchVideoExportSession.findFirst({
                where: { batch_id: batch.id },
                orderBy: { version: 'desc' },
                select: { version: true }
            });

            const createdSession = await tx.batchVideoExportSession.create({
                data: {
                    batch_id: batch.id,
                    created_by_user_id: req.user!.id,
                    status: 'OPEN',
                    version: (latestVersionRecord?.version ?? 0) + 1,
                    expected_count: batch.items.length,
                    uploaded_count: 0,
                    crossfade_ms: safeCrossfadeMs,
                    source_fingerprint: normalizedFingerprint as Prisma.InputJsonValue,
                    render_manifest: normalizedManifest as Prisma.InputJsonValue
                },
                include: buildVideoExportSessionInclude
            });

            return {
                statusCode: 201,
                payload: {
                    session: serializeVideoExportSessionDetails(createdSession),
                    resumed: false
                }
            };
        });

        res.status(result.statusCode).json(result.payload);
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Не удалось создать сессию экспорта видео.';

        res.status(statusCode).json({ error: message });
    }
});

router.get('/:id/video-export-sessions/:sessionId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await markStaleVideoExportSessions(prisma, req.params.id);
        const session = await loadVideoExportSession(prisma, req.params.id, req.params.sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Сессия экспорта не найдена.' });
        }

        res.json({
            session: serializeVideoExportSessionDetails(session)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить сессию экспорта.' });
    }
});

router.post('/:id/video-export-sessions/:sessionId/files', authenticateToken, async (req: AuthRequest, res) => {
    let uploadedFile: Express.Multer.File | undefined;
    let loadedSessionId: string | null = null;

    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await runVideoExportUpload(req, res);
        uploadedFile = req.file as Express.Multer.File | undefined;

        if (!uploadedFile) {
            throw createHttpError('Не передан финальный MP4-файл.', 400);
        }

        const serialNumber = typeof req.body.serial_number === 'string'
            ? req.body.serial_number.trim().toUpperCase()
            : '';
        if (!serialNumber) {
            throw createHttpError('Не передан serial_number для финального ролика.', 400);
        }
        const result = await withVideoExportBatchLock(req.params.id, async (tx) => {
            await markStaleVideoExportSessions(tx, req.params.id);

            const loadedSession = await loadVideoExportSession(tx, req.params.id, req.params.sessionId);
            if (!loadedSession) {
                throw createHttpError('Сессия экспорта не найдена.', 404);
            }
            loadedSessionId = loadedSession.id;

            if (loadedSession.batch.status !== 'RECEIVED') {
                throw createHttpError('Дозагрузка финальных роликов доступна только для партии в статусе RECEIVED.', 400);
            }

            if (loadedSession.status === 'CANCELLED') {
                throw createHttpError('Сессия экспорта отменена и больше не принимает загрузки.', 409);
            }

            const manifest = parseVideoExportManifest(loadedSession.render_manifest);
            if (!manifest) {
                throw createHttpError('В сессии отсутствует render_manifest.', 400);
            }

            const outputBySerial = new Map(manifest.outputs.map((output) => [output.serial_number.toUpperCase(), output]));
            const targetOutput = outputBySerial.get(serialNumber);
            if (!targetOutput) {
                throw createHttpError('serial_number не относится к текущей сессии экспорта.', 400);
            }

            const batchItem = loadedSession.batch.items.find((item) => item.id === targetOutput.item_id && item.serial_number?.toUpperCase() === serialNumber);
            if (!batchItem || !batchItem.serial_number) {
                throw createHttpError('serial_number не найден среди Item выбранной партии.', 400);
            }

            const uploadedManifest = parseUploadedVideoExportManifest(loadedSession.uploaded_manifest);
            const existingEntry = uploadedManifest.find((entry) => entry.serial_number.toUpperCase() === serialNumber);
            if (existingEntry) {
                return {
                    duplicate: true,
                    batchId: loadedSession.batch_id,
                    version: loadedSession.version,
                    shouldComplete: false as const,
                    session: serializeVideoExportSessionDetails(loadedSession)
                };
            }

            const outputDir = buildVideoExportPublicOutputDir(loadedSession.batch_id, loadedSession.version);
            await fs.mkdir(outputDir, { recursive: true });

            const fileName = buildVideoExportFilename(serialNumber);
            const targetPath = path.join(outputDir, fileName);
            await fs.rm(targetPath, { force: true });
            await moveFileSafely(uploadedFile!.path, targetPath);
            uploadedFile = undefined;

            const nextManifestEntry: UploadedVideoExportManifestEntry = {
                serial_number: serialNumber,
                item_id: batchItem.id,
                file_name: fileName,
                relative_path: buildVideoExportPublicRelativePath(loadedSession.batch_id, loadedSession.version, fileName),
                public_url: buildVideoExportPublicUrl(loadedSession.batch_id, loadedSession.version, fileName),
                uploaded_at: new Date().toISOString()
            };
            const nextManifest = [...uploadedManifest, nextManifestEntry];
            if (nextManifest.length > loadedSession.expected_count) {
                throw createHttpError('Загружено больше финальных роликов, чем ожидает сессия.', 400);
            }

            const shouldComplete = nextManifest.length === loadedSession.expected_count;
            if (shouldComplete) {
                const uniqueSerials = new Set(nextManifest.map((entry) => entry.serial_number.toUpperCase()));
                if (uniqueSerials.size !== loadedSession.expected_count) {
                    throw createHttpError('В uploaded_manifest обнаружены дубли serial_number.', 400);
                }

                const missingOutput = manifest.outputs.find((output) => !uniqueSerials.has(output.serial_number.toUpperCase()));
                if (missingOutput) {
                    throw createHttpError('Не все финальные ролики загружены в сессию.', 400);
                }

                for (const entry of nextManifest) {
                    await tx.item.update({
                        where: { id: entry.item_id },
                        data: {
                            item_video_url: entry.public_url
                        }
                    });
                }
            }

            await tx.batchVideoExportSession.update({
                where: { id: loadedSession.id },
                data: {
                    status: shouldComplete ? 'COMPLETED' : 'UPLOADING',
                    uploaded_count: nextManifest.length,
                    uploaded_manifest: nextManifest as Prisma.InputJsonValue,
                    error_message: null,
                    started_at: loadedSession.started_at ?? new Date(),
                    finished_at: shouldComplete ? new Date() : null
                }
            });

            const updatedSession = await tx.batchVideoExportSession.findUniqueOrThrow({
                where: { id: loadedSession.id },
                include: buildVideoExportSessionInclude
            });

            return {
                duplicate: false,
                batchId: loadedSession.batch_id,
                shouldComplete,
                version: loadedSession.version,
                session: serializeVideoExportSessionDetails(updatedSession)
            };
        });

        if (!result.duplicate && result.shouldComplete) {
            await cleanupOlderCompletedVideoExports(result.batchId, result.version);
        }

        res.json(result);
    } catch (error) {
        console.error(error);

        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Не удалось загрузить финальный ролик.';

        if (loadedSessionId && statusCode >= 500) {
            await prisma.batchVideoExportSession.update({
                where: { id: loadedSessionId },
                data: {
                    status: 'FAILED',
                    error_message: message
                }
            }).catch(() => undefined);
        }

        res.status(statusCode).json({ error: message });
    } finally {
        await removeStagedVideoFile(uploadedFile);
    }
});

router.post('/:id/video-export-sessions/:sessionId/retry-tail', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const result = await withVideoExportBatchLock(req.params.id, async (tx) => {
            await markStaleVideoExportSessions(tx, req.params.id);

            const session = await loadVideoExportSession(tx, req.params.id, req.params.sessionId);
            if (!session) {
                throw createHttpError('Сессия экспорта не найдена.', 404);
            }

            if (session.batch.status !== 'RECEIVED') {
                throw createHttpError('Повторная дозагрузка доступна только для партии в статусе RECEIVED.', 400);
            }

            if (session.status === 'COMPLETED') {
                return {
                    session: serializeVideoExportSessionDetails(session),
                    pending_serials: [] as string[],
                    resumed: false,
                    recovered_stale: false
                };
            }

            if (session.status === 'CANCELLED') {
                throw createHttpError('Отменённую export-session нельзя возобновить. Создайте новую сессию.', 409);
            }

            const manifest = parseVideoExportManifest(session.render_manifest);
            if (!manifest) {
                throw createHttpError('В сессии отсутствует render_manifest.', 400);
            }

            const uploadedSerials = new Set(
                parseUploadedVideoExportManifest(session.uploaded_manifest).map((entry) => entry.serial_number.toUpperCase())
            );
            const pendingSerials = manifest.outputs
                .map((output) => output.serial_number)
                .filter((serialNumber) => !uploadedSerials.has(serialNumber.toUpperCase()));

            const recoveredStale = session.status === 'ABANDONED';
            const reopenedSession = await tx.batchVideoExportSession.update({
                where: { id: session.id },
                data: {
                    status: pendingSerials.length > 0 ? 'OPEN' : session.status,
                    error_message: null,
                    started_at: session.started_at ?? new Date(),
                    finished_at: pendingSerials.length > 0 ? null : session.finished_at
                },
                include: buildVideoExportSessionInclude
            });

            return {
                session: serializeVideoExportSessionDetails(reopenedSession),
                pending_serials: pendingSerials,
                resumed: pendingSerials.length > 0,
                recovered_stale: recoveredStale
            };
        });

        res.json(result);
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Не удалось подготовить retry-tail для export-session.';

        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-sessions/:sessionId/cancel', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const result = await withVideoExportBatchLock(req.params.id, async (tx) => {
            await markStaleVideoExportSessions(tx, req.params.id);

            const session = await loadVideoExportSession(tx, req.params.id, req.params.sessionId);
            if (!session) {
                throw createHttpError('Сессия экспорта не найдена.', 404);
            }

            if (session.status === 'COMPLETED') {
                throw createHttpError('Завершённую export-session нельзя отменить.', 409);
            }

            if (session.status === 'CANCELLED') {
                return {
                    session: serializeVideoExportSessionDetails(session),
                    cancelled: true
                };
            }

            const cancelledSession = await tx.batchVideoExportSession.update({
                where: { id: session.id },
                data: {
                    status: 'CANCELLED',
                    error_message: VIDEO_EXPORT_CANCELLED_MESSAGE,
                    finished_at: new Date()
                },
                include: buildVideoExportSessionInclude
            });

            return {
                session: serializeVideoExportSessionDetails(cancelledSession),
                cancelled: true
            };
        });

        res.json(result);
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Не удалось отменить export-session.';

        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/media-sync', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const { files } = req.body as {
            files?: Array<{ name?: string; url?: string }>;
        };

        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: 'Не передан список файлов для сопоставления.' });
        }

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: {
                items: {
                    where: {
                        deleted_at: null
                    }
                }
            }
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        const bySerial = new Map(
            batch.items
                .filter((item) => item.serial_number)
                .map((item) => [String(item.serial_number).toUpperCase(), item])
        );

        const matched: string[] = [];
        const unmatched: string[] = [];

        await prisma.$transaction(async (tx) => {
            for (const file of files) {
                const safeName = typeof file?.name === 'string' ? file.name.trim() : '';
                const safeUrl = typeof file?.url === 'string' ? file.url.trim() : '';
                const fileType = safeName ? getFileType(safeName) : null;

                if (!safeName || !safeUrl || !fileType) {
                    unmatched.push(safeName || '(unknown)');
                    continue;
                }

                const serial = getSerialFromFilename(safeName);
                const item = bySerial.get(serial);
                if (!item) {
                    unmatched.push(safeName);
                    continue;
                }

                await tx.item.update({
                    where: { id: item.id },
                    data: fileType === 'photo'
                        ? { item_photo_url: safeUrl }
                        : { item_video_url: safeUrl }
                });

                matched.push(safeName);
            }
        });

        const updated = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });

        res.json({
            matched,
            unmatched,
            batch: updated ? serializeBatch(req, updated) : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось сопоставить media-файлы партии.' });
    }
});

router.post('/:id/finalize', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);
        const updated = await withVideoExportBatchLock(req.params.id, async (tx) => {
            await markStaleVideoExportSessions(tx, req.params.id);

            const batch = await tx.batch.findFirst({
                where: {
                    id: req.params.id,
                    deleted_at: null
                },
                include: {
                    items: {
                        where: {
                            deleted_at: null
                        }
                    },
                    collection_request: true,
                    video_processing_jobs: {
                        where: {
                            status: {
                                in: ACTIVE_VIDEO_JOB_STATUSES
                            }
                        },
                        take: 1
                    },
                    video_export_sessions: {
                        where: {
                            status: {
                                in: [...ACTIVE_VIDEO_EXPORT_STATUSES] as Array<'OPEN' | 'UPLOADING'>
                            }
                        },
                        take: 1
                    }
                }
            });

            if (!batch) {
                throw createHttpError('Партия не найдена.', 404);
            }

            if (batch.status !== 'RECEIVED') {
                throw createHttpError('Завершить можно только партию в статусе RECEIVED.', 400);
            }

            if (batch.video_processing_jobs.length > 0) {
                throw createHttpError('Нельзя завершить партию, пока идет обработка видео-комплекта.', 400);
            }

            if (batch.video_export_sessions.length > 0) {
                throw createHttpError('Нельзя завершить партию, пока идёт локальный экспорт видео.', 400);
            }

            if (!hasAllBatchMedia(batch.items)) {
                throw createHttpError('Для каждого камня обязательны фото и видео перед завершением партии.', 400);
            }

            await tx.batch.update({
                where: { id: batch.id },
                data: { status: 'FINISHED' }
            });
            await tx.item.updateMany({
                where: {
                    batch_id: batch.id,
                    status: 'NEW',
                    deleted_at: null
                },
                data: { status: 'STOCK_HQ' }
            });

            if (batch.collection_request_id) {
                await tx.collectionRequest.update({
                    where: { id: batch.collection_request_id },
                    data: { status: 'IN_STOCK' }
                });
            } else {
                await tx.auditLog.create({
                    data: {
                        user_id: req.user!.id,
                        action: 'BATCH_FINALIZED_WITHOUT_REQUEST',
                        details: { batchId: batch.id }
                    }
                });
            }

            return tx.batch.findFirst({
                where: {
                    id: batch.id,
                    deleted_at: null
                },
                include: BATCH_INCLUDE
            });
        });

        res.json(updated ? serializeBatch(req, updated) : { success: true });
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Не удалось завершить партию.';
        res.status(statusCode).json({ error: message });
    }
});

export default router;
