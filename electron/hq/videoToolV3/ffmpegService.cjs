const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
const OUTPUT_FPS = 24;
const MAX_SOURCE_DURATION_MS = 60 * 60 * 1000;

const QUALITY_PRESETS = {
    fast: { preset: 'veryfast', crf: 28 },
    standard: { preset: 'medium', crf: 23 },
    high: { preset: 'slow', crf: 20 }
};

const isAsarPath = (value) => typeof value === 'string' && /(^|[\\/])app\.asar([\\/]|$)/.test(value);
const toUnpackedAsarPath = (value) => String(value || '').replace(/(^|[\\/])app\.asar([\\/]|$)/, (match) => match.replace('app.asar', 'app.asar.unpacked'));

const resolveBinaryPath = (configuredPath, fallback) => {
    const candidate = configuredPath || fallback;
    const unpacked = isAsarPath(candidate) ? toUnpackedAsarPath(candidate) : '';

    if (unpacked) {
        if (fs.existsSync(unpacked)) {
            return unpacked;
        }
        return unpacked;
    }

    if (candidate && fs.existsSync(candidate)) {
        return candidate;
    }

    return fallback;
};

const ffmpegPath = () => resolveBinaryPath(process.env.FFMPEG_PATH, ffmpegStatic || 'ffmpeg');
const ffprobePath = () => resolveBinaryPath(process.env.FFPROBE_PATH, ffprobeStatic?.path || 'ffprobe');

const parseJson = (raw, label) => {
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error(`${label} вернул некорректный JSON.`);
    }
};

const normalizeNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const getDurationMs = (format, stream) => {
    const streamDuration = normalizeNumber(stream?.duration);
    const formatDuration = normalizeNumber(format?.duration);
    const durationSec = streamDuration > 0 ? streamDuration : formatDuration;
    return Math.round(durationSec * 1000);
};

const classifyFfmpegError = (message) => {
    if (/spawn .*?(ENOENT|ENOTDIR|EACCES)|ENOENT|ENOTDIR|EACCES/i.test(message)) {
        return 'FFmpeg не найден или недоступен. Переустановите HQ Desktop или проверьте сборку приложения.';
    }
    if (/No space left on device|ENOSPC/i.test(message)) {
        return 'Недостаточно места для обработки видео.';
    }
    if (/Invalid data found|moov atom not found|Output file is empty|Conversion failed/i.test(message)) {
        return 'Исходный файл не удалось прочитать. Выберите другой файл.';
    }
    return message || 'FFmpeg завершился с ошибкой.';
};

const toSec = (valueMs) => {
    const numeric = Number(valueMs);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return '0';
    }
    return (numeric / 1000).toFixed(3);
};

class FfmpegService {
    constructor({ fileStore }) {
        if (!fileStore) {
            throw new Error('FfmpegService requires fileStore.');
        }
        this.fileStore = fileStore;
    }

    async probe(inputPath) {
        const stat = await fsp.stat(inputPath).catch((error) => {
            if (error?.code === 'ENOENT') {
                const missing = new Error('Исходный файл не найден.');
                missing.code = 'SOURCE_MISSING';
                throw missing;
            }
            throw error;
        });

        if (!stat.isFile() || stat.size <= 0) {
            throw new Error('Исходный файл не удалось прочитать. Выберите другой файл.');
        }

        const { stdout } = await this.runProcess(ffprobePath(), [
            '-v', 'error',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            inputPath
        ]);
        const parsed = parseJson(stdout, 'ffprobe');
        const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
        const videoStream = streams.find((stream) => stream?.codec_type === 'video');
        if (!videoStream) {
            throw new Error('Исходный файл не удалось прочитать. Выберите другой файл.');
        }

        const width = Math.round(normalizeNumber(videoStream.width));
        const height = Math.round(normalizeNumber(videoStream.height));
        const durationMs = getDurationMs(parsed.format, videoStream);
        if (width <= 0 || height <= 0 || durationMs <= 0) {
            throw new Error('Исходный файл не удалось прочитать. Выберите другой файл.');
        }
        if (durationMs > MAX_SOURCE_DURATION_MS) {
            throw new Error('Видео длиннее 60 минут не поддерживается.');
        }

        return {
            width,
            height,
            durationMs,
            sizeBytes: stat.size,
            formatName: parsed.format?.format_name || null,
            videoCodec: videoStream.codec_name || null
        };
    }

