import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { PrismaClient, Prisma } from '@prisma/client';
import {
    buildVideoJobPublicOutputDir,
    buildVideoJobPublicRelativePath,
    buildVideoJobPublicUrl,
    buildVideoJobWorkDir,
    ensureVideoProcessingDirectories,
    getVideoProcessorRuntimeConfig,
    padVideoSequence,
    parseSourceManifest,
    sanitizeVideoOutputSegment,
    sortBatchItemsForVideoAssignment,
    type VideoProcessorRuntimeConfig,
    type VideoResultManifestEntry
} from './services/videoProcessing.ts';
import { resolveProjectPath } from './utils/projectPaths.ts';

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);

type ClaimedVideoJob = Prisma.VideoProcessingJobGetPayload<{
    include: {
        batch: {
            include: {
                items: {
                    select: {
                        id: true;
                        temp_id: true;
                        item_seq: true;
                    };
                };
            };
        };
    };
}>;

type ProbeInfo = {
    width: number;
    height: number;
    fps: string;
    sampleRate: number;
    channels: number;
    hasAudio: boolean;
};

const sleep = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));
const parseBooleanEnv = (value: string | undefined) =>
    typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
const VIDEO_PIPELINE_DIAGNOSTICS = parseBooleanEnv(process.env.VIDEO_PIPELINE_DIAGNOSTICS);
let activeProcessingJobs = 0;

const log = (...args: unknown[]) => {
    console.log('[video-processor]', ...args);
};

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
        component: 'video-processor',
        ...fields
    })
        .map(([key, value]) => {
            const formatted = formatDiagnosticValue(value);
            return formatted === null ? null : `${key}=${formatted}`;
        })
        .filter(Boolean)
        .join(' ');

    if (payload) {
        log(payload);
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

const ensureDir = async (directory: string) => {
    await fs.mkdir(directory, { recursive: true });
};

const safeRemove = async (targetPath: string) => {
    await fs.rm(targetPath, { recursive: true, force: true }).catch(() => undefined);
};

const runBinary = async (binary: string, args: string[]) => {
    return execFileAsync(binary, args, {
        maxBuffer: 16 * 1024 * 1024
    });
};

const parseFrameRate = (rawValue: unknown): string => {
    if (typeof rawValue !== 'string' || !rawValue.includes('/')) {
        return '30';
    }

    const [rawNumerator, rawDenominator] = rawValue.split('/');
    const numerator = Number(rawNumerator);
    const denominator = Number(rawDenominator);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return '30';
    }

    const value = numerator / denominator;
    if (!Number.isFinite(value) || value <= 0) {
        return '30';
    }

    return String(Number(value.toFixed(3)));
};

const normalizeDimension = (value: unknown, fallback: number) => {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallback;
    }

    const rounded = Math.max(2, Math.round(numericValue));
    return rounded % 2 === 0 ? rounded : rounded + 1;
};

const normalizeAudioChannels = (value: unknown) => {
    const numericValue = typeof value === 'number' ? value : Number(value);
    return numericValue === 1 ? 1 : 2;
};

const channelLayoutFor = (channels: number) => channels === 1 ? 'mono' : 'stereo';

