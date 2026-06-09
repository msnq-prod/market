import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import sharp, { type Metadata } from 'sharp';
import { loadBatchMediaSnapshot, queueBatchMediaReadyNotifications, runTelegramSideEffect } from './telegramNotifications.ts';
import { prisma } from './prisma.ts';
import { writeSecurityAuditLog } from './security.ts';
import {
    PHOTO_TOOL_PUBLIC_OUTPUT_ROOT,
    PHOTO_TOOL_PUBLIC_URL_ROOT,
    sha256File
} from '../routes/batches/shared.ts';
import {
    buildPhotoToolStateToken,
    getPhotoToolPayload
} from '../routes/batches/photoToolService.ts';
import { resolveProjectPath } from '../utils/projectPaths.ts';
import { logDomainEvent } from './logger.ts';

export type PhotoToolV2ErrorCode =
    | 'BATCH_NOT_RECEIVED'
    | 'RUN_MANIFEST_CONFLICT'
    | 'PHOTO_TOOL_RUN_STALE'
    | 'PHOTO_TOOL_RUN_NOT_READY'
    | 'CHECKSUM_MISMATCH'
    | 'PHOTO_VALIDATION_FAILED'
    | 'UPLOAD_LIMIT_EXCEEDED'
    | 'UPLOAD_INTENT_EXPIRED'
    | 'UPLOAD_INTENT_CORRUPT'
    | 'UPLOAD_CHUNK_CONFLICT'
    | 'UPLOAD_CHUNKS_MISSING';

export class PhotoToolV2HttpError extends Error {
    statusCode: number;
    code?: PhotoToolV2ErrorCode;
    details?: unknown;

