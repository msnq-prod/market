import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';

const execFileAsync = promisify(execFile);

export const HELPER_PROTOCOL_VERSION = 'stones-video-export-helper-v2';
export const DEFAULT_PORT = 3012;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_CLEANUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_MAX_SOURCE_DURATION_MS = 60 * 60 * 1000;
export const DEFAULT_PREVIEW_WIDTH = 540;
export const DEFAULT_PREVIEW_HEIGHT = 960;
export const DEFAULT_ALLOWED_ORIGINS = [
    'http://127.0.0.1:3001',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5273',
    'http://localhost:5273'
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const PLACEHOLDER_HELPER_VERSION = '0.0.0';

const secondsFromMs = (value) => (value / 1000).toFixed(3);

const buildVideoFilter = (labelPrefix, inputIndex, startMs, endMs) => (
    `[${inputIndex}:v]trim=start=${secondsFromMs(startMs)}:end=${secondsFromMs(endMs)},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=24,setsar=1[${labelPrefix}]`
);

const buildPreviewFilter = () => (
    `scale=${DEFAULT_PREVIEW_WIDTH}:${DEFAULT_PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease,pad=${DEFAULT_PREVIEW_WIDTH}:${DEFAULT_PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,fps=24,setsar=1`
);

const normalizeVersion = (value) => typeof value === 'string' ? value.trim() : '';
const getRuntimeHelperVersion = () => normalizeVersion(process.versions.electron);
const resolveHelperVersion = (value) => {
    const normalized = normalizeVersion(value);
    if (normalized && normalized !== PLACEHOLDER_HELPER_VERSION) {
        return normalized;
    }

    return getRuntimeHelperVersion() || 'dev';
};

const readPackageVersion = async () => {
    try {
        const raw = await fsp.readFile(packageJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        return resolveHelperVersion(parsed.version);
    } catch {
        return resolveHelperVersion('');
    }
};

const getDefaultStorageRoot = () => {
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library/Application Support/ZAGARAMI Video Helper');
    }

    return path.join(process.cwd(), 'storage/video-export-helper');
};

const ensureDirectory = async (directoryPath) => {
    await fsp.mkdir(directoryPath, { recursive: true });
};

const resolveExecutablePath = (binaryPath) => {
    if (typeof binaryPath !== 'string' || !binaryPath) {
        return binaryPath;
    }

    if (binaryPath.includes('.asar/')) {
        const unpackedPath = binaryPath.replace('.asar/', '.asar.unpacked/');
        if (fs.existsSync(unpackedPath)) {
            return unpackedPath;
        }
    }

    if (binaryPath.includes('.asar\\')) {
        const unpackedPath = binaryPath.replace('.asar\\', '.asar.unpacked\\');
        if (fs.existsSync(unpackedPath)) {
            return unpackedPath;
        }
    }

    return binaryPath;
};

const isOptionalModuleNotFound = (error, moduleName) => {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const code = typeof error.code === 'string' ? error.code : '';
    const message = typeof error.message === 'string' ? error.message : '';
    if (!['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(code)) {
        return false;
    }

    return message.includes(`'${moduleName}'`) || message.includes(`"${moduleName}"`) || message.includes(moduleName);
};

const importOptionalDependency = async (moduleName) => {
    try {
        return await import(moduleName);
    } catch (error) {
        if (isOptionalModuleNotFound(error, moduleName)) {
            return null;
        }

        throw error;
    }
};

const resolveBundledBinaryPaths = async () => {
    const [ffmpegModule, ffprobeModule] = await Promise.all([
        importOptionalDependency('ffmpeg-static'),
        importOptionalDependency('ffprobe-static')
    ]);

    const ffmpegStaticPath = resolveExecutablePath(typeof ffmpegModule?.default === 'string' ? ffmpegModule.default : '');
    const ffprobeExport = ffprobeModule?.default;
    const ffprobeStaticPath = resolveExecutablePath(
        typeof ffprobeExport?.path === 'string'
            ? ffprobeExport.path
            : typeof ffprobeExport === 'string'
                ? ffprobeExport
                : ''
    );

    return {
        ffmpegStaticPath,
        ffprobeStaticPath
    };
};

const isLoopbackAddress = (value) => {
    if (!value) {
        return false;
    }

    return value === '127.0.0.1'
        || value === '::1'
        || value === '::ffff:127.0.0.1';
};

const runBinary = async (binary, args) =>
    execFileAsync(binary, args, { maxBuffer: 32 * 1024 * 1024 });

const ensureBinaryExists = async (binary) => {
    await runBinary(binary, ['-version']);
};

const getFreeBytes = async (targetPath) => {
    const stat = await fsp.statfs(targetPath);
    return Number(stat.bavail) * Number(stat.bsize);
};

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeAllowedOrigins = (...entries) => Array.from(new Set(
    entries
        .flat()
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean)
));

const normalizeSegments = (segments) => {
    if (!Array.isArray(segments) || segments.length < 2) {
        throw new Error('segments должен содержать минимум 000 и один товарный сегмент.');
    }

    return segments.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new Error('segments содержит некорректные данные.');
        }

        const sequence = typeof entry.sequence === 'number' ? entry.sequence : Number(entry.sequence);
        const startMs = typeof entry.start_ms === 'number' ? entry.start_ms : Number(entry.start_ms);
        const endMs = typeof entry.end_ms === 'number' ? entry.end_ms : Number(entry.end_ms);

        if (!Number.isFinite(sequence) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || sequence !== index || startMs < 0 || endMs <= startMs) {
            throw new Error('segments должны быть непрерывной нумерованной цепочкой.');
        }

        return {
            sequence,
            start_ms: startMs,
            end_ms: endMs
        };
    }).sort((left, right) => left.sequence - right.sequence);
};