const escapeConcatPath = (inputPath: string) => inputPath.replace(/'/g, `'\\''`);

const probeFile = async (inputPath: string): Promise<ProbeInfo> => {
    const { stdout } = await runBinary('ffprobe', [
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        inputPath
    ]);

    const parsed = JSON.parse(stdout) as { streams?: Array<Record<string, unknown>> };
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const videoStream = streams.find((stream) => stream.codec_type === 'video');
    if (!videoStream) {
        throw new Error(`ffprobe не нашёл видеодорожку в файле ${path.basename(inputPath)}.`);
    }

    const audioStream = streams.find((stream) => stream.codec_type === 'audio');

    return {
        width: normalizeDimension(videoStream.width, 1920),
        height: normalizeDimension(videoStream.height, 1080),
        fps: parseFrameRate(videoStream.avg_frame_rate ?? videoStream.r_frame_rate),
        sampleRate: audioStream && audioStream.sample_rate ? Number(audioStream.sample_rate) || 48000 : 48000,
        channels: normalizeAudioChannels(audioStream?.channels),
        hasAudio: Boolean(audioStream)
    };
};

const normalizeClip = async (
    inputPath: string,
    outputPath: string,
    profile: ProbeInfo,
    inputProbe: ProbeInfo,
    ffmpegThreads: number
) => {
    const scaleFilter = `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${profile.fps},setsar=1`;
    const baseArgs = [
        '-map', '0:v:0',
        '-vf', scaleFilter,
        '-r', profile.fps,
        '-threads', String(ffmpegThreads),
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', String(profile.sampleRate),
        '-ac', String(profile.channels),
        '-movflags', '+faststart'
    ];

    if (inputProbe.hasAudio) {
        await runBinary('ffmpeg', [
            '-y',
            '-i', inputPath,
            ...baseArgs,
            '-map', '0:a:0',
            outputPath
        ]);
        return;
    }

    await runBinary('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-f', 'lavfi',
        '-i', `anullsrc=channel_layout=${channelLayoutFor(profile.channels)}:sample_rate=${profile.sampleRate}`,
        ...baseArgs,
        '-map', '1:a:0',
        '-shortest',
        outputPath
    ]);
};

const concatNormalizedClips = async (
    baseClipPath: string,
    tailClipPath: string,
    outputPath: string,
    listPath: string,
    profile: ProbeInfo,
    ffmpegThreads: number
) => {
    await fs.writeFile(
        listPath,
        `file '${escapeConcatPath(baseClipPath)}'\nfile '${escapeConcatPath(tailClipPath)}'\n`,
        'utf8'
    );

    try {
        await runBinary('ffmpeg', [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-c', 'copy',
            '-movflags', '+faststart',
            outputPath
        ]);
        return { usedFallback: false };
    } catch {
        await runBinary('ffmpeg', [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-threads', String(ffmpegThreads),
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ar', String(profile.sampleRate),
            '-ac', String(profile.channels),
            '-movflags', '+faststart',
            outputPath
        ]);
        return { usedFallback: true };
    }
};

const claimNextQueuedJob = async (): Promise<ClaimedVideoJob | null> => {
    return prisma.$transaction(async (tx) => {
        const [candidate] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id
            FROM video_processing_jobs
            WHERE status = 'QUEUED'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `);

        if (!candidate) {
            return null;
        }

        await tx.videoProcessingJob.update({
            where: { id: candidate.id },
            data: {
                status: 'PROCESSING',
                started_at: new Date(),
                finished_at: null,
                error_message: null,
                processed_output_count: 0
            }
        });

        return tx.videoProcessingJob.findUnique({
            where: { id: candidate.id },
            include: {
                batch: {
                    include: {
                        items: {
                            select: {
                                id: true,
                                temp_id: true,
                                item_seq: true
                            }
                        }
                    }
                }
            }
        });
    });
};

const markJobFailed = async (jobId: string, message: string, processedOutputCount: number) => {
    await prisma.videoProcessingJob.update({
        where: { id: jobId },
        data: {
            status: 'FAILED',
            error_message: message,
            processed_output_count: processedOutputCount,
            finished_at: new Date()
        }
    });
};

const runWithConcurrency = async (
    totalCount: number,
    concurrency: number,
    worker: (index: number) => Promise<void>
) => {
    if (totalCount === 0) {
        return;
    }

    let nextIndex = 0;
    let firstError: unknown = null;

    const runner = async () => {
        while (true) {
            if (firstError) {
                return;
            }

            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= totalCount) {
                return;
            }

            try {
                await worker(currentIndex);
            } catch (error) {
                firstError ??= error;
                return;
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, totalCount) }, () => runner()));

    if (firstError) {
        throw firstError;
    }
};

