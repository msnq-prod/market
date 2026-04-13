import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { Request } from 'express';
import { resolveProjectPath } from '../utils/projectPaths.ts';

// Ensure directories exist
const uploadDir = resolveProjectPath('public', 'uploads');
const videoDir = resolveProjectPath('public', 'uploads', 'videos');
const photoDir = resolveProjectPath('public', 'uploads', 'photos');

[uploadDir, videoDir, photoDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: (_req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, videoDir);
        } else {
            cb(null, photoDir);
        }
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else if (file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
};

export const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 300 * 1024 * 1024 // 300MB limit
    }
});
