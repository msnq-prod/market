import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import {
    cancelVideoToolV3Run,
    createVideoToolV3Run,
    getVideoToolV3Batch,
    getVideoToolV3ErrorCode,
    getVideoToolV3ErrorDetails,
    getVideoToolV3ErrorStatus,
    getVideoToolV3Run
} from '../services/videoToolV3RunService.ts';
import {
    completeVideoToolV3UploadIntent,
    createVideoToolV3UploadIntent,
    getVideoToolV3UploadIntent,
    putVideoToolV3UploadChunk,
    removeVideoToolV3UploadIntentsForRun
} from '../services/videoToolV3UploadIntentService.ts';

const router = express.Router();
const STAFF_ROLES = ['ADMIN', 'MANAGER'] as const;

router.use(authenticateToken, requireRole(STAFF_ROLES));

const sendError = (res: express.Response, error: unknown, fallback: string) => {
    console.error(error);
    const code = getVideoToolV3ErrorCode(error);
    const details = getVideoToolV3ErrorDetails(error);
    res.status(getVideoToolV3ErrorStatus(error)).json({
        error: error instanceof Error && error.message ? error.message : fallback,
        ...(code ? { code } : {}),
        ...(details !== undefined ? { details } : {})
    });
};

router.get('/batches/:batchId', async (req: AuthRequest, res) => {
    try {
        res.json(await getVideoToolV3Batch(req, req.params.batchId));
    } catch (error) {
        sendError(res, error, 'Не удалось загрузить партию для Video Tool v3.');
    }
});

router.post('/batches/:batchId/runs', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        const result = await createVideoToolV3Run(req, req.params.batchId, req.user.id, req.body);
        res.status(result.statusCode).json(result.payload);
    } catch (error) {
        sendError(res, error, 'Не удалось создать run Video Tool v3.');
    }
});

router.get('/runs/:runId', async (req: AuthRequest, res) => {
    try {
        res.json(await getVideoToolV3Run(req, req.params.runId));
    } catch (error) {
        sendError(res, error, 'Не удалось загрузить run Video Tool v3.');
    }
});

router.post('/runs/:runId/items/:itemId/upload-intent', async (req: AuthRequest, res) => {
    try {
        res.json(await createVideoToolV3UploadIntent(req.params.runId, req.params.itemId, req.body));
    } catch (error) {
        sendError(res, error, 'Не удалось создать upload intent.');
    }
});

router.get('/runs/:runId/items/:itemId/upload-intent/:uploadId', async (req: AuthRequest, res) => {
    try {
        res.json(await getVideoToolV3UploadIntent(req.params.runId, req.params.itemId, req.params.uploadId));
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

            res.json(await putVideoToolV3UploadChunk(
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
        if (!req.user) return res.sendStatus(401);
        res.json(await completeVideoToolV3UploadIntent(
            req.params.runId,
            req.params.itemId,
            req.params.uploadId,
            req.user.id
        ));
    } catch (error) {
        sendError(res, error, 'Не удалось завершить upload intent.');
    }
});

router.post('/runs/:runId/cancel', async (req: AuthRequest, res) => {
    try {
        const payload = await cancelVideoToolV3Run(req.params.runId);
        await removeVideoToolV3UploadIntentsForRun(req.params.runId);
        res.json(payload);
    } catch (error) {
        sendError(res, error, 'Не удалось отменить run Video Tool v3.');
    }
});

export default router;
