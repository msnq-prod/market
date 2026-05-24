import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { Prisma } from '@prisma/client';
import { authenticateToken } from '../../middleware/auth.ts';
import { runVideoJobUpload } from '../../middleware/videoJobUpload.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import {
    buildVideoJobSourceDir,
    buildVideoJobSourceRelativePath,
    serializeVideoProcessingJob,
    validateVideoBundleFiles
} from '../../services/videoProcessing.ts';
import { moveFileSafely } from '../../services/videoExport.ts';
import { isStaffRole } from '../../utils/collectionWorkflow.ts';
import { BATCH_INCLUDE, createHttpError, getErrorMessage, getErrorStatusCode, prisma, removeStagedVideoFiles, serializeBatch } from './shared.ts';
import { ACTIVE_VIDEO_JOB_STATUSES } from './shared.ts';

const router = express.Router();

router.post('/:id/video-jobs', authenticateToken, async (req: AuthRequest, res) => {
    let uploadedFiles: Express.Multer.File[] | undefined;
    let sourceDir = '';
    let jobCreated = false;

    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        await runVideoJobUpload(req, res);
        uploadedFiles = req.files as Express.Multer.File[] | undefined;

        if (!uploadedFiles || uploadedFiles.length === 0) {
            throw createHttpError('Не передан видео-комплект для обработки.', 400);
        }

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: {
                items: {
                    where: {
                        deleted_at: null
                    }
                },
                video_processing_jobs: {
                    where: {
                        status: {
                            in: ACTIVE_VIDEO_JOB_STATUSES
                        }
                    },
                    orderBy: { created_at: 'desc' },
                    take: 1
                }
            }
        });

        if (!batch) {
            throw createHttpError('Партия не найдена.', 404);
        }

        if (batch.status !== 'RECEIVED') {
            throw createHttpError('Автосклейка доступна только для партии в статусе RECEIVED.', 400);
        }

        if (batch.video_processing_jobs.length > 0) {
            throw createHttpError('Для партии уже выполняется обработка видео. Дождитесь завершения текущего задания.', 409);
        }

        const validatedBundle = validateVideoBundleFiles(
            uploadedFiles.map((file) => ({
                originalName: file.originalname,
                stagingPath: file.path
            })),
            batch.items.length
        );

        const latestVersionRecord = await prisma.videoProcessingJob.findFirst({
            where: { batch_id: batch.id },
            orderBy: { version: 'desc' },
            select: { version: true }
        });

        const jobId = crypto.randomUUID();
        const nextVersion = (latestVersionRecord?.version ?? 0) + 1;
        sourceDir = buildVideoJobSourceDir(jobId);
        await fs.mkdir(sourceDir, { recursive: true });

        const sourceManifest = [];
        for (const clip of validatedBundle.orderedFiles) {
            const storedName = clip.normalizedBaseName;
            const targetPath = path.join(sourceDir, storedName);
            await moveFileSafely(clip.stagingPath, targetPath);

            sourceManifest.push({
                sequence: clip.sequence,
                original_name: clip.originalName,
                stored_name: storedName,
                relative_path: buildVideoJobSourceRelativePath(jobId, storedName)
            });
        }

        const createdJob = await prisma.videoProcessingJob.create({
            data: {
                id: jobId,
                batch_id: batch.id,
                requested_by_user_id: req.user.id,
                status: 'QUEUED',
                version: nextVersion,
                source_count: validatedBundle.orderedFiles.length,
                output_count: batch.items.length,
                processed_output_count: 0,
                base_clip_name: validatedBundle.baseClip.originalName,
                source_manifest: sourceManifest as Prisma.InputJsonValue
            }
        });
        jobCreated = true;

        const updatedBatch = await prisma.batch.findFirst({
            where: {
                id: batch.id,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });

        res.status(202).json({
            job: serializeVideoProcessingJob(createdJob),
            batch: updatedBatch ? serializeBatch(req, updatedBatch) : null
        });
    } catch (error) {
        console.error(error);

        if (!jobCreated && sourceDir) {
            await fs.rm(sourceDir, { recursive: true, force: true }).catch((cleanupError) => {
                console.error('Failed to cleanup video job source directory', cleanupError);
            });
        }

        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось поставить видео-комплект в очередь обработки.');

        res.status(statusCode).json({ error: message });
    } finally {
        await removeStagedVideoFiles(uploadedFiles ?? (req.files as Express.Multer.File[] | undefined));
    }
});

export default router;
