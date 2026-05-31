import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import {
    buildVideoExportFilename,
    buildVideoExportPublicOutputDir,
    buildVideoExportPublicUrl,
    moveFileSafely,
    parseVideoExportManifest,
    type VideoExportManifest
} from '../../services/videoExport.ts';
import {
    createHttpError,
    parseChecksumSha256,
    prisma,
    removeStagedVideoFile,
    sha256File
} from './shared.ts';

export const buildVideoExportRunInclude = Prisma.validator<Prisma.BatchVideoExportRunInclude>()({
    batch: {
        include: {
            items: {
                where: { deleted_at: null },
                orderBy: { item_seq: 'asc' }
            }
        }
    },
    items: {
        orderBy: { segment_seq: 'asc' }
    }
});

type RunRecord = Prisma.BatchVideoExportRunGetPayload<{ include: typeof buildVideoExportRunInclude }>;

export const BLOCKING_VIDEO_EXPORT_RUN_STATUSES: Array<'DRAFT' | 'READY' | 'RENDERING' | 'UPLOADING' | 'PARTIAL'> = [
    'DRAFT',
    'READY',
    'RENDERING',
    'UPLOADING',
    'PARTIAL'
];

export const serializeVideoExportRunDetails = (run: RunRecord) => ({
    run_id: run.id,
    batch_id: run.batch_id,
    created_by_user_id: run.created_by_user_id,
    status: run.status,
    version: run.version,
    render_manifest: run.render_manifest,
    export_settings: run.export_settings,
    committed_at: run.committed_at,
    created_at: run.created_at,
    updated_at: run.updated_at,
    items: run.items.map((item) => ({
        item_id: item.item_id,
        serial_number: item.serial_number,
        segment_seq: item.segment_seq,
        status: item.status,
        render_status: item.render_status,
        upload_status: item.upload_status,
        file_url: item.file_url,
        item_card_url: `/clone/${encodeURIComponent(item.serial_number)}`,
        error_message: item.error_message,
        checksum: item.checksum,
        updated_at: item.updated_at,
        created_at: item.created_at
    }))
});

const parseJsonBodyField = (value: unknown) => {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as unknown;
        } catch {
            return null;
        }
    }

    return value ?? null;
};

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

    if (parsed.export_settings) {
        const { resolution, quality, fps } = parsed.export_settings;
        if (resolution && !['1080p', '720p'].includes(resolution)) {
            throw createHttpError('Недопустимое разрешение в настройках экспорта.', 400);
        }
        if (quality && !['high', 'medium', 'low'].includes(quality)) {
            throw createHttpError('Недопустимое качество в настройках экспорта.', 400);
        }
        if (fps && ![30, 60].includes(fps)) {
            throw createHttpError('Недопустимая частота кадров (FPS) в настройках экспорта.', 400);
        }
    }

    return {
        ...(parsed.manifest_version ? { manifest_version: parsed.manifest_version } : {}),
        ...(parsed.sources ? { sources: [...parsed.sources].sort((left, right) => left.source_index - right.source_index) } : {}),
        segments: sortedSegments,
        outputs,
        ...(parsed.intro_asset ? { intro_asset: parsed.intro_asset } : {}),
        ...(parsed.export_settings ? { export_settings: parsed.export_settings } : {})
    };
};