    async probePrepared(inputPath) {
        const probe = await this.probe(inputPath);
        if (probe.width !== OUTPUT_WIDTH || probe.height !== OUTPUT_HEIGHT) {
            throw new Error('Prepared-файл имеет неверное разрешение.');
        }
        return probe;
    }

    async prepareSource({ inputPath, preparedPath, qualityPreset = 'standard', expectedDurationMs = 0, onProgress, signal }) {
        const preset = QUALITY_PRESETS[qualityPreset] || QUALITY_PRESETS.standard;
        const tmpOutput = this.fileStore.createTempPath(preparedPath);
        await fsp.mkdir(path.dirname(tmpOutput), { recursive: true });
        await fsp.rm(tmpOutput, { force: true }).catch(() => undefined);

        try {
            await this.runProcess(ffmpegPath(), [
                '-y',
                '-i', inputPath,
                '-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},fps=${OUTPUT_FPS},setsar=1`,
                '-an',
                '-c:v', 'libx264',
                '-preset', preset.preset,
                '-crf', String(preset.crf),
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                '-progress', 'pipe:1',
                '-nostats',
                '-f', 'mp4',
                tmpOutput
            ], {
                signal,
                onStdout: (chunk) => {
                    this.parseProgress(chunk, expectedDurationMs, onProgress);
                }
            });

            await this.probePrepared(tmpOutput);
            await this.fileStore.atomicMove(tmpOutput, preparedPath);
            const preparedProbe = await this.probePrepared(preparedPath);
            const sizeBytes = await this.fileStore.getFileSize(preparedPath);
            if (sizeBytes <= 0) {
                throw new Error('Prepared-файл пустой.');
            }
            const checksumSha256 = await this.fileStore.sha256(preparedPath);
            onProgress?.(100);

            return {
                preparedPath,
                checksumSha256,
                durationMs: preparedProbe.durationMs,
                sizeBytes
            };
        } catch (error) {
            await fsp.rm(tmpOutput, { force: true }).catch(() => undefined);
            const nextError = new Error(classifyFfmpegError(error instanceof Error ? error.message : 'FFmpeg завершился с ошибкой.'));
            nextError.code = error?.code;
            throw nextError;
        }
    }

