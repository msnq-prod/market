import multer from 'multer';
import path from 'path';
import type { Request, Response } from 'express';
import type { FileFilterCallback } from 'multer';
import { ensureVideoProcessingDirectories, SUPPORTED_VIDEO_EXTENSIONS, VIDEO_JOB_STAGING_ROOT } from '../services/videoProcessing.ts';

ensureVideoProcessingDirectories();

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, VIDEO_JOB_STAGING_ROOT);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('video/') && SUPPORTED_VIDEO_EXTENSIONS.has(extension)) {
        cb(null, true);
        return;
    }

    cb(new Error('Для автосклейки разрешены только видео mp4, mov, m4v и webm.'), false);
};

const videoJobUpload = multer({
    storage,
    fileFilter,
    limits: {
        files: 100,
        fileSize: 1024 * 1024 * 1024
    }
});

export const runVideoJobUpload = (req: Request, res: Response) =>
    new Promise<void>((resolve, reject) => {
        videoJobUpload.array('files')(req, res, (error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
