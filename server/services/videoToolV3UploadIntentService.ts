import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { resolveProjectPath } from '../utils/projectPaths.ts';
import {
    VideoToolV3HttpError,
    commitVideoToolV3ItemVideo,
    loadVideoToolV3RunItemForUpload
} from './videoToolV3RunService.ts';

type UploadIntentMetadata = {
    upload_id: string;
    run_id: string;
    item_id: string;
    serial_number: string;
    file_name: string;
    file_size_bytes: number;
    checksum_sha256: string;
    chunk_size_bytes: number;
    expires_at: string;
    chunks: Record<string, string>;
};

const UPLOAD_INTENTS_ROOT = resolveProjectPath('storage', 'video-tool-v3', 'upload-intents');
const INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const SHA256_RE = /^[a-f0-9]{64}$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseSha256 = (value: unknown, fieldName: string) => {
    if (typeof value !== 'string' || !SHA256_RE.test(value.trim().toLowerCase())) {
        throw new VideoToolV3HttpError(`${fieldName} должен быть sha256.`, 400);
    }

    return value.trim().toLowerCase();
};

const parsePositiveInteger = (value: unknown, fieldName: string) => {
    if (!Number.isInteger(value) || Number(value) <= 0) {
        throw new VideoToolV3HttpError(`${fieldName} должен быть положительным целым числом.`, 400);
    }

    return Number(value);
};

const parseNonEmptyString = (value: unknown, fieldName: string) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new VideoToolV3HttpError(`${fieldName} обязателен.`, 400);
    }

    return value.trim();
};

const buildUploadId = (runId: string, itemId: string, checksumSha256: string) =>
    `v3_${crypto.createHash('sha256').update(`${runId}:${itemId}:${checksumSha256}`).digest('hex')}`;

const getIntentDir = (uploadId: string) => path.join(UPLOAD_INTENTS_ROOT, uploadId);
const getIntentPath = (uploadId: string) => path.join(getIntentDir(uploadId), 'intent.json');
const getChunksDir = (uploadId: string) => path.join(getIntentDir(uploadId), 'chunks');
const getChunkPath = (uploadId: string, chunkIndex: number) => path.join(getChunksDir(uploadId), `${chunkIndex}.part`);

const ensureInsideIntentRoot = (targetPath: string) => {
    const root = path.resolve(UPLOAD_INTENTS_ROOT);
    const resolved = path.resolve(targetPath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        throw new VideoToolV3HttpError('Некорректный upload_id.', 400);
    }
};

const readIntent = async (uploadId: string): Promise<UploadIntentMetadata> => {
    const intentPath = getIntentPath(uploadId);
    ensureInsideIntentRoot(intentPath);

    let raw: string;
    try {
        raw = await fs.readFile(intentPath, 'utf8');
    } catch {
        throw new VideoToolV3HttpError('Upload intent не найден.', 404);
    }

    const parsed = JSON.parse(raw) as UploadIntentMetadata;
    if (new Date(parsed.expires_at).getTime() <= Date.now()) {
        throw new VideoToolV3HttpError('Upload intent истек.', 410, 'UPLOAD_INTENT_EXPIRED');
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
        throw new VideoToolV3HttpError('Upload intent не относится к run item.', 404);
    }
};

const validateChunkIndex = (value: string) => {
    const chunkIndex = Number(value);
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
        throw new VideoToolV3HttpError('chunkIndex должен быть неотрицательным целым числом.', 400);
    }

    return chunkIndex;
};

const getExpectedChunkCount = (intent: UploadIntentMetadata) =>
    Math.ceil(intent.file_size_bytes / intent.chunk_size_bytes);

const hashBuffer = (body: Buffer) => crypto.createHash('sha256').update(body).digest('hex');

