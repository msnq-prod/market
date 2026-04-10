import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { BatchVideoExportSession, Prisma } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export const VIDEO_EXPORT_STORAGE_ROOT = path.join(projectRoot, 'storage/video-export');
export const VIDEO_EXPORT_STAGING_ROOT = path.join(VIDEO_EXPORT_STORAGE_ROOT, 'staging');
export const VIDEO_EXPORT_PUBLIC_OUTPUT_ROOT = path.join(projectRoot, 'public/uploads/videos/exports');
export const VIDEO_EXPORT_PUBLIC_URL_ROOT = '/uploads/videos/exports';
export const ACTIVE_VIDEO_EXPORT_STATUSES = new Set(['OPEN', 'UPLOADING']);
export const RECOVERABLE_VIDEO_EXPORT_STATUSES = new Set(['OPEN', 'UPLOADING', 'FAILED', 'ABANDONED']);
export const VIDEO_EXPORT_CROSSFADE_MS = 200;
export const VIDEO_EXPORT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const VIDEO_EXPORT_ABANDONED_MESSAGE = 'Сессия автоматически переведена в ABANDONED после 24 часов без активности.';
export const VIDEO_EXPORT_CANCELLED_MESSAGE = 'Сессия экспорта отменена вручную.';

export type VideoExportSourceFingerprint = {
    name: string;
    size: number;
    lastModified: number;
    durationMs: number;
};

export type VideoExportSegment = {
    sequence: number;
    start_ms: number;
    end_ms: number;
};

export type VideoExportOutput = {
    segment_seq: number;
    serial_number: string;
    item_id: string;
};

export type VideoExportManifest = {
    segments: VideoExportSegment[];
    outputs: VideoExportOutput[];
};

export type UploadedVideoExportManifestEntry = {
    serial_number: string;
    item_id: string;
    file_name: string;
    relative_path: string;
    public_url: string;
    uploaded_at: string;
};

const toPosixPath = (value: string) => value.split(path.sep).join('/');

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const ensureVideoExportDirectories = () => {
    [VIDEO_EXPORT_STORAGE_ROOT, VIDEO_EXPORT_STAGING_ROOT, VIDEO_EXPORT_PUBLIC_OUTPUT_ROOT].forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

export const moveFileSafely = async (sourcePath: string, targetPath: string) => {
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

export const buildVideoExportStagingPath = (filename: string) => path.join(VIDEO_EXPORT_STAGING_ROOT, filename);
export const buildVideoExportPublicOutputDir = (batchId: string, version: number) =>
    path.join(VIDEO_EXPORT_PUBLIC_OUTPUT_ROOT, batchId, `v${version}`);
export const buildVideoExportPublicRelativePath = (batchId: string, version: number, filename: string) =>
    toPosixPath(path.join('uploads/videos/exports', batchId, `v${version}`, filename));
export const buildVideoExportPublicUrl = (batchId: string, version: number, filename: string) =>
    `${VIDEO_EXPORT_PUBLIC_URL_ROOT}/${encodeURIComponent(batchId)}/v${version}/${encodeURIComponent(filename)}`;

export const sanitizeVideoExportSerial = (serialNumber: string) =>
    serialNumber.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

export const buildVideoExportFilename = (serialNumber: string) =>
    `${sanitizeVideoExportSerial(serialNumber)}.mp4`;

export const serializeBatchVideoExportSession = (
    session: Pick<BatchVideoExportSession, 'id' | 'status' | 'version' | 'expected_count' | 'uploaded_count' | 'crossfade_ms' | 'error_message' | 'started_at' | 'finished_at'> | null | undefined
) => {
    if (!session) {
        return null;
    }

    return {
        session_id: session.id,
        status: session.status,
        version: session.version,
        expected_count: session.expected_count,
        uploaded_count: session.uploaded_count,
        crossfade_ms: session.crossfade_ms,
        error_message: session.error_message,
        started_at: session.started_at,
        finished_at: session.finished_at
    };
};

export const parseVideoExportSourceFingerprint = (
    value: Prisma.JsonValue | null | undefined
): VideoExportSourceFingerprint | null => {
    if (!isRecord(value)) {
        return null;
    }

    const name = typeof value.name === 'string' ? value.name : '';
    const size = typeof value.size === 'number' ? value.size : Number(value.size);
    const lastModified = typeof value.lastModified === 'number' ? value.lastModified : Number(value.lastModified);
    const durationMs = typeof value.durationMs === 'number' ? value.durationMs : Number(value.durationMs);

    if (!name || !Number.isFinite(size) || !Number.isFinite(lastModified) || !Number.isFinite(durationMs)) {
        return null;
    }

    return {
        name,
        size,
        lastModified,
        durationMs
    };
};

export const parseVideoExportManifest = (value: Prisma.JsonValue | null | undefined): VideoExportManifest | null => {
    if (!isRecord(value) || !Array.isArray(value.segments) || !Array.isArray(value.outputs)) {
        return null;
    }

    const segments = value.segments.flatMap((entry) => {
        if (!isRecord(entry)) return [];

        const sequence = typeof entry.sequence === 'number' ? entry.sequence : Number(entry.sequence);
        const startMs = typeof entry.start_ms === 'number' ? entry.start_ms : Number(entry.start_ms);
        const endMs = typeof entry.end_ms === 'number' ? entry.end_ms : Number(entry.end_ms);

        if (!Number.isFinite(sequence) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
            return [];
        }

        return [{
            sequence,
            start_ms: startMs,
            end_ms: endMs
        }];
    });

    const outputs = value.outputs.flatMap((entry) => {
        if (!isRecord(entry)) return [];

        const segmentSeq = typeof entry.segment_seq === 'number' ? entry.segment_seq : Number(entry.segment_seq);
        const serialNumber = typeof entry.serial_number === 'string' ? entry.serial_number : '';
        const itemId = typeof entry.item_id === 'string' ? entry.item_id : '';

        if (!Number.isFinite(segmentSeq) || !serialNumber || !itemId) {
            return [];
        }

        return [{
            segment_seq: segmentSeq,
            serial_number: serialNumber,
            item_id: itemId
        }];
    });

    return { segments, outputs };
};

export const parseUploadedVideoExportManifest = (
    value: Prisma.JsonValue | null | undefined
): UploadedVideoExportManifestEntry[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!isRecord(entry)) return [];

        const serialNumber = typeof entry.serial_number === 'string' ? entry.serial_number : '';
        const itemId = typeof entry.item_id === 'string' ? entry.item_id : '';
        const fileName = typeof entry.file_name === 'string' ? entry.file_name : '';
        const relativePath = typeof entry.relative_path === 'string' ? entry.relative_path : '';
        const publicUrl = typeof entry.public_url === 'string' ? entry.public_url : '';
        const uploadedAt = typeof entry.uploaded_at === 'string' ? entry.uploaded_at : '';

        if (!serialNumber || !itemId || !fileName || !relativePath || !publicUrl || !uploadedAt) {
            return [];
        }

        return [{
            serial_number: serialNumber,
            item_id: itemId,
            file_name: fileName,
            relative_path: relativePath,
            public_url: publicUrl,
            uploaded_at: uploadedAt
        }];
    });
};

export const sameVideoExportFingerprint = (
    left: VideoExportSourceFingerprint | null,
    right: VideoExportSourceFingerprint | null
) => JSON.stringify(left) === JSON.stringify(right);

export const sameVideoExportManifest = (
    left: VideoExportManifest | null,
    right: VideoExportManifest | null
) => JSON.stringify(left) === JSON.stringify(right);
