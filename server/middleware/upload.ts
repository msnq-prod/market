import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { createRequire } from 'module';
import multer from 'multer';
import type { Request, Response } from 'express';
import sharp from 'sharp';
import { resolveProjectPath } from '../utils/projectPaths.ts';

export type SharedUploadKind = 'photo' | 'video';

export type PhotoUploadNormalizationOptions = {
    format?: 'jpeg';
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
};

export type SharedUploadNormalizationOptions = {
    photo?: PhotoUploadNormalizationOptions;
    photoPreNormalized?: boolean;
};

type SharedUploadMetadata = {
    extension: string;
    kind: SharedUploadKind;
    mimeType: string;
};

type PreparedUploadedFile = {
    file: MutableUploadedFile;
    metadata: SharedUploadMetadata;
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
const DEFAULT_PHOTO_NORMALIZATION_OPTIONS: Required<PhotoUploadNormalizationOptions> = {
    format: 'jpeg',
    quality: 80,
    maxWidth: 1200,
    maxHeight: 1200
};

const parseBooleanEnv = (value: string | undefined) =>
    typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());

const parsePositiveIntegerEnv = (name: string, fallback: number) => {
    const raw = process.env[name]?.trim();
    if (!raw) {
        return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Environment variable ${name} must be a positive integer.`);
    }

    return parsed;
};

const execFileAsync = promisify(execFile);
const APPLE_SILICON_HEIC_FAST_PATH = process.platform === 'darwin' && process.arch === 'arm64';
const DEFAULT_HEIC_APPLE_SILICON_CONCURRENCY = Math.min(Math.max(os.availableParallelism() - 1, 2), 8);
const PHOTO_CONCURRENCY = parsePositiveIntegerEnv('PHOTO_CONCURRENCY', 2);
const HEIC_APPLE_SILICON_CONCURRENCY = parsePositiveIntegerEnv(
    'HEIC_APPLE_SILICON_CONCURRENCY',
    DEFAULT_HEIC_APPLE_SILICON_CONCURRENCY
);
const VIDEO_PIPELINE_DIAGNOSTICS = parseBooleanEnv(process.env.VIDEO_PIPELINE_DIAGNOSTICS);
let activePhotoConversionTasks = 0;

sharp.cache({ files: 0 });
sharp.concurrency(1);

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

const formatDiagnosticValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return null;
        }

        return Number.isInteger(value)
            ? String(value)
            : String(Number(value.toFixed(3)));
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    const normalized = String(value).trim();
    return normalized ? normalized.replace(/\s+/g, '_') : null;
};

const logDiagnostic = (fields: Record<string, unknown>) => {
    if (!VIDEO_PIPELINE_DIAGNOSTICS) {
        return;
    }

    const payload = Object.entries({
        component: 'upload-photo',
        ...fields
    })
        .map(([key, value]) => {
            const formatted = formatDiagnosticValue(value);
            return formatted === null ? null : `${key}=${formatted}`;
        })
        .filter(Boolean)
        .join(' ');

    if (payload) {
        console.log('[upload]', payload);
    }
};

const runDiagnosticStage = async <T>(
    stage: string,
    baseFields: Record<string, unknown>,
    task: () => Promise<T>,
    successFields?: Record<string, unknown> | ((result: T) => Record<string, unknown>),
    failureFields?: Record<string, unknown> | ((error: unknown) => Record<string, unknown>)
) => {
    const startedAt = Date.now();

    try {
        const result = await task();
        logDiagnostic({
            event: 'timing',
            stage,
            status: 'ok',
            duration_ms: Date.now() - startedAt,
            ...baseFields,
            ...(typeof successFields === 'function' ? successFields(result) : successFields)
        });
        return result;
    } catch (error) {
        logDiagnostic({
            event: 'timing',
            stage,
            status: 'failed',
            duration_ms: Date.now() - startedAt,
            ...baseFields,
            ...(typeof failureFields === 'function' ? failureFields(error) : failureFields)
        });
        throw error;
    }
};

const createPhotoNormalizationError = (sourceExtension: string) =>
    createUploadValidationError(
        isHeicLikeExtension(sourceExtension)
            ? 'Не удалось обработать HEIC/HEIF-фото. Попробуйте экспортировать его в JPEG или PNG.'
            : 'Не удалось обработать изображение. Поддерживаются JPEG, PNG, WebP, GIF, AVIF, TIFF, BMP и HEIC/HEIF.'
    );

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
const shouldUseAppleSiliconHeicFastPath = (sourceExtension: string) =>
    APPLE_SILICON_HEIC_FAST_PATH && isHeicLikeExtension(sourceExtension);

const normalizePhotoOptions = (options?: PhotoUploadNormalizationOptions): Required<PhotoUploadNormalizationOptions> => ({
    ...DEFAULT_PHOTO_NORMALIZATION_OPTIONS,
    ...(options || {})
});

const normalizeHeicToJpegWithSips = async (filePath: string, options?: PhotoUploadNormalizationOptions) => {
    const targetPath = `${filePath}.jpg`;
    const normalizedOptions = normalizePhotoOptions(options);

    try {
        await execFileAsync('/usr/bin/sips', ['-s', 'format', 'jpeg', filePath, '--out', targetPath]);
    } catch (error) {
        const stat = await fsp.stat(targetPath).catch(() => null);
        if (!stat || stat.size <= 0) {
            throw error;
        }
    }

    const resizedPath = `${targetPath}.normalized.jpg`;
    await sharp(targetPath, { animated: false })
        .rotate()
        .resize({
            width: normalizedOptions.maxWidth,
            height: normalizedOptions.maxHeight,
            fit: 'inside',
            withoutEnlargement: true
        })
        .jpeg({ quality: normalizedOptions.quality, mozjpeg: true })
        .toFile(resizedPath);
    await fsp.rm(targetPath, { force: true });
    await moveFileSafely(resizedPath, targetPath);
    await fsp.rm(filePath, { force: true });

    return targetPath;
};

const normalizePhotoToJpeg = async (
    filePath: string,
    sourceExtension: string,
    options?: PhotoUploadNormalizationOptions
) => {
    const targetPath = `${filePath}.jpg`;
    const normalizedOptions = normalizePhotoOptions(options);

    try {
        await sharp(filePath, { animated: false })
            .rotate()
            .resize({
                width: normalizedOptions.maxWidth,
                height: normalizedOptions.maxHeight,
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: normalizedOptions.quality, mozjpeg: true })
            .toFile(targetPath);
    } catch (sharpError) {
        if (!isHeicLikeExtension(sourceExtension)) {
            throw sharpError;
        }

        const sourceBuffer = await fsp.readFile(filePath);
        const converted = await heicConvert({
            buffer: sourceBuffer,
            format: 'JPEG',
            quality: normalizedOptions.quality / 100
        });
        const convertedBuffer = converted instanceof ArrayBuffer
            ? Buffer.from(new Uint8Array(converted))
            : Buffer.from(converted);
        const convertedPath = `${filePath}.converted.jpg`;
        await fsp.writeFile(convertedPath, convertedBuffer);
        try {
            await sharp(convertedPath, { animated: false })
                .rotate()
                .resize({
                    width: normalizedOptions.maxWidth,
                    height: normalizedOptions.maxHeight,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: normalizedOptions.quality, mozjpeg: true })
                .toFile(targetPath);
        } finally {
            await fsp.rm(convertedPath, { force: true });
        }
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

const finalizeNormalizedUpload = async (
    file: MutableUploadedFile,
    metadata: SharedUploadMetadata,
    normalizedPath: string
) => {
    const stat = await fsp.stat(normalizedPath).catch(() => null);
    const normalizedFilename = path.basename(normalizedPath);

    file.path = normalizedPath;
    file.filename = normalizedFilename;
    file.size = stat?.size ?? file.size;
    file.mimetype = metadata.kind === 'photo' ? 'image/jpeg' : metadata.mimeType;
    file.safe_extension = metadata.kind === 'photo' ? '.jpg' : metadata.extension;
    file.safe_kind = metadata.kind;
    file.safe_mime_type = metadata.kind === 'photo' ? 'image/jpeg' : metadata.mimeType;
    file.safe_source_extension = metadata.extension;

    return file;
};

const normalizeSingleUploadedPhoto = async (
    file: MutableUploadedFile,
    metadata: SharedUploadMetadata,
    options?: PhotoUploadNormalizationOptions
) => {
    activePhotoConversionTasks += 1;
    let converter = 'sharp';
    const normalizedOptions = normalizePhotoOptions(options);
    try {
        const normalizedFile = await runDiagnosticStage(
            'photo_convert',
            {
                source_ext: metadata.extension,
                size_bytes: file.size,
                active_tasks: activePhotoConversionTasks,
                converter: shouldUseAppleSiliconHeicFastPath(metadata.extension) ? 'sips' : 'sharp',
                heic_concurrency: shouldUseAppleSiliconHeicFastPath(metadata.extension) ? HEIC_APPLE_SILICON_CONCURRENCY : null,
                quality: normalizedOptions.quality,
                max_width: normalizedOptions.maxWidth,
                max_height: normalizedOptions.maxHeight,
                platform: process.platform,
                arch: process.arch
            },
            async () => {
                if (shouldUseAppleSiliconHeicFastPath(metadata.extension)) {
                    try {
                        converter = 'sips';
                        return finalizeNormalizedUpload(file, metadata, await normalizeHeicToJpegWithSips(file.path, normalizedOptions));
                    } catch {
                        converter = 'heic-convert';
                    }
                }

                converter = isHeicLikeExtension(metadata.extension) ? 'heic-convert' : 'sharp';
                return finalizeNormalizedUpload(file, metadata, await normalizePhotoToJpeg(file.path, metadata.extension, normalizedOptions));
            },
            (result) => ({
                used_fast_path: false,
                size_bytes: result.size,
                active_tasks: activePhotoConversionTasks,
                converter
            }),
            () => ({
                used_fast_path: false,
                active_tasks: activePhotoConversionTasks,
                converter
            })
        );

        return normalizedFile;
    } catch {
        throw createPhotoNormalizationError(metadata.extension);
    } finally {
        activePhotoConversionTasks = Math.max(0, activePhotoConversionTasks - 1);
    }
};

const normalizeSingleUploadedVideo = async (file: MutableUploadedFile, metadata: SharedUploadMetadata) => {
    const normalizedFilename = `${path.parse(file.filename).name}${metadata.extension}`;
    const normalizedPath = path.join(path.dirname(file.path), normalizedFilename);

    if (normalizedPath !== file.path) {
        await moveFileSafely(file.path, normalizedPath);
    }

    return finalizeNormalizedUpload(file, metadata, normalizedPath);
};

const finalizePreNormalizedPhoto = async (file: MutableUploadedFile, metadata: SharedUploadMetadata) => {
    if (metadata.extension !== '.jpg') {
        throw createUploadValidationError('Предварительно подготовленные photo-tool файлы должны быть JPEG.');
    }

    const normalizedPath = `${file.path}.jpg`;
    await moveFileSafely(file.path, normalizedPath);
    return finalizeNormalizedUpload(file, metadata, normalizedPath);
};

const mapWithConcurrency = async <Input, Output>(
    items: Input[],
    concurrency: number,
    mapper: (item: Input, index: number) => Promise<Output>
) => {
    if (items.length === 0) {
        return [] as Output[];
    }

    const results = new Array<Output>(items.length);
    let nextIndex = 0;
    let firstError: unknown = null;

    const runWorker = async () => {
        while (true) {
            if (firstError) {
                return;
            }

            const currentIndex = nextIndex;
            nextIndex += 1;

            if (currentIndex >= items.length) {
                return;
            }

            try {
                results[currentIndex] = await mapper(items[currentIndex], currentIndex);
            } catch (error) {
                if (!firstError) {
                    firstError = error;
                }
                return;
            }
        }
    };

    const workers = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => runWorker()
    );
    await Promise.allSettled(workers);

    if (firstError) {
        throw firstError;
    }

    return results;
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

export const DEFAULT_UPLOAD_MAX_FILES = 100;

export const createSharedUpload = (options: { maxFiles?: number } = {}) => multer({
    storage,
    fileFilter,
    limits: {
        files: options.maxFiles ?? DEFAULT_UPLOAD_MAX_FILES,
        fileSize: UPLOAD_MAX_FILE_SIZE_BYTES
    }
});

export const upload = createSharedUpload();

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
    expectedKind?: SharedUploadKind,
    options?: SharedUploadNormalizationOptions
) => {
    if (!files || files.length === 0) {
        return [];
    }

    const preparedFiles: PreparedUploadedFile[] = [];

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

        preparedFiles.push({ file, metadata });
    }

    if (options?.photoPreNormalized && preparedFiles.every(({ metadata }) => metadata.kind === 'photo')) {
        return Promise.all(preparedFiles.map(({ file, metadata }) => finalizePreNormalizedPhoto(file, metadata)));
    }

    if (preparedFiles.every(({ metadata }) => metadata.kind === 'photo')) {
        const hasOnlyAppleSiliconHeicFiles = preparedFiles.every(({ metadata }) =>
            shouldUseAppleSiliconHeicFastPath(metadata.extension)
        );
        const photoBatchConcurrency = hasOnlyAppleSiliconHeicFiles
            ? HEIC_APPLE_SILICON_CONCURRENCY
            : PHOTO_CONCURRENCY;

        return runDiagnosticStage(
            'photo_batch',
            {
                event: 'summary',
                file_count: preparedFiles.length,
                photo_concurrency: PHOTO_CONCURRENCY,
                heic_concurrency: hasOnlyAppleSiliconHeicFiles ? HEIC_APPLE_SILICON_CONCURRENCY : null,
                converter: hasOnlyAppleSiliconHeicFiles ? 'sips' : 'mixed',
                platform: process.platform,
                arch: process.arch
            },
            () => mapWithConcurrency(
                preparedFiles,
                photoBatchConcurrency,
                async ({ file, metadata }) => normalizeSingleUploadedPhoto(file, metadata, options?.photo)
            ),
            () => ({
                event: 'summary',
                file_count: preparedFiles.length,
                photo_concurrency: PHOTO_CONCURRENCY,
                heic_concurrency: hasOnlyAppleSiliconHeicFiles ? HEIC_APPLE_SILICON_CONCURRENCY : null,
                converter: hasOnlyAppleSiliconHeicFiles ? 'sips' : 'mixed',
                platform: process.platform,
                arch: process.arch
            }),
            () => ({
                event: 'summary',
                file_count: preparedFiles.length,
                photo_concurrency: PHOTO_CONCURRENCY,
                heic_concurrency: hasOnlyAppleSiliconHeicFiles ? HEIC_APPLE_SILICON_CONCURRENCY : null,
                converter: hasOnlyAppleSiliconHeicFiles ? 'sips' : 'mixed',
                platform: process.platform,
                arch: process.arch
            })
        );
    }

    const normalizedFiles: MutableUploadedFile[] = [];
    for (const { file, metadata } of preparedFiles) {
        normalizedFiles.push(
            metadata.kind === 'photo'
                ? await normalizeSingleUploadedPhoto(file, metadata, options?.photo)
                : await normalizeSingleUploadedVideo(file, metadata)
        );
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