export const createVideoToolV3UploadIntent = async (runId: string, itemId: string, body: unknown) => {
    if (!isPlainObject(body)) {
        throw new VideoToolV3HttpError('Некорректный запрос.', 400);
    }

    const serialNumber = parseNonEmptyString(body.serial_number, 'serial_number');
    const fileName = parseNonEmptyString(body.file_name, 'file_name');
    const fileSizeBytes = parsePositiveInteger(body.file_size_bytes, 'file_size_bytes');
    const checksumSha256 = parseSha256(body.checksum_sha256, 'checksum_sha256');
    const chunkSizeBytes = parsePositiveInteger(body.chunk_size_bytes, 'chunk_size_bytes');

    const { runItem } = await loadVideoToolV3RunItemForUpload(runId, itemId);
    if (runItem.serial_number !== serialNumber) {
        throw new VideoToolV3HttpError('serial_number не совпадает с run item.', 400);
    }

    const uploadId = buildUploadId(runId, itemId, checksumSha256);
    try {
        const existingIntent = await readIntent(uploadId);
        assertIntentScope(existingIntent, runId, itemId);
        if (
            existingIntent.serial_number === serialNumber
            && existingIntent.file_name === fileName
            && existingIntent.file_size_bytes === fileSizeBytes
            && existingIntent.chunk_size_bytes === chunkSizeBytes
        ) {
            return serializeIntent(existingIntent);
        }
        await fs.rm(getIntentDir(uploadId), { recursive: true, force: true });
    } catch (error) {
        if (getVideoToolV3UploadStatus(error) !== 404 && getVideoToolV3UploadStatus(error) !== 410) {
            throw error;
        }
        await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
    }

    const intent: UploadIntentMetadata = {
        upload_id: uploadId,
        run_id: runId,
        item_id: itemId,
        serial_number: serialNumber,
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

export const getVideoToolV3UploadIntent = async (runId: string, itemId: string, uploadId: string) => {
    const intent = await readIntent(uploadId);
    assertIntentScope(intent, runId, itemId);
    return serializeIntent(intent);
};

export const putVideoToolV3UploadChunk = async (
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
        throw new VideoToolV3HttpError('chunkIndex выходит за пределы файла.', 400);
    }

    const expectedChecksum = parseSha256(chunkSha256Header, 'X-Chunk-Sha256');
    const actualChecksum = hashBuffer(body);
    if (actualChecksum !== expectedChecksum) {
        throw new VideoToolV3HttpError('Checksum chunk не совпадает.', 409, 'CHECKSUM_MISMATCH');
    }

    const isLastChunk = chunkIndex === expectedChunkCount - 1;
    const expectedSize = isLastChunk
        ? intent.file_size_bytes - (intent.chunk_size_bytes * chunkIndex)
        : intent.chunk_size_bytes;

    if (body.length !== expectedSize) {
        throw new VideoToolV3HttpError('Размер chunk не совпадает с ожидаемым.', 400);
    }

    const existingChecksum = intent.chunks[String(chunkIndex)];
    if (existingChecksum) {
        if (existingChecksum !== expectedChecksum) {
            await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
            throw new VideoToolV3HttpError('Chunk уже загружен с другим checksum.', 409, 'UPLOAD_CHUNK_CONFLICT');
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
        throw new VideoToolV3HttpError('Не все chunks загружены.', 409, 'UPLOAD_CHUNKS_MISSING', { missing_chunks: missingChunks });
    }

    const assembledPath = path.join(getIntentDir(intent.upload_id), 'assembled.tmp');
    ensureInsideIntentRoot(assembledPath);
    await fs.writeFile(assembledPath, Buffer.alloc(0));

    for (let chunkIndex = 0; chunkIndex < expectedChunkCount; chunkIndex += 1) {
        const chunkPath = getChunkPath(intent.upload_id, chunkIndex);
        const chunk = await fs.readFile(chunkPath);
        await fs.appendFile(assembledPath, chunk);
    }

    return assembledPath;
};

export const completeVideoToolV3UploadIntent = async (
    runId: string,
    itemId: string,
    uploadId: string,
    userId: string
) => {
    const intent = await readIntent(uploadId);
    assertIntentScope(intent, runId, itemId);
    const assembledPath = await assembleChunks(intent);

    let result;
    try {
        result = await commitVideoToolV3ItemVideo({
            runId,
            itemId,
            userId,
            serialNumber: intent.serial_number,
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

export const removeVideoToolV3UploadIntentsForRun = async (runId: string) => {
    let entries: string[] = [];
    try {
        entries = await fs.readdir(UPLOAD_INTENTS_ROOT);
    } catch {
        return;
    }

    await Promise.all(entries.map(async (entry) => {
        const uploadId = entry;
        try {
            const intent = await readIntent(uploadId);
            if (intent.run_id === runId) {
                await fs.rm(getIntentDir(uploadId), { recursive: true, force: true });
            }
        } catch {
            await fs.rm(getIntentDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
        }
    }));
};

const getVideoToolV3UploadStatus = (error: unknown) =>
    typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

export const __videoToolV3UploadIntentTestUtils = {
    getIntentDir,
    writeIntent,
    removeIntent: (uploadId: string) => fs.rm(getIntentDir(uploadId), { recursive: true, force: true })
};