    constructor(message: string, statusCode: number, code?: PhotoToolV2ErrorCode, details?: unknown) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

export const getPhotoToolV2ErrorStatus = (error: unknown) =>
    typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

export const getPhotoToolV2ErrorCode = (error: unknown) =>
    typeof (error as { code?: unknown })?.code === 'string'
        ? String((error as { code: string }).code)
        : undefined;

export const getPhotoToolV2ErrorDetails = (error: unknown) =>
    (error as { details?: unknown })?.details;

const RUN_INCLUDE = Prisma.validator<Prisma.PhotoToolRunInclude>()({
    items: {
        orderBy: { item_seq: 'asc' }
    }
});

const BATCH_INCLUDE = Prisma.validator<Prisma.BatchInclude>()({
    items: {
        where: { deleted_at: null },
        orderBy: { item_seq: 'asc' }
    }
});

type PhotoToolRunRecord = Prisma.PhotoToolRunGetPayload<{ include: typeof RUN_INCLUDE }>;
type PhotoToolBatchRecord = Prisma.BatchGetPayload<{ include: typeof BATCH_INCLUDE }>;

type PhotoExportSettings = {
    format: 'jpeg';
    quality: number;
    maxWidth: number;
    maxHeight: number;
};

type PhotoManifestItem = {
    itemId: string;
    itemSeq: number;
    source: 'existing' | 'upload';
    existingUrl?: string;
    fileName?: string;
};

type PhotoManifestV2 = {
    manifestVersion: 2;
    batchId: string;
    runId: string;
    basePhotoStateToken: string;
    photoExportSettings: PhotoExportSettings;
    items: PhotoManifestItem[];
};

type UploadIntentMetadata = {
    upload_id: string;
    run_id: string;
    item_id: string;
    item_seq: number;
    file_name: string;
    file_size_bytes: number;
    checksum_sha256: string;
    chunk_size_bytes: number;
    expires_at: string;
    chunks: Record<string, string>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;
const UPLOAD_INTENTS_ROOT = resolveProjectPath('storage', 'photo-tool-v2', 'upload-intents');
const INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PHOTO_V2_FILE_SIZE_BYTES = 40 * 1024 * 1024;
const MIN_PHOTO_V2_CHUNK_SIZE_BYTES = 256 * 1024;
const MAX_PHOTO_V2_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_PHOTO_V2_CHUNKS = 100;
const TERMINAL_RUN_STATUSES = ['CANCELLED', 'COMPLETED', 'STALE'] as const;
const uploadIntentLocks = new Map<string, Promise<void>>();
const CORRUPT_INTENT_GRACE_MS = 60 * 60 * 1000;
const ACTIVE_RUN_STUCK_MS = 30 * 60 * 1000;
const COMMIT_RUN_STUCK_MS = 5 * 60 * 1000;
const STUCK_RUN_LOG_THROTTLE_MS = 15 * 60 * 1000;
const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
const photoToolV2StuckRunLastWarnAt = new Map<string, number>();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isUuid = (value: unknown): value is string =>
    typeof value === 'string' && UUID_RE.test(value);

const stableJson = (value: unknown): string => {
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
    }
    if (isPlainObject(value)) {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const parsePositiveInteger = (value: unknown, fieldName: string) => {
    if (!Number.isInteger(value) || Number(value) <= 0) {
        throw new PhotoToolV2HttpError(`${fieldName} должен быть положительным целым числом.`, 400);
    }

    return Number(value);
};

const validateUploadIntentSizing = (fileSizeBytes: number, chunkSizeBytes: number) => {
    if (fileSizeBytes > MAX_PHOTO_V2_FILE_SIZE_BYTES) {
        throw new PhotoToolV2HttpError('Файл превышает лимит Photo Tool v2.', 413, 'UPLOAD_LIMIT_EXCEEDED', {
            max_file_size_bytes: MAX_PHOTO_V2_FILE_SIZE_BYTES
        });
    }
    if (chunkSizeBytes < MIN_PHOTO_V2_CHUNK_SIZE_BYTES || chunkSizeBytes > MAX_PHOTO_V2_CHUNK_SIZE_BYTES) {
        throw new PhotoToolV2HttpError('Размер chunk выходит за лимиты Photo Tool v2.', 400, 'UPLOAD_LIMIT_EXCEEDED', {
            min_chunk_size_bytes: MIN_PHOTO_V2_CHUNK_SIZE_BYTES,
            max_chunk_size_bytes: MAX_PHOTO_V2_CHUNK_SIZE_BYTES
        });
    }
    if (Math.ceil(fileSizeBytes / chunkSizeBytes) > MAX_PHOTO_V2_CHUNKS) {
        throw new PhotoToolV2HttpError('Слишком много chunks для одного фото.', 400, 'UPLOAD_LIMIT_EXCEEDED', {
            max_chunks: MAX_PHOTO_V2_CHUNKS
        });
    }
};

const parseNonEmptyString = (value: unknown, fieldName: string) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new PhotoToolV2HttpError(`${fieldName} обязателен.`, 400);
    }

    return value.trim();
};

const parseSha256 = (value: unknown, fieldName: string) => {
    const parsed = parseNonEmptyString(value, fieldName).toLowerCase();
    if (!SHA256_RE.test(parsed)) {
        throw new PhotoToolV2HttpError(`${fieldName} должен быть sha256.`, 400);
    }

    return parsed;
};

const parsePhotoExportSettings = (value: unknown): PhotoExportSettings => {
    if (!isPlainObject(value)) {
        throw new PhotoToolV2HttpError('photo_export_settings должен быть объектом.', 400);
    }

    const quality = value.quality;
    const maxWidth = value.maxWidth;
    const maxHeight = value.maxHeight;
    if (value.format !== 'jpeg'
        || !Number.isInteger(quality) || Number(quality) < 40 || Number(quality) > 95
        || !Number.isInteger(maxWidth) || Number(maxWidth) < 800 || Number(maxWidth) > 4096
        || !Number.isInteger(maxHeight) || Number(maxHeight) < 800 || Number(maxHeight) > 4096) {
        throw new PhotoToolV2HttpError('Некорректные photo_export_settings.', 400);
    }

    return {
        format: 'jpeg',
        quality: Number(quality),
        maxWidth: Number(maxWidth),
        maxHeight: Number(maxHeight)
    };
};

const parsePhotoManifestV2 = (value: unknown, batchId: string, runId: string): PhotoManifestV2 => {
    if (!isPlainObject(value)) {
        throw new PhotoToolV2HttpError('Некорректный manifest.', 400);
    }

    if (value.manifestVersion !== 2 || value.batchId !== batchId || value.runId !== runId) {
        throw new PhotoToolV2HttpError('Некорректный manifest.', 400);
    }

    const basePhotoStateToken = parseNonEmptyString(value.basePhotoStateToken, 'basePhotoStateToken');
    const photoExportSettings = parsePhotoExportSettings(value.photoExportSettings);
    if (!Array.isArray(value.items) || value.items.length === 0) {
        throw new PhotoToolV2HttpError('manifest.items обязателен.', 400);
    }

    const items = value.items.map((entry): PhotoManifestItem => {
        if (!isPlainObject(entry)) {
            throw new PhotoToolV2HttpError('Некорректный item в manifest.', 400);
        }

        const itemId = parseNonEmptyString(entry.itemId, 'itemId');
        const itemSeq = parsePositiveInteger(entry.itemSeq, 'itemSeq');
        if (entry.source === 'existing') {
            return {
                itemId,
                itemSeq,
                source: 'existing',
                existingUrl: parseNonEmptyString(entry.existingUrl, 'existingUrl')
            };
        }
        if (entry.source === 'upload') {
            return {
                itemId,
                itemSeq,
                source: 'upload',
                fileName: parseNonEmptyString(entry.fileName, 'fileName')
            };
        }

        throw new PhotoToolV2HttpError('manifest item source должен быть existing или upload.', 400);
    });

    return {
        manifestVersion: 2,
        batchId,
        runId,
        basePhotoStateToken,
        photoExportSettings,
        items
    };
};

const serializeRun = (run: PhotoToolRunRecord) => ({
    id: run.id,
    batch_id: run.batch_id,
    status: run.status,
    expected_count: run.expected_count,
    uploaded_count: run.uploaded_count,
    base_photo_state_token: run.base_photo_state_token,
    photo_export_settings: run.photo_export_settings,
    manifest: run.manifest,
    error_message: run.error_message,
    committed_at: run.committed_at,
    created_at: run.created_at,
    updated_at: run.updated_at,
    items: run.items.map((item) => ({
        id: item.id,
        run_id: item.run_id,
        item_id: item.item_id,
        item_seq: item.item_seq,
        source_type: item.source_type,
        status: item.status,
        file_url: item.file_url,
        existing_url: item.existing_url,
        checksum_sha256: item.checksum_sha256,
        file_size_bytes: item.file_size_bytes,
        error_message: item.error_message,
        uploaded_at: item.uploaded_at,
        committed_at: item.committed_at
    }))
});

const getPhotoToolBatch = async (batchId: string) => prisma.batch.findFirst({
    where: { id: batchId, deleted_at: null },
    include: BATCH_INCLUDE
});

const ensureBatchReady = (batch: PhotoToolBatchRecord | null) => {
    if (!batch) {
        throw new PhotoToolV2HttpError('Партия не найдена.', 404);
    }
    if (batch.status !== 'RECEIVED') {
        throw new PhotoToolV2HttpError('Партия должна быть в статусе RECEIVED.', 409, 'BATCH_NOT_RECEIVED');
    }
    if (batch.items.some((item) => item.item_seq == null)) {
        throw new PhotoToolV2HttpError('У некоторых Item отсутствует item_seq.', 400);
    }

    return batch as PhotoToolBatchRecord & { items: Array<PhotoToolBatchRecord['items'][number] & { item_seq: number }> };
};

const validateManifestAgainstBatch = (manifest: PhotoManifestV2, batch: ReturnType<typeof ensureBatchReady>) => {
    if (manifest.items.length !== batch.items.length) {
        throw new PhotoToolV2HttpError('manifest должен содержать полный набор item партии.', 400);
    }
    if (manifest.basePhotoStateToken !== buildPhotoToolStateToken(batch)) {
        throw new PhotoToolV2HttpError('Фото партии уже изменились.', 409, 'PHOTO_TOOL_RUN_STALE');
    }

    const itemsById = new Map(batch.items.map((item) => [item.id, item]));
    const seenItemIds = new Set<string>();
    const seenItemSeqs = new Set<number>();
    const currentBatchPhotoUrls = new Set(batch.items.flatMap((item) => item.item_photo_url ? [item.item_photo_url] : []));

    for (const entry of manifest.items) {
        const item = itemsById.get(entry.itemId);
        if (!item || item.item_seq !== entry.itemSeq) {
            throw new PhotoToolV2HttpError('manifest содержит item вне партии или неверный item_seq.', 400);
        }
        if (seenItemIds.has(entry.itemId) || seenItemSeqs.has(entry.itemSeq)) {
            throw new PhotoToolV2HttpError('manifest содержит дубли item.', 400);
        }
        if (entry.source === 'existing') {
            const existingUrl = entry.existingUrl || '';
            if (!existingUrl || (!existingUrl.startsWith(`${PHOTO_TOOL_PUBLIC_URL_ROOT}/`) && !currentBatchPhotoUrls.has(existingUrl))) {
                throw new PhotoToolV2HttpError('Для existing-фото разрешены только текущие фото партии или URL из /uploads/photos/.', 400);
            }
        }
        seenItemIds.add(entry.itemId);
        seenItemSeqs.add(entry.itemSeq);
    }
};

export const getPhotoToolV2Batch = async (batchId: string) => getPhotoToolPayload(batchId);

export const createPhotoToolV2Run = async (
    batchId: string,
    userId: string,
    body: unknown
) => {
    if (!isPlainObject(body)) {
        throw new PhotoToolV2HttpError('Некорректный запрос.', 400);
    }

    const clientRunId = body.client_run_id;
    const expectedCount = body.expected_count;
    if (!isUuid(clientRunId) || !Number.isInteger(expectedCount) || Number(expectedCount) < 0) {
        throw new PhotoToolV2HttpError('Некорректные параметры запуска.', 400);
    }

    const manifest = parsePhotoManifestV2(body.manifest, batchId, clientRunId);
    if (manifest.items.length !== Number(expectedCount)) {
        throw new PhotoToolV2HttpError('expected_count не совпадает с manifest.items.', 400);
    }

    const existingRun = await prisma.photoToolRun.findUnique({
        where: { id: clientRunId },
        include: RUN_INCLUDE
    });
    if (existingRun) {
        if (existingRun.batch_id !== batchId || stableJson(existingRun.manifest) !== stableJson(manifest)) {
            throw new PhotoToolV2HttpError('Run с таким client_run_id уже создан с другим manifest.', 409, 'RUN_MANIFEST_CONFLICT');
        }
        if (['READY_TO_COMMIT', 'COMMITTING'].includes(existingRun.status)) {
            await attemptPhotoToolV2AutoCommit(existingRun.id, userId);
            const latestRun = await prisma.photoToolRun.findUnique({
                where: { id: existingRun.id },
                include: RUN_INCLUDE
            });
            return { statusCode: 200, payload: serializeRun(latestRun || existingRun) };
        }
        return { statusCode: 200, payload: serializeRun(existingRun) };
    }

    const batch = ensureBatchReady(await getPhotoToolBatch(batchId));
    validateManifestAgainstBatch(manifest, batch);
    const reusedCount = manifest.items.filter((item) => item.source === 'existing').length;
    const now = new Date();
    const run = await prisma.photoToolRun.create({
        data: {
            id: clientRunId,
            batch_id: batchId,
            created_by_user_id: userId,
            expected_count: Number(expectedCount),
            uploaded_count: reusedCount,
            status: reusedCount === manifest.items.length ? 'READY_TO_COMMIT' : reusedCount > 0 ? 'UPLOADING' : 'OPEN',
            base_photo_state_token: manifest.basePhotoStateToken,
            photo_export_settings: manifest.photoExportSettings as unknown as Prisma.InputJsonValue,
            manifest: manifest as unknown as Prisma.InputJsonValue,
            items: {
                create: manifest.items.map((item) => item.source === 'existing'
                    ? {
                        item_id: item.itemId,
                        item_seq: item.itemSeq,
                        source_type: 'EXISTING',
                        status: 'REUSED',
                        existing_url: item.existingUrl,
                        file_url: item.existingUrl,
                        uploaded_at: now
                    }
                    : {
                        item_id: item.itemId,
                        item_seq: item.itemSeq,
                        source_type: 'UPLOAD',
                        status: 'PENDING'
                    })
            }
        },
        include: RUN_INCLUDE
    });

    if (run.status === 'READY_TO_COMMIT') {
        await attemptPhotoToolV2AutoCommit(run.id, userId);
        const latestRun = await prisma.photoToolRun.findUnique({
            where: { id: run.id },
            include: RUN_INCLUDE
        });
        return { statusCode: 201, payload: serializeRun(latestRun || run) };
    }

    return { statusCode: 201, payload: serializeRun(run) };
};

export const getPhotoToolV2Run = async (runId: string, userId?: string) => {
    if (userId) {
        await attemptPhotoToolV2AutoCommit(runId, userId);
    }

    const run = await prisma.photoToolRun.findUnique({
        where: { id: runId },
        include: RUN_INCLUDE
    });
    if (!run) {
        throw new PhotoToolV2HttpError('Run не найден.', 404);
    }

    return serializeRun(run);
};

const loadRunItemForUpload = async (
    runId: string,
    itemId: string,
    options: { allowTerminalLookup?: boolean } = {}
) => {
    const run = await prisma.photoToolRun.findUnique({
        where: { id: runId },
        include: {
            items: {
                where: { item_id: itemId },
                include: { item: true }
            }
        }
    });
    if (!run || run.items.length === 0) {
        throw new PhotoToolV2HttpError('Run item не найден.', 404);
    }
    if (!options.allowTerminalLookup && ['CANCELLED', 'COMPLETED', 'STALE'].includes(run.status)) {
        throw new PhotoToolV2HttpError('Run не принимает upload.', 409);
    }
    const runItem = run.items[0];
    if (runItem.source_type !== 'UPLOAD') {
        throw new PhotoToolV2HttpError('Upload intent доступен только для upload item.', 409);
    }

    return { run, runItem };
};

const buildUploadId = (runId: string, itemId: string, checksumSha256: string) =>
    `photo_v2_${crypto.createHash('sha256').update(`${runId}:${itemId}:${checksumSha256}`).digest('hex')}`;

const getIntentDir = (uploadId: string) => path.join(UPLOAD_INTENTS_ROOT, uploadId);
const getIntentPath = (uploadId: string) => path.join(getIntentDir(uploadId), 'intent.json');
const getChunksDir = (uploadId: string) => path.join(getIntentDir(uploadId), 'chunks');
const getChunkPath = (uploadId: string, chunkIndex: number) => path.join(getChunksDir(uploadId), `${chunkIndex}.part`);
const getExpectedChunkCount = (intent: UploadIntentMetadata) =>
    Math.ceil(intent.file_size_bytes / intent.chunk_size_bytes);
const getExpectedChunkSize = (intent: UploadIntentMetadata, chunkIndex: number) => {
    const isLastChunk = chunkIndex === getExpectedChunkCount(intent) - 1;
    return isLastChunk
        ? intent.file_size_bytes - (intent.chunk_size_bytes * chunkIndex)
        : intent.chunk_size_bytes;
};

const ensureInsideIntentRoot = (targetPath: string) => {
    const root = path.resolve(UPLOAD_INTENTS_ROOT);
    const resolved = path.resolve(targetPath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        throw new PhotoToolV2HttpError('Некорректный upload_id.', 400);
    }
};

const writeIntent = async (intent: UploadIntentMetadata) => {
    const intentDir = getIntentDir(intent.upload_id);
    ensureInsideIntentRoot(intentDir);
    await fs.mkdir(getChunksDir(intent.upload_id), { recursive: true });
    const intentPath = getIntentPath(intent.upload_id);
    const tempPath = path.join(intentDir, `.${process.pid}.${Date.now()}.intent.tmp`);
    ensureInsideIntentRoot(tempPath);
    await fs.writeFile(tempPath, `${JSON.stringify(intent, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, intentPath);
};

const normalizeIntentChunks = async (intent: UploadIntentMetadata) => {
    const rawChunks = isPlainObject(intent.chunks) ? intent.chunks : {};
    const nextChunks: Record<string, string> = {};
    const expectedChunkCount = getExpectedChunkCount(intent);
    let changed = rawChunks !== intent.chunks;

    for (const [rawIndex, rawChecksum] of Object.entries(rawChunks)) {
        const chunkIndex = Number(rawIndex);
        const checksum = typeof rawChecksum === 'string' ? rawChecksum.trim().toLowerCase() : '';
        const isValidChunkEntry = Number.isInteger(chunkIndex)
            && chunkIndex >= 0
            && chunkIndex < expectedChunkCount
            && SHA256_RE.test(checksum);
        if (!isValidChunkEntry) {
            changed = true;
            continue;
        }

        const chunkPath = getChunkPath(intent.upload_id, chunkIndex);
        ensureInsideIntentRoot(chunkPath);
        try {
            const stat = await fs.stat(chunkPath);
            if (stat.size !== getExpectedChunkSize(intent, chunkIndex)) {
                await fs.rm(chunkPath, { force: true }).catch(() => undefined);
                changed = true;
                continue;
            }

            const actualChecksum = await sha256File(chunkPath);
            if (actualChecksum !== checksum) {
                await fs.rm(chunkPath, { force: true }).catch(() => undefined);
                changed = true;
                continue;
            }
        } catch {
            changed = true;
            continue;
        }

        nextChunks[String(chunkIndex)] = checksum;
    }

    const currentKeys = Object.keys(rawChunks).sort();
    const nextKeys = Object.keys(nextChunks).sort();
    if (currentKeys.length !== nextKeys.length || currentKeys.some((key, index) => key !== nextKeys[index])) {
        changed = true;
    }

    if (changed) {
        intent.chunks = nextChunks;
        await writeIntent(intent);
    }

    return intent;
};

const readIntent = async (uploadId: string, options: { normalizeChunks?: boolean } = {}): Promise<UploadIntentMetadata> => {
    const intentPath = getIntentPath(uploadId);
    ensureInsideIntentRoot(intentPath);

    let raw = '';
    try {
        raw = await fs.readFile(intentPath, 'utf8');
    } catch {
        throw new PhotoToolV2HttpError('Upload intent не найден.', 404);
    }

    let parsed: UploadIntentMetadata;
    try {
        parsed = JSON.parse(raw) as UploadIntentMetadata;
    } catch {
        await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
        throw new PhotoToolV2HttpError('Upload intent поврежден.', 404, 'UPLOAD_INTENT_CORRUPT');
    }
    if (new Date(parsed.expires_at).getTime() <= Date.now()) {
        throw new PhotoToolV2HttpError('Upload intent истек.', 410, 'UPLOAD_INTENT_EXPIRED');
    }

    return options.normalizeChunks === false ? parsed : normalizeIntentChunks(parsed);
};

const serializeIntent = (intent: UploadIntentMetadata) => ({
    upload_id: intent.upload_id,
    uploaded_chunks: Object.keys(intent.chunks).map(Number).sort((a, b) => a - b),
    chunk_size_bytes: intent.chunk_size_bytes,
    file_size_bytes: intent.file_size_bytes,
    checksum_sha256: intent.checksum_sha256,
    expires_at: intent.expires_at
});

const assertIntentScope = (intent: UploadIntentMetadata, runId: string, itemId: string) => {
    if (intent.run_id !== runId || intent.item_id !== itemId) {
        throw new PhotoToolV2HttpError('Upload intent не относится к run item.', 404);
    }
};

const validateChunkIndex = (value: string) => {
    const chunkIndex = Number(value);
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
        throw new PhotoToolV2HttpError('chunkIndex должен быть неотрицательным целым числом.', 400);
    }

    return chunkIndex;
};

const hashBuffer = (body: Buffer) => crypto.createHash('sha256').update(body).digest('hex');

const getUploadStatus = (error: unknown) =>
    typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

const withUploadIntentLock = async <T>(uploadId: string, fn: () => Promise<T>): Promise<T> => {
    const previous = uploadIntentLocks.get(uploadId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });
    const next = previous.catch(() => undefined).then(() => current);
    uploadIntentLocks.set(uploadId, next);

    await previous.catch(() => undefined);
    try {
        return await fn();
    } finally {
        release();
        if (uploadIntentLocks.get(uploadId) === next) {
            uploadIntentLocks.delete(uploadId);
        }
    }
};

const markPhotoToolV2RunItemFailed = async (runId: string, itemId: string, message: string) => {
    await prisma.$transaction(async (tx) => {
        await tx.photoToolRunItem.updateMany({
            where: {
                run_id: runId,
                item_id: itemId,
                status: { notIn: ['UPLOADED', 'REUSED', 'CANCELLED'] }
            },
            data: {
                status: 'FAILED',
                error_message: message
            }
        });
        await tx.photoToolRun.updateMany({
            where: {
                id: runId,
                status: { notIn: ['COMPLETED', 'STALE', 'CANCELLED'] }
            },
            data: {
                status: 'FAILED',
                error_message: message
            }
        });
    });
};

export const createPhotoToolV2UploadIntent = async (runId: string, itemId: string, body: unknown) => {
    if (!isPlainObject(body)) {
        throw new PhotoToolV2HttpError('Некорректный запрос.', 400);
    }

    const fileName = parseNonEmptyString(body.file_name, 'file_name');
    const fileSizeBytes = parsePositiveInteger(body.file_size_bytes, 'file_size_bytes');
    const checksumSha256 = parseSha256(body.checksum_sha256, 'checksum_sha256');
    const chunkSizeBytes = parsePositiveInteger(body.chunk_size_bytes, 'chunk_size_bytes');
    validateUploadIntentSizing(fileSizeBytes, chunkSizeBytes);
    const { run, runItem } = await loadRunItemForUpload(runId, itemId, { allowTerminalLookup: true });

    const uploadId = buildUploadId(runId, itemId, checksumSha256);
    if (runItem.status === 'UPLOADED') {
        if (runItem.checksum_sha256 === checksumSha256
            && runItem.file_size_bytes === fileSizeBytes
            && runItem.file_url) {
            return {
                upload_id: uploadId,
                uploaded_chunks: [],
                chunk_size_bytes: chunkSizeBytes,
                file_size_bytes: fileSizeBytes,
                checksum_sha256: checksumSha256,
                expires_at: null,
                completed: true,
                file_url: runItem.file_url,
                run_status: run.status
            };
        }

        throw new PhotoToolV2HttpError('Run item уже загружен с другим checksum.', 409, 'CHECKSUM_MISMATCH');
    }
    if ((TERMINAL_RUN_STATUSES as readonly string[]).includes(run.status)) {
        throw new PhotoToolV2HttpError('Run не принимает upload.', 409);
    }

    return withUploadIntentLock(uploadId, async () => {
        try {
            const existingIntent = await readIntent(uploadId);
            assertIntentScope(existingIntent, runId, itemId);
            if (
                existingIntent.file_name === fileName
                && existingIntent.file_size_bytes === fileSizeBytes
                && existingIntent.chunk_size_bytes === chunkSizeBytes
            ) {
                return serializeIntent(existingIntent);
            }
            await fs.rm(getIntentDir(uploadId), { recursive: true, force: true });
        } catch (error) {
            if (getUploadStatus(error) !== 404 && getUploadStatus(error) !== 410) {
                throw error;
            }
            await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
        }

        await prisma.$transaction(async (tx) => {
            const updatedRun = await tx.photoToolRun.updateMany({
                where: {
                    id: runId,
                    status: { notIn: [...TERMINAL_RUN_STATUSES] }
                },
                data: { status: 'UPLOADING', error_message: null }
            });
            if (updatedRun.count !== 1) {
                throw new PhotoToolV2HttpError('Run не принимает upload.', 409);
            }

            const updatedItem = await tx.photoToolRunItem.updateMany({
                where: {
                    id: runItem.id,
                    status: { notIn: ['UPLOADED', 'REUSED', 'CANCELLED'] }
                },
                data: {
                    status: 'UPLOADING',
                    checksum_sha256: checksumSha256,
                    file_size_bytes: fileSizeBytes,
                    error_message: null
                }
            });
            if (updatedItem.count !== 1) {
                throw new PhotoToolV2HttpError('Run item не принимает upload.', 409);
            }
        });

        const intent: UploadIntentMetadata = {
            upload_id: uploadId,
            run_id: runId,
            item_id: itemId,
            item_seq: runItem.item_seq,
            file_name: fileName,
            file_size_bytes: fileSizeBytes,
            checksum_sha256: checksumSha256,
            chunk_size_bytes: chunkSizeBytes,
            expires_at: new Date(Date.now() + INTENT_TTL_MS).toISOString(),
            chunks: {}
        };
        await writeIntent(intent);
        return serializeIntent(intent);
    });
};

export const getPhotoToolV2UploadIntent = async (runId: string, itemId: string, uploadId: string) => {
    const intent = await readIntent(uploadId);
    assertIntentScope(intent, runId, itemId);
    return serializeIntent(intent);
};

export const putPhotoToolV2UploadChunk = async (
    runId: string,
    itemId: string,
    uploadId: string,
    rawChunkIndex: string,
    chunkSha256Header: unknown,
    body: Buffer
) => {
    return withUploadIntentLock(uploadId, async () => {
        await loadRunItemForUpload(runId, itemId);
        const intent = await readIntent(uploadId);
        assertIntentScope(intent, runId, itemId);

        const chunkIndex = validateChunkIndex(rawChunkIndex);
        const expectedChunkCount = getExpectedChunkCount(intent);
        if (chunkIndex >= expectedChunkCount) {
            throw new PhotoToolV2HttpError('chunkIndex выходит за пределы файла.', 400);
        }

        const expectedChecksum = parseSha256(chunkSha256Header, 'X-Chunk-Sha256');
        const actualChecksum = hashBuffer(body);
        if (actualChecksum !== expectedChecksum) {
            throw new PhotoToolV2HttpError('Checksum chunk не совпадает.', 409, 'CHECKSUM_MISMATCH');
        }

        const expectedSize = getExpectedChunkSize(intent, chunkIndex);
        if (body.length !== expectedSize) {
            throw new PhotoToolV2HttpError('Размер chunk не совпадает с ожидаемым.', 400);
        }

        const existingChecksum = intent.chunks[String(chunkIndex)];
        if (existingChecksum) {
            if (existingChecksum !== expectedChecksum) {
                await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
                throw new PhotoToolV2HttpError('Chunk уже загружен с другим checksum.', 409, 'UPLOAD_CHUNK_CONFLICT');
            }
            return {
                upload_id: uploadId,
                chunk_index: chunkIndex,
                accepted: true,
                uploaded_chunks: serializeIntent(intent).uploaded_chunks
            };
        }

        const chunkPath = getChunkPath(uploadId, chunkIndex);
        ensureInsideIntentRoot(chunkPath);
        await fs.mkdir(path.dirname(chunkPath), { recursive: true });
        await fs.writeFile(chunkPath, body);
        intent.chunks[String(chunkIndex)] = expectedChecksum;
        await writeIntent(intent);

        return {
            upload_id: uploadId,
            chunk_index: chunkIndex,
            accepted: true,
            uploaded_chunks: serializeIntent(intent).uploaded_chunks
        };
    });
};

const assembleChunks = async (intent: UploadIntentMetadata) => {
    const expectedChunkCount = getExpectedChunkCount(intent);
    const missingChunks: number[] = [];
    for (let chunkIndex = 0; chunkIndex < expectedChunkCount; chunkIndex += 1) {
        if (!intent.chunks[String(chunkIndex)]) {
            missingChunks.push(chunkIndex);
        }
    }
    if (missingChunks.length > 0) {
        throw new PhotoToolV2HttpError('Не все chunks загружены.', 409, 'UPLOAD_CHUNKS_MISSING', { missing_chunks: missingChunks });
    }

    const assembledPath = path.join(getIntentDir(intent.upload_id), 'assembled.tmp');
    ensureInsideIntentRoot(assembledPath);
    await fs.writeFile(assembledPath, Buffer.alloc(0));
    for (let chunkIndex = 0; chunkIndex < expectedChunkCount; chunkIndex += 1) {
        await fs.appendFile(assembledPath, await fs.readFile(getChunkPath(intent.upload_id, chunkIndex)));
    }

    return assembledPath;
};

const sanitizePathSegment = (value: string) =>
    value
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '') || 'item';

const moveFileSafely = async (sourcePath: string, targetPath: string) => {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try {
        await fs.rename(sourcePath, targetPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
            throw error;
        }
        await fs.copyFile(sourcePath, targetPath);
        await fs.rm(sourcePath, { force: true });
    }
};

const validateUploadedPhotoFile = async (filePath: string, settings: PhotoExportSettings) => {
    let metadata: Metadata;
    try {
        metadata = await sharp(filePath, { animated: false }).metadata();
    } catch {
        throw new PhotoToolV2HttpError('Uploaded photo не декодируется как изображение.', 422, 'PHOTO_VALIDATION_FAILED');
    }

    if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height) {
        throw new PhotoToolV2HttpError('Photo Tool v2 принимает только финальный JPEG.', 422, 'PHOTO_VALIDATION_FAILED');
    }
    if (metadata.width > settings.maxWidth || metadata.height > settings.maxHeight) {
        throw new PhotoToolV2HttpError('Размер JPEG не соответствует photo_export_settings.', 422, 'PHOTO_VALIDATION_FAILED', {
            width: metadata.width,
            height: metadata.height,
            maxWidth: settings.maxWidth,
            maxHeight: settings.maxHeight
        });
    }
};

const commitUploadedPhotoRunItem = async (input: {
    runId: string;
    itemId: string;
    checksumSha256: string;
    fileSizeBytes: number;
    sourceFilePath: string;
}) => {
    const actualChecksum = await sha256File(input.sourceFilePath);
    if (actualChecksum !== input.checksumSha256) {
        throw new PhotoToolV2HttpError('Checksum полного файла не совпадает.', 409, 'CHECKSUM_MISMATCH');
    }

    const { run, runItem } = await loadRunItemForUpload(input.runId, input.itemId);
    await validateUploadedPhotoFile(input.sourceFilePath, parsePhotoExportSettings(run.photo_export_settings));
    if ((TERMINAL_RUN_STATUSES as readonly string[]).includes(run.status)) {
        throw new PhotoToolV2HttpError('Run не принимает upload.', 409);
    }

    const runDir = path.join(PHOTO_TOOL_PUBLIC_OUTPUT_ROOT, 'v2-runs', sanitizePathSegment(input.runId));
    const fileName = `item-${String(runItem.item_seq).padStart(3, '0')}.jpg`;
    const finalPath = path.join(runDir, fileName);
    const tempFinalPath = path.join(runDir, `.${fileName}.${Date.now()}.tmp`);
    const publicUrl = `${PHOTO_TOOL_PUBLIC_URL_ROOT}/v2-runs/${encodeURIComponent(input.runId)}/${encodeURIComponent(fileName)}`;

    await fs.mkdir(runDir, { recursive: true });
    await fs.rm(tempFinalPath, { force: true });
    await moveFileSafely(input.sourceFilePath, tempFinalPath);
    await fs.rename(tempFinalPath, finalPath);

    const { updatedItem, updatedRun } = await prisma.$transaction(async (tx) => {
        const currentRun = await tx.photoToolRun.findUniqueOrThrow({
            where: { id: input.runId },
            select: { status: true, expected_count: true }
        });
        if ((TERMINAL_RUN_STATUSES as readonly string[]).includes(currentRun.status)) {
            throw new PhotoToolV2HttpError('Run не принимает upload.', 409);
        }

        const updatedItemCount = await tx.photoToolRunItem.updateMany({
            where: {
                id: runItem.id,
                status: { notIn: ['UPLOADED', 'REUSED', 'CANCELLED'] }
            },
            data: {
                status: 'UPLOADED',
                file_url: publicUrl,
                checksum_sha256: input.checksumSha256,
                file_size_bytes: input.fileSizeBytes,
                error_message: null,
                uploaded_at: new Date()
            }
        });
        if (updatedItemCount.count !== 1) {
            throw new PhotoToolV2HttpError('Run item не принимает upload.', 409);
        }

        const updatedItem = await tx.photoToolRunItem.findUniqueOrThrow({
            where: { id: runItem.id },
            select: {
                id: true,
                run_id: true,
                item_id: true,
                item_seq: true,
                status: true,
                file_url: true,
                checksum_sha256: true,
                file_size_bytes: true,
                uploaded_at: true
            }
        });

        const readyCount = await tx.photoToolRunItem.count({
            where: {
                run_id: input.runId,
                status: { in: ['UPLOADED', 'REUSED'] }
            }
        });
        const nextStatus = readyCount >= currentRun.expected_count ? 'READY_TO_COMMIT' : 'UPLOADING';
        const updatedRun = await tx.photoToolRun.update({
            where: { id: input.runId },
            data: {
                status: nextStatus,
                uploaded_count: readyCount,
                error_message: null
            },
            select: {
                id: true,
                status: true,
                expected_count: true,
                uploaded_count: true
            }
        });

        return { updatedItem, updatedRun };
    }).catch(async (error) => {
        await fs.rm(finalPath, { force: true }).catch(() => undefined);
        throw error;
    });

    return {
        id: updatedItem.id,
        run_id: updatedItem.run_id,
        item_id: updatedItem.item_id,
        item_seq: updatedItem.item_seq,
        status: updatedItem.status,
        file_url: updatedItem.file_url,
        checksum_sha256: updatedItem.checksum_sha256,
        file_size_bytes: updatedItem.file_size_bytes,
        uploaded_at: updatedItem.uploaded_at,
        run_status: updatedRun.status,
        uploaded_count: updatedRun.uploaded_count,
        expected_count: updatedRun.expected_count
    };
};

export const completePhotoToolV2UploadIntent = async (
    runId: string,
    itemId: string,
    uploadId: string,
    userId: string
) => {
    return withUploadIntentLock(uploadId, async () => {
        const intent = await readIntent(uploadId);
        assertIntentScope(intent, runId, itemId);
        const assembledPath = await assembleChunks(intent);

        let result;
        try {
            result = await commitUploadedPhotoRunItem({
                runId,
                itemId,
                checksumSha256: intent.checksum_sha256,
                fileSizeBytes: intent.file_size_bytes,
                sourceFilePath: assembledPath
            });
        } catch (error) {
            const code = getPhotoToolV2ErrorCode(error);
            if (code === 'CHECKSUM_MISMATCH' || code === 'PHOTO_VALIDATION_FAILED') {
                await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
                const message = error instanceof Error && error.message
                    ? error.message
                    : 'Upload item не прошел проверку.';
                await markPhotoToolV2RunItemFailed(runId, itemId, message).catch(() => undefined);
            }
            throw error;
        }

        await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
        const autoCommit = await attemptPhotoToolV2AutoCommit(runId, userId);
        return {
            ...result,
            ...autoCommit
        };
    });
};

const buildPhotoToolFilePathFromUrl = (value: string) => {
    if (!value.startsWith(`${PHOTO_TOOL_PUBLIC_URL_ROOT}/`)) {
        return null;
    }

    const encodedPath = value.slice(PHOTO_TOOL_PUBLIC_URL_ROOT.length + 1);
    if (!encodedPath) {
        return null;
    }

    const segments = encodedPath.split('/').map((segment) => {
        try {
            return decodeURIComponent(segment);
        } catch {
            return '';
        }
    });
    if (segments.some((segment) => !segment || segment !== path.basename(segment))) {
        return null;
    }

    return path.join(PHOTO_TOOL_PUBLIC_OUTPUT_ROOT, ...segments);
};

const cleanupOrphanedPhotoToolFiles = async (candidateUrls: string[]) => {
    const normalizedUrls = [...new Set(candidateUrls.filter((url) => url.startsWith(`${PHOTO_TOOL_PUBLIC_URL_ROOT}/`)))];
    if (normalizedUrls.length === 0) {
        return;
    }

    const stillReferenced = await prisma.item.findMany({
        where: { item_photo_url: { in: normalizedUrls } },
        select: { item_photo_url: true }
    });
    const referencedSet = new Set(stillReferenced.flatMap((item) => item.item_photo_url ? [item.item_photo_url] : []));

    await Promise.all(normalizedUrls
        .filter((url) => !referencedSet.has(url))
        .map(async (url) => {
            const filePath = buildPhotoToolFilePathFromUrl(url);
            if (!filePath) return;
            await fs.rm(filePath, { force: true }).catch(() => undefined);
        }));
};

const createStaleError = () => new PhotoToolV2HttpError('Фото партии уже изменились.', 409, 'PHOTO_TOOL_RUN_STALE');

const buildNextPhotoUrlByItemId = (run: PhotoToolRunRecord) => new Map(run.items.map((item) => {
    const nextUrl = item.file_url || item.existing_url;
    if (!nextUrl) {
        throw new PhotoToolV2HttpError('Run item не содержит итоговый file_url.', 409, 'PHOTO_TOOL_RUN_NOT_READY');
    }
    return [item.item_id, nextUrl] as const;
}));

const isRunOutcomeAlreadyApplied = (
    batch: ReturnType<typeof ensureBatchReady>,
    nextPhotoUrlByItemId: Map<string, string>
) =>
    batch.items.length === nextPhotoUrlByItemId.size
    && batch.items.every((item) => nextPhotoUrlByItemId.get(item.id) === (item.item_photo_url || null));

const markPhotoToolV2RunCompleted = async (
    run: PhotoToolRunRecord,
    userId: string,
    details: Record<string, unknown> = {}
) => prisma.$transaction(async (tx) => {
    await tx.photoToolRunItem.updateMany({
        where: { run_id: run.id },
        data: { committed_at: new Date() }
    });

    await writeSecurityAuditLog(tx, {
        action: 'PHOTO_TOOL_V2_RUN_COMMITTED',
        user_id: userId,
        entity_type: 'batch',
        entity_id: run.batch_id,
        details: {
            batch_id: run.batch_id,
            run_id: run.id,
            item_count: run.items.length,
            ...details
        }
    });

    return tx.photoToolRun.update({
        where: { id: run.id },
        data: {
            status: 'COMPLETED',
            uploaded_count: run.expected_count,
            committed_at: new Date(),
            error_message: null
        },
        include: RUN_INCLUDE
    });
});

const serializeAutoCommitStatus = (run: {
    status: string;
    uploaded_count: number;
    expected_count: number;
    error_message?: string | null;
}) => ({
    run_status: run.status,
    run_committed: run.status === 'COMPLETED',
    uploaded_count: run.uploaded_count,
    expected_count: run.expected_count,
    ...(run.error_message ? { run_error_message: run.error_message } : {})
});

async function attemptPhotoToolV2AutoCommit(runId: string, userId: string) {
    const run = await prisma.photoToolRun.findUnique({
        where: { id: runId },
        include: RUN_INCLUDE
    });
    if (!run) {
        return {};
    }
    if (['COMPLETED', 'STALE', 'FAILED', 'CANCELLED'].includes(run.status)) {
        return serializeAutoCommitStatus(run);
    }
    if (!run.items.every((item) => item.status === 'UPLOADED' || item.status === 'REUSED')) {
        return serializeAutoCommitStatus(run);
    }

    try {
        const committedRun = await commitPhotoToolV2Run(run.id, userId);
        return serializeAutoCommitStatus(committedRun);
    } catch (error) {
        const latestRun = await prisma.photoToolRun.findUnique({
            where: { id: run.id },
            select: {
                status: true,
                uploaded_count: true,
                expected_count: true,
                error_message: true
            }
        });
        if (latestRun?.status === 'COMPLETED' || getPhotoToolV2ErrorCode(error) === 'PHOTO_TOOL_RUN_STALE') {
            return latestRun ? serializeAutoCommitStatus(latestRun) : {};
        }
        if (getPhotoToolV2ErrorCode(error) === 'PHOTO_TOOL_RUN_NOT_READY') {
            return latestRun ? serializeAutoCommitStatus(latestRun) : {};
        }

        const message = error instanceof Error && error.message
            ? error.message
            : 'Photo Tool v2 auto-commit failed.';
        const retryableRun = await prisma.photoToolRun.update({
            where: { id: run.id },
            data: { status: 'READY_TO_COMMIT', error_message: message },
            select: {
                status: true,
                uploaded_count: true,
                expected_count: true,
                error_message: true
            }
        }).catch(() => latestRun);

        return retryableRun ? serializeAutoCommitStatus(retryableRun) : {};
    }
}

let photoToolV2FinalizerTimer: ReturnType<typeof setInterval> | null = null;
let photoToolV2FinalizerRunning = false;
let photoToolV2LastMaintenanceAt = 0;

export const runPhotoToolV2FinalizerOnce = async (limit = 10) => {
    if (photoToolV2FinalizerRunning) {
        return { processed: 0, skipped: true };
    }

    photoToolV2FinalizerRunning = true;
    try {
        const runs = await prisma.photoToolRun.findMany({
            where: { status: { in: ['READY_TO_COMMIT', 'COMMITTING'] } },
            select: { id: true, created_by_user_id: true },
            orderBy: { updated_at: 'asc' },
            take: limit
        });

        for (const run of runs) {
            await attemptPhotoToolV2AutoCommit(run.id, run.created_by_user_id)
                .catch((error) => console.error('Photo Tool v2 finalizer failed', { runId: run.id, error }));
        }

        return { processed: runs.length, skipped: false };
    } finally {
        photoToolV2FinalizerRunning = false;
    }
};

export const startPhotoToolV2Finalizer = (options: { intervalMs?: number; limit?: number } = {}) => {
    if (photoToolV2FinalizerTimer) {
        return () => undefined;
    }

    const intervalMs = options.intervalMs ?? 15_000;
    const limit = options.limit ?? 10;
    const tick = () => {
        void runPhotoToolV2FinalizerOnce(limit)
            .catch((error) => console.error('Photo Tool v2 finalizer tick failed', error));
        if (Date.now() - photoToolV2LastMaintenanceAt >= MAINTENANCE_INTERVAL_MS) {
            photoToolV2LastMaintenanceAt = Date.now();
            void runPhotoToolV2MaintenanceOnce()
                .catch((error) => console.error('Photo Tool v2 maintenance tick failed', error));
        }
    };

    photoToolV2FinalizerTimer = setInterval(tick, intervalMs);
    photoToolV2FinalizerTimer.unref?.();
    tick();

    return () => {
        if (photoToolV2FinalizerTimer) {
            clearInterval(photoToolV2FinalizerTimer);
            photoToolV2FinalizerTimer = null;
        }
    };
};

export const commitPhotoToolV2Run = async (runId: string, userId: string) => {
    const run = await prisma.photoToolRun.findUnique({
        where: { id: runId },
        include: RUN_INCLUDE
    });
    if (!run) {
        throw new PhotoToolV2HttpError('Run не найден.', 404);
    }
    if (run.status === 'COMPLETED') {
        return serializeRun(run);
    }
    if (['CANCELLED', 'STALE'].includes(run.status)) {
        throw new PhotoToolV2HttpError('Run нельзя commit.', 409);
    }
    if (!run.items.every((item) => item.status === 'UPLOADED' || item.status === 'REUSED')) {
        throw new PhotoToolV2HttpError('Run еще не готов к commit.', 409, 'PHOTO_TOOL_RUN_NOT_READY');
    }

    const nextPhotoUrlByItemId = buildNextPhotoUrlByItemId(run);
    const beforeMediaSnapshot = await loadBatchMediaSnapshot(prisma, run.batch_id);
    const batch = ensureBatchReady(await getPhotoToolBatch(run.batch_id));
    if (buildPhotoToolStateToken(batch) !== run.base_photo_state_token) {
        if (isRunOutcomeAlreadyApplied(batch, nextPhotoUrlByItemId)) {
            return serializeRun(await markPhotoToolV2RunCompleted(run, userId, {
                idempotent_already_applied: true
            }));
        }
        await prisma.photoToolRun.update({
            where: { id: run.id },
            data: { status: 'STALE', error_message: 'Фото партии уже изменились.' }
        });
        throw createStaleError();
    }

    const expectedItemStateById = new Map(batch.items.map((item) => [item.id, {
        item_photo_url: item.item_photo_url,
        updated_at: item.updated_at,
        item_seq: item.item_seq
    }]));
    const cleanupCandidateUrls = batch.items.flatMap((item) => item.item_photo_url ? [item.item_photo_url] : []);

    let updatedRun: PhotoToolRunRecord;
    try {
        updatedRun = await prisma.$transaction(async (tx) => {
            const runClaim = await tx.photoToolRun.updateMany({
                where: {
                    id: run.id,
                    status: { notIn: [...TERMINAL_RUN_STATUSES] }
                },
                data: { status: 'COMMITTING', error_message: null }
            });
            if (runClaim.count !== 1) {
                throw new PhotoToolV2HttpError('Run нельзя commit.', 409);
            }

            const lockedItems = await tx.$queryRaw<Array<{
                id: string;
                item_seq: number | null;
                item_photo_url: string | null;
                updated_at: Date;
            }>>(Prisma.sql`
                SELECT id, item_seq, item_photo_url, updated_at
                FROM items
                WHERE batch_id = ${run.batch_id}
                    AND deleted_at IS NULL
                FOR UPDATE
            `);
            if (lockedItems.length !== run.items.length) {
                throw createStaleError();
            }

            const lockedItemById = new Map(lockedItems.map((item) => [item.id, item]));
            for (const item of run.items) {
                const expectedState = expectedItemStateById.get(item.item_id);
                const lockedItem = lockedItemById.get(item.item_id);
                if (!expectedState || !lockedItem
                    || lockedItem.item_seq !== expectedState.item_seq
                    || (lockedItem.item_photo_url || null) !== (expectedState.item_photo_url || null)
                    || lockedItem.updated_at.getTime() !== expectedState.updated_at.getTime()) {
                    throw createStaleError();
                }
            }

            for (const item of run.items) {
                const updateResult = await tx.item.updateMany({
                    where: {
                        id: item.item_id,
                        batch_id: run.batch_id,
                        deleted_at: null
                    },
                    data: {
                        item_photo_url: nextPhotoUrlByItemId.get(item.item_id) || null
                    }
                });
                if (updateResult.count !== 1) {
                    throw createStaleError();
                }
            }

            await tx.photoToolRunItem.updateMany({
                where: { run_id: run.id },
                data: { committed_at: new Date() }
            });

            await writeSecurityAuditLog(tx, {
                action: 'PHOTO_TOOL_V2_RUN_COMMITTED',
                user_id: userId,
                entity_type: 'batch',
                entity_id: run.batch_id,
                details: {
                    batch_id: run.batch_id,
                    run_id: run.id,
                    item_count: run.items.length
                }
            });

            return tx.photoToolRun.update({
                where: { id: run.id },
                data: {
                    status: 'COMPLETED',
                    uploaded_count: run.expected_count,
                    committed_at: new Date(),
                    error_message: null
                },
                include: RUN_INCLUDE
            });
        });
    } catch (error) {
        if ((error as { code?: unknown })?.code === 'PHOTO_TOOL_RUN_STALE') {
            const latestBatch = await getPhotoToolBatch(run.batch_id).catch(() => null);
            if (latestBatch) {
                const readyLatestBatch = ensureBatchReady(latestBatch);
                if (isRunOutcomeAlreadyApplied(readyLatestBatch, nextPhotoUrlByItemId)) {
                    updatedRun = await markPhotoToolV2RunCompleted(run, userId, {
                        idempotent_already_applied: true
                    });
                    return serializeRun(updatedRun);
                }
            }
            await prisma.photoToolRun.update({
                where: { id: run.id },
                data: { status: 'STALE', error_message: 'Фото партии уже изменились.' }
            }).catch(() => undefined);
        }
        throw error;
    }

    const afterMediaSnapshot = await loadBatchMediaSnapshot(prisma, run.batch_id);
    await runTelegramSideEffect(() => queueBatchMediaReadyNotifications(prisma, beforeMediaSnapshot, afterMediaSnapshot));
    const nextUrls = new Set(nextPhotoUrlByItemId.values());
    await cleanupOrphanedPhotoToolFiles(cleanupCandidateUrls.filter((url) => !nextUrls.has(url)));
    return serializeRun(updatedRun);
};

export const cancelPhotoToolV2Run = async (runId: string) => {
    const run = await prisma.photoToolRun.findUnique({
        where: { id: runId },
        include: RUN_INCLUDE
    });
    if (!run) {
        throw new PhotoToolV2HttpError('Run не найден.', 404);
    }
    if (run.status === 'COMPLETED') {
        throw new PhotoToolV2HttpError('Завершенный run нельзя отменить.', 409);
    }

    const uploadedRunFileUrls = run.items.flatMap((item) =>
        item.source_type === 'UPLOAD' && item.file_url ? [item.file_url] : []
    );
    const updatedRun = await prisma.$transaction(async (tx) => {
        await tx.photoToolRunItem.updateMany({
            where: { run_id: run.id, source_type: 'UPLOAD' },
            data: { status: 'CANCELLED', file_url: null }
        });
        await tx.photoToolRunItem.updateMany({
            where: { run_id: run.id, source_type: 'EXISTING', status: { not: 'REUSED' } },
            data: { status: 'CANCELLED' }
        });
        return tx.photoToolRun.update({
            where: { id: run.id },
            data: { status: 'CANCELLED' },
            include: RUN_INCLUDE
        });
    });

    await cleanupOrphanedPhotoToolFiles(uploadedRunFileUrls);
    return serializeRun(updatedRun);
};

export const removePhotoToolV2UploadIntentsForRun = async (runId: string) => {
    let entries: string[] = [];
    try {
        entries = await fs.readdir(UPLOAD_INTENTS_ROOT);
    } catch {
        return;
    }

    await Promise.all(entries.map(async (entry) => {
        try {
            const intent = await readIntent(entry, { normalizeChunks: false });
            if (intent.run_id === runId) {
                await fs.rm(getIntentDir(entry), { recursive: true, force: true });
            }
        } catch {
            await fs.rm(getIntentDir(entry), { recursive: true, force: true }).catch(() => undefined);
        }
    }));
};

const listDirectoryEntries = async (directoryPath: string, options: { withFileTypes: true }) => {
    try {
        return await fs.readdir(directoryPath, options);
    } catch {
        return [];
    }
};

export const cleanupPhotoToolV2UploadIntents = async (options: { nowMs?: number } = {}) => {
    const nowMs = options.nowMs ?? Date.now();
    const entries = await listDirectoryEntries(UPLOAD_INTENTS_ROOT, { withFileTypes: true });
    let scanned = 0;
    let removedExpired = 0;
    let removedCorrupt = 0;

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        scanned += 1;
        const uploadId = entry.name;
        const intentDir = getIntentDir(uploadId);
        ensureInsideIntentRoot(intentDir);

        try {
            const intent = await readIntent(uploadId, { normalizeChunks: false });
            if (new Date(intent.expires_at).getTime() <= nowMs) {
                await fs.rm(intentDir, { recursive: true, force: true });
                removedExpired += 1;
            }
        } catch (error) {
            const status = getUploadStatus(error);
            if (status === 410 || getPhotoToolV2ErrorCode(error) === 'UPLOAD_INTENT_CORRUPT') {
                await fs.rm(intentDir, { recursive: true, force: true }).catch(() => undefined);
                if (getPhotoToolV2ErrorCode(error) === 'UPLOAD_INTENT_CORRUPT') {
                    removedCorrupt += 1;
                } else {
                    removedExpired += 1;
                }
                continue;
            }

            const stat = await fs.stat(intentDir).catch(() => null);
            if (stat && nowMs - stat.mtimeMs > CORRUPT_INTENT_GRACE_MS) {
                await fs.rm(intentDir, { recursive: true, force: true }).catch(() => undefined);
                removedCorrupt += 1;
            }
        }
    }

    if (removedExpired > 0 || removedCorrupt > 0) {
        logDomainEvent('api', 'photo-tool-v2-upload-intents-cleaned', {
            scanned,
            removed_expired: removedExpired,
            removed_corrupt: removedCorrupt
        }, 'info');
    }

    return { scanned, removed_expired: removedExpired, removed_corrupt: removedCorrupt };
};

const buildPhotoToolV2RunFileUrls = async () => {
    const v2RunsRoot = path.join(PHOTO_TOOL_PUBLIC_OUTPUT_ROOT, 'v2-runs');
    const runDirs = await listDirectoryEntries(v2RunsRoot, { withFileTypes: true });
    const urls: string[] = [];

    for (const runDir of runDirs) {
        if (!runDir.isDirectory()) {
            continue;
        }

        const files = await listDirectoryEntries(path.join(v2RunsRoot, runDir.name), { withFileTypes: true });
        for (const file of files) {
            if (!file.isFile() || !file.name.toLowerCase().endsWith('.jpg')) {
                continue;
            }
            urls.push(`${PHOTO_TOOL_PUBLIC_URL_ROOT}/v2-runs/${encodeURIComponent(runDir.name)}/${encodeURIComponent(file.name)}`);
        }
    }

    return urls;
};

export const cleanupPhotoToolV2OrphanRunFiles = async () => {
    const candidateUrls = await buildPhotoToolV2RunFileUrls();
    if (candidateUrls.length === 0) {
        return { scanned: 0, removed: 0 };
    }

    const itemReferences = await prisma.item.findMany({
        where: { item_photo_url: { in: candidateUrls } },
        select: { item_photo_url: true }
    });
    const runItemReferences = await prisma.photoToolRunItem.findMany({
        where: { file_url: { in: candidateUrls } },
        select: { file_url: true }
    });
    const referencedUrls = new Set([
        ...itemReferences.flatMap((item) => item.item_photo_url ? [item.item_photo_url] : []),
        ...runItemReferences.flatMap((item) => item.file_url ? [item.file_url] : [])
    ]);
    const orphanUrls = candidateUrls.filter((url) => !referencedUrls.has(url));

    await Promise.all(orphanUrls.map(async (url) => {
        const filePath = buildPhotoToolFilePathFromUrl(url);
        if (!filePath) return;
        await fs.rm(filePath, { force: true }).catch(() => undefined);
        await fs.rmdir(path.dirname(filePath)).catch(() => undefined);
    }));

    if (orphanUrls.length > 0) {
        logDomainEvent('api', 'photo-tool-v2-orphan-run-files-cleaned', {
            scanned: candidateUrls.length,
            removed: orphanUrls.length
        }, 'info');
    }

    return { scanned: candidateUrls.length, removed: orphanUrls.length };
};

export const monitorPhotoToolV2Runs = async (options: { nowMs?: number; limit?: number } = {}) => {
    const nowMs = options.nowMs ?? Date.now();
    const limit = options.limit ?? 50;
    const runs = await prisma.photoToolRun.findMany({
        where: { status: { in: ['OPEN', 'UPLOADING', 'READY_TO_COMMIT', 'COMMITTING'] } },
        select: {
            id: true,
            batch_id: true,
            status: true,
            expected_count: true,
            uploaded_count: true,
            updated_at: true,
            error_message: true
        },
        orderBy: { updated_at: 'asc' },
        take: limit
    });

    let warned = 0;
    for (const run of runs) {
        const thresholdMs = ['READY_TO_COMMIT', 'COMMITTING'].includes(run.status)
            ? COMMIT_RUN_STUCK_MS
            : ACTIVE_RUN_STUCK_MS;
        const ageMs = nowMs - run.updated_at.getTime();
        if (ageMs < thresholdMs) {
            continue;
        }

        const lastWarnAt = photoToolV2StuckRunLastWarnAt.get(run.id) || 0;
        if (nowMs - lastWarnAt < STUCK_RUN_LOG_THROTTLE_MS) {
            continue;
        }

        photoToolV2StuckRunLastWarnAt.set(run.id, nowMs);
        warned += 1;
        logDomainEvent('api', 'photo-tool-v2-run-stuck', {
            run_id: run.id,
            batch_id: run.batch_id,
            status: run.status,
            expected_count: run.expected_count,
            uploaded_count: run.uploaded_count,
            age_ms: ageMs,
            error_message: run.error_message
        }, 'warn');
    }

    for (const [runId, lastWarnAt] of photoToolV2StuckRunLastWarnAt.entries()) {
        if (nowMs - lastWarnAt > STUCK_RUN_LOG_THROTTLE_MS * 4) {
            photoToolV2StuckRunLastWarnAt.delete(runId);
        }
    }

    return { scanned: runs.length, warned };
};

export const runPhotoToolV2MaintenanceOnce = async (options: { nowMs?: number } = {}) => {
    const [uploadIntents, orphanRunFiles, monitor] = await Promise.all([
        cleanupPhotoToolV2UploadIntents(options),
        cleanupPhotoToolV2OrphanRunFiles(),
        monitorPhotoToolV2Runs(options)
    ]);

    return {
        upload_intents: uploadIntents,
        orphan_run_files: orphanRunFiles,
        monitor
    };
};

export const __photoToolV2TestUtils = {
    parsePhotoManifestV2,
    stableJson,
    buildUploadId,
    validateUploadIntentSizing,
    getIntentDir,
    writeIntent,
    writeRawIntent: async (uploadId: string, content: string) => {
        await fs.mkdir(getIntentDir(uploadId), { recursive: true });
        await fs.writeFile(getIntentPath(uploadId), content, 'utf8');
    },
    removeIntent: (uploadId: string) => fs.rm(getIntentDir(uploadId), { recursive: true, force: true }),
    cleanupPhotoToolV2UploadIntents,
    cleanupPhotoToolV2OrphanRunFiles,
    monitorPhotoToolV2Runs
};
