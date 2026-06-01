import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../../middleware/auth.ts';
import { runVideoExportUpload } from '../../middleware/videoExportUpload.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { isStaffRole } from '../../utils/collectionWorkflow.ts';
import { createHttpError, getErrorMessage, getErrorStatusCode, parseChecksumSha256, removeStagedVideoFile, sha256File } from './shared.ts';
import {
    getVideoUploadStatus,
    getVideoUploadSessions,
    loadVideoUploadSession,
    uploadVideoUploadSessionItemFile,
    cancelVideoUploadSession,
    serializeVideoUploadSessionDetails
} from './videoExportRunService.ts';
import { prisma } from '../../services/prisma.ts';
import {
    VIDEO_EXPORT_PUBLIC_OUTPUT_ROOT,
    VIDEO_EXPORT_PUBLIC_URL_ROOT,
    moveFileSafely
} from '../../services/videoExport.ts';

const router = express.Router();
const VIDEO_EXPORT_HEALTHCHECK_DIR_NAME = '_healthcheck';

const ensureVideoExportBatchExists = async (batchId: string) => {
    const batch = await prisma.batch.findFirst({
        where: { id: batchId, deleted_at: null },
        select: { id: true }
    });
    if (!batch) {
        throw createHttpError('Партия не найдена.', 404);
    }
};

const buildVideoExportHealthcheckDir = (batchId: string, checkId: string) =>
    path.join(VIDEO_EXPORT_PUBLIC_OUTPUT_ROOT, VIDEO_EXPORT_HEALTHCHECK_DIR_NAME, batchId, checkId);

const buildVideoExportHealthcheckUrl = (batchId: string, checkId: string, fileName: string) =>
    `${VIDEO_EXPORT_PUBLIC_URL_ROOT}/${VIDEO_EXPORT_HEALTHCHECK_DIR_NAME}/${encodeURIComponent(batchId)}/${encodeURIComponent(checkId)}/${encodeURIComponent(fileName)}`;

const assertValidHealthcheckId = (checkId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(checkId)) {
        throw createHttpError('Некорректный healthcheck id.', 400);
    }
};

router.get('/:id/video-uploads', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await getVideoUploadStatus(req.params.id));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить статус видео.');
        res.status(statusCode).json({ error: message });
    }
});

router.get('/:id/video-export-runs', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await getVideoUploadSessions(req.params.id));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить список запусков экспорта.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-healthcheck', authenticateToken, async (req: AuthRequest, res) => {
    let uploadedFile: Express.Multer.File | undefined;

    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await ensureVideoExportBatchExists(req.params.id);
        await runVideoExportUpload(req, res);
        uploadedFile = req.file as Express.Multer.File | undefined;
        if (!uploadedFile) {
            throw createHttpError('Не передан probe-файл.', 400);
        }

        const parsedChecksum = parseChecksumSha256((req.body as Record<string, unknown> | undefined)?.checksum_sha256);
        if (!parsedChecksum) {
            throw createHttpError('Не передана контрольная сумма probe-файла.', 400);
        }

        const actualChecksum = await sha256File(uploadedFile.path);
        if (actualChecksum !== parsedChecksum) {
            throw createHttpError('Контрольная сумма probe-файла не совпадает.', 400);
        }

        const checkId = randomUUID();
        const fileName = 'probe.mp4';
        const outputDir = buildVideoExportHealthcheckDir(req.params.id, checkId);
        const targetPath = path.join(outputDir, fileName);
        await fs.mkdir(outputDir, { recursive: true });
        await moveFileSafely(uploadedFile.path, targetPath);

        res.json({
            check_id: checkId,
            file_url: buildVideoExportHealthcheckUrl(req.params.id, checkId, fileName),
            checksum_sha256: actualChecksum,
            size_bytes: uploadedFile.size
        });
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось проверить готовность video export storage.');
        res.status(statusCode).json({ error: message });
    } finally {
        if (uploadedFile) {
            await removeStagedVideoFile(uploadedFile).catch(() => undefined);
        }
    }
});

router.delete('/:id/video-export-healthcheck/:checkId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        assertValidHealthcheckId(req.params.checkId);
        await ensureVideoExportBatchExists(req.params.id);
        await fs.rm(buildVideoExportHealthcheckDir(req.params.id, req.params.checkId), { recursive: true, force: true });
        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось удалить healthcheck-файл.');
        res.status(statusCode).json({ error: message });
    }
});

router.get('/:id/video-export-runs/:runId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const run = await loadVideoUploadSession(prisma, req.params.id, req.params.runId);
        if (!run) {
            throw createHttpError('Запуск экспорта не найден.', 404);
        }

        res.json({ run: serializeVideoUploadSessionDetails(run) });
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить детали запуска экспорта.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-runs/:runId/items/:itemId/upload', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await runVideoExportUpload(req, res);
        const uploadedFile = req.file as Express.Multer.File | undefined;
        if (!uploadedFile) {
            throw createHttpError('Не передан медиафайл.', 400);
        }

        res.json(await uploadVideoUploadSessionItemFile(req.params.id, req.params.runId, req.params.itemId, req.user.id, req.body as Record<string, unknown> | undefined, uploadedFile));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить видеоролик.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-runs/:runId/cancel', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await cancelVideoUploadSession(req.params.id, req.params.runId));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось отменить запуск экспорта.');
        res.status(statusCode).json({ error: message });
    }
});

export default router;
