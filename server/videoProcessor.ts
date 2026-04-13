import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
    buildVideoJobPublicOutputDir,
    buildVideoJobPublicRelativePath,
    buildVideoJobPublicUrl,
    buildVideoJobWorkDir,
    ensureVideoProcessingDirectories,
    padVideoSequence,
    parseSourceManifest,
    sanitizeVideoOutputSegment,
    sortBatchItemsForVideoAssignment,
    type VideoResultManifestEntry
} from './services/videoProcessing.ts';
import { resolveProjectPath } from './utils/projectPaths.ts';

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = Number.parseInt(process.env.VIDEO_PROCESSOR_POLL_MS || '3000', 10) || 3000;

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

const log = (...args: unknown[]) => {
    console.log('[video-processor]', ...args);
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

const normalizeClip = async (inputPath: string, outputPath: string, profile: ProbeInfo, inputProbe: ProbeInfo) => {
    const scaleFilter = `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${profile.fps},setsar=1`;
    const baseArgs = [
        '-map', '0:v:0',
        '-vf', scaleFilter,
        '-r', profile.fps,
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

const concatNormalizedClips = async (baseClipPath: string, tailClipPath: string, outputPath: string, listPath: string, profile: ProbeInfo) => {
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
    } catch {
        await runBinary('ffmpeg', [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
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
    }
};

const claimNextQueuedJob = async (): Promise<ClaimedVideoJob | null> => {
    const nextQueuedJob = await prisma.videoProcessingJob.findFirst({
        where: { status: 'QUEUED' },
        orderBy: { created_at: 'asc' },
        select: { id: true }
    });

    if (!nextQueuedJob) {
        return null;
    }

    const claimResult = await prisma.videoProcessingJob.updateMany({
        where: {
            id: nextQueuedJob.id,
            status: 'QUEUED'
        },
        data: {
            status: 'PROCESSING',
            started_at: new Date(),
            finished_at: null,
            error_message: null,
            processed_output_count: 0
        }
    });

    if (claimResult.count === 0) {
        return null;
    }

    return prisma.videoProcessingJob.findUnique({
        where: { id: nextQueuedJob.id },
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

const processJob = async (job: ClaimedVideoJob) => {
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
    try {
        const baseProbe = await probeFile(baseSource.absolutePath);
        const normalizedBasePath = path.join(workDir, `normalized-${baseSource.stored_name}.mp4`);
        await normalizeClip(baseSource.absolutePath, normalizedBasePath, baseProbe, baseProbe);

        const resultManifest: VideoResultManifestEntry[] = [];
        const subsequentFiles = sourceFiles.slice(1);
        for (let index = 0; index < subsequentFiles.length; index += 1) {
            const inputFile = subsequentFiles[index];
            const item = orderedItems[index];
            if (!item) {
                throw new Error('Не удалось сопоставить итоговое видео с Item партии.');
            }

            const inputProbe = await probeFile(inputFile.absolutePath);
            const normalizedTailPath = path.join(workDir, `normalized-${inputFile.stored_name}.mp4`);
            const concatListPath = path.join(workDir, `concat-${padVideoSequence(index + 1)}.txt`);
            const outputFileName = `${padVideoSequence(index + 1)}-${sanitizeVideoOutputSegment(item.temp_id)}.mp4`;
            const outputPath = path.join(outputDir, outputFileName);

            await normalizeClip(inputFile.absolutePath, normalizedTailPath, baseProbe, inputProbe);
            await concatNormalizedClips(normalizedBasePath, normalizedTailPath, outputPath, concatListPath, baseProbe);

            resultManifest.push({
                sequence: index + 1,
                item_id: item.id,
                temp_id: item.temp_id,
                item_seq: item.item_seq,
                file_name: outputFileName,
                relative_path: buildVideoJobPublicRelativePath(job.batch_id, job.version, outputFileName),
                public_url: buildVideoJobPublicUrl(job.batch_id, job.version, outputFileName)
            });

            processedOutputs = index + 1;
            await prisma.videoProcessingJob.update({
                where: { id: job.id },
                data: {
                    processed_output_count: processedOutputs
                }
            });
        }

        await prisma.$transaction(async (tx) => {
            for (const result of resultManifest) {
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
                    processed_output_count: resultManifest.length,
                    result_manifest: resultManifest as Prisma.InputJsonValue,
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
    } catch (error) {
        await safeRemove(workDir);
        await safeRemove(outputDir);
        throw Object.assign(error instanceof Error ? error : new Error('Неизвестная ошибка обработки видео.'), {
            processedOutputs
        });
    }
};

const assertBinaryExists = async (binary: string) => {
    await runBinary(binary, ['-version']);
};

const workerLoop = async () => {
    while (true) {
        let job: ClaimedVideoJob | null = null;
        try {
            job = await claimNextQueuedJob();
        } catch (error) {
            log('Polling error', error);
            await sleep(POLL_INTERVAL_MS);
            continue;
        }

        if (!job) {
            await sleep(POLL_INTERVAL_MS);
            continue;
        }

        log(`Processing job ${job.id} for batch ${job.batch_id}`);

        try {
            await processJob(job);
            log(`Completed job ${job.id}`);
        } catch (error) {
            const processedOutputs = typeof (error as { processedOutputs?: unknown })?.processedOutputs === 'number'
                ? Number((error as { processedOutputs: number }).processedOutputs)
                : job.processed_output_count;
            const message = error instanceof Error ? error.message : 'Не удалось обработать видео-комплект.';
            await markJobFailed(job.id, message, processedOutputs);
            log(`Failed job ${job.id}: ${message}`);
        }
    }
};

const main = async () => {
    ensureVideoProcessingDirectories();
    await assertBinaryExists('ffprobe');
    await assertBinaryExists('ffmpeg');
    log(`Worker started with poll interval ${POLL_INTERVAL_MS}ms`);
    await workerLoop();
};

main().catch((error) => {
    console.error('[video-processor] Fatal error', error);
    process.exitCode = 1;
}).finally(async () => {
    await prisma.$disconnect();
});
