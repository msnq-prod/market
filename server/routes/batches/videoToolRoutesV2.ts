import express from 'express';
import { authenticateToken } from '../../middleware/auth.ts';
import { runVideoExportUpload } from '../../middleware/videoExportUpload.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { isStaffRole } from '../../utils/collectionWorkflow.ts';
import { createHttpError, getErrorMessage, getErrorStatusCode } from './shared.ts';
import {
    getVideoExportRuns,
    loadVideoExportRun,
    uploadVideoExportItemFile,
    cancelVideoExportRun,
    serializeVideoExportRunDetails
} from './videoExportRunService.ts';
import { prisma } from '../../services/prisma.ts';

const router = express.Router();

router.get('/:id/video-export-runs', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await getVideoExportRuns(req.params.id));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить список запусков экспорта.');
        res.status(statusCode).json({ error: message });
    }
});

router.get('/:id/video-export-runs/:runId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const run = await loadVideoExportRun(prisma, req.params.id, req.params.runId);
        if (!run) {
            throw createHttpError('Запуск экспорта не найден.', 404);
        }

        res.json({ run: serializeVideoExportRunDetails(run) });
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

        res.json(await uploadVideoExportItemFile(req.params.id, req.params.runId, req.params.itemId, req.user.id, req.body as Record<string, unknown> | undefined, uploadedFile));
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

        res.json(await cancelVideoExportRun(req.params.id, req.params.runId));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось отменить запуск экспорта.');
        res.status(statusCode).json({ error: message });
    }
});

export default router;
