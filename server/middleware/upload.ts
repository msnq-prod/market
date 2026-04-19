import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import multer from 'multer';
import type { Request, Response } from 'express';
import { resolveProjectPath } from '../utils/projectPaths.ts';

export type SharedUploadKind = 'photo' | 'video';

type SharedUploadMetadata = {
    extension: string;
    kind: SharedUploadKind;
    mimeType: string;
};

type MutableUploadedFile = Express.Multer.File & {
    safe_extension?: string;
    safe_kind?: SharedUploadKind;
    safe_mime_type?: string;
};

const PHOTO_MIME_TO_EXTENSION = new Map<string, string>([
    ['image/gif', '.gif'],
    ['image/jpeg', '.jpg'],
    ['image/jpg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp']
]);

const VIDEO_MIME_TO_EXTENSION = new Map<string, string>([
    ['video/mp4', '.mp4'],
    ['video/m4v', '.m4v'],
    ['video/quicktime', '.mov'],
    ['video/webm', '.webm'],
    ['video/x-m4v', '.m4v']
]);

const PHOTO_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.m4v', '.mov', '.mp4', '.webm']);
const SAFE_UPLOAD_CONTENT_TYPES = new Map<string, string>([
    ['.gif', 'image/gif'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.m4v', 'video/x-m4v'],
    ['.mov', 'video/quicktime'],
    ['.mp4', 'video/mp4'],
    ['.png', 'image/png'],
    ['.webm', 'video/webm'],
    ['.webp', 'image/webp']
]);
const ACTIVE_CONTENT_MARKERS = ['<!doctype', '<body', '<html', '<iframe', '<script', '<svg', '<?xml'];
const UPLOAD_MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024;
const UPLOAD_SNIFF_BYTES = 4096;

export const uploadDir = resolveProjectPath('public', 'uploads');
export const photoDir = resolveProjectPath('public', 'uploads', 'photos');
export const videoDir = resolveProjectPath('public', 'uploads', 'videos');
export const uploadStagingDir = resolveProjectPath('storage', 'uploads', 'staging');
export const PHOTO_UPLOAD_PUBLIC_URL_ROOT = '/uploads/photos';
export const VIDEO_UPLOAD_PUBLIC_URL_ROOT = '/uploads/videos';

[uploadDir, photoDir, videoDir, uploadStagingDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const createUploadValidationError = (message: string) =>
    Object.assign(new Error(message), { statusCode: 400 });

const getDeclaredUploadKind = (file: Express.Multer.File): SharedUploadKind | null => {
    if (PHOTO_MIME_TO_EXTENSION.has(file.mimetype)) {
        return 'photo';
    }

    if (VIDEO_MIME_TO_EXTENSION.has(file.mimetype)) {
        return 'video';
    }

    return null;
};

const getAllowedOriginalExtension = (kind: SharedUploadKind, originalName: string) => {
    const extension = path.extname(originalName || '').trim().toLowerCase();
    if (kind === 'photo' && PHOTO_EXTENSIONS.has(extension)) {
        return extension === '.jpeg' ? '.jpg' : extension;
    }

    if (kind === 'video' && VIDEO_EXTENSIONS.has(extension)) {
        return extension;
    }

    return null;
};

const buildSafeUploadMetadata = (file: Express.Multer.File): SharedUploadMetadata => {
    const kind = getDeclaredUploadKind(file);
    if (!kind) {
        throw createUploadValidationError('Разрешены только PNG, JPEG, GIF, WebP и видео MP4, MOV, M4V, WEBM.');
    }

    const originalExtension = getAllowedOriginalExtension(kind, file.originalname);
    const extension = originalExtension
        || (kind === 'photo' ? PHOTO_MIME_TO_EXTENSION.get(file.mimetype) : VIDEO_MIME_TO_EXTENSION.get(file.mimetype))
        || (kind === 'photo' ? '.png' : '.mp4');
    const mimeType = SAFE_UPLOAD_CONTENT_TYPES.get(extension) || file.mimetype;

    return {
        extension,
        kind,
        mimeType
    };
};

const readUploadSnippet = async (filePath: string) => {
    const handle = await fsp.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(UPLOAD_SNIFF_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
};

const containsActiveMarkup = (snippet: Buffer) => {
    const normalized = snippet
        .toString('utf8')
        .replace(/^\uFEFF/, '')
        .trimStart()
        .toLowerCase();

    if (!normalized.startsWith('<')) {
        return false;
    }

    return ACTIVE_CONTENT_MARKERS.some((marker) => normalized.includes(marker)) || normalized.startsWith('<');
};

const moveFileSafely = async (sourcePath: string, targetPath: string) => {
    try {
        await fsp.rename(sourcePath, targetPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== 'EXDEV') {
            throw error;
        }

        await fsp.copyFile(sourcePath, targetPath);
        await fsp.unlink(sourcePath);
    }
};

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadStagingDir);
    },
    filename: (_req, _file, cb) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomInt(1_000_000_000)}`;
        cb(null, `${uniqueSuffix}.staged`);
    }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    try {
        buildSafeUploadMetadata(file);
        cb(null, true);
    } catch (error) {
        cb(error as Error);
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        files: 100,
        fileSize: UPLOAD_MAX_FILE_SIZE_BYTES
    }
});

export const runSharedUploadSingle = (req: Request, res: Response, fieldName = 'file') =>
    new Promise<void>((resolve, reject) => {
        upload.single(fieldName)(req, res, (error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });

export const runSharedUploadAny = (req: Request, res: Response) =>
    new Promise<void>((resolve, reject) => {
        upload.any()(req, res, (error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });

export const cleanupSharedUploadedFiles = async (files: Array<Express.Multer.File | undefined> | undefined) => {
    if (!files || files.length === 0) {
        return;
    }

    await Promise.all(files.map(async (file) => {
        if (!file?.path) {
            return;
        }

        try {
            await fsp.rm(file.path, { force: true });
        } catch (error) {
            console.error('Failed to cleanup staged upload', file.path, error);
        }
    }));
};

export const normalizeSharedUploadedFiles = async (
    files: Express.Multer.File[] | undefined,
    expectedKind?: SharedUploadKind
) => {
    if (!files || files.length === 0) {
        return [];
    }

    const normalizedFiles: MutableUploadedFile[] = [];

    for (const rawFile of files) {
        const file = rawFile as MutableUploadedFile;
        const metadata = buildSafeUploadMetadata(file);
        if (expectedKind && metadata.kind !== expectedKind) {
            throw createUploadValidationError(
                expectedKind === 'photo'
                    ? 'Разрешены только PNG, JPEG, GIF и WebP изображения.'
                    : 'Разрешены только MP4, MOV, M4V и WEBM видео.'
            );
        }

        const snippet = await readUploadSnippet(file.path);
        if (containsActiveMarkup(snippet)) {
            throw createUploadValidationError('Файл отклонен: активный HTML/SVG/XML-контент запрещен.');
        }

        const normalizedFilename = `${path.parse(file.filename).name}${metadata.extension}`;
        const normalizedPath = path.join(path.dirname(file.path), normalizedFilename);
        if (normalizedPath !== file.path) {
            await moveFileSafely(file.path, normalizedPath);
        }

        file.path = normalizedPath;
        file.filename = normalizedFilename;
        file.mimetype = metadata.mimeType;
        file.safe_extension = metadata.extension;
        file.safe_kind = metadata.kind;
        file.safe_mime_type = metadata.mimeType;
        normalizedFiles.push(file);
    }

    return normalizedFiles;
};

export const finalizeSharedUploadedFile = async (file: Express.Multer.File, kind?: SharedUploadKind) => {
    const mutableFile = file as MutableUploadedFile;
    const targetKind = kind || mutableFile.safe_kind || getDeclaredUploadKind(file);
    if (!targetKind) {
        throw createUploadValidationError('Не удалось определить тип загруженного файла.');
    }

    const safeExtension = mutableFile.safe_extension
        || getAllowedOriginalExtension(targetKind, file.originalname)
        || (targetKind === 'photo' ? '.png' : '.mp4');
    const uniqueSuffix = `${Date.now()}-${crypto.randomInt(1_000_000_000)}`;
    const targetFilename = `${uniqueSuffix}${safeExtension}`;
    const targetRoot = targetKind === 'photo' ? photoDir : videoDir;
    const targetPath = path.join(targetRoot, targetFilename);

    await moveFileSafely(file.path, targetPath);

    return {
        filename: targetFilename,
        kind: targetKind,
        path: targetPath,
        url: `${targetKind === 'photo' ? PHOTO_UPLOAD_PUBLIC_URL_ROOT : VIDEO_UPLOAD_PUBLIC_URL_ROOT}/${targetFilename}`
    };
};

export const setUploadedMediaResponseHeaders = (res: Response, filePath: string) => {
    const extension = path.extname(filePath).toLowerCase();
    const contentType = SAFE_UPLOAD_CONTENT_TYPES.get(extension);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; sandbox");

    if (contentType) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline');
        return;
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
};
