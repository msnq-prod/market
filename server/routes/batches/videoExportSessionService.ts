import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import { loadBatchMediaSnapshot, queueBatchMediaReadyNotifications, runTelegramSideEffect } from '../../services/telegramNotifications.ts';
import {
    ACTIVE_VIDEO_EXPORT_STATUSES,
    RECOVERABLE_VIDEO_EXPORT_STATUSES,
    VIDEO_EXPORT_ABANDONED_MESSAGE,
    VIDEO_EXPORT_CANCELLED_MESSAGE,
    VIDEO_EXPORT_STALE_AFTER_MS,
    buildVideoExportFilename,
    buildVideoExportPublicOutputDir,
    buildVideoExportPublicRelativePath,
    buildVideoExportPublicUrl,
    moveFileSafely,
    parseUploadedVideoExportManifest,
    parseVideoExportManifest,
    parseVideoExportSourceFingerprint,
    serializeBatchVideoExportSession,
    type UploadedVideoExportManifestEntry,
    type VideoExportIntroAsset,
    type VideoExportManifest
} from '../../services/videoExport.ts';
import {
    BATCH_INCLUDE,
    createHttpError,
    parseChecksumSha256,
    prisma,
    removeStagedVideoFile,
    sha256File
} from './shared.ts';
import type { PrismaDbClient } from './shared.ts';

const VIDEO_EXPORT_LOCK_TIMEOUT_SECONDS = 15;
const VIDEO_EXPORT_INTRO_FILENAME = 'intro.mp4';