const normalizeOutputs = (outputs) => {
    if (!Array.isArray(outputs) || outputs.length === 0) {
        throw new Error('outputs должен содержать минимум один финальный ролик.');
    }

    const seenSerials = new Set();
    return outputs.map((entry) => {
        if (!isRecord(entry)) {
            throw new Error('outputs содержит некорректные данные.');
        }

        const segmentSeq = typeof entry.segment_seq === 'number' ? entry.segment_seq : Number(entry.segment_seq);
        const serialNumber = typeof entry.serial_number === 'string' ? entry.serial_number.trim().toUpperCase() : '';
        const itemId = typeof entry.item_id === 'string' ? entry.item_id : undefined;

        if (!Number.isFinite(segmentSeq) || segmentSeq < 1 || !serialNumber) {
            throw new Error('Каждый output должен содержать segment_seq >= 1 и serial_number.');
        }

        if (seenSerials.has(serialNumber)) {
            throw new Error('Нельзя рендерить два файла с одинаковым serial_number в одном job.');
        }

        seenSerials.add(serialNumber);
        return {
            segment_seq: segmentSeq,
            serial_number: serialNumber,
            item_id: itemId
        };
    }).sort((left, right) => left.segment_seq - right.segment_seq);
};

const readHelperConfig = async (storageRoot, explicitAllowedOrigins) => {
    const fromOptions = Array.isArray(explicitAllowedOrigins) ? explicitAllowedOrigins : null;
    if (fromOptions && fromOptions.length > 0) {
        return mergeAllowedOrigins(DEFAULT_ALLOWED_ORIGINS, fromOptions);
    }

    const fromEnv = (process.env.VIDEO_EXPORT_HELPER_ALLOWED_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    if (fromEnv.length > 0) {
        return mergeAllowedOrigins(DEFAULT_ALLOWED_ORIGINS, fromEnv);
    }

    try {
        const raw = await fsp.readFile(path.join(storageRoot, 'config.json'), 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.allowed_origins)) {
            const origins = parsed.allowed_origins
                .map((item) => typeof item === 'string' ? item.trim() : '')
                .filter(Boolean);
            if (origins.length > 0) {
                return mergeAllowedOrigins(DEFAULT_ALLOWED_ORIGINS, origins);
            }
        }
    } catch {
        return DEFAULT_ALLOWED_ORIGINS;
    }

    return DEFAULT_ALLOWED_ORIGINS;
};