export const withVideoExportBatchLock = async <T>(batchId: string, handler: (tx: Prisma.TransactionClient) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
        const lockName = `video_export_run_batch_${batchId}`;
        const lockRows = await tx.$queryRaw<Array<{ acquired: number | bigint | null }>>`
            SELECT GET_LOCK(${lockName}, 15) AS acquired
        `;
        const acquired = typeof lockRows[0]?.acquired === 'bigint' ? Number(lockRows[0].acquired) : Number(lockRows[0]?.acquired ?? 0);
        if (acquired !== 1) {
            throw createHttpError('Не удалось получить эксклюзивную блокировку для запуска экспорта партии. Повторите попытку.', 409);
        }

        try {
            return await handler(tx);
        } finally {
            await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`.catch(() => undefined);
        }
    });

export const loadVideoExportRun = async (db: Prisma.TransactionClient | typeof prisma, batchId: string, runId: string) => {
    return db.batchVideoExportRun.findFirst({
        where: {
            id: runId,
            batch_id: batchId,
            batch: { deleted_at: null }
        },
        include: buildVideoExportRunInclude
    });
};

export const getVideoExportRuns = async (batchId: string) => {
    const runs = await prisma.batchVideoExportRun.findMany({
        where: {
            batch_id: batchId,
            batch: { deleted_at: null }
        },
        include: buildVideoExportRunInclude,
        orderBy: { version: 'desc' }
    });

    return { runs: runs.map(serializeVideoExportRunDetails) };
};

export const uploadVideoExportItemFile = async (
    batchId: string,
    runId: string,
    itemId: string,
    userId: string,
    body: Record<string, unknown> | undefined,
    uploadedFile: Express.Multer.File
) => {
    try {
        const parsedChecksum = parseChecksumSha256(body?.checksum_sha256);
        if (parsedChecksum) {
            const actualChecksum = await sha256File(uploadedFile.path);
            if (actualChecksum !== parsedChecksum) {
                throw createHttpError('Контрольная сумма ролика не совпадает с queued upload.', 400);
            }
        }

        const serialNumber = typeof body?.serial_number === 'string'
            ? body.serial_number.trim().toUpperCase()
            : '';
        if (!serialNumber) {
            throw createHttpError('Не передан serial_number для ролика.', 400);
        }

        return await withVideoExportBatchLock(batchId, async (tx) => {
            const batch = await tx.batch.findFirst({
                where: { id: batchId, deleted_at: null },
                include: {
                    items: {
                        where: { deleted_at: null },
                        orderBy: { item_seq: 'asc' }
                    }
                }
            });
            if (!batch) {
                throw createHttpError('Партия не найдена.', 404);
            }
            if (batch.status !== 'RECEIVED') {
                throw createHttpError('Загрузка видео доступна только для партии в статусе RECEIVED.', 400);
            }

            const normalizedManifest = normalizeVideoExportManifest(parseJsonBodyField(body?.render_manifest), batch.items);
            const manifestTarget = normalizedManifest.outputs.find((output) => (
                output.item_id === itemId && output.serial_number.toUpperCase() === serialNumber
            ));
            if (!manifestTarget) {
                throw createHttpError('render_manifest не содержит загружаемый Item.', 400);
            }

            let run = await loadVideoExportRun(tx, batchId, runId);
            if (!run) {
                const latestVersionRecord = await tx.batchVideoExportRun.findFirst({
                    where: { batch_id: batch.id },
                    orderBy: { version: 'desc' },
                    select: { version: true }
                });
                await tx.batchVideoExportRun.create({
                    data: {
                        id: runId,
                        batch_id: batch.id,
                        created_by_user_id: userId,
                        status: 'UPLOADING',
                        version: (latestVersionRecord?.version ?? 0) + 1,
                        render_manifest: normalizedManifest as Prisma.InputJsonValue,
                        export_settings: (parseJsonBodyField(body?.export_settings) || normalizedManifest.export_settings || {}) as Prisma.InputJsonValue
                    }
                });
                for (const output of normalizedManifest.outputs) {
                    await tx.batchVideoExportItem.create({
                        data: {
                            run_id: runId,
                            item_id: output.item_id,
                            serial_number: output.serial_number,
                            segment_seq: output.segment_seq,
                            status: 'PENDING'
                        }
                    });
                }

                run = await loadVideoExportRun(tx, batchId, runId);
                if (!run) {
                    throw createHttpError('Не удалось создать серверный запуск экспорта.', 500);
                }
            } else {
                const existingManifest = parseVideoExportManifest(run.render_manifest);
                if (JSON.stringify(existingManifest) !== JSON.stringify(normalizedManifest)) {
                    throw createHttpError('render_manifest не совпадает с серверным запуском экспорта.', 409);
                }
            }

            if (run.status === 'CANCELLED' || run.status === 'COMPLETED') {
                throw createHttpError('Этот запуск уже закрыт.', 409);
            }

            const targetItem = run.items.find((it) => it.item_id === itemId && it.serial_number.toUpperCase() === serialNumber);
            if (!targetItem) {
                throw createHttpError('Товар не относится к текущему запуску экспорта.', 400);
            }

            const outputDir = buildVideoExportPublicOutputDir(batchId, run.version);
            await fs.mkdir(outputDir, { recursive: true });

            const fileName = buildVideoExportFilename(serialNumber);
            const targetPath = path.join(outputDir, fileName);
            await fs.rm(targetPath, { force: true });
            await moveFileSafely(uploadedFile.path, targetPath);

            const publicUrl = buildVideoExportPublicUrl(batchId, run.version, fileName);

            // Update item in run
            await tx.batchVideoExportItem.update({
                where: { id: targetItem.id },
                data: {
                    status: 'UPLOADED',
                    render_status: 'RENDERED',
                    upload_status: 'UPLOADED',
                    file_url: publicUrl,
                    checksum: parsedChecksum || null,
                    error_message: null
                }
            });

            // Update item_video_url immediately
            await tx.item.update({
                where: { id: itemId },
                data: { item_video_url: publicUrl }
            });

            // Reconcile run status
            const currentItems = await tx.batchVideoExportItem.findMany({
                where: { run_id: run.id }
            });

            const allTerminal = currentItems.every((item) =>
                item.status === 'UPLOADED' || item.status === 'SKIPPED' || item.status === 'CANCELLED'
            );

            let nextRunStatus: RunRecord['status'] = run.status;
            if (allTerminal) {
                nextRunStatus = 'COMPLETED';
            } else if (run.status === 'RENDERING' || run.status === 'READY') {
                nextRunStatus = 'UPLOADING';
            }

            await tx.batchVideoExportRun.update({
                where: { id: run.id },
                data: {
                    status: nextRunStatus,
                    committed_at: nextRunStatus === 'COMPLETED' ? new Date() : run.committed_at
                }
            });

            const updatedRun = await tx.batchVideoExportRun.findUniqueOrThrow({
                where: { id: run.id },
                include: buildVideoExportRunInclude
            });

            return {
                run: serializeVideoExportRunDetails(updatedRun),
                status: nextRunStatus,
                file_url: publicUrl,
                item_card_url: `/clone/${encodeURIComponent(serialNumber)}`,
                uploaded: {
                    item_id: itemId,
                    serial_number: serialNumber,
                    file_url: publicUrl,
                    item_card_url: `/clone/${encodeURIComponent(serialNumber)}`
                }
            };
        });
    } finally {
        await removeStagedVideoFile(uploadedFile);
    }
};

export const cancelVideoExportRun = async (batchId: string, runId: string) => {
    return withVideoExportBatchLock(batchId, async (tx) => {
        const run = await loadVideoExportRun(tx, batchId, runId);
        if (!run) {
            throw createHttpError('Запуск экспорта не найден.', 404);
        }

        if (run.status === 'COMPLETED') {
            throw createHttpError('Завершенный запуск нельзя отменить.', 400);
        }

        await tx.batchVideoExportRun.update({
            where: { id: run.id },
            data: {
                status: 'CANCELLED'
            }
        });

        await tx.batchVideoExportItem.updateMany({
            where: { run_id: run.id, status: { notIn: ['UPLOADED', 'SKIPPED'] } },
            data: {
                status: 'CANCELLED',
                render_status: 'CANCELLED',
                upload_status: 'CANCELLED'
            }
        });

        const updatedRun = await tx.batchVideoExportRun.findUniqueOrThrow({
            where: { id: run.id },
            include: buildVideoExportRunInclude
        });

        return { run: serializeVideoExportRunDetails(updatedRun) };
    });
};