export const buildVideoExportSessionInclude = Prisma.validator<Prisma.BatchVideoExportSessionInclude>()({
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

export const serializeVideoExportSessionDetails = (session: VideoExportSessionRecord) => ({
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

    if (parsed.outputs.length < 1 || parsed.outputs.length > batchItems.length) {
        throw createHttpError(`Количество товарных фрагментов должно быть от 1 до ${batchItems.length}.`, 400);
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

        const sourceIndex = typeof segment.source_index === 'number' ? segment.source_index : 0;
        if (sourceIndex < 0 || !Number.isInteger(sourceIndex)) {
            throw createHttpError('Некорректный source_index в render_manifest.', 400);
        }
    });

    if (sortedSegments.length !== parsed.outputs.length + 1) {
        throw createHttpError('Количество сегментов должно равняться intro + количеству outputs.', 400);
    }

    if (parsed.sources) {
        if (parsed.sources.length === 0) {
            throw createHttpError('sources не должен быть пустым.', 400);
        }

        const sortedSources = [...parsed.sources].sort((left, right) => left.source_index - right.source_index);
        sortedSources.forEach((source, index) => {
            if (source.source_index !== index) {
                throw createHttpError('sources должны идти непрерывно от source_index 0.', 400);
            }

            if (index === 0 && source.role !== 'WITH_INTRO') {
                throw createHttpError('Первый source должен содержать intro.', 400);
            }

            if (index > 0 && source.role !== 'NO_INTRO') {
                throw createHttpError('Дополнительные source должны быть без intro.', 400);
            }
        });

        const sourceIndexSet = new Set(sortedSources.map((source) => source.source_index));
        const segmentWithMissingSource = sortedSegments.find((segment) => !sourceIndexSet.has(segment.source_index ?? 0));
        if (segmentWithMissingSource) {
            throw createHttpError('Сегмент ссылается на отсутствующий source_index.', 400);
        }
    }

    const segmentsBySource = new Map<number, VideoExportManifest['segments']>();
    for (const segment of sortedSegments) {
        const sourceIndex = segment.source_index ?? 0;
        const sourceSegments = segmentsBySource.get(sourceIndex) ?? [];
        sourceSegments.push(segment);
        segmentsBySource.set(sourceIndex, sourceSegments);
    }

    for (const sourceSegments of segmentsBySource.values()) {
        const sortedSourceSegments = [...sourceSegments].sort((left, right) => left.start_ms - right.start_ms);
        for (let index = 1; index < sortedSourceSegments.length; index += 1) {
            const previous = sortedSourceSegments[index - 1];
            const current = sortedSourceSegments[index];
            if ((previous.end_ms - current.start_ms) > 1) {
                throw createHttpError('Сегменты одного source не должны пересекаться.', 400);
            }
        }
    }

    const batchItemsById = new Map(batchItemsWithSerial.map((item) => [item.id, item]));
    const seenSegmentSeq = new Set<number>();
    const seenItemIds = new Set<string>();
    const seenSerials = new Set<string>();
    const sortedParsedOutputs = [...parsed.outputs].sort((left, right) => left.segment_seq - right.segment_seq);
    const outputs = sortedParsedOutputs.map((output, outputIndex) => {
        const expectedBatchItem = batchItems[outputIndex];
        const batchItem = batchItemsById.get(output.item_id);
        if (!batchItem || !batchItem.serial_number) {
            throw createHttpError('render_manifest содержит item_id вне выбранной партии.', 400);
        }

        if (!expectedBatchItem || output.item_id !== expectedBatchItem.id) {
            throw createHttpError('render_manifest должен описывать префикс Item партии без пропусков.', 400);
        }

        if (output.serial_number !== batchItem.serial_number) {
            throw createHttpError('render_manifest.serial_number не совпадает с Item.serial_number.', 400);
        }

        if (output.segment_seq !== outputIndex + 1) {
            throw createHttpError('render_manifest.segment_seq должен идти последовательностью 001..NNN без пропусков.', 400);
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
        ...(parsed.manifest_version ? { manifest_version: parsed.manifest_version } : {}),
        ...(parsed.sources ? { sources: [...parsed.sources].sort((left, right) => left.source_index - right.source_index) } : {}),
        segments: sortedSegments,
        outputs,
        ...(parsed.intro_asset ? { intro_asset: parsed.intro_asset } : {})
    };
};

const manifestsAreAppendCompatible = (
    existingManifest: VideoExportManifest | null,
    nextManifest: VideoExportManifest
) => {
    if (!existingManifest || existingManifest.outputs.length > nextManifest.outputs.length || existingManifest.segments.length > nextManifest.segments.length) {
        return false;
    }

    const existingWithoutIntroAsset = {
        ...existingManifest,
        intro_asset: null
    };
    const nextPrefixWithoutIntroAsset = {
        ...nextManifest,
        sources: nextManifest.sources?.slice(0, existingManifest.sources?.length ?? nextManifest.sources?.length),
        segments: nextManifest.segments.slice(0, existingManifest.segments.length),
        outputs: nextManifest.outputs.slice(0, existingManifest.outputs.length),
        intro_asset: null
    };

    return JSON.stringify(existingWithoutIntroAsset) === JSON.stringify(nextPrefixWithoutIntroAsset);
};

const normalizeVideoExportSourceFingerprintInput = (value: unknown) => {
    const parsed = parseVideoExportSourceFingerprint((value ?? null) as Prisma.JsonValue | null);
    if (!parsed) {
        throw createHttpError('Не передан корректный source_fingerprint.', 400);
    }

    return parsed;
};

export const loadVideoExportSession = async (db: PrismaDbClient, batchId: string, sessionId: string) => {
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

export const markStaleVideoExportSessions = async (db: PrismaDbClient, batchId: string) => {
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

export const markAllStaleVideoExportSessions = async () => {
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

export const withVideoExportBatchLock = async <T>(batchId: string, handler: (tx: Prisma.TransactionClient) => Promise<T>) =>
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

export const getVideoToolPayload = async (req: { buildBatchPayload: (batch: Prisma.BatchGetPayload<{ include: typeof BATCH_INCLUDE }>) => unknown }, batchId: string) => {
    await markStaleVideoExportSessions(prisma, batchId);

    const batch = await prisma.batch.findFirst({
        where: {
            id: batchId,
            deleted_at: null
        },
        include: BATCH_INCLUDE
    });

    if (!batch) {
        throw createHttpError('Партия не найдена.', 404);
    }

    const serialized = req.buildBatchPayload(batch);
    const typedSerialized = serialized as ReturnType<typeof req.buildBatchPayload> & {
        id: string;
        status: string;
        created_at: Date;
        updated_at: Date;
        collected_date: Date | null;
        collected_time: string | null;
        daily_batch_seq: number | null;
        items: Array<{ id: string; temp_id: string | null; item_seq: number | null; serial_number: string | null; item_video_url: string | null }>;
        video_processing: unknown;
        video_export: unknown;
        product: null | { id: string; country_code: string | null; location_code: string | null; item_code: string | null; translations: unknown };
    };

    return {
        batch: {
            id: typedSerialized.id,
            status: typedSerialized.status,
            created_at: typedSerialized.created_at,
            updated_at: typedSerialized.updated_at,
            collected_date: typedSerialized.collected_date,
            collected_time: typedSerialized.collected_time,
            daily_batch_seq: typedSerialized.daily_batch_seq,
            expected_output_count: typedSerialized.items.length,
            video_processing: typedSerialized.video_processing,
            video_export: typedSerialized.video_export
        },
        product: typedSerialized.product
            ? {
                id: typedSerialized.product.id,
                country_code: typedSerialized.product.country_code,
                location_code: typedSerialized.product.location_code,
                item_code: typedSerialized.product.item_code,
                translations: typedSerialized.product.translations
            }
            : null,
        items: typedSerialized.items.map((item) => ({
            id: item.id,
            temp_id: item.temp_id,
            item_seq: item.item_seq,
            serial_number: item.serial_number,
            item_video_url: item.item_video_url
        }))
    };
};

export const createOrResumeVideoExportSession = async (
    batchId: string,
    userId: string,
    body: {
        expected_count?: number;
        crossfade_ms?: number;
        source_fingerprint?: unknown;
        render_manifest?: unknown;
    }
) => {
    const safeExpectedCount = typeof body.expected_count === 'number' ? body.expected_count : Number(body.expected_count);
    if (!Number.isFinite(safeExpectedCount)) {
        throw createHttpError('expected_count должен быть числом.', 400);
    }

    const safeCrossfadeMs = typeof body.crossfade_ms === 'number' ? body.crossfade_ms : Number(body.crossfade_ms);
    if (!Number.isFinite(safeCrossfadeMs) || safeCrossfadeMs < 0 || safeCrossfadeMs > 5000) {
        throw createHttpError('Длительность аудио-кроссфейда должна быть числом от 0 до 5000 мс.', 400);
    }

    const normalizedFingerprint = normalizeVideoExportSourceFingerprintInput(body.source_fingerprint);
    return withVideoExportBatchLock(batchId, async (tx) => {
        await markStaleVideoExportSessions(tx, batchId);

        const batch = await tx.batch.findFirst({
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

        if (!batch) {
            throw createHttpError('Партия не найдена.', 404);
        }

        if (batch.status !== 'RECEIVED') {
            throw createHttpError('Монтаж видео доступен только для партии в статусе RECEIVED.', 400);
        }

        if (safeExpectedCount !== batch.items.length) {
            throw createHttpError(`Количество товарных фрагментов должно совпадать с количеством Item партии: ${batch.items.length}.`, 400);
        }

        const normalizedManifest = normalizeVideoExportManifest(body.render_manifest, batch.items);

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
            const sameManifestConfig = manifestsAreAppendCompatible(existingManifest, normalizedManifest)
                && existingManifest?.segments.length === normalizedManifest.segments.length
                && existingManifest?.outputs.length === normalizedManifest.outputs.length
                && (existingManifest.sources?.length ?? 0) === (normalizedManifest.sources?.length ?? 0)
                && latestReusable.crossfade_ms === safeCrossfadeMs
                && latestReusable.expected_count === batch.items.length;
            const appendCompatible = manifestsAreAppendCompatible(existingManifest, normalizedManifest);

            if (latestReusable.uploaded_count > 0 && !appendCompatible) {
                throw createHttpError('Для незавершённой сессии уже загружены файлы. Можно только добавить новые source и клипы в конец текущей нарезки.', 409);
            }

            const manifestForUpdate = existingManifest?.intro_asset && !normalizedManifest.intro_asset
                ? {
                    ...normalizedManifest,
                    intro_asset: existingManifest.intro_asset
                }
                : normalizedManifest;

            const updatedSession = latestReusable.uploaded_count === 0 || latestReusable.status !== 'OPEN' || !sameManifestConfig
                ? await tx.batchVideoExportSession.update({
                    where: { id: latestReusable.id },
                    data: {
                        status: 'OPEN',
                        expected_count: batch.items.length,
                        crossfade_ms: safeCrossfadeMs,
                        source_fingerprint: normalizedFingerprint as Prisma.InputJsonValue,
                        render_manifest: manifestForUpdate as Prisma.InputJsonValue,
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
                created_by_user_id: userId,
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
};

export const getVideoExportSessionPayload = async (batchId: string, sessionId: string) => {
    await markStaleVideoExportSessions(prisma, batchId);
    const session = await loadVideoExportSession(prisma, batchId, sessionId);
    if (!session) {
        throw createHttpError('Сессия экспорта не найдена.', 404);
    }

    return {
        session: serializeVideoExportSessionDetails(session)
    };
};

export const uploadVideoExportIntro = async (batchId: string, sessionId: string, body: Record<string, unknown> | undefined, uploadedFile: Express.Multer.File) => {
    try {
        const parsedChecksum = parseChecksumSha256(body?.checksum_sha256);
        if (parsedChecksum) {
            const actualChecksum = await sha256File(uploadedFile.path);
            if (actualChecksum !== parsedChecksum) {
                throw createHttpError('Контрольная сумма intro-файла не совпадает с queued upload.', 400);
            }
        }

        return await withVideoExportBatchLock(batchId, async (tx) => {
            await markStaleVideoExportSessions(tx, batchId);

            const loadedSession = await loadVideoExportSession(tx, batchId, sessionId);
            if (!loadedSession) {
                throw createHttpError('Сессия экспорта не найдена.', 404);
            }

            if (loadedSession.batch.status !== 'RECEIVED') {
                throw createHttpError('Сохранение intro доступно только для партии в статусе RECEIVED.', 400);
            }

            if (loadedSession.status === 'CANCELLED') {
                throw createHttpError('Сессия экспорта отменена и больше не принимает intro.', 409);
            }

            const manifest = parseVideoExportManifest(loadedSession.render_manifest);
            if (!manifest) {
                throw createHttpError('В сессии отсутствует render_manifest.', 400);
            }

            if (manifest.intro_asset) {
                return {
                    duplicate: true,
                    session: serializeVideoExportSessionDetails(loadedSession)
                };
            }

            const outputDir = buildVideoExportPublicOutputDir(loadedSession.batch_id, loadedSession.version);
            await fs.mkdir(outputDir, { recursive: true });

            const targetPath = path.join(outputDir, VIDEO_EXPORT_INTRO_FILENAME);
            await fs.rm(targetPath, { force: true });
            await moveFileSafely(uploadedFile.path, targetPath);

            const introAsset: VideoExportIntroAsset = {
                file_name: VIDEO_EXPORT_INTRO_FILENAME,
                relative_path: buildVideoExportPublicRelativePath(loadedSession.batch_id, loadedSession.version, VIDEO_EXPORT_INTRO_FILENAME),
                public_url: buildVideoExportPublicUrl(loadedSession.batch_id, loadedSession.version, VIDEO_EXPORT_INTRO_FILENAME),
                uploaded_at: new Date().toISOString()
            };

            const updatedSession = await tx.batchVideoExportSession.update({
                where: { id: loadedSession.id },
                data: {
                    render_manifest: {
                        ...manifest,
                        intro_asset: introAsset
                    } as Prisma.InputJsonValue,
                    error_message: null,
                    started_at: loadedSession.started_at ?? new Date()
                },
                include: buildVideoExportSessionInclude
            });

            return {
                duplicate: false,
                session: serializeVideoExportSessionDetails(updatedSession)
            };
        });
    } finally {
        await removeStagedVideoFile(uploadedFile);
    }
};

export const uploadVideoExportFile = async (
    batchId: string,
    sessionId: string,
    body: Record<string, unknown> | undefined,
    uploadedFile: Express.Multer.File
) => {
    let loadedSessionId: string | null = null;
    const beforeMediaSnapshot = await loadBatchMediaSnapshot(prisma, batchId);

    try {
        const parsedChecksum = parseChecksumSha256(body?.checksum_sha256);
        if (parsedChecksum) {
            const actualChecksum = await sha256File(uploadedFile.path);
            if (actualChecksum !== parsedChecksum) {
                throw createHttpError('Контрольная сумма финального ролика не совпадает с queued upload.', 400);
            }
        }

        const serialNumber = typeof body?.serial_number === 'string'
            ? body.serial_number.trim().toUpperCase()
            : '';
        if (!serialNumber) {
            throw createHttpError('Не передан serial_number для финального ролика.', 400);
        }

        const result = await withVideoExportBatchLock(batchId, async (tx) => {
            await markStaleVideoExportSessions(tx, batchId);

            const loadedSession = await loadVideoExportSession(tx, batchId, sessionId);
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
            await moveFileSafely(uploadedFile.path, targetPath);

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
            const afterMediaSnapshot = await loadBatchMediaSnapshot(prisma, batchId);
            await runTelegramSideEffect(() => queueBatchMediaReadyNotifications(prisma, beforeMediaSnapshot, afterMediaSnapshot));
        }

        return result;
    } catch (error) {
        if (loadedSessionId && (typeof (error as { statusCode?: unknown })?.statusCode !== 'number' || Number((error as { statusCode?: number }).statusCode) >= 500)) {
            await prisma.batchVideoExportSession.update({
                where: { id: loadedSessionId },
                data: {
                    status: 'FAILED',
                    error_message: error instanceof Error && error.message ? error.message : 'Не удалось загрузить финальный ролик.'
                }
            }).catch(() => undefined);
        }

        throw error;
    } finally {
        await removeStagedVideoFile(uploadedFile);
    }
};

export const retryVideoExportTail = async (batchId: string, sessionId: string) => {
    return withVideoExportBatchLock(batchId, async (tx) => {
        await markStaleVideoExportSessions(tx, batchId);

        const session = await loadVideoExportSession(tx, batchId, sessionId);
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
};

export const cancelVideoExportSession = async (batchId: string, sessionId: string) => {
    return withVideoExportBatchLock(batchId, async (tx) => {
        await markStaleVideoExportSessions(tx, batchId);

        const session = await loadVideoExportSession(tx, batchId, sessionId);
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
};

export const serializeBatchVideoExport = serializeBatchVideoExportSession;