const probeSource = async (ffprobePath, filePath) => {
    const { stdout } = await runBinary(ffprobePath, [
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        filePath
    ]);

    const parsed = JSON.parse(stdout);
    const formatDuration = Number(parsed.format?.duration);
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const videoStream = streams.find((stream) => stream.codec_type === 'video');
    if (!videoStream) {
        throw new Error('ffprobe не нашёл видеодорожку в исходном файле.');
    }

    return {
        durationMs: Number.isFinite(formatDuration) ? Math.max(1, Math.round(formatDuration * 1000)) : 0,
        hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
        videoCodec: typeof videoStream.codec_name === 'string' ? videoStream.codec_name : '',
        formatName: typeof parsed.format?.format_name === 'string' ? parsed.format.format_name : ''
    };
};

const shouldGeneratePreview = (originalName, probe) => {
    const extension = path.extname(originalName).toLowerCase();
    const codec = (probe.videoCodec || '').toLowerCase();
    const formatName = (probe.formatName || '').toLowerCase();

    if (extension === '.mp4' && ['h264', 'avc1'].includes(codec)) {
        return false;
    }

    if (extension === '.webm' && ['vp8', 'vp9', 'av1'].includes(codec)) {
        return false;
    }

    return formatName.includes('mov')
        || ['hevc', 'h265', 'prores', 'dnxhd'].some((part) => codec.includes(part))
        || extension === '.m4v';
};

const renderPreviewFile = async (ffmpegPath, source, outputPath) => {
    const args = [
        '-y',
        '-i', source.file_path,
        '-vf', buildPreviewFilter(),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '24',
        '-pix_fmt', 'yuv420p'
    ];

    if (source.has_audio) {
        args.push(
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '48000',
            '-ac', '2'
        );
    } else {
        args.push('-an');
    }

    args.push(
        '-movflags', '+faststart',
        outputPath
    );

    await runBinary(ffmpegPath, args);
};

const renderOutputFile = async (
    ffmpegPath,
    source,
    introSegment,
    tailSegment,
    outputPath,
    crossfadeMs
) => {
    const introDurationMs = introSegment.end_ms - introSegment.start_ms;
    const tailDurationMs = tailSegment.end_ms - tailSegment.start_ms;
    const totalDurationMs = introDurationMs + tailDurationMs;
    const effectiveCrossfadeMs = Math.max(
        0,
        Math.min(crossfadeMs, Math.floor(introDurationMs / 2), Math.floor(tailDurationMs / 2))
    );
    const delayMs = Math.max(0, introDurationMs - effectiveCrossfadeMs);

    const videoFilters = [
        buildVideoFilter('v0', 0, introSegment.start_ms, introSegment.end_ms),
        buildVideoFilter('v1', 1, tailSegment.start_ms, tailSegment.end_ms),
        '[v0][v1]concat=n=2:v=1:a=0[v]'
    ];

    const args = [
        '-y',
        '-i', source.file_path,
        '-i', source.file_path
    ];

    let filterComplex = videoFilters.join(';');
    let audioMapLabel = '';

    if (source.has_audio) {
        const crossfadeSeconds = (effectiveCrossfadeMs / 1000).toFixed(3);
        const introFadeStartSeconds = Math.max(0, (introDurationMs - effectiveCrossfadeMs) / 1000).toFixed(3);
        filterComplex += ';'
            + `[0:a]atrim=start=${secondsFromMs(introSegment.start_ms)}:end=${secondsFromMs(introSegment.end_ms)},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${effectiveCrossfadeMs > 0 ? `,afade=t=out:st=${introFadeStartSeconds}:d=${crossfadeSeconds}` : ''}[a0];`
            + `[1:a]atrim=start=${secondsFromMs(tailSegment.start_ms)}:end=${secondsFromMs(tailSegment.end_ms)},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${effectiveCrossfadeMs > 0 ? `,afade=t=in:st=0:d=${crossfadeSeconds}` : ''},adelay=${delayMs}|${delayMs}[a1];`
            + `[a0][a1]amix=inputs=2:normalize=0:dropout_transition=0,atrim=duration=${(totalDurationMs / 1000).toFixed(3)},aresample=48000[a]`;
        audioMapLabel = '[a]';
    } else {
        args.push(
            '-f', 'lavfi',
            '-t', (totalDurationMs / 1000).toFixed(3),
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'
        );
        audioMapLabel = '2:a:0';
    }

    args.push(
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-map', audioMapLabel,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-r', '24',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-ac', '2',
        '-movflags', '+faststart',
        outputPath
    );

    await runBinary(ffmpegPath, args);
};

