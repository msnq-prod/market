import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import {
    cancelPhotoToolV2Run,
    commitPhotoToolV2Run,
    completePhotoToolV2UploadIntent,
    createPhotoToolV2Run,
    createPhotoToolV2UploadIntent,
    getPhotoToolV2Batch,
    getPhotoToolV2ErrorCode,
    getPhotoToolV2ErrorDetails,
    getPhotoToolV2ErrorStatus,
    getPhotoToolV2Run,
    getPhotoToolV2UploadIntent,
    putPhotoToolV2UploadChunk,
    removePhotoToolV2UploadIntentsForRun
} from '../services/photoToolV2Service.ts';

const router = express.Router();
const STAFF_ROLES = ['ADMIN', 'MANAGER', 'SALES_MANAGER'] as const;

router.use(authenticateToken, requireRole(STAFF_ROLES));

const sendError = (res: express.Response, error: unknown, fallback: string) => {
    console.error(error);
    const code = getPhotoToolV2ErrorCode(error);
    const details = getPhotoToolV2ErrorDetails(error);
    res.status(getPhotoToolV2ErrorStatus(error)).json({
        error: error instanceof Error && error.message ? error.message : fallback,
        ...(code ? { code } : {}),
        ...(details !== undefined ? { details } : {})
    });
};

router.get('/batches/:batchId', async (req: AuthRequest, res) => {
    try {
        res.json(await getPhotoToolV2Batch(req.params.batchId));
    } catch (error) {
        sendError(res, error, 'Не удалось загрузить партию для Photo Tool v2.');
    }
});

router.post('/batches/:batchId/runs', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        const result = await createPhotoToolV2Run(req.params.batchId, req.user.id, req.body);
        res.status(result.statusCode).json(result.payload);
    } catch (error) {
        sendError(res, error, 'Не удалось создать run Photo Tool v2.');
    }
});

router.get('/runs/:runId', async (req: AuthRequest, res) => {
    try {
        res.json(await getPhotoToolV2Run(req.params.runId));
    } catch (error) {
        sendError(res, error, 'Не удалось загрузить run Photo Tool v2.');
    }
});

router.post('/runs/:runId/items/:itemId/upload-intent', async (req: AuthRequest, res) => {
    try {
        res.json(await createPhotoToolV2UploadIntent(req.params.runId, req.params.itemId, req.body));
    } catch (error) {
        sendError(res, error, 'Не удалось создать upload intent.');
    }
});

router.get('/runs/:runId/items/:itemId/upload-intent/:uploadId', async (req: AuthRequest, res) => {
    try {
        res.json(await getPhotoToolV2UploadIntent(req.params.runId, req.params.itemId, req.params.uploadId));
    } catch (error) {
        sendError(res, error, 'Не удалось загрузить upload intent.');
    }
});

router.put(
    '/runs/:runId/items/:itemId/upload-intent/:uploadId/chunks/:chunkIndex',
    express.raw({ type: 'application/octet-stream', limit: '64mb' }),
    async (req: AuthRequest, res) => {
        try {
            if (!Buffer.isBuffer(req.body)) {
                return res.status(400).json({ error: 'Body должен быть binary chunk.' });
            }

            res.json(await putPhotoToolV2UploadChunk(
                req.params.runId,
                req.params.itemId,
                req.params.uploadId,
                req.params.chunkIndex,
                req.headers['x-chunk-sha256'],
                req.body
            ));
        } catch (error) {
            sendError(res, error, 'Не удалось загрузить chunk.');
        }
    }
);

router.post('/runs/:runId/items/:itemId/upload-intent/:uploadId/complete', async (req: AuthRequest, res) => {
    try {
        res.json(await completePhotoToolV2UploadIntent(
            req.params.runId,
            req.params.itemId,
            req.params.uploadId
        ));
    } catch (error) {
        sendError(res, error, 'Не удалось завершить upload intent.');
    }
});

router.post('/runs/:runId/commit', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        res.json(await commitPhotoToolV2Run(req.params.runId, req.user.id));
    } catch (error) {
        sendError(res, error, 'Не удалось commit run Photo Tool v2.');
    }
});

router.post('/runs/:runId/cancel', async (req: AuthRequest, res) => {
    try {
        const payload = await cancelPhotoToolV2Run(req.params.runId);
        await removePhotoToolV2UploadIntentsForRun(req.params.runId);
        res.json(payload);
    } catch (error) {
        sendError(res, error, 'Не удалось отменить run Photo Tool v2.');
    }
});

export default router;
