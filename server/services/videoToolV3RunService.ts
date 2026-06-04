import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import type express from 'express';
import { prisma } from './prisma.ts';
import { writeSecurityAuditLog } from './security.ts';
import { sha256File } from '../routes/batches/shared.ts';
import { buildCloneUrl } from '../utils/cloneUrls.ts';
import { resolveProjectPath } from '../utils/projectPaths.ts';

export type VideoToolV3ErrorCode =
    | 'BATCH_NOT_RECEIVED'
    | 'RUN_MANIFEST_CONFLICT'
    | 'ITEM_VIDEO_EXISTS'
    | 'CHECKSUM_MISMATCH'
    | 'UPLOAD_INTENT_EXPIRED'
    | 'UPLOAD_CHUNK_CONFLICT'
    | 'UPLOAD_CHUNKS_MISSING';

export class VideoToolV3HttpError extends Error {
    statusCode: number;
    code?: VideoToolV3ErrorCode;
    details?: unknown;

    constructor(message: string, statusCode: number, code?: VideoToolV3ErrorCode, details?: unknown) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

export const getVideoToolV3ErrorStatus = (error: unknown) =>
    typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

export const getVideoToolV3ErrorCode = (error: unknown) =>
    typeof (error as { code?: unknown })?.code === 'string'
        ? String((error as { code: string }).code)
        : undefined;

export const getVideoToolV3ErrorDetails = (error: unknown) =>
    (error as { details?: unknown })?.details;

const RUN_INCLUDE = Prisma.validator<Prisma.VideoToolV3RunInclude>()({
    items: {
        orderBy: { created_at: 'asc' }
    }
});

const BATCH_INCLUDE = Prisma.validator<Prisma.BatchInclude>()({
    product: {
        include: {
            translations: true,
            location: true
        }
    },
    items: {
        where: { deleted_at: null },
        orderBy: { item_seq: 'asc' }
    }
});

type VideoToolV3RunRecord = Prisma.VideoToolV3RunGetPayload<{ include: typeof RUN_INCLUDE }>;
type VideoToolV3BatchRecord = Prisma.BatchGetPayload<{ include: typeof BATCH_INCLUDE }>;

type ManifestOutput = {
    exportItemId: string;
    itemId: string;
    serialNumber: string;
    segmentId: string;
    sourceId: string;
    startMs: number;
    endMs: number;
};

type RenderManifestV3 = {
    manifestVersion: 3;
    batchId: string;
    projectId: string;
    runId: string;
    settings: {
        width: 720;
        height: 1280;
        fps: 24;
        qualityPreset: string;
        audio: 'disabled';
    };
    sources: Array<{
        sourceId: string;
        position: number;
        preparedPath: string;
        checksumSha256: string;
        durationMs: number;
    }>;
    introSegment: {
        segmentId: string;
        sourceId: string;
        startMs: number;
        endMs: number;
    };
    outputs: ManifestOutput[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;
const VIDEO_TOOL_V3_PUBLIC_ROOT = resolveProjectPath('public', 'uploads', 'videos', 'v3');
const VIDEO_TOOL_V3_PUBLIC_URL_ROOT = '/uploads/videos/v3';

const exactKeys = (value: Record<string, unknown>, keys: string[]) => {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isUuid = (value: unknown): value is string =>
    typeof value === 'string' && UUID_RE.test(value);

const isSha256 = (value: unknown): value is string =>
    typeof value === 'string' && SHA256_RE.test(value.toLowerCase());

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) >= 0;

export const parseRenderManifestV3 = (value: unknown, batchId: string, runId: string): RenderManifestV3 => {
    if (!isPlainObject(value) || !exactKeys(value, [
        'manifestVersion',
        'batchId',
        'projectId',
        'runId',
        'settings',
        'sources',
        'introSegment',
        'outputs'
    ])) {
        throw new VideoToolV3HttpError('Некорректный manifest.', 400);
    }

    if (value.manifestVersion !== 3 || value.batchId !== batchId || value.runId !== runId || !isUuid(value.projectId)) {
        throw new VideoToolV3HttpError('Некорректный manifest.', 400);
    }

    if (!isPlainObject(value.settings) || !exactKeys(value.settings, ['width', 'height', 'fps', 'qualityPreset', 'audio'])) {
        throw new VideoToolV3HttpError('Некорректные настройки manifest.', 400);
    }

    if (
        value.settings.width !== 720
        || value.settings.height !== 1280
        || value.settings.fps !== 24
        || value.settings.audio !== 'disabled'
        || !isNonEmptyString(value.settings.qualityPreset)
    ) {
        throw new VideoToolV3HttpError('Некорректные настройки manifest.', 400);
    }

    if (!Array.isArray(value.sources) || value.sources.length === 0) {
        throw new VideoToolV3HttpError('Manifest должен содержать sources.', 400);
    }

    const sources = value.sources.map((source) => {
        if (!isPlainObject(source) || !exactKeys(source, [
            'sourceId',
            'position',
            'preparedPath',
            'checksumSha256',
            'durationMs'
        ])) {
            throw new VideoToolV3HttpError('Некорректный source в manifest.', 400);
        }
        if (
            !isUuid(source.sourceId)
            || !isNonNegativeInteger(source.position)
            || !isNonEmptyString(source.preparedPath)
            || !isSha256(source.checksumSha256)
            || !Number.isInteger(source.durationMs)
            || Number(source.durationMs) <= 0
        ) {
            throw new VideoToolV3HttpError('Некорректный source в manifest.', 400);
        }

        return {
            sourceId: source.sourceId,
            position: source.position,
            preparedPath: source.preparedPath,
            checksumSha256: source.checksumSha256.toLowerCase(),
            durationMs: Number(source.durationMs)
        };
    });

    if (!isPlainObject(value.introSegment) || !exactKeys(value.introSegment, ['segmentId', 'sourceId', 'startMs', 'endMs'])) {
        throw new VideoToolV3HttpError('Некорректный introSegment в manifest.', 400);
    }
    if (
        !isUuid(value.introSegment.segmentId)
        || !isUuid(value.introSegment.sourceId)
        || !isNonNegativeInteger(value.introSegment.startMs)
        || !Number.isInteger(value.introSegment.endMs)
        || Number(value.introSegment.endMs) <= Number(value.introSegment.startMs)
    ) {
        throw new VideoToolV3HttpError('Некорректный introSegment в manifest.', 400);
    }

    if (!Array.isArray(value.outputs)) {
        throw new VideoToolV3HttpError('Manifest должен содержать outputs.', 400);
    }

    const outputs = value.outputs.map((output) => {
        if (!isPlainObject(output) || !exactKeys(output, [
            'exportItemId',
            'itemId',
            'serialNumber',
            'segmentId',
            'sourceId',
            'startMs',
            'endMs'
        ])) {
            throw new VideoToolV3HttpError('Некорректный output в manifest.', 400);
        }
        if (
            !isUuid(output.exportItemId)
            || !isUuid(output.itemId)
            || !isNonEmptyString(output.serialNumber)
            || !isUuid(output.segmentId)
            || !isUuid(output.sourceId)
            || !isNonNegativeInteger(output.startMs)
            || !Number.isInteger(output.endMs)
            || Number(output.endMs) <= Number(output.startMs)
        ) {
            throw new VideoToolV3HttpError('Некорректный output в manifest.', 400);
        }

        return {
            exportItemId: output.exportItemId,
            itemId: output.itemId,
            serialNumber: output.serialNumber,
            segmentId: output.segmentId,
            sourceId: output.sourceId,
            startMs: output.startMs,
            endMs: Number(output.endMs)
        };
    });

    const sourceIds = new Set(sources.map((source) => source.sourceId));
    if (!sourceIds.has(value.introSegment.sourceId) || outputs.some((output) => !sourceIds.has(output.sourceId))) {
        throw new VideoToolV3HttpError('Manifest ссылается на неизвестный source.', 400);
    }

    return {
        manifestVersion: 3,
        batchId,
        projectId: value.projectId,
        runId,
        settings: value.settings as RenderManifestV3['settings'],
        sources,
        introSegment: value.introSegment as RenderManifestV3['introSegment'],
        outputs
    };
};

const stableJson = (value: unknown): string => {
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(',')}]`;
    }
    if (isPlainObject(value)) {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const serializeRun = (req: express.Request | null, run: VideoToolV3RunRecord) => ({
    run: {
        id: run.id,
        batch_id: run.batch_id,
        status: run.status,
        expected_count: run.expected_count,
        uploaded_count: run.uploaded_count,
        replace_existing: run.replace_existing,
        created_at: run.created_at,
        updated_at: run.updated_at
    },
    items: run.items.map((item) => ({
        item_id: item.item_id,
        serial_number: item.serial_number,
        status: item.status,
        file_url: item.file_url,
        checksum_sha256: item.checksum_sha256,
        clone_url: req ? buildCloneUrl(req, item.serial_number) : `/clone/${encodeURIComponent(item.serial_number)}`
    }))
});

const assertBatchVisible = (batch: VideoToolV3BatchRecord) => {
    if (batch.product && (batch.product.deleted_at || batch.product.location?.deleted_at)) {
        throw new VideoToolV3HttpError('Партия связана со скрытым товаром или локацией.', 409);
    }
};

export const getVideoToolV3Batch = async (req: express.Request, batchId: string) => {
    const batch = await prisma.batch.findFirst({
        where: { id: batchId, deleted_at: null },
        include: BATCH_INCLUDE
    });

    if (!batch) {
        throw new VideoToolV3HttpError('Партия не найдена.', 404);
    }
    assertBatchVisible(batch);

    return {
        batch: {
            id: batch.id,
            status: batch.status,
            expected_output_count: batch.items.length,
            daily_batch_seq: batch.daily_batch_seq,
            created_at: batch.created_at,
            updated_at: batch.updated_at
        },
        product: batch.product
            ? {
                id: batch.product.id,
                country_code: batch.product.country_code,
                location_code: batch.product.location_code,
                item_code: batch.product.item_code,
                translations: batch.product.translations.map((translation) => ({
                    language_id: translation.language_id,
                    name: translation.name,
                    description: translation.description
                }))
            }
            : null,
        items: batch.items.map((item) => ({
            id: item.id,
            temp_id: item.temp_id,
            item_seq: item.item_seq,
            serial_number: item.serial_number || '',
            item_video_url: item.item_video_url,
            clone_url: buildCloneUrl(req, item.serial_number)
        }))
    };
};

export const createVideoToolV3Run = async (
    req: express.Request,
    batchId: string,
    userId: string,
    body: unknown
) => {
    if (!isPlainObject(body)) {
        throw new VideoToolV3HttpError('Некорректный запрос.', 400);
    }

    const clientRunId = body.client_run_id;
    const expectedCount = body.expected_count;
    const replaceExisting = body.replace_existing;

    if (!isUuid(clientRunId) || !Number.isInteger(expectedCount) || Number(expectedCount) < 0 || typeof replaceExisting !== 'boolean') {
        throw new VideoToolV3HttpError('Некорректные параметры запуска.', 400);
    }

    const manifest = parseRenderManifestV3(body.manifest, batchId, clientRunId);
    if (manifest.outputs.length !== expectedCount) {
        throw new VideoToolV3HttpError('expected_count не совпадает с manifest.outputs.', 400);
    }

    const existingRun = await prisma.videoToolV3Run.findUnique({
        where: { id: clientRunId },
        include: RUN_INCLUDE
    });

    if (existingRun) {
        if (existingRun.batch_id !== batchId || stableJson(existingRun.manifest) !== stableJson(manifest)) {
            throw new VideoToolV3HttpError('Run с таким client_run_id уже создан с другим manifest.', 409, 'RUN_MANIFEST_CONFLICT');
        }
        return { statusCode: 200, payload: serializeRun(req, existingRun) };
    }

    const batch = await prisma.batch.findFirst({
        where: { id: batchId, deleted_at: null },
        include: BATCH_INCLUDE
    });

    if (!batch) {
        throw new VideoToolV3HttpError('Партия не найдена.', 404);
    }
    assertBatchVisible(batch);
    if (batch.status !== 'RECEIVED') {
        throw new VideoToolV3HttpError('Партия должна быть в статусе RECEIVED.', 409, 'BATCH_NOT_RECEIVED');
    }

    const itemsById = new Map(batch.items.map((item) => [item.id, item]));
    const seenItemIds = new Set<string>();
    const seenSerials = new Set<string>();

    for (const output of manifest.outputs) {
        const item = itemsById.get(output.itemId);
        if (!item) {
            throw new VideoToolV3HttpError('Output ссылается на item вне партии.', 400);
        }
        if (item.serial_number !== output.serialNumber) {
            throw new VideoToolV3HttpError('Serial number в manifest не совпадает с Item.', 400);
        }
        if (seenItemIds.has(output.itemId) || seenSerials.has(output.serialNumber)) {
            throw new VideoToolV3HttpError('Manifest содержит дубли item/serial.', 400);
        }
        if (item.item_video_url && !replaceExisting) {
            throw new VideoToolV3HttpError('Видео товара уже существует.', 409, 'ITEM_VIDEO_EXISTS', {
                item_id: item.id,
                serial_number: item.serial_number
            });
        }
        seenItemIds.add(output.itemId);
        seenSerials.add(output.serialNumber);
    }

    const run = await prisma.$transaction(async (tx) => tx.videoToolV3Run.create({
        data: {
            id: clientRunId,
            batch_id: batchId,
            created_by_user_id: userId,
            expected_count: expectedCount,
            replace_existing: replaceExisting,
            manifest: manifest as unknown as Prisma.InputJsonValue,
            items: {
                create: manifest.outputs.map((output) => ({
                    item_id: output.itemId,
                    serial_number: output.serialNumber
                }))
            }
        },
        include: RUN_INCLUDE
    }));

    return { statusCode: 201, payload: serializeRun(req, run) };
};

export const getVideoToolV3Run = async (req: express.Request, runId: string) => {
    const run = await prisma.videoToolV3Run.findUnique({
        where: { id: runId },
        include: RUN_INCLUDE
    });

    if (!run) {
        throw new VideoToolV3HttpError('Run не найден.', 404);
    }

    return serializeRun(req, run);
};

export const loadVideoToolV3RunItemForUpload = async (runId: string, itemId: string) => {
    const run = await prisma.videoToolV3Run.findUnique({
        where: { id: runId },
        include: {
            batch: true,
            items: {
                where: { item_id: itemId },
                include: { item: true }
            }
        }
    });

    if (!run || run.items.length === 0) {
        throw new VideoToolV3HttpError('Run item не найден.', 404);
    }
    if (run.status === 'CANCELLED') {
        throw new VideoToolV3HttpError('Run отменен.', 409);
    }

    return { run, runItem: run.items[0] };
};

const sanitizeFilenamePart = (value: string) => {
    const safe = value
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
    return safe || 'item';
};

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

export const commitVideoToolV3ItemVideo = async (input: {
    runId: string;
    itemId: string;
    userId: string;
    serialNumber: string;
    checksumSha256: string;
    fileSizeBytes: number;
    sourceFilePath: string;
}) => {
    const actualChecksum = await sha256File(input.sourceFilePath);
    if (actualChecksum !== input.checksumSha256) {
        throw new VideoToolV3HttpError('Checksum полного файла не совпадает.', 409, 'CHECKSUM_MISMATCH');
    }

    const { run, runItem } = await loadVideoToolV3RunItemForUpload(input.runId, input.itemId);
    if (runItem.serial_number !== input.serialNumber) {
        throw new VideoToolV3HttpError('Serial number не совпадает с run item.', 400);
    }

    const safeSerial = sanitizeFilenamePart(input.serialNumber);
    const outputDir = path.join(VIDEO_TOOL_V3_PUBLIC_ROOT, run.batch_id, run.id);
    const finalPath = path.join(outputDir, `${safeSerial}.mp4`);
    const tempFinalPath = path.join(outputDir, `.${safeSerial}.${Date.now()}.tmp`);
    const publicUrl = `${VIDEO_TOOL_V3_PUBLIC_URL_ROOT}/${encodeURIComponent(run.batch_id)}/${encodeURIComponent(run.id)}/${encodeURIComponent(`${safeSerial}.mp4`)}`;

    await fs.mkdir(outputDir, { recursive: true });
    await fs.rm(tempFinalPath, { force: true });
    await moveFileSafely(input.sourceFilePath, tempFinalPath);
    await fs.rename(tempFinalPath, finalPath);

    const result = await prisma.$transaction(async (tx) => {
        await tx.videoToolV3Item.update({
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

        await tx.item.update({
            where: { id: input.itemId },
            data: { item_video_url: publicUrl }
        });

        const uploadedCount = await tx.videoToolV3Item.count({
            where: { run_id: run.id, status: 'UPLOADED' }
        });

        const nextStatus = uploadedCount >= run.expected_count
            ? 'COMPLETED'
            : uploadedCount > 0
                ? 'PARTIAL'
                : 'OPEN';

        const updatedRun = await tx.videoToolV3Run.update({
            where: { id: run.id },
            data: {
                status: nextStatus,
                uploaded_count: uploadedCount,
                completed_at: nextStatus === 'COMPLETED' ? new Date() : null
            }
        });

        await writeSecurityAuditLog(tx, {
            action: runItem.file_url ? 'VIDEO_TOOL_V3_ITEM_OVERWRITTEN' : 'VIDEO_TOOL_V3_ITEM_UPLOADED',
            user_id: input.userId,
            entity_type: 'item',
            entity_id: input.itemId,
            details: {
                batch_id: run.batch_id,
                run_id: run.id,
                item_id: input.itemId,
                serial_number: input.serialNumber,
                file_url: publicUrl,
                checksum_sha256: input.checksumSha256,
                file_size_bytes: input.fileSizeBytes
            }
        });

        return {
            run: {
                id: updatedRun.id,
                status: updatedRun.status,
                expected_count: updatedRun.expected_count,
                uploaded_count: updatedRun.uploaded_count
            },
            uploaded: {
                item_id: input.itemId,
                serial_number: input.serialNumber,
                file_url: publicUrl,
                checksum_sha256: input.checksumSha256,
                clone_url: `/clone/${encodeURIComponent(input.serialNumber)}`
            }
        };
    });

    return result;
};

export const cancelVideoToolV3Run = async (runId: string) => {
    const run = await prisma.videoToolV3Run.findUnique({
        where: { id: runId },
        include: RUN_INCLUDE
    });

    if (!run) {
        throw new VideoToolV3HttpError('Run не найден.', 404);
    }
    if (run.status === 'COMPLETED') {
        throw new VideoToolV3HttpError('Завершенный run нельзя отменить.', 409);
    }

    const updatedRun = await prisma.$transaction(async (tx) => {
        await tx.videoToolV3Item.updateMany({
            where: { run_id: run.id, status: { not: 'UPLOADED' } },
            data: { status: 'CANCELLED' }
        });

        return tx.videoToolV3Run.update({
            where: { id: run.id },
            data: { status: 'CANCELLED' },
            include: RUN_INCLUDE
        });
    });

    return serializeRun(null, updatedRun);
};
