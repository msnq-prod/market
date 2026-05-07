import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import multer from 'multer';
import type { Request, Response } from 'express';
import sharp from 'sharp';
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
    safe_source_extension?: string;
};

type HeicConvert = (options: {
    buffer: Buffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
}) => Promise<ArrayBuffer | Buffer | Uint8Array>;

const require = createRequire(import.meta.url);
const heicConvert = require('heic-convert') as HeicConvert;

const PHOTO_MIME_TO_EXTENSION = new Map<string, string>([
    ['image/avif', '.avif'],
    ['image/bmp', '.bmp'],
    ['image/gif', '.gif'],
    ['image/heic', '.heic'],
    ['image/heif', '.heif'],
    ['image/jpeg', '.jpg'],
    ['image/jpg', '.jpg'],
    ['image/png', '.png'],
    ['image/tiff', '.tiff'],
    ['image/x-bmp', '.bmp'],
    ['image/x-ms-bmp', '.bmp'],
    ['image/x-tiff', '.tiff'],
    ['image/webp', '.webp']
]);

const VIDEO_MIME_TO_EXTENSION = new Map<string, string>([
    ['video/mp4', '.mp4'],
    ['video/m4v', '.m4v'],
    ['video/quicktime', '.mov'],
    ['video/webm', '.webm'],
    ['video/x-m4v', '.m4v']
]);

const PHOTO_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);
const RAW_PHOTO_EXTENSIONS = new Set(['.arw', '.cr2', '.cr3', '.dng', '.nef', '.orf', '.raf', '.rw2']);
const VIDEO_EXTENSIONS = new Set(['.m4v', '.mov', '.mp4', '.webm']);
const SAFE_UPLOAD_CONTENT_TYPES = new Map<string, string>([
    ['.avif', 'image/avif'],
    ['.bmp', 'image/bmp'],
    ['.gif', 'image/gif'],
    ['.heic', 'image/heic'],
    ['.heif', 'image/heif'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.m4v', 'video/x-m4v'],
    ['.mov', 'video/quicktime'],
    ['.mp4', 'video/mp4'],
    ['.png', 'image/png'],
    ['.tif', 'image/tiff'],
    ['.tiff', 'image/tiff'],
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

const getOriginalExtension = (originalName: string) => path.extname(originalName || '').trim().toLowerCase();

const getDeclaredUploadKind = (file: Express.Multer.File): SharedUploadKind | null => {
    if (PHOTO_MIME_TO_EXTENSION.has(file.mimetype)) {
        return 'photo';
    }

    if (VIDEO_MIME_TO_EXTENSION.has(file.mimetype)) {
        return 'video';
    }

    const extension = getOriginalExtension(file.originalname);
    if (PHOTO_EXTENSIONS.has(extension)) {
        return 'photo';
    }

    if (VIDEO_EXTENSIONS.has(extension)) {
        return 'video';
    }

    return null;
};

const getAllowedOriginalExtension = (kind: SharedUploadKind, originalName: string) => {
    const extension = getOriginalExtension(originalName);
    if (kind === 'photo' && PHOTO_EXTENSIONS.has(extension)) {
        return extension === '.jpeg' ? '.jpg' : extension;
    }

    if (kind === 'video' && VIDEO_EXTENSIONS.has(extension)) {
        return extension;
    }

    return null;
};

const buildSafeUploadMetadata = (file: Express.Multer.File): SharedUploadMetadata => {
    if (RAW_PHOTO_EXTENSIONS.has(getOriginalExtension(file.originalname))) {
        throw createUploadValidationError('DNG/RAW пока не поддерживается для паспорта. Экспортируйте фото в HEIC/JPEG/PNG.');
    }

    const kind = getDeclaredUploadKind(file);
    if (!kind) {
        throw createUploadValidationError('Разрешены фото JPEG, PNG, WebP, GIF, AVIF, TIFF, BMP, HEIC/HEIF и видео MP4, MOV, M4V, WEBM.');
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

const isHeicLikeExtension = (extension: string) => extension === '.heic' || extension === '.heif';

const normalizePhotoToJpeg = async (filePath: string, sourceExtension: string) => {
    const targetPath = `${filePath}.jpg`;

    try {
        await sharp(filePath, { animated: false })
            .rotate()
            .jpeg({ quality: 90, mozjpeg: true })
            .toFile(targetPath);
    } catch (sharpError) {
        if (!isHeicLikeExtension(sourceExtension)) {
            throw sharpError;
        }

        const sourceBuffer = await fsp.readFile(filePath);
        const converted = await heicConvert({
            buffer: sourceBuffer,
            format: 'JPEG',
            quality: 0.9
        });
        const convertedBuffer = converted instanceof ArrayBuffer
            ? Buffer.from(new Uint8Array(converted))
            : Buffer.from(converted);
        await fsp.writeFile(targetPath, convertedBuffer);
    }

    await fsp.rm(filePath, { force: true });
    return targetPath;
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
                    ? 'Разрешены фото JPEG, PNG, WebP, GIF, AVIF, TIFF, BMP и HEIC/HEIF.'
                    : 'Разрешены только MP4, MOV, M4V и WEBM видео.'
            );
        }

        const snippet = await readUploadSnippet(file.path);
        if (containsActiveMarkup(snippet)) {
            throw createUploadValidationError('Файл отклонен: активный HTML/SVG/XML-контент запрещен.');
        }

        let normalizedFilename = `${path.parse(file.filename).name}${metadata.extension}`;
        let normalizedPath = path.join(path.dirname(file.path), normalizedFilename);
        if (metadata.kind === 'photo') {
            try {
                normalizedPath = await normalizePhotoToJpeg(file.path, metadata.extension);
                normalizedFilename = path.basename(normalizedPath);
            } catch {
                throw createUploadValidationError(
                    isHeicLikeExtension(metadata.extension)
                        ? 'Не удалось обработать HEIC/HEIF-фото. Попробуйте экспортировать его в JPEG или PNG.'
                        : 'Не удалось обработать изображение. Поддерживаются JPEG, PNG, WebP, GIF, AVIF, TIFF, BMP и HEIC/HEIF.'
                );
            }
        } else if (normalizedPath !== file.path) {
            await moveFileSafely(file.path, normalizedPath);
        }

        const stat = await fsp.stat(normalizedPath).catch(() => null);
        file.path = normalizedPath;
        file.filename = normalizedFilename;
        file.size = stat?.size ?? file.size;
        file.mimetype = metadata.kind === 'photo' ? 'image/jpeg' : metadata.mimeType;
        file.safe_extension = metadata.kind === 'photo' ? '.jpg' : metadata.extension;
        file.safe_kind = metadata.kind;
        file.safe_mime_type = metadata.kind === 'photo' ? 'image/jpeg' : metadata.mimeType;
        file.safe_source_extension = metadata.extension;
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
