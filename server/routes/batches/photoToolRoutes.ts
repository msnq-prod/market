import express from 'express';
import { authenticateToken } from '../../middleware/auth.ts';
import { normalizeSharedUploadedFiles, upload } from '../../middleware/upload.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { isStaffRole } from '../../utils/collectionWorkflow.ts';
import { getErrorCode, getErrorMessage, getErrorStatusCode } from './shared.ts';
import { applyPhotoTool, getPhotoToolPayload } from './photoToolService.ts';

const router = express.Router();

router.get('/:id/photo-tool', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        res.json(await getPhotoToolPayload(req.params.id));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить данные для photo-tool.');
        res.status(statusCode).json({ error: message });
    }
});

router.post('/:id/photo-tool/apply', authenticateToken, async (req: AuthRequest, res) => {
    let uploadedFiles: Express.Multer.File[] = [];

    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await new Promise<void>((resolve, reject) => {
            upload.array('files')(req, res, (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
        await normalizeSharedUploadedFiles(uploadedFiles, 'photo');
        if (uploadedFiles.some((file) => !file.mimetype.startsWith('image/'))) {
            throw Object.assign(new Error('Photo-tool принимает только image-файлы.'), { statusCode: 400 });
        }

        res.json(await applyPhotoTool(req.params.id, req.body as Record<string, unknown> | undefined, uploadedFiles));
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось применить назначения photo-tool.');
        const code = getErrorCode(error);
        res.status(statusCode).json(code ? { error: message, code } : { error: message });
    }
});

export default router;
