import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../../middleware/auth.ts';
import { cleanupSharedUploadedFiles, createSharedUpload, normalizeSharedUploadedFiles } from '../../middleware/upload.ts';
import type { PhotoUploadNormalizationOptions } from '../../middleware/upload.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { isStaffRole } from '../../utils/collectionWorkflow.ts';
import { getErrorCode, getErrorMessage, getErrorStatusCode } from './shared.ts';
import { applyPhotoTool, getPhotoToolPayload } from './photoToolService.ts';

const router = express.Router();
const DEFAULT_PHOTO_EXPORT_SETTINGS: Required<PhotoUploadNormalizationOptions> = {
    format: 'jpeg',
    quality: 80,
    maxWidth: 1200,
    maxHeight: 1200
};
const LEGACY_PHOTO_TOOL_APPLY_MAX_FILES = 500;
const photoToolApplyUpload = createSharedUpload({ maxFiles: LEGACY_PHOTO_TOOL_APPLY_MAX_FILES });

const createPhotoExportSettingsError = (message: string) =>
    Object.assign(new Error(message), { statusCode: 400 });

const parseIntegerInRange = (
    value: unknown,
    fieldName: string,
    min: number,
    max: number
) => {
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
        throw createPhotoExportSettingsError(`photo_export_settings.${fieldName} должен быть целым числом ${min}..${max}.`);
    }

    return value as number;
};

const parsePhotoExportSettings = (value: unknown): Required<PhotoUploadNormalizationOptions> => {
    if (value == null || value === '') {
        return DEFAULT_PHOTO_EXPORT_SETTINGS;
    }

    if (Array.isArray(value) || typeof value !== 'string') {
        throw createPhotoExportSettingsError('photo_export_settings должен быть JSON-строкой.');
    }

    let parsedValue: unknown;
    try {
        parsedValue = JSON.parse(value);
    } catch {
        throw createPhotoExportSettingsError('photo_export_settings должен быть корректным JSON.');
    }

    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
        throw createPhotoExportSettingsError('photo_export_settings должен быть JSON-объектом.');
    }

    const settings = parsedValue as Record<string, unknown>;
    if (settings.format !== undefined && settings.format !== 'jpeg') {
        throw createPhotoExportSettingsError('photo_export_settings.format поддерживает только jpeg.');
    }

    return {
        format: 'jpeg',
        quality: parseIntegerInRange(settings.quality ?? DEFAULT_PHOTO_EXPORT_SETTINGS.quality, 'quality', 40, 95),
        maxWidth: parseIntegerInRange(settings.maxWidth ?? DEFAULT_PHOTO_EXPORT_SETTINGS.maxWidth, 'maxWidth', 800, 4096),
        maxHeight: parseIntegerInRange(settings.maxHeight ?? DEFAULT_PHOTO_EXPORT_SETTINGS.maxHeight, 'maxHeight', 800, 4096)
    };
};

const parsePhotoPreNormalized = (value: unknown) => value === '1' || value === 'true';
const SHA256_RE = /^[a-f0-9]{64}$/;

const normalizePhotoToolUploadError = (error: unknown) => {
    if (!(error instanceof multer.MulterError)) {
        return error;
    }

    const message = error.code === 'LIMIT_FILE_COUNT'
        ? `За один запуск photo-tool можно загрузить не более ${LEGACY_PHOTO_TOOL_APPLY_MAX_FILES} файлов.`
        : error.message || 'Некорректная загрузка файлов photo-tool.';

    return Object.assign(new Error(message), {
        statusCode: 400,
        code: error.code
    });
};

const isSafePreNormalizedManifest = (value: unknown) => {
    if (typeof value !== 'string') {
        return false;
    }

    let parsedValue: unknown;
    try {
        parsedValue = JSON.parse(value);
    } catch {
        return false;
    }

    if (!Array.isArray(parsedValue)) {
        return false;
    }

    return parsedValue.every((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return false;
        }

        const typedEntry = entry as Record<string, unknown>;
        if (typedEntry.source !== 'upload') {
            return true;
        }

        return typeof typedEntry.queue_job_id === 'string'
            && typeof typedEntry.queue_file_id === 'string'
            && typeof typedEntry.checksum_sha256 === 'string'
            && SHA256_RE.test(typedEntry.checksum_sha256.trim().toLowerCase());
    });
};

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
    let requestBody: Record<string, unknown> | undefined;

    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await new Promise<void>((resolve, reject) => {
            photoToolApplyUpload.array('files')(req, res, (error) => {
                if (error) {
                    reject(normalizePhotoToolUploadError(error));
                    return;
                }

                resolve();
            });
        });

        uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
        requestBody = req.body as Record<string, unknown> | undefined;
        const photoExportSettings = parsePhotoExportSettings((req.body as Record<string, unknown> | undefined)?.photo_export_settings);
        const photoPreNormalized = parsePhotoPreNormalized(requestBody?.photo_pre_normalized);
        if (photoPreNormalized && !isSafePreNormalizedManifest(requestBody?.manifest)) {
            throw Object.assign(new Error('photo_pre_normalized разрешен только для queued photo-tool upload с checksum.'), { statusCode: 400 });
        }
        await normalizeSharedUploadedFiles(uploadedFiles, 'photo', {
            photo: photoExportSettings,
            photoPreNormalized
        });
        if (uploadedFiles.some((file) => !file.mimetype.startsWith('image/'))) {
            throw Object.assign(new Error('Photo-tool принимает только image-файлы.'), { statusCode: 400 });
        }

        res.json(await applyPhotoTool(req.params.id, req.body as Record<string, unknown> | undefined, uploadedFiles));
    } catch (error) {
        console.error('photo-tool apply failed', {
            batch_id: req.params.id,
            queue_job_id: typeof requestBody?.queue_job_id === 'string' ? requestBody.queue_job_id : null
        }, error);
        uploadedFiles = uploadedFiles.length ? uploadedFiles : ((req.files as Express.Multer.File[] | undefined) ?? []);
        await cleanupSharedUploadedFiles(uploadedFiles);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось применить назначения photo-tool.');
        const code = getErrorCode(error);
        res.status(statusCode).json(code ? { error: message, code } : { error: message });
    }
});

export default router;
