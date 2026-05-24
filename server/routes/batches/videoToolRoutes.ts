import express from 'express';
import { authenticateToken } from '../../middleware/auth.ts';
import { runVideoExportUpload } from '../../middleware/videoExportUpload.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { isStaffRole } from '../../utils/collectionWorkflow.ts';
import { createHttpError, getErrorMessage, getErrorStatusCode, serializeBatch } from './shared.ts';
import {
    cancelVideoExportSession,
    createOrResumeVideoExportSession,
    getVideoExportSessionPayload,
    getVideoToolPayload,
    retryVideoExportTail,
    uploadVideoExportFile,
    uploadVideoExportIntro
} from './videoExportSessionService.ts';

const router = express.Router();

router.get('/:id/video-tool', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await getVideoToolPayload({ buildBatchPayload: (batch) => serializeBatch(req, batch) }, req.params.id));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить данные для монтажного инструмента.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-sessions', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const result = await createOrResumeVideoExportSession(req.params.id, req.user.id, req.body as {
            expected_count?: number;
            crossfade_ms?: number;
            source_fingerprint?: unknown;
            render_manifest?: unknown;
        });
        res.status(result.statusCode).json(result.payload);
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось создать сессию экспорта видео.');
        res.status(statusCode).json({ error: message });
    }
});

router.get('/:id/video-export-sessions/:sessionId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await getVideoExportSessionPayload(req.params.id, req.params.sessionId));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить сессию экспорта.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-sessions/:sessionId/intro-file', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await runVideoExportUpload(req, res);
        const uploadedFile = req.file as Express.Multer.File | undefined;
        if (!uploadedFile) {
            throw createHttpError('Не передан MP4-файл intro.', 400);
        }

        res.json(await uploadVideoExportIntro(req.params.id, req.params.sessionId, req.body as Record<string, unknown> | undefined, uploadedFile));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось сохранить intro-файл.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-sessions/:sessionId/files', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await runVideoExportUpload(req, res);
        const uploadedFile = req.file as Express.Multer.File | undefined;
        if (!uploadedFile) {
            throw createHttpError('Не передан финальный MP4-файл.', 400);
        }

        res.json(await uploadVideoExportFile(req.params.id, req.params.sessionId, req.body as Record<string, unknown> | undefined, uploadedFile));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить финальный ролик.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-sessions/:sessionId/retry-tail', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await retryVideoExportTail(req.params.id, req.params.sessionId));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось подготовить retry-tail для export-session.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-sessions/:sessionId/cancel', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await cancelVideoExportSession(req.params.id, req.params.sessionId));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось отменить export-session.');
        res.status(statusCode).json({ error: message });
    }
});

export default router;
