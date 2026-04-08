import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Prisma, VideoProcessingJob } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export const VIDEO_JOB_STORAGE_ROOT = path.join(projectRoot, 'storage/video-jobs');
export const VIDEO_JOB_STAGING_ROOT = path.join(VIDEO_JOB_STORAGE_ROOT, 'staging');
export const VIDEO_JOB_PUBLIC_OUTPUT_ROOT = path.join(projectRoot, 'public/uploads/videos/generated');
export const VIDEO_JOB_PUBLIC_URL_ROOT = '/uploads/videos/generated';
export const VIDEO_JOB_ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING']);
export const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

export type UploadedVideoBundleFile = {
    originalName: string;
    stagingPath: string;
};

export type ValidatedVideoClip = {
    sequence: number;
    originalName: string;
    normalizedBaseName: string;
    extension: string;
    stagingPath: string;
};

export type VideoSourceManifestEntry = {
    sequence: number;
    original_name: string;
    stored_name: string;
    relative_path: string;
};

export type VideoResultManifestEntry = {
    sequence: number;
    item_id: string;
    temp_id: string;
    item_seq: number | null;
    file_name: string;
    relative_path: string;
    public_url: string;
};

export const ensureVideoProcessingDirectories = () => {
    [VIDEO_JOB_STORAGE_ROOT, VIDEO_JOB_STAGING_ROOT, VIDEO_JOB_PUBLIC_OUTPUT_ROOT].forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

const toPosixPath = (value: string) => value.split(path.sep).join('/');

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const padVideoSequence = (sequence: number) => String(sequence).padStart(3, '0');

export const sanitizeVideoOutputSegment = (value: string) => {
    const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-');
    return normalized.replace(/^-|-$/g, '') || 'item';
};

export const buildVideoJobSourceDir = (jobId: string) => path.join(VIDEO_JOB_STORAGE_ROOT, jobId, 'source');
export const buildVideoJobWorkDir = (jobId: string) => path.join(VIDEO_JOB_STORAGE_ROOT, jobId, 'work');
export const buildVideoJobSourceRelativePath = (jobId: string, filename: string) =>
    toPosixPath(path.join('storage/video-jobs', jobId, 'source', filename));
export const buildVideoJobPublicOutputDir = (batchId: string, version: number) =>
    path.join(VIDEO_JOB_PUBLIC_OUTPUT_ROOT, batchId, `v${version}`);
export const buildVideoJobPublicRelativePath = (batchId: string, version: number, filename: string) =>
    toPosixPath(path.join('uploads/videos/generated', batchId, `v${version}`, filename));
export const buildVideoJobPublicUrl = (batchId: string, version: number, filename: string) =>
    `${VIDEO_JOB_PUBLIC_URL_ROOT}/${encodeURIComponent(batchId)}/v${version}/${encodeURIComponent(filename)}`;
export const resolveProjectPath = (relativePath: string) => path.join(projectRoot, relativePath);

export const parseStrictNumberedFilename = (filename: string): { sequence: number; extension: string; normalizedBaseName: string } | null => {
    const baseName = path.basename(filename).trim();
    const match = baseName.match(/^(\d{3})\.(mp4|mov|m4v|webm)$/i);
    if (!match) {
        return null;
    }

    return {
        sequence: Number(match[1]),
        extension: match[2].toLowerCase(),
        normalizedBaseName: `${match[1]}.${match[2].toLowerCase()}`
    };
};

export const validateVideoBundleFiles = (
    files: UploadedVideoBundleFile[],
    expectedOutputCount: number
): { orderedFiles: ValidatedVideoClip[]; baseClip: ValidatedVideoClip } => {
    if (files.length < 2) {
        throw new Error('Нужно загрузить минимум два видео: базовый клип 001 и хотя бы один последующий.');
    }

    const orderedFiles = files.map((file) => {
        const parsed = parseStrictNumberedFilename(file.originalName);
        if (!parsed) {
            throw new Error('Видео-комплект должен быть назван строго по схеме 001.mp4, 002.mp4, 003.mp4 и так далее.');
        }

        return {
            sequence: parsed.sequence,
            originalName: path.basename(file.originalName).trim(),
            normalizedBaseName: parsed.normalizedBaseName,
            extension: parsed.extension,
            stagingPath: file.stagingPath
        } satisfies ValidatedVideoClip;
    }).sort((left, right) => left.sequence - right.sequence);

    orderedFiles.forEach((file, index) => {
        const expectedSequence = index + 1;
        if (file.sequence !== expectedSequence) {
            throw new Error(`Нарушена нумерация видео-комплекта. Ожидался файл ${padVideoSequence(expectedSequence)}.`);
        }
    });

    if (orderedFiles[0]?.sequence !== 1) {
        throw new Error('Базовый клип должен иметь имя 001.mp4, 001.mov, 001.m4v или 001.webm.');
    }

    if (orderedFiles.length - 1 !== expectedOutputCount) {
        throw new Error(`Количество итоговых видео должно совпадать с количеством Item в партии: ожидается ${expectedOutputCount}, получено ${orderedFiles.length - 1}.`);
    }

    return {
        orderedFiles,
        baseClip: orderedFiles[0]
    };
};

export const sortBatchItemsForVideoAssignment = <T extends { item_seq: number | null; temp_id: string }>(items: T[]) =>
    [...items].sort((left, right) => {
        const leftSeq = left.item_seq ?? Number.MAX_SAFE_INTEGER;
        const rightSeq = right.item_seq ?? Number.MAX_SAFE_INTEGER;
        if (leftSeq !== rightSeq) {
            return leftSeq - rightSeq;
        }

        return left.temp_id.localeCompare(right.temp_id, 'en', { numeric: true, sensitivity: 'base' });
    });

export const serializeVideoProcessingJob = (
    job: Pick<VideoProcessingJob, 'id' | 'status' | 'version' | 'source_count' | 'output_count' | 'processed_output_count' | 'error_message' | 'started_at' | 'finished_at'> | null | undefined
) => {
    if (!job) {
        return null;
    }

    return {
        job_id: job.id,
        status: job.status,
        version: job.version,
        source_count: job.source_count,
        output_count: job.output_count,
        processed_output_count: job.processed_output_count,
        error_message: job.error_message,
        started_at: job.started_at,
        finished_at: job.finished_at
    };
};

export const parseSourceManifest = (value: Prisma.JsonValue | null | undefined): VideoSourceManifestEntry[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!isRecord(entry)) return [];

        const sequence = typeof entry.sequence === 'number' ? entry.sequence : NaN;
        const originalName = typeof entry.original_name === 'string' ? entry.original_name : '';
        const storedName = typeof entry.stored_name === 'string' ? entry.stored_name : '';
        const relativePath = typeof entry.relative_path === 'string' ? entry.relative_path : '';

        if (!Number.isFinite(sequence) || !originalName || !storedName || !relativePath) {
            return [];
        }

        return [{
            sequence,
            original_name: originalName,
            stored_name: storedName,
            relative_path: relativePath
        }];
    });
};

export const parseResultManifest = (value: Prisma.JsonValue | null | undefined): VideoResultManifestEntry[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!isRecord(entry)) return [];

        const sequence = typeof entry.sequence === 'number' ? entry.sequence : NaN;
        const itemId = typeof entry.item_id === 'string' ? entry.item_id : '';
        const tempId = typeof entry.temp_id === 'string' ? entry.temp_id : '';
        const itemSeq = typeof entry.item_seq === 'number' ? entry.item_seq : null;
        const fileName = typeof entry.file_name === 'string' ? entry.file_name : '';
        const relativePath = typeof entry.relative_path === 'string' ? entry.relative_path : '';
        const publicUrl = typeof entry.public_url === 'string' ? entry.public_url : '';

        if (!Number.isFinite(sequence) || !itemId || !tempId || !fileName || !relativePath || !publicUrl) {
            return [];
        }

        return [{
            sequence,
            item_id: itemId,
            temp_id: tempId,
            item_seq: itemSeq,
            file_name: fileName,
            relative_path: relativePath,
            public_url: publicUrl
        }];
    });
};