export async function startVideoExportHelperServer(options = {}) {
    const app = express();
    const port = Number.parseInt(String(options.port || process.env.VIDEO_EXPORT_HELPER_PORT || DEFAULT_PORT), 10) || DEFAULT_PORT;
    const host = typeof options.host === 'string' ? options.host : DEFAULT_HOST;
    const storageRoot = options.storageRoot || process.env.VIDEO_EXPORT_HELPER_STORAGE_ROOT || getDefaultStorageRoot();
    const sourceRoot = path.join(storageRoot, 'sources');
    const previewRoot = path.join(storageRoot, 'previews');
    const jobRoot = path.join(storageRoot, 'jobs');
    const stateFilePath = path.join(storageRoot, 'state.json');
    const cleanupMaxAgeMs = Number(options.cleanupMaxAgeMs || process.env.VIDEO_EXPORT_HELPER_CLEANUP_MAX_AGE_MS || DEFAULT_CLEANUP_MAX_AGE_MS);
    const minFreeBytes = Number(options.minFreeBytes || process.env.VIDEO_EXPORT_HELPER_MIN_FREE_BYTES || DEFAULT_MIN_FREE_BYTES);
    const maxSourceDurationMs = Number(options.maxSourceDurationMs || process.env.VIDEO_EXPORT_HELPER_MAX_SOURCE_DURATION_MS || DEFAULT_MAX_SOURCE_DURATION_MS);
    const helperVersion = resolveHelperVersion(
        typeof options.helperVersion === 'string'
            ? options.helperVersion
            : await readPackageVersion()
    );
    const { ffmpegStaticPath, ffprobeStaticPath } = await resolveBundledBinaryPaths();
    const ffmpegPath = resolveExecutablePath(options.ffmpegPath || process.env.VIDEO_EXPORT_HELPER_FFMPEG_BIN || ffmpegStaticPath || 'ffmpeg');
    const ffprobePath = resolveExecutablePath(options.ffprobePath || process.env.VIDEO_EXPORT_HELPER_FFPROBE_BIN || ffprobeStaticPath || 'ffprobe');

    await ensureDirectory(storageRoot);
    await ensureDirectory(sourceRoot);
    await ensureDirectory(previewRoot);
    await ensureDirectory(jobRoot);

    const allowedOrigins = await readHelperConfig(storageRoot, options.allowedOrigins);
    const allowedOriginSet = new Set(allowedOrigins);
    const sources = new Map();
    const jobs = new Map();
    const buildHelperUrl = (pathname) => `http://${host}:${port}${pathname}`;

    let stateWritePromise = Promise.resolve();
    const persistState = async () => {
        const snapshot = {
            sources: Array.from(sources.values()),
            jobs: Array.from(jobs.values())
        };

        stateWritePromise = stateWritePromise
            .catch(() => undefined)
            .then(() => fsp.writeFile(stateFilePath, JSON.stringify(snapshot, null, 2), 'utf8'));

        await stateWritePromise;
    };

    const removeSourceArtifacts = async (source) => {
        if (!source) {
            return;
        }

        await Promise.all([
            fsp.rm(source.file_path, { force: true }).catch(() => undefined),
            source.preview_path
                ? fsp.rm(source.preview_path, { force: true }).catch(() => undefined)
                : Promise.resolve()
        ]);
        sources.delete(source.id);
    };

    const removeJobArtifacts = async (jobId) => {
        const job = jobs.get(jobId);
        if (!job) {
            return;
        }

        jobs.delete(jobId);
        const jobDirectory = path.dirname(job.outputs[0]?.file_path || path.join(jobRoot, job.id));
        await fsp.rm(jobDirectory, { recursive: true, force: true }).catch(() => undefined);

        const sourceStillUsed = Array.from(jobs.values()).some((candidate) => candidate.source_id === job.source_id);
        if (!sourceStillUsed) {
            const source = sources.get(job.source_id);
            if (source) {
                await removeSourceArtifacts(source);
            }
        }

        await persistState();
    };

    const cleanupOldAssets = async () => {
        const threshold = Date.now() - cleanupMaxAgeMs;
        let removedJobs = 0;
        let removedSources = 0;

        for (const job of Array.from(jobs.values())) {
            const createdAt = Date.parse(job.created_at);
            const isActive = job.status === 'QUEUED' || job.status === 'PROCESSING';
            if (isActive || !Number.isFinite(createdAt) || createdAt >= threshold) {
                continue;
            }

            const sourceId = job.source_id;
            jobs.delete(job.id);
            removedJobs += 1;
            await fsp.rm(path.dirname(job.outputs[0]?.file_path || path.join(jobRoot, job.id)), { recursive: true, force: true }).catch(() => undefined);

            const sourceStillUsed = Array.from(jobs.values()).some((candidate) => candidate.source_id === sourceId);
            if (!sourceStillUsed) {
                const source = sources.get(sourceId);
                if (source) {
                    await removeSourceArtifacts(source);
                    removedSources += 1;
                }
            }
        }

        const referencedSourceIds = new Set(Array.from(jobs.values()).map((job) => job.source_id));
        for (const source of Array.from(sources.values())) {
            const createdAt = Date.parse(source.created_at);
            if (referencedSourceIds.has(source.id) || !Number.isFinite(createdAt) || createdAt >= threshold) {
                continue;
            }

            await removeSourceArtifacts(source);
            removedSources += 1;
        }

        await persistState();
        return { removed_jobs: removedJobs, removed_sources: removedSources };
    };

    const getHealthInfo = async () => {
        const freeBytes = await getFreeBytes(storageRoot);
        await ensureBinaryExists(ffmpegPath);
        await ensureBinaryExists(ffprobePath);

        return {
            ok: true,
            ffmpeg: true,
            ffprobe: true,
            helper_version: helperVersion,
            protocol_version: HELPER_PROTOCOL_VERSION,
            port,
            storage_root: storageRoot,
            allowed_origins: allowedOrigins,
            free_bytes: freeBytes,
            cleanup_threshold_days: Math.round(cleanupMaxAgeMs / (24 * 60 * 60 * 1000)),
            queued_jobs: Array.from(jobs.values()).filter((job) => job.status === 'QUEUED' || job.status === 'PROCESSING').length
        };
    };

    const ensureEnoughDiskSpace = async (requiredBytes) => {
        const freeBytes = await getFreeBytes(storageRoot);
        if ((freeBytes - requiredBytes) < minFreeBytes) {
            throw new Error('Недостаточно свободного места для локальной обработки видео. Очистите диск или helper cache.');
        }
    };

    const estimateRenderBytes = (source, outputCount) => {
        const perOutputBytes = Math.max(32 * 1024 * 1024, Math.ceil(source.size * 0.5));
        return outputCount * perOutputBytes;
    };

    const updateJob = async (jobId, update) => {
        const current = jobs.get(jobId);
        if (!current) {
            return;
        }

        jobs.set(jobId, {
            ...current,
            ...update,
            updated_at: new Date().toISOString()
        });
        await persistState();
    };

    const processRenderJob = async (jobId, source, segments) => {
        const job = jobs.get(jobId);
        if (!job) {
            return;
        }

        const introSegment = segments[0];
        if (!introSegment) {
            await updateJob(jobId, { status: 'FAILED', error_message: 'В render job отсутствует сегмент 000.' });
            return;
        }

        await updateJob(jobId, { status: 'PROCESSING', error_message: null });

        let processedCount = 0;
        for (const outputState of job.outputs) {
            try {
                const tailSegment = segments[outputState.segment_seq];
                if (!tailSegment) {
                    throw new Error(`Не найден товарный сегмент ${String(outputState.segment_seq).padStart(3, '0')}.`);
                }

                outputState.status = 'PROCESSING';
                await updateJob(jobId, { outputs: [...job.outputs] });

                await renderOutputFile(ffmpegPath, source, introSegment, tailSegment, outputState.file_path, job.crossfade_ms);

                outputState.status = 'COMPLETED';
                outputState.error_message = null;
                processedCount += 1;
                await updateJob(jobId, {
                    outputs: [...job.outputs],
                    processed_count: processedCount
                });
            } catch (error) {
                outputState.status = 'FAILED';
                outputState.error_message = error instanceof Error ? error.message : 'Не удалось отрендерить файл.';
                await updateJob(jobId, {
                    status: 'FAILED',
                    outputs: [...job.outputs],
                    processed_count: processedCount,
                    error_message: outputState.error_message
                });
                return;
            }
        }

        await updateJob(jobId, {
            status: 'COMPLETED',
            outputs: [...job.outputs],
            processed_count: processedCount,
            error_message: null
        });
    };

    try {
        const raw = await fsp.readFile(stateFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        const loadedSources = Array.isArray(parsed.sources) ? parsed.sources : [];
        const loadedJobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];

        for (const source of loadedSources) {
            if (!isRecord(source) || typeof source.id !== 'string' || typeof source.file_path !== 'string') {
                continue;
            }

            if (!fs.existsSync(source.file_path)) {
                continue;
            }

            sources.set(source.id, {
                ...source,
                preview_path: typeof source.preview_path === 'string' && fs.existsSync(source.preview_path)
                    ? source.preview_path
                    : null
            });
        }

        for (const job of loadedJobs) {
            if (!isRecord(job) || typeof job.id !== 'string' || typeof job.source_id !== 'string' || !Array.isArray(job.outputs)) {
                continue;
            }

            const nextOutputs = job.outputs.map((output) => {
                if (!isRecord(output) || typeof output.file_path !== 'string') {
                    return null;
                }

                const completedExists = output.status === 'COMPLETED' && fs.existsSync(output.file_path);
                if ((output.status === 'QUEUED' || output.status === 'PROCESSING') || (output.status === 'COMPLETED' && !completedExists)) {
                    return {
                        ...output,
                        status: 'FAILED',
                        error_message: 'Helper был перезапущен до завершения рендера.'
                    };
                }

                return output;
            }).filter(Boolean);

            if (!sources.has(job.source_id) || nextOutputs.length === 0) {
                continue;
            }

            const processedCount = nextOutputs.filter((output) => output.status === 'COMPLETED').length;
            const failedOutput = nextOutputs.find((output) => output.status === 'FAILED');

            jobs.set(job.id, {
                ...job,
                status: failedOutput ? 'FAILED' : job.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
                outputs: nextOutputs,
                processed_count: processedCount,
                total_count: nextOutputs.length,
                error_message: failedOutput ? failedOutput.error_message || 'Helper был перезапущен до завершения рендера.' : job.error_message,
                updated_at: new Date().toISOString()
            });
        }
    } catch {
        // Fresh start.
    }

    await cleanupOldAssets().catch(() => undefined);
    await getHealthInfo();

    const upload = multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => cb(null, sourceRoot),
            filename: (_req, file, cb) => {
                const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
                cb(null, `${uniqueSuffix}${path.extname(file.originalname).toLowerCase() || '.mp4'}`);
            }
        }),
        fileFilter: (_req, file, cb) => {
            const extension = path.extname(file.originalname).toLowerCase();
            const allowedExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm']);
            if ((file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream' || !file.mimetype) && allowedExtensions.has(extension)) {
                cb(null, true);
                return;
            }

            cb(new Error('Для источника разрешены только mp4, mov, m4v и webm.'), false);
        },
        limits: {
            files: 1,
            fileSize: 1024 * 1024 * 1024
        }
    });

    app.use(express.json({ limit: '2mb' }));
    app.use((req, res, next) => {
        if (!isLoopbackAddress(req.socket.remoteAddress)) {
            res.status(403).json({ error: 'Helper принимает запросы только с loopback-интерфейса.' });
            return;
        }

        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
        const isAllowedOrigin = origin ? allowedOriginSet.has(origin) : false;

        if (origin && isAllowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Stones-Video-Helper-Version');
        }

        if (req.method === 'OPTIONS') {
            if (!origin || !isAllowedOrigin) {
                res.status(403).json({ error: 'Origin helper запроса не разрешён.' });
                return;
            }

            res.sendStatus(204);
            return;
        }

        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
        if (origin && !isAllowedOrigin) {
            res.status(403).json({ error: 'Origin helper запроса не разрешён.' });
            return;
        }

        if (isMutating) {
            if (!origin || !isAllowedOrigin) {
                res.status(403).json({ error: 'Mutating helper requests требуют разрешённый Origin.' });
                return;
            }

            const protocolHeader = typeof req.headers['x-stones-video-helper-version'] === 'string'
                ? req.headers['x-stones-video-helper-version']
                : '';
            if (protocolHeader !== HELPER_PROTOCOL_VERSION) {
                res.status(426).json({
                    error: 'Версия helper protocol не совпадает с web UI.',
                    protocol_version: HELPER_PROTOCOL_VERSION,
                    helper_version: helperVersion
                });
                return;
            }
        }

        next();
    });

    app.get('/health', async (_req, res) => {
        try {
            res.json(await getHealthInfo());
        } catch (error) {
            res.status(500).json({
                ok: false,
                helper_version: helperVersion,
                protocol_version: HELPER_PROTOCOL_VERSION,
                error: error instanceof Error ? error.message : 'Не удалось проверить ffmpeg/ffprobe.'
            });
        }
    });

    app.post('/maintenance/cleanup', async (_req, res) => {
        try {
            const removed = await cleanupOldAssets();
            res.json({
                success: true,
                ...removed,
                health: await getHealthInfo()
            });
        } catch (error) {
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Не удалось очистить helper cache.'
            });
        }
    });

    app.post('/sources', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Не передан исходный видеофайл.' });
            }

            await ensureEnoughDiskSpace(req.file.size);

            const probe = await probeSource(ffprobePath, req.file.path);
            if (probe.durationMs <= 0) {
                throw new Error('Не удалось определить длительность исходного ролика.');
            }

            if (probe.durationMs > maxSourceDurationMs) {
                throw new Error(`Исходный ролик длиннее допустимого лимита ${Math.round(maxSourceDurationMs / 60000)} минут.`);
            }

            const sourceId = crypto.randomUUID();
            const sourceRecord = {
                id: sourceId,
                original_name: req.file.originalname,
                file_path: req.file.path,
                preview_path: null,
                size: req.file.size,
                duration_ms: probe.durationMs,
                has_audio: probe.hasAudio,
                created_at: new Date().toISOString()
            };

            if (shouldGeneratePreview(req.file.originalname, probe)) {
                const previewPath = path.join(previewRoot, `${sourceId}.mp4`);
                try {
                    await renderPreviewFile(ffmpegPath, sourceRecord, previewPath);
                    sourceRecord.preview_path = previewPath;
                } catch (previewError) {
                    console.warn('[video-export-helper] preview render failed', previewError);
                    await fsp.rm(previewPath, { force: true }).catch(() => undefined);
                }
            }

            sources.set(sourceId, sourceRecord);
            await persistState();

            res.status(201).json({
                source_id: sourceRecord.id,
                duration_ms: sourceRecord.duration_ms,
                has_audio: sourceRecord.has_audio,
                video_codec: probe.videoCodec,
                format_name: probe.formatName,
                preview_url: sourceRecord.preview_path
                    ? buildHelperUrl(`/sources/${sourceRecord.id}/preview`)
                    : undefined,
                fingerprint: {
                    name: sourceRecord.original_name,
                    size: sourceRecord.size,
                    lastModified: Number(req.body.lastModified) || 0,
                    durationMs: sourceRecord.duration_ms
                }
            });
        } catch (error) {
            if (req.file?.path) {
                await fsp.rm(req.file.path, { force: true }).catch(() => undefined);
            }

            res.status(500).json({
                error: error instanceof Error ? error.message : 'Не удалось принять исходный видеофайл.'
            });
        }
    });

    app.get('/sources/:id/preview', (req, res) => {
        const source = sources.get(req.params.id);
        if (!source || !source.preview_path) {
            return res.status(404).json({ error: 'Preview для исходника не найден.' });
        }

        if (!fs.existsSync(source.preview_path)) {
            return res.status(404).json({ error: 'Preview-файл отсутствует на диске.' });
        }

        res.setHeader('Content-Type', 'video/mp4');
        res.sendFile(source.preview_path);
    });

    app.post('/render-jobs', async (req, res) => {
        try {
            const sourceId = typeof req.body.source_id === 'string' ? req.body.source_id : '';
            const source = sources.get(sourceId);
            if (!source) {
                return res.status(404).json({ error: 'Исходный файл для рендера не найден в helper.' });
            }

            const crossfadeMs = typeof req.body.crossfade_ms === 'number'
                ? req.body.crossfade_ms
                : Number(req.body.crossfade_ms);
            if (!Number.isFinite(crossfadeMs) || crossfadeMs < 0 || crossfadeMs > 5000) {
                return res.status(400).json({ error: 'crossfade_ms должен быть числом от 0 до 5000.' });
            }

            const segments = normalizeSegments(req.body.segments);
            const outputs = normalizeOutputs(req.body.outputs);
            const invalidOutput = outputs.find((output) => output.segment_seq >= segments.length);
            if (invalidOutput) {
                return res.status(400).json({ error: 'Один из outputs ссылается на отсутствующий товарный сегмент.' });
            }

            await ensureEnoughDiskSpace(estimateRenderBytes(source, outputs.length));

            const jobId = crypto.randomUUID();
            const jobDir = path.join(jobRoot, jobId);
            await ensureDirectory(jobDir);

            const job = {
                id: jobId,
                source_id: source.id,
                status: 'QUEUED',
                crossfade_ms: crossfadeMs,
                processed_count: 0,
                total_count: outputs.length,
                error_message: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                outputs: outputs.map((output) => ({
                    serial_number: output.serial_number,
                    segment_seq: output.segment_seq,
                    status: 'QUEUED',
                    file_name: `${output.serial_number}.mp4`,
                    file_path: path.join(jobDir, `${output.serial_number}.mp4`),
                    error_message: null
                }))
            };

            jobs.set(jobId, job);
            await persistState();
            void processRenderJob(jobId, source, segments);

            res.status(202).json({
                job_id: job.id,
                status: job.status,
                processed_count: job.processed_count,
                total_count: job.total_count,
                outputs: job.outputs.map((output) => ({
                    serial_number: output.serial_number,
                    segment_seq: output.segment_seq,
                    status: output.status,
                    error_message: output.error_message
                }))
            });
        } catch (error) {
            res.status(400).json({
                error: error instanceof Error ? error.message : 'Не удалось создать render job.'
            });
        }
    });

    app.get('/render-jobs/:id', (req, res) => {
        const job = jobs.get(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Render job не найден.' });
        }

        res.json({
            job_id: job.id,
            source_id: job.source_id,
            status: job.status,
            crossfade_ms: job.crossfade_ms,
            processed_count: job.processed_count,
            total_count: job.total_count,
            error_message: job.error_message,
            created_at: job.created_at,
            updated_at: job.updated_at,
            outputs: job.outputs.map((output) => ({
                serial_number: output.serial_number,
                segment_seq: output.segment_seq,
                status: output.status,
                error_message: output.error_message
            }))
        });
    });

    app.get('/render-jobs/:id/files/:serial', async (req, res) => {
        const job = jobs.get(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Render job не найден.' });
        }

        const output = job.outputs.find((entry) => entry.serial_number === req.params.serial.trim().toUpperCase());
        if (!output) {
            return res.status(404).json({ error: 'Файл для указанного serial_number не найден.' });
        }

        if (output.status !== 'COMPLETED') {
            return res.status(409).json({ error: 'Файл ещё не готов к скачиванию.' });
        }

        res.setHeader('Content-Type', 'video/mp4');
        res.sendFile(output.file_path);
    });

    app.post('/render-jobs/:id/cleanup', async (req, res) => {
        const job = jobs.get(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Render job не найден.' });
        }

        await removeJobArtifacts(job.id);
        res.json({ success: true });
    });

    app.use((error, _req, res, _next) => {
        console.error('[video-export-helper] request failed', error);

        const statusCode = error instanceof multer.MulterError
            ? 400
            : typeof error?.statusCode === 'number'
                ? Number(error.statusCode)
                : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Внутренняя ошибка video-export-helper.';

        if (res.headersSent) {
            return;
        }

        res.status(statusCode).json({ error: message });
    });

    const server = await new Promise((resolve) => {
        const nextServer = app.listen(port, host, () => resolve(nextServer));
    });

    return {
        app,
        server,
        host,
        port,
        storageRoot,
        allowedOrigins,
        helperVersion,
        protocolVersion: HELPER_PROTOCOL_VERSION,
        ffmpegPath,
        ffprobePath,
        getHealthInfo,
        cleanupOldAssets,
        stop: async () => new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        })
    };
}
