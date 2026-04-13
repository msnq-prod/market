import multer from 'multer';
import path from 'path';
import type { Request, Response } from 'express';
import { ensureVideoExportDirectories, VIDEO_EXPORT_STAGING_ROOT } from '../services/videoExport.ts';

ensureVideoExportDirectories();

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, VIDEO_EXPORT_STAGING_ROOT);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `${uniqueSuffix}${path.extname(file.originalname).toLowerCase() || '.mp4'}`);
    }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if ((file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream') && extension === '.mp4') {
        cb(null, true);
        return;
    }

    cb(new Error('Для финального экспорта разрешены только MP4-файлы.'));
};

const videoExportUpload = multer({
    storage,
    fileFilter,
    limits: {
        files: 1,
        fileSize: 1024 * 1024 * 1024
    }
});

export const runVideoExportUpload = (req: Request, res: Response) =>
    new Promise<void>((resolve, reject) => {
        videoExportUpload.single('file')(req, res, (error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
