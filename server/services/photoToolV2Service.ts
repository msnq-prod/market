import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
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

export type PhotoToolV2ErrorCode =
    | 'BATCH_NOT_RECEIVED'
    | 'RUN_MANIFEST_CONFLICT'
    | 'PHOTO_TOOL_RUN_STALE'
    | 'PHOTO_TOOL_RUN_NOT_READY'
    | 'CHECKSUM_MISMATCH'
    | 'UPLOAD_INTENT_EXPIRED'
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

    return { statusCode: 201, payload: serializeRun(run) };
};

export const getPhotoToolV2Run = async (runId: string) => {
    const run = await prisma.photoToolRun.findUnique({
        where: { id: runId },
        include: RUN_INCLUDE
    });
    if (!run) {
        throw new PhotoToolV2HttpError('Run не найден.', 404);
    }

    return serializeRun(run);
};

const loadRunItemForUpload = async (runId: string, itemId: string) => {
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
    if (['CANCELLED', 'COMPLETED', 'STALE'].includes(run.status)) {
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

const ensureInsideIntentRoot = (targetPath: string) => {
    const root = path.resolve(UPLOAD_INTENTS_ROOT);
    const resolved = path.resolve(targetPath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        throw new PhotoToolV2HttpError('Некорректный upload_id.', 400);
    }
};

const readIntent = async (uploadId: string): Promise<UploadIntentMetadata> => {
    const intentPath = getIntentPath(uploadId);
    ensureInsideIntentRoot(intentPath);

    let raw = '';
    try {
        raw = await fs.readFile(intentPath, 'utf8');
    } catch {
        throw new PhotoToolV2HttpError('Upload intent не найден.', 404);
    }

    const parsed = JSON.parse(raw) as UploadIntentMetadata;
    if (new Date(parsed.expires_at).getTime() <= Date.now()) {
        throw new PhotoToolV2HttpError('Upload intent истек.', 410, 'UPLOAD_INTENT_EXPIRED');
    }

    return parsed;
};

const writeIntent = async (intent: UploadIntentMetadata) => {
    const intentDir = getIntentDir(intent.upload_id);
    ensureInsideIntentRoot(intentDir);
    await fs.mkdir(getChunksDir(intent.upload_id), { recursive: true });
    await fs.writeFile(getIntentPath(intent.upload_id), `${JSON.stringify(intent, null, 2)}\n`, 'utf8');
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

const getExpectedChunkCount = (intent: UploadIntentMetadata) =>
    Math.ceil(intent.file_size_bytes / intent.chunk_size_bytes);

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

export const createPhotoToolV2UploadIntent = async (runId: string, itemId: string, body: unknown) => {
    if (!isPlainObject(body)) {
        throw new PhotoToolV2HttpError('Некорректный запрос.', 400);
    }

    const fileName = parseNonEmptyString(body.file_name, 'file_name');
    const fileSizeBytes = parsePositiveInteger(body.file_size_bytes, 'file_size_bytes');
    const checksumSha256 = parseSha256(body.checksum_sha256, 'checksum_sha256');
    const chunkSizeBytes = parsePositiveInteger(body.chunk_size_bytes, 'chunk_size_bytes');
    const { runItem } = await loadRunItemForUpload(runId, itemId);

    const uploadId = buildUploadId(runId, itemId, checksumSha256);
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

    await prisma.photoToolRunItem.update({
        where: { id: runItem.id },
        data: {
            status: 'UPLOADING',
            checksum_sha256: checksumSha256,
            file_size_bytes: fileSizeBytes,
            error_message: null
        }
    });
    await prisma.photoToolRun.update({
        where: { id: runId },
        data: { status: 'UPLOADING', error_message: null }
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

    const isLastChunk = chunkIndex === expectedChunkCount - 1;
    const expectedSize = isLastChunk
        ? intent.file_size_bytes - (intent.chunk_size_bytes * chunkIndex)
        : intent.chunk_size_bytes;
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

    const { runItem } = await loadRunItemForUpload(input.runId, input.itemId);
    const runDir = path.join(PHOTO_TOOL_PUBLIC_OUTPUT_ROOT, 'v2-runs', sanitizePathSegment(input.runId));
    const fileName = `item-${String(runItem.item_seq).padStart(3, '0')}.jpg`;
    const finalPath = path.join(runDir, fileName);
    const tempFinalPath = path.join(runDir, `.${fileName}.${Date.now()}.tmp`);
    const publicUrl = `${PHOTO_TOOL_PUBLIC_URL_ROOT}/v2-runs/${encodeURIComponent(input.runId)}/${encodeURIComponent(fileName)}`;

    await fs.mkdir(runDir, { recursive: true });
    await fs.rm(tempFinalPath, { force: true });
    await moveFileSafely(input.sourceFilePath, tempFinalPath);
    await fs.rename(tempFinalPath, finalPath);

    const updatedRun = await prisma.$transaction(async (tx) => {
        await tx.photoToolRunItem.update({
            where: { id: runItem.id },
            data: {
                status: 'UPLOADED',
                file_url: publicUrl,
                checksum_sha256: input.checksumSha256,
                file_size_bytes: input.fileSizeBytes,
                error_message: null,
                uploaded_at: new Date()
            }
        });

        const readyCount = await tx.photoToolRunItem.count({
            where: {
                run_id: input.runId,
                status: { in: ['UPLOADED', 'REUSED'] }
            }
        });
        const run = await tx.photoToolRun.findUniqueOrThrow({
            where: { id: input.runId }
        });
        const nextStatus = readyCount >= run.expected_count ? 'READY_TO_COMMIT' : 'UPLOADING';
        return tx.photoToolRun.update({
            where: { id: input.runId },
            data: {
                status: nextStatus,
                uploaded_count: readyCount,
                error_message: null
            },
            include: RUN_INCLUDE
        });
    });

    return serializeRun(updatedRun);
};

export const completePhotoToolV2UploadIntent = async (
    runId: string,
    itemId: string,
    uploadId: string
) => {
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
        if ((error as { code?: unknown })?.code === 'CHECKSUM_MISMATCH') {
            await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
        }
        throw error;
    }

    await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
    return result;
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

    const beforeMediaSnapshot = await loadBatchMediaSnapshot(prisma, run.batch_id);
    const batch = ensureBatchReady(await getPhotoToolBatch(run.batch_id));
    if (buildPhotoToolStateToken(batch) !== run.base_photo_state_token) {
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
    const nextPhotoUrlByItemId = new Map(run.items.map((item) => {
        const nextUrl = item.file_url || item.existing_url;
        if (!nextUrl) {
            throw new PhotoToolV2HttpError('Run item не содержит итоговый file_url.', 409, 'PHOTO_TOOL_RUN_NOT_READY');
        }
        return [item.item_id, nextUrl] as const;
    }));

    let updatedRun: PhotoToolRunRecord;
    try {
        updatedRun = await prisma.$transaction(async (tx) => {
            await tx.photoToolRun.update({
                where: { id: run.id },
                data: { status: 'COMMITTING', error_message: null }
            });

            for (const item of run.items) {
                const expectedState = expectedItemStateById.get(item.item_id);
                if (!expectedState) {
                    throw createStaleError();
                }
                const result = await tx.item.updateMany({
                    where: {
                        id: item.item_id,
                        batch_id: run.batch_id,
                        deleted_at: null,
                        item_seq: expectedState.item_seq,
                        item_photo_url: expectedState.item_photo_url,
                        updated_at: expectedState.updated_at
                    },
                    data: {
                        item_photo_url: nextPhotoUrlByItemId.get(item.item_id) || null
                    }
                });
                if (result.count !== 1) {
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

    const updatedRun = await prisma.$transaction(async (tx) => {
        await tx.photoToolRunItem.updateMany({
            where: { run_id: run.id, status: { notIn: ['UPLOADED', 'REUSED'] } },
            data: { status: 'CANCELLED' }
        });
        return tx.photoToolRun.update({
            where: { id: run.id },
            data: { status: 'CANCELLED' },
            include: RUN_INCLUDE
        });
    });

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
            const intent = await readIntent(entry);
            if (intent.run_id === runId) {
                await fs.rm(getIntentDir(entry), { recursive: true, force: true });
            }
        } catch {
            await fs.rm(getIntentDir(entry), { recursive: true, force: true }).catch(() => undefined);
        }
    }));
};

export const __photoToolV2TestUtils = {
    parsePhotoManifestV2,
    stableJson,
    buildUploadId,
    getIntentDir,
    writeIntent,
    removeIntent: (uploadId: string) => fs.rm(getIntentDir(uploadId), { recursive: true, force: true })
};
