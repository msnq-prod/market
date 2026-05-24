import express from 'express';
import multer from 'multer';
import { authenticateToken, requireRole } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import {
    cleanupSharedUploadedFiles,
    finalizeSharedUploadedFile,
    normalizeSharedUploadedFiles,
    runSharedUploadAny,
    runSharedUploadSingle
} from '../middleware/upload.ts';
import { IS_LOCAL_AUTH_ENVIRONMENT } from '../config/env.ts';
import {
    buildSecurityAuditDetails,
    createRateLimitMiddleware,
    writeSecurityAuditLog
} from '../services/security.ts';
import { logDomainEvent } from '../services/logger.ts';
import { prisma } from '../services/prisma.ts';
import { HQ_STAFF_ROLES, PARTNER_ROLES } from '../../shared/domain/policy.ts';

const router = express.Router();
const uploadRateLimitMax = IS_LOCAL_AUTH_ENVIRONMENT ? 300 : 30;

const uploadRateLimit = createRateLimitMiddleware({
    namespace: 'media-upload',
    window_ms: 15 * 60 * 1000,
    max: uploadRateLimitMax,
    block_ms: 30 * 60 * 1000,
    message: 'Слишком много загрузок. Повторите позже.',
    key: (req: AuthRequest) => req.user ? req.user.id : null,
    on_limit: async (req, context) => {
        await writeSecurityAuditLog(prisma, {
            action: 'SECURITY_UPLOAD_RATE_LIMITED',
            user_id: req.user?.id,
            details: buildSecurityAuditDetails(req, {
                attempts: context.count,
                reset_at: new Date(context.reset_at).toISOString()
            })
        });
    }
});

router.use(authenticateToken, requireRole([...HQ_STAFF_ROLES, ...PARTNER_ROLES]), uploadRateLimit);

const getUploadErrorStatusCode = (error: unknown) => {
    if (error instanceof multer.MulterError) {
        return 400;
    }

    return typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((error as { statusCode: number }).statusCode)
        : 500;
};

const sendUploadError = async (req: AuthRequest, res: express.Response, error: unknown, fallbackMessage: string) => {
    const statusCode = getUploadErrorStatusCode(error);
    const message = error instanceof Error && error.message ? error.message : fallbackMessage;

    if (statusCode === 400) {
        await writeSecurityAuditLog(prisma, {
            action: 'SECURITY_UPLOAD_REJECTED',
            user_id: req.user?.id,
            details: buildSecurityAuditDetails(req, {
                error: message
            })
        });
    }

    res.status(statusCode).json({ error: message });
};

router.post('/photo', async (req: AuthRequest, res) => {
    try {
        await runSharedUploadSingle(req, res);
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен.' });
        }

        await normalizeSharedUploadedFiles([req.file], 'photo');
        const stored = await finalizeSharedUploadedFile(req.file, 'photo');
        logDomainEvent('api', 'upload-photo-success', {
            entity_type: 'upload',
            entity_id: stored.filename,
            user_id: req.user?.id,
            kind: stored.kind,
            url: stored.url
        });

        res.json({ url: stored.url });
    } catch (error) {
        await cleanupSharedUploadedFiles(req.file ? [req.file] : undefined);
        await sendUploadError(req, res, error, 'Не удалось загрузить изображение.');
    }
});

router.post('/video', async (req: AuthRequest, res) => {
    try {
        await runSharedUploadSingle(req, res);
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен.' });
        }

        await normalizeSharedUploadedFiles([req.file], 'video');
        const stored = await finalizeSharedUploadedFile(req.file, 'video');
        logDomainEvent('api', 'upload-video-success', {
            entity_type: 'upload',
            entity_id: stored.filename,
            user_id: req.user?.id,
            kind: stored.kind,
            url: stored.url
        });

        res.json({ url: stored.url });
    } catch (error) {
        await cleanupSharedUploadedFiles(req.file ? [req.file] : undefined);
        await sendUploadError(req, res, error, 'Не удалось загрузить видео.');
    }
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        await runSharedUploadAny(req, res);
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];

        if (files.length === 0) {
            return res.status(400).json({ error: 'Файл не загружен.' });
        }

        if (files.length !== 1) {
            await cleanupSharedUploadedFiles(files);
            return res.status(400).json({ error: 'Generic upload принимает ровно один файл.' });
        }

        const [file] = await normalizeSharedUploadedFiles(files);
        const stored = await finalizeSharedUploadedFile(file);
        logDomainEvent('api', 'upload-generic-success', {
            entity_type: 'upload',
            entity_id: stored.filename,
            user_id: req.user?.id,
            kind: stored.kind,
            url: stored.url
        });

        res.json({ url: stored.url });
    } catch (error) {
        await cleanupSharedUploadedFiles(req.files as Express.Multer.File[] | undefined);
        await sendUploadError(req, res, error, 'Не удалось загрузить файл.');
    }
});

export default router;