const processJob = async (job: ClaimedVideoJob, config: VideoProcessorRuntimeConfig) => {
    if (!job.batch) {
        throw new Error('Для задания не найдена партия.');
    }

    if (job.batch.status !== 'RECEIVED') {
        throw new Error('Видео-комплект можно обрабатывать только для партии в статусе RECEIVED.');
    }

    const orderedItems = sortBatchItemsForVideoAssignment(job.batch.items);
    if (orderedItems.length !== job.output_count) {
        throw new Error(`Количество Item в партии изменилось: ожидалось ${job.output_count}, получено ${orderedItems.length}.`);
    }

    const sourceManifest = parseSourceManifest(job.source_manifest);
    if (sourceManifest.length !== job.source_count || sourceManifest.length !== orderedItems.length + 1) {
        throw new Error('Source manifest задания поврежден или не соответствует партии.');
    }

    const sourceFiles = sourceManifest.map((entry) => ({
        ...entry,
        absolutePath: resolveProjectPath(entry.relative_path)
    })).sort((left, right) => left.sequence - right.sequence);

    for (const file of sourceFiles) {
        await fs.access(file.absolutePath);
    }

    const baseSource = sourceFiles[0];
    if (!baseSource) {
        throw new Error('В задании отсутствует базовый клип.');
    }

    const workDir = buildVideoJobWorkDir(job.id);
    const outputDir = buildVideoJobPublicOutputDir(job.batch_id, job.version);
    await safeRemove(workDir);
    await safeRemove(outputDir);
    await ensureDir(workDir);
    await ensureDir(outputDir);

    let processedOutputs = 0;
    let activeTailTasks = 0;
    const jobStartedAt = Date.now();
    logDiagnostic({
        event: 'summary',
        stage: 'job',
        status: 'started',
        duration_ms: 0,
        job_id: job.id,
        batch_id: job.batch_id,
        source_count: sourceFiles.length,
        output_count: job.output_count,
        processed_output_count: processedOutputs,
        active_jobs: activeProcessingJobs,
        job_concurrency: config.jobConcurrency,
        ffmpeg_threads: config.ffmpegThreads
    });
    try {
        const baseProbe = await runDiagnosticStage(
            'probe',
            {
                job_id: job.id,
                batch_id: job.batch_id,
                clip_role: 'base',
                clip_index: baseSource.sequence,
                active_jobs: activeProcessingJobs,
                active_tasks: activeTailTasks
            },
            () => probeFile(baseSource.absolutePath),
            (result) => ({ has_audio: result.hasAudio })
        );
        const normalizedBasePath = path.join(workDir, `normalized-${baseSource.stored_name}.mp4`);
        await runDiagnosticStage(
            'normalize',
            {
                job_id: job.id,
                batch_id: job.batch_id,
                clip_role: 'base',
                clip_index: baseSource.sequence,
                active_jobs: activeProcessingJobs,
                active_tasks: activeTailTasks,
                ffmpeg_threads: config.ffmpegThreads
            },
            () => normalizeClip(baseSource.absolutePath, normalizedBasePath, baseProbe, baseProbe, config.ffmpegThreads)
        );

        const subsequentFiles = sourceFiles.slice(1);
        const resultManifest = new Array<VideoResultManifestEntry | undefined>(subsequentFiles.length);

        await runWithConcurrency(subsequentFiles.length, config.jobConcurrency, async (index) => {
            const inputFile = subsequentFiles[index];
            const item = orderedItems[index];
            if (!inputFile || !item) {
                throw new Error('Не удалось сопоставить итоговое видео с Item партии.');
            }

            activeTailTasks += 1;
            try {
                const inputProbe = await runDiagnosticStage(
                    'probe',
                    {
                        job_id: job.id,
                        batch_id: job.batch_id,
                        clip_role: 'tail',
                        clip_index: inputFile.sequence,
                        active_jobs: activeProcessingJobs,
                        active_tasks: activeTailTasks
                    },
                    () => probeFile(inputFile.absolutePath),
                    (result) => ({ has_audio: result.hasAudio })
                );
                const normalizedTailPath = path.join(workDir, `normalized-${inputFile.stored_name}.mp4`);
                const concatListPath = path.join(workDir, `concat-${padVideoSequence(index + 1)}.txt`);
                const outputFileName = `${padVideoSequence(index + 1)}-${sanitizeVideoOutputSegment(item.temp_id)}.mp4`;
                const outputPath = path.join(outputDir, outputFileName);

                await runDiagnosticStage(
                    'normalize',
                    {
                        job_id: job.id,
                        batch_id: job.batch_id,
                        clip_role: 'tail',
                        clip_index: inputFile.sequence,
                        active_jobs: activeProcessingJobs,
                        active_tasks: activeTailTasks,
                        ffmpeg_threads: config.ffmpegThreads
                    },
                    () => normalizeClip(inputFile.absolutePath, normalizedTailPath, baseProbe, inputProbe, config.ffmpegThreads)
                );
                await runDiagnosticStage(
                    'final_concat',
                    {
                        job_id: job.id,
                        batch_id: job.batch_id,
                        output_index: index + 1,
                        active_jobs: activeProcessingJobs,
                        active_tasks: activeTailTasks,
                        ffmpeg_threads: config.ffmpegThreads
                    },
                    () => concatNormalizedClips(normalizedBasePath, normalizedTailPath, outputPath, concatListPath, baseProbe, config.ffmpegThreads),
                    (result) => ({ fallback_reencode: result.usedFallback })
                );

                resultManifest[index] = {
                    sequence: index + 1,
                    item_id: item.id,
                    temp_id: item.temp_id,
                    item_seq: item.item_seq,
                    file_name: outputFileName,
                    relative_path: buildVideoJobPublicRelativePath(job.batch_id, job.version, outputFileName),
                    public_url: buildVideoJobPublicUrl(job.batch_id, job.version, outputFileName)
                };

                await prisma.videoProcessingJob.update({
                    where: { id: job.id },
                    data: {
                        processed_output_count: {
                            increment: 1
                        }
                    }
                });
                processedOutputs += 1;
            } finally {
                activeTailTasks = Math.max(0, activeTailTasks - 1);
            }
        });

        const completedManifest = resultManifest.flatMap((entry) => entry ? [entry] : []);
        if (completedManifest.length !== subsequentFiles.length) {
            throw new Error('Не удалось собрать полный result manifest для задания.');
        }

        await prisma.$transaction(async (tx) => {
            for (const result of completedManifest) {
                await tx.item.update({
                    where: { id: result.item_id },
                    data: {
                        item_video_url: result.public_url
                    }
                });
            }

            await tx.videoProcessingJob.update({
                where: { id: job.id },
                data: {
                    status: 'COMPLETED',
                    processed_output_count: completedManifest.length,
                    result_manifest: completedManifest as Prisma.InputJsonValue,
                    error_message: null,
                    finished_at: new Date()
                }
            });
        });

        const completedOlderJobs = await prisma.videoProcessingJob.findMany({
            where: {
                batch_id: job.batch_id,
                status: 'COMPLETED',
                version: {
                    not: job.version
                }
            },
            select: { version: true }
        });

        await Promise.all([
            safeRemove(path.join(path.dirname(workDir))),
            ...completedOlderJobs.map((completedJob) => safeRemove(buildVideoJobPublicOutputDir(job.batch_id, completedJob.version)))
        ]);
        logDiagnostic({
            event: 'summary',
            stage: 'job',
            status: 'completed',
            duration_ms: Date.now() - jobStartedAt,
            job_id: job.id,
            batch_id: job.batch_id,
            source_count: sourceFiles.length,
            output_count: job.output_count,
            processed_output_count: completedManifest.length,
            active_jobs: activeProcessingJobs,
            job_concurrency: config.jobConcurrency,
            ffmpeg_threads: config.ffmpegThreads
        });
    } catch (error) {
        await safeRemove(workDir);
        await safeRemove(outputDir);
        logDiagnostic({
            event: 'summary',
            stage: 'job',
            status: 'failed',
            duration_ms: Date.now() - jobStartedAt,
            job_id: job.id,
            batch_id: job.batch_id,
            source_count: sourceFiles.length,
            output_count: job.output_count,
            processed_output_count: processedOutputs,
            active_jobs: activeProcessingJobs,
            job_concurrency: config.jobConcurrency,
            ffmpeg_threads: config.ffmpegThreads
        });
        throw Object.assign(error instanceof Error ? error : new Error('Неизвестная ошибка обработки видео.'), {
            processedOutputs
        });
    }
};

