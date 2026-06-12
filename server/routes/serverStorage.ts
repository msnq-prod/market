import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import fsSync, { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { authenticateToken, requireRole } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { resolveProjectPath } from '../utils/projectPaths.ts';
import { ADMIN_ONLY_ROLES } from '../../shared/domain/policy.ts';
import {
    buildSecurityAuditDetails,
    writeSecurityAuditLog
} from '../services/security.ts';
import { prisma } from '../services/prisma.ts';

const router = express.Router();

const STORAGE_ROOT = resolveProjectPath('public', 'uploads');
const STORAGE_STAGING_ROOT = resolveProjectPath('storage', 'uploads', 'staging');
const STORAGE_ROOT_NAME = 'uploads';
const MAX_FILES_PER_UPLOAD = 25;
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024;

fsSync.mkdirSync(STORAGE_ROOT, { recursive: true });
fsSync.mkdirSync(STORAGE_STAGING_ROOT, { recursive: true });

const storageUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, STORAGE_STAGING_ROOT),
        filename: (_req, _file, cb) => cb(null, `server-storage-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`)
    }),
    limits: {
        files: MAX_FILES_PER_UPLOAD,
        fileSize: MAX_FILE_SIZE_BYTES
    }
});

type StorageEntry = {
    name: string;
    type: 'file' | 'directory';
    relative_path: string;
    size_bytes: number;
    modified_at: string;
    batch: BatchFolderMetadata | null;
};

type BatchFolderMetadata = {
    id: string;
    location_id: string | null;
    location_name: string;
    template_name: string;
    collected_date: string | null;
    created_at: string;
    display_name: string;
};

const BATCH_FOLDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createStorageError = (message: string, statusCode = 400) =>
    Object.assign(new Error(message), { statusCode });

const getErrorStatusCode = (error: unknown) => {
    if (typeof (error as { statusCode?: unknown })?.statusCode === 'number') {
        return Number((error as { statusCode: number }).statusCode);
    }
    if (error instanceof multer.MulterError) {
        return 400;
    }
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return 404;
    }
    return 500;
};

const normalizeRelativePath = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value !== 'string') {
        throw createStorageError('Некорректный путь.');
    }

    const rawPath = value.replace(/\\/g, '/').trim();
    const relativeInput = rawPath.replace(/^\/+/, '');
    if (relativeInput.split('/').includes('..')) {
        throw createStorageError('Путь вне разрешенной папки.');
    }

    const normalized = path.posix.normalize(`/${relativeInput}`).slice(1);
    if (normalized === '.' || normalized === '/') return '';
    if (normalized === '..' || normalized.startsWith('../') || path.isAbsolute(normalized)) {
        throw createStorageError('Путь вне разрешенной папки.');
    }

    return normalized;
};

const resolveEditablePath = (value: unknown): { relativePath: string; absolutePath: string } => {
    const relativePath = normalizeRelativePath(value);
    const absolutePath = path.resolve(STORAGE_ROOT, relativePath);
    const rootPath = path.resolve(STORAGE_ROOT);

    if (absolutePath !== rootPath && !absolutePath.startsWith(`${rootPath}${path.sep}`)) {
        throw createStorageError('Путь вне разрешенной папки.');
    }

    return { relativePath, absolutePath };
};

const validateEntryName = (value: unknown): string => {
    if (typeof value !== 'string') {
        throw createStorageError('Некорректное имя.');
    }

    const name = value.trim();
    if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
        throw createStorageError('Некорректное имя.');
    }

    return name;
};

const assertExistingPathInsideRoot = async (absolutePath: string) => {
    const [rootRealPath, targetRealPath] = await Promise.all([
        fs.realpath(STORAGE_ROOT),
        fs.realpath(absolutePath)
    ]);

    if (targetRealPath !== rootRealPath && !targetRealPath.startsWith(`${rootRealPath}${path.sep}`)) {
        throw createStorageError('Путь вне разрешенной папки.');
    }
};

const getDirectorySize = async (absolutePath: string): Promise<number> => {
    const stat = await fs.lstat(absolutePath);
    if (stat.isSymbolicLink()) return stat.size;
    if (!stat.isDirectory()) return stat.size;

    const entries = await fs.readdir(absolutePath);
    let total = 0;
    for (const entry of entries) {
        total += await getDirectorySize(path.join(absolutePath, entry));
    }
    return total;
};

const getLocalizedName = (translations: Array<{ language_id: number; name: string }>, fallback: string) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    return translation?.name || fallback;
};

