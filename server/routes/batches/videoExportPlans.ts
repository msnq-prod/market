import express from 'express';
import { authenticateToken } from '../../middleware/auth.ts';
import { runVideoExportUpload } from '../../middleware/videoExportUpload.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { isStaffRole } from '../../utils/collectionWorkflow.ts';
import { createHttpError, getErrorMessage, getErrorStatusCode } from './shared.ts';
import {
    createOrResumeVideoExportSession,
    uploadVideoExportArtifact,
    skipVideoExportArtifact,
    commitVideoExportPlan
} from './videoExportSessionService.ts';

const router = express.Router();

router.post('/:id/video-export-plans', authenticateToken, async (req: AuthRequest, res) => {
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
        const message = getErrorMessage(error, 'Не удалось создать план экспорта.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-plans/:planId/artifacts', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await runVideoExportUpload(req, res);
        const uploadedFile = req.file as Express.Multer.File | undefined;
        if (!uploadedFile) {
            throw createHttpError('Не передан медиафайл артефакта.', 400);
        }

        res.json(await uploadVideoExportArtifact(req.params.id, req.params.planId, req.body as Record<string, unknown> | undefined, uploadedFile));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось сохранить артефакт экспорта.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-plans/:planId/skip', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const { serial_number } = req.body as { serial_number?: string };
        if (!serial_number) {
            throw createHttpError('Не передан serial_number для пропуска.', 400);
        }

        res.json(await skipVideoExportArtifact(req.params.id, req.params.planId, serial_number));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось пропустить артефакт.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/video-export-plans/:planId/commit', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await commitVideoExportPlan(req.params.id, req.params.planId));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось применить результаты видеоэкспорта.');
        res.status(statusCode).json({ error: message });
    }
});

export default router;