const assertBinaryExists = async (binary: string) => {
    await runBinary(binary, ['-version']);
};

const workerLoop = async (workerIndex: number, config: VideoProcessorRuntimeConfig) => {
    while (true) {
        let job: ClaimedVideoJob | null = null;
        try {
            job = await claimNextQueuedJob();
        } catch (error) {
            log(`Worker ${workerIndex}: polling error`, error);
            await sleep(config.pollIntervalMs);
            continue;
        }

        if (!job) {
            await sleep(config.pollIntervalMs);
            continue;
        }

        log(`Worker ${workerIndex}: processing job ${job.id} for batch ${job.batch_id}`);

        try {
            activeProcessingJobs += 1;
            await processJob(job, config);
            log(`Worker ${workerIndex}: completed job ${job.id}`);
        } catch (error) {
            const processedOutputs = typeof (error as { processedOutputs?: unknown })?.processedOutputs === 'number'
                ? Number((error as { processedOutputs: number }).processedOutputs)
                : job.processed_output_count;
            const message = error instanceof Error ? error.message : 'Не удалось обработать видео-комплект.';
            await markJobFailed(job.id, message, processedOutputs);
            log(`Worker ${workerIndex}: failed job ${job.id}: ${message}`);
        } finally {
            activeProcessingJobs = Math.max(0, activeProcessingJobs - (job ? 1 : 0));
        }
    }
};

const main = async () => {
    const config = getVideoProcessorRuntimeConfig();
    ensureVideoProcessingDirectories();
    await assertBinaryExists('ffprobe');
    await assertBinaryExists('ffmpeg');
    log(
        `Started with poll=${config.pollIntervalMs}ms workers=${config.workerCount} jobConcurrency=${config.jobConcurrency} ffmpegThreads=${config.ffmpegThreads}`
    );
    await Promise.all(
        Array.from({ length: config.workerCount }, (_, index) => workerLoop(index + 1, config))
    );
};

main().catch((error) => {
    console.error('[video-processor] Fatal error', error);
    process.exitCode = 1;
}).finally(async () => {
    await prisma.$disconnect();
});