const formatBatchFolderDate = (value: Date) => new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
}).format(value);

const hydrateBatchFolderMetadata = async (entries: StorageEntry[]): Promise<StorageEntry[]> => {
    const batchIds = entries
        .filter((entry) => entry.type === 'directory' && BATCH_FOLDER_ID_PATTERN.test(entry.name))
        .map((entry) => entry.name);

    if (batchIds.length === 0) return entries;

    const batches = await prisma.batch.findMany({
        where: { id: { in: batchIds } },
        select: {
            id: true,
            collected_date: true,
            created_at: true,
            product: {
                select: {
                    translations: {
                        select: {
                            language_id: true,
                            name: true
                        }
                    },
                    location: {
                        select: {
                            id: true,
                            translations: {
                                select: {
                                    language_id: true,
                                    name: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    const batchById = new Map<string, BatchFolderMetadata>();
    for (const batch of batches) {
        const locationName = batch.product?.location
            ? getLocalizedName(batch.product.location.translations, 'Без локации')
            : 'Без локации';
        const templateName = batch.product
            ? getLocalizedName(batch.product.translations, 'Без шаблона')
            : 'Без шаблона';
        const dateValue = batch.collected_date || batch.created_at;
        batchById.set(batch.id, {
            id: batch.id,
            location_id: batch.product?.location?.id || null,
            location_name: locationName,
            template_name: templateName,
            collected_date: batch.collected_date?.toISOString() || null,
            created_at: batch.created_at.toISOString(),
            display_name: `${locationName} | ${templateName} | ${formatBatchFolderDate(dateValue)}`
        });
    }

    return entries.map((entry) => ({
        ...entry,
        batch: batchById.get(entry.name) || null
    }));
};

const serializeEntry = async (directoryRelativePath: string, directoryAbsolutePath: string, name: string): Promise<StorageEntry | null> => {
    const absolutePath = path.join(directoryAbsolutePath, name);
    const stat = await fs.lstat(absolutePath);
    if (stat.isSymbolicLink()) return null;

    const isDirectory = stat.isDirectory();
    const relativePath = path.posix.join(directoryRelativePath, name);

    return {
        name,
        type: isDirectory ? 'directory' : 'file',
        relative_path: relativePath,
        size_bytes: isDirectory ? await getDirectorySize(absolutePath) : stat.size,
        modified_at: stat.mtime.toISOString(),
        batch: null
    };
};

const getDiskSnapshot = async () => {
    if (typeof fs.statfs !== 'function') {
        return { total_bytes: null, free_bytes: null };
    }

    const stat = await fs.statfs(STORAGE_ROOT);
    const blockSize = Number(stat.bsize || 0);
    return {
        total_bytes: Number(stat.blocks || 0) * blockSize,
        free_bytes: Number(stat.bavail || 0) * blockSize
    };
};

const listStorage = async (pathValue: unknown) => {
    const { relativePath, absolutePath } = resolveEditablePath(pathValue);
    await assertExistingPathInsideRoot(absolutePath);

    const stat = await fs.lstat(absolutePath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw createStorageError('Путь не является папкой.', 400);
    }

    const names = await fs.readdir(absolutePath);
    const entriesWithoutMetadata = (await Promise.all(names.map((name) => serializeEntry(relativePath, absolutePath, name))))
        .filter((entry): entry is StorageEntry => entry !== null)
        .sort((left, right) => {
            if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
            return left.name.localeCompare(right.name, 'ru');
        });
    const entries = await hydrateBatchFolderMetadata(entriesWithoutMetadata);

    const disk = await getDiskSnapshot();
    const usedBytes = await getDirectorySize(STORAGE_ROOT);

    return {
        root_name: STORAGE_ROOT_NAME,
        current_path: relativePath,
        parent_path: relativePath ? path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath) : null,
        used_bytes: usedBytes,
        total_bytes: disk.total_bytes,
        free_bytes: disk.free_bytes,
        entries
    };
};

const moveWithoutOverwrite = async (sourcePath: string, targetPath: string) => {
    try {
        await fs.link(sourcePath, targetPath);
        await fs.rm(sourcePath, { force: true });
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EEXIST') {
            throw createStorageError('Файл с таким именем уже существует.', 409);
        }
        if (code !== 'EXDEV') {
            throw error;
        }
        await fs.copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL).catch((copyError) => {
            if ((copyError as NodeJS.ErrnoException).code === 'EEXIST') {
                throw createStorageError('Файл с таким именем уже существует.', 409);
            }
            throw copyError;
        });
        await fs.rm(sourcePath, { force: true });
    }
};

const cleanupUploadedFiles = async (files: Express.Multer.File[]) => {
    await Promise.all(files.map((file) => fs.rm(file.path, { force: true }).catch(() => undefined)));
};

router.use(authenticateToken, requireRole(ADMIN_ONLY_ROLES));

router.get('/', async (req, res) => {
    try {
        res.json(await listStorage(req.query.path));
    } catch (error) {
        res.status(getErrorStatusCode(error)).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить папку.' });
    }
});

router.post('/folder', async (req: AuthRequest, res) => {
    try {
        const { relativePath, absolutePath } = resolveEditablePath(req.body?.path);
        await assertExistingPathInsideRoot(absolutePath);
        const name = validateEntryName(req.body?.name);
        const targetRelativePath = path.posix.join(relativePath, name);
        const target = resolveEditablePath(targetRelativePath);

        await fs.mkdir(target.absolutePath);
        await writeSecurityAuditLog(prisma, {
            action: 'SERVER_STORAGE_FOLDER_CREATED',
            user_id: req.user?.id,
            details: buildSecurityAuditDetails(req, {
                path: target.relativePath
            })
        });

        res.status(201).json(await listStorage(relativePath));
    } catch (error) {
        const statusCode = (error as NodeJS.ErrnoException).code === 'EEXIST' ? 409 : getErrorStatusCode(error);
        res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Не удалось создать папку.' });
    }
});

router.post('/upload', (req: AuthRequest, res) => {
    storageUpload.array('files', MAX_FILES_PER_UPLOAD)(req, res, async (error) => {
        const files = (req.files as Express.Multer.File[] | undefined) || [];
        if (error) {
            await cleanupUploadedFiles(files);
            return res.status(getErrorStatusCode(error)).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить файл.' });
        }

        try {
            if (files.length === 0) {
                return res.status(400).json({ error: 'Файл не загружен.' });
            }

            const { relativePath, absolutePath } = resolveEditablePath(req.body?.path);
            await assertExistingPathInsideRoot(absolutePath);
            const stat = await fs.lstat(absolutePath);
            if (!stat.isDirectory() || stat.isSymbolicLink()) {
                throw createStorageError('Путь не является папкой.');
            }

            for (const file of files) {
                const safeName = validateEntryName(path.basename(file.originalname.replace(/\\/g, '/')));
                const target = resolveEditablePath(path.posix.join(relativePath, safeName));
                await moveWithoutOverwrite(file.path, target.absolutePath);
            }

            await writeSecurityAuditLog(prisma, {
                action: 'SERVER_STORAGE_FILES_UPLOADED',
                user_id: req.user?.id,
                details: buildSecurityAuditDetails(req, {
                    path: relativePath,
                    files: files.map((file) => file.originalname)
                })
            });

            return res.status(201).json(await listStorage(relativePath));
        } catch (nextError) {
            await cleanupUploadedFiles(files);
            return res.status(getErrorStatusCode(nextError)).json({
                error: nextError instanceof Error ? nextError.message : 'Не удалось загрузить файл.'
            });
        }
    });
});

router.delete('/', async (req: AuthRequest, res) => {
    try {
        const { relativePath, absolutePath } = resolveEditablePath(req.body?.path);
        if (!relativePath) {
            throw createStorageError('Корневую папку удалить нельзя.');
        }

        await assertExistingPathInsideRoot(absolutePath);
        const stat = await fs.lstat(absolutePath);
        if (stat.isSymbolicLink()) {
            throw createStorageError('Symlink удалять нельзя.');
        }

        const deletedSizeBytes = stat.isDirectory() ? await getDirectorySize(absolutePath) : stat.size;
        await fs.rm(absolutePath, { recursive: stat.isDirectory(), force: false });
        await writeSecurityAuditLog(prisma, {
            action: 'SERVER_STORAGE_ENTRY_DELETED',
            user_id: req.user?.id,
            details: buildSecurityAuditDetails(req, {
                path: relativePath,
                type: stat.isDirectory() ? 'directory' : 'file',
                size_bytes: deletedSizeBytes
            })
        });

        res.json(await listStorage(path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath)));
    } catch (error) {
        res.status(getErrorStatusCode(error)).json({ error: error instanceof Error ? error.message : 'Не удалось удалить файл.' });
    }
});

export default router;