    async renderItem({ intro, tail, outputPath, qualityPreset = 'standard', onProgress, signal }) {
        const preset = QUALITY_PRESETS[qualityPreset] || QUALITY_PRESETS.standard;
        const tmpOutput = this.fileStore.createTempPath(outputPath);
        const introDurationMs = Math.max(0, Number(intro?.endMs || 0) - Number(intro?.startMs || 0));
        const tailDurationMs = Math.max(0, Number(tail?.endMs || 0) - Number(tail?.startMs || 0));
        const expectedDurationMs = introDurationMs + tailDurationMs;

        if (!intro?.preparedPath || !tail?.preparedPath) {
            throw new Error('Render input не содержит prepared path.');
        }
        if (expectedDurationMs <= 0) {
            throw new Error('Render segment duration должен быть больше 0.');
        }

        await fsp.mkdir(path.dirname(tmpOutput), { recursive: true });
        await fsp.rm(tmpOutput, { force: true }).catch(() => undefined);

        try {
            await this.runProcess(ffmpegPath(), [
                '-y',
                '-i', intro.preparedPath,
                '-i', tail.preparedPath,
                '-filter_complex',
                [
                    `[0:v]trim=start=${toSec(intro.startMs)}:end=${toSec(intro.endMs)},setpts=PTS-STARTPTS[v0]`,
                    `[1:v]trim=start=${toSec(tail.startMs)}:end=${toSec(tail.endMs)},setpts=PTS-STARTPTS[v1]`,
                    '[v0][v1]concat=n=2:v=1:a=0[v]'
                ].join(';'),
                '-map', '[v]',
                '-an',
                '-c:v', 'libx264',
                '-preset', preset.preset,
                '-crf', String(preset.crf),
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                '-progress', 'pipe:1',
                '-nostats',
                '-f', 'mp4',
                tmpOutput
            ], {
                signal,
                onStdout: (chunk) => {
                    this.parseProgress(chunk, expectedDurationMs, onProgress);
                }
            });

            const tmpProbe = await this.probePrepared(tmpOutput);
            const toleranceMs = Math.max(750, Math.round(expectedDurationMs * 0.05));
            if (Math.abs(tmpProbe.durationMs - expectedDurationMs) > toleranceMs) {
                throw new Error('Rendered-файл имеет неверную duration.');
            }
            const tmpSizeBytes = await this.fileStore.getFileSize(tmpOutput);
            if (tmpSizeBytes <= 0) {
                throw new Error('Rendered-файл пустой.');
            }

            await this.fileStore.atomicMove(tmpOutput, outputPath);
            const finalProbe = await this.probePrepared(outputPath);
            const sizeBytes = await this.fileStore.getFileSize(outputPath);
            if (sizeBytes <= 0) {
                throw new Error('Rendered output пустой.');
            }
            const checksumSha256 = await this.fileStore.sha256(outputPath);
            onProgress?.(100);

            return {
                outputPath,
                checksumSha256,
                durationMs: finalProbe.durationMs,
                sizeBytes
            };
        } catch (error) {
            await fsp.rm(tmpOutput, { force: true }).catch(() => undefined);
            const nextError = new Error(classifyFfmpegError(error instanceof Error ? error.message : 'FFmpeg завершился с ошибкой.'));
            nextError.code = error?.code;
            throw nextError;
        }
    }

    parseProgress(chunk, expectedDurationMs, onProgress) {
        if (!onProgress || !expectedDurationMs) {
            return;
        }

        const text = String(chunk);
        for (const line of text.split(/\r?\n/)) {
            const match = line.match(/^out_time_ms=(\d+)/);
            if (!match) {
                continue;
            }
            const raw = Number(match[1]);
            if (!Number.isFinite(raw) || raw <= 0) {
                continue;
            }
            const normalizedMs = raw > expectedDurationMs * 10 ? Math.floor(raw / 1000) : raw;
            const progress = Math.min(99, Math.max(0, Math.floor((normalizedMs / expectedDurationMs) * 100)));
            onProgress(progress);
        }
    }

    runProcess(binaryPath, args, { signal, onStdout } = {}) {
        return new Promise((resolve, reject) => {
            const child = spawn(binaryPath, args, { windowsHide: true });
            let stdout = '';
            let stderr = '';
            let settled = false;
            let killTimer = null;

            const finish = (error, result) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (killTimer) {
                    clearTimeout(killTimer);
                }
                if (signal) {
                    signal.removeEventListener('abort', abort);
                }
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            };

            const abort = () => {
                if (child.killed) {
                    return;
                }
                child.kill('SIGTERM');
                killTimer = setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 5000);
            };

            if (signal) {
                if (signal.aborted) {
                    abort();
                } else {
                    signal.addEventListener('abort', abort, { once: true });
                }
            }

            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                onStdout?.(chunk);
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            child.on('error', (error) => finish(error));
            child.on('close', (code, signalName) => {
                if (code === 0) {
                    finish(null, { stdout, stderr });
                    return;
                }
                const message = stderr.trim() || `Process exited with code ${code ?? signalName}.`;
                const error = new Error(message);
                finish(error);
            });
        });
    }
}

module.exports = {
    FfmpegService,
    resolveBinaryPath,
    QUALITY_PRESETS,
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT,
    OUTPUT_FPS
};
