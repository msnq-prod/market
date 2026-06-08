import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import { loadBatchMediaSnapshot, queueBatchMediaReadyNotifications, runTelegramSideEffect } from '../../services/telegramNotifications.ts';
import {
    PHOTO_TOOL_PUBLIC_OUTPUT_ROOT,
    PHOTO_TOOL_PUBLIC_URL_ROOT,
    buildPhotoToolFilename,
    buildQueuedPhotoToolFilename,
    createCodedHttpError,
    createHttpError,
    parseNullableInteger,
    parseOptionalText,
    parseChecksumSha256,
    prisma,
    removeStagedFiles,
    sha256File
} from './shared.ts';

const moveFileSafely = async (sourcePath: string, targetPath: string) => {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try {
        await fs.rename(sourcePath, targetPath);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EXDEV') {
            throw error;
        }
        await fs.copyFile(sourcePath, targetPath);
        await fs.rm(sourcePath, { force: true });
    }
};

const createPhotoToolStateStaleError = () => createCodedHttpError(
    'Фото партии уже обновились в другом окне или фоновой загрузкой. Обновите Photo Tool, чтобы не перезаписать чужие изменения.',
    409,
    'PHOTO_TOOL_STATE_STALE'
);

type PhotoToolApplyManifestEntry = {
    item_id: string;
    item_seq: number;
    source: 'existing' | 'upload';
    existing_url?: string;
    file_index?: number;
    queue_job_id?: string;
    queue_file_id?: string;
    checksum_sha256?: string;
};

type PhotoToolBatchRecord = Prisma.BatchGetPayload<{
    include: {
        items: {
            where: { deleted_at: null };
            orderBy: { item_seq: 'asc' };
        };
    };
}>;

const parseQueueToken = (value: unknown) => {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return /^[a-zA-Z0-9_-]{1,80}$/.test(trimmed) ? trimmed : undefined;
};

export const buildPhotoToolStateToken = (batch: PhotoToolBatchRecord) =>
    crypto.createHash('sha256').update(JSON.stringify(
        batch.items.map((item) => ({
            id: item.id,
            item_seq: item.item_seq,
            item_photo_url: item.item_photo_url,
            updated_at: item.updated_at
        }))
    )).digest('hex');

export const serializePhotoToolPayload = (batch: PhotoToolBatchRecord) => ({
    batch: {
        id: batch.id,
        status: batch.status,
        created_at: batch.created_at,
        updated_at: batch.updated_at,
        expected_photo_count: batch.items.length,
        photo_state_token: buildPhotoToolStateToken(batch)
    },
    items: batch.items.map((item) => ({
        id: item.id,
        temp_id: item.temp_id,
        item_seq: item.item_seq,
        serial_number: item.serial_number,
        item_photo_url: item.item_photo_url
    }))
});

const parsePhotoToolBaseStateToken = (value: unknown) => {
    const parsed = parseOptionalText(value);
    if (!parsed) {
        throw createHttpError('Не передан base_photo_state_token для photo-tool.', 400);
    }

    return parsed;
};

const buildPhotoToolFilePathFromUrl = (value: string) => {
    if (!value.startsWith(`${PHOTO_TOOL_PUBLIC_URL_ROOT}/`)) {
        return null;
    }

    const encodedFilename = value.slice(PHOTO_TOOL_PUBLIC_URL_ROOT.length + 1);
    if (!encodedFilename) {
        return null;
    }

    let decodedFilename = '';
    try {
        decodedFilename = decodeURIComponent(encodedFilename);
    } catch {
        return null;
    }

    if (!decodedFilename || decodedFilename !== path.basename(decodedFilename)) {
        return null;
    }

    return path.join(PHOTO_TOOL_PUBLIC_OUTPUT_ROOT, decodedFilename);
};

const cleanupOrphanedPhotoToolFiles = async (candidateUrls: string[]) => {
    const normalizedUrls = [...new Set(candidateUrls.filter((url) => url.startsWith(`${PHOTO_TOOL_PUBLIC_URL_ROOT}/`)))];
    if (normalizedUrls.length === 0) {
        return;
    }

    const stillReferenced = await prisma.item.findMany({
        where: {
            item_photo_url: {
                in: normalizedUrls
            }
        },
        select: {
            item_photo_url: true
        }
    });
    const referencedSet = new Set(stillReferenced.flatMap((item) => item.item_photo_url ? [item.item_photo_url] : []));

    await Promise.all(normalizedUrls
        .filter((url) => !referencedSet.has(url))
        .map(async (url) => {
            const filePath = buildPhotoToolFilePathFromUrl(url);
            if (!filePath) {
                return;
            }

            try {
                await fs.rm(filePath, { force: true });
            } catch (error) {
                console.error('Failed to cleanup orphaned photo-tool file', filePath, error);
            }
        }));
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
    const currentBatchPhotoUrls = new Set(batch.items.flatMap((item) => item.item_photo_url ? [item.item_photo_url] : []));

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
            const isAllowedExistingUrl = typeof existingUrl === 'string'
                && (existingUrl.startsWith(`${PHOTO_TOOL_PUBLIC_URL_ROOT}/`) || currentBatchPhotoUrls.has(existingUrl));

            if (!isAllowedExistingUrl) {
                throw createHttpError('Для existing-фото разрешены только текущие фото партии или URL из /uploads/photos/.', 400);
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
                file_index: fileIndex,
                queue_job_id: parseQueueToken(typedEntry.queue_job_id),
                queue_file_id: parseQueueToken(typedEntry.queue_file_id),
                checksum_sha256: parseChecksumSha256(typedEntry.checksum_sha256)
            };
        }

        seenItemIds.add(itemId);
        return normalizedEntry;
    });
};

export const getPhotoToolPayload = async (batchId: string) => {
    const batch = ensurePhotoToolBatchReady(await getPhotoToolBatch(batchId));
    return serializePhotoToolPayload(batch);
};

export const applyPhotoTool = async (
    batchId: string,
    body: Record<string, unknown> | undefined,
    uploadedFiles: Express.Multer.File[]
) => {
    const createdPaths: string[] = [];
    let cleanupCandidateUrls: string[] = [];
    const beforeMediaSnapshot = await loadBatchMediaSnapshot(prisma, batchId);

    try {
        const batch = ensurePhotoToolBatchReady(await getPhotoToolBatch(batchId));
        const currentPhotoStateToken = buildPhotoToolStateToken(batch);
        const basePhotoStateToken = parsePhotoToolBaseStateToken(body?.base_photo_state_token);
        const manifest = parsePhotoToolApplyManifest(body?.manifest, batch);
        const expectedItemStateById = new Map(batch.items.map((item) => [item.id, {
            item_photo_url: item.item_photo_url,
            updated_at: item.updated_at
        }]));
        if (basePhotoStateToken !== currentPhotoStateToken) {
            const currentPhotoUrlByItemId = new Map(batch.items.map((item) => [item.id, item.item_photo_url || null]));
            const isAlreadyApplied = manifest.every((entry) => {
                if (entry.source === 'existing') {
                    return currentPhotoUrlByItemId.get(entry.item_id) === entry.existing_url;
                }

                if (!entry.queue_job_id || !entry.queue_file_id) {
                    return false;
                }

                const uploadedFile = uploadedFiles[entry.file_index as number];
                if (!uploadedFile) {
                    return false;
                }

                const targetFilename = buildQueuedPhotoToolFilename(
                    batch.id,
                    entry.item_seq,
                    uploadedFile.originalname,
                    entry.queue_job_id,
                    entry.queue_file_id,
                    path.extname(uploadedFile.filename).toLowerCase()
                );
                return currentPhotoUrlByItemId.get(entry.item_id) === `${PHOTO_TOOL_PUBLIC_URL_ROOT}/${targetFilename}`;
            });

            if (isAlreadyApplied) {
                await removeStagedFiles(uploadedFiles);
                return serializePhotoToolPayload(batch);
            }

            throw createPhotoToolStateStaleError();
        }

        const usedFileIndexes = manifest
            .filter((entry) => entry.source === 'upload')
            .map((entry) => entry.file_index as number)
            .sort((left, right) => left - right);

        if (usedFileIndexes.length !== uploadedFiles.length) {
            throw createHttpError('Количество upload-записей в manifest не совпадает с набором загруженных файлов.', 400);
        }

        usedFileIndexes.forEach((fileIndex, index) => {
            if (fileIndex !== index || !uploadedFiles[fileIndex]) {
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

            if (entry.checksum_sha256) {
                const actualChecksum = await sha256File(uploadedFile.path);
                if (actualChecksum !== entry.checksum_sha256) {
                    throw createHttpError('Контрольная сумма фото не совпадает с queued upload.', 400);
                }
            }

            const safeExtension = path.extname(uploadedFile.filename).toLowerCase();
            const targetFilename = entry.queue_job_id && entry.queue_file_id
                ? buildQueuedPhotoToolFilename(
                    batch.id,
                    entry.item_seq,
                    uploadedFile.originalname,
                    entry.queue_job_id,
                    entry.queue_file_id,
                    safeExtension
                )
                : buildPhotoToolFilename(
                    batch.id,
                    entry.item_seq,
                    uploadedFile.originalname,
                    safeExtension
                );
            const targetPath = path.join(PHOTO_TOOL_PUBLIC_OUTPUT_ROOT, targetFilename);
            await moveFileSafely(uploadedFile.path, targetPath);
            createdPaths.push(targetPath);

            nextPhotoUrlByItemId.set(entry.item_id, `${PHOTO_TOOL_PUBLIC_URL_ROOT}/${targetFilename}`);
        }

        cleanupCandidateUrls = batch.items
            .flatMap((item) => item.item_photo_url ? [item.item_photo_url] : []);
        const nextPhotoUrls = new Set(nextPhotoUrlByItemId.values());
        cleanupCandidateUrls = cleanupCandidateUrls.filter((url) => !nextPhotoUrls.has(url));

        await prisma.$transaction(async (tx) => {
            for (const entry of manifest) {
                const expectedItemState = expectedItemStateById.get(entry.item_id);
                if (!expectedItemState) {
                    throw createPhotoToolStateStaleError();
                }

                const result = await tx.item.updateMany({
                    where: {
                        id: entry.item_id,
                        batch_id: batch.id,
                        deleted_at: null,
                        item_seq: entry.item_seq,
                        item_photo_url: expectedItemState.item_photo_url,
                        updated_at: expectedItemState.updated_at
                    },
                    data: {
                        item_photo_url: nextPhotoUrlByItemId.get(entry.item_id) || null
                    }
                });

                if (result.count !== 1) {
                    throw createPhotoToolStateStaleError();
                }
            }
        });

        const updatedBatch = ensurePhotoToolBatchReady(await getPhotoToolBatch(batchId));
        const afterMediaSnapshot = await loadBatchMediaSnapshot(prisma, batchId);
        await runTelegramSideEffect(() => queueBatchMediaReadyNotifications(prisma, beforeMediaSnapshot, afterMediaSnapshot));
        await cleanupOrphanedPhotoToolFiles(cleanupCandidateUrls);
        return serializePhotoToolPayload(updatedBatch);
    } catch (error) {
        await Promise.all(createdPaths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)));
        await removeStagedFiles(uploadedFiles);
        throw error;
    }
};
