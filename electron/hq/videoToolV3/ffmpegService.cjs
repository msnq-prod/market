const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
const OUTPUT_FPS = 24;
const OUTPUT_AUDIO_SAMPLE_RATE = 48_000;
const OUTPUT_AUDIO_CHANNELS = 2;
const OUTPUT_AUDIO_CHANNEL_LAYOUT = 'stereo';
const OUTPUT_AUDIO_BITRATE = '128k';
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

const parseMaxVolumeDb = (stderr) => {
    const match = String(stderr || '').match(/max_volume:\s*(-?(?:\d+(?:\.\d+)?|inf)) dB/i);
    if (!match) return null;
    return match[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(match[1]);
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

const silentAudioFilter = (durationMs, label) => (
    `anullsrc=channel_layout=${OUTPUT_AUDIO_CHANNEL_LAYOUT}:sample_rate=${OUTPUT_AUDIO_SAMPLE_RATE},atrim=duration=${toSec(durationMs)},asetpts=PTS-STARTPTS[${label}]`
);

const trimAudioFilter = (inputIndex, startMs, endMs, label) => (
    `[${inputIndex}:a:0]atrim=start=${toSec(startMs)}:end=${toSec(endMs)},asetpts=PTS-STARTPTS,aresample=${OUTPUT_AUDIO_SAMPLE_RATE},aformat=sample_rates=${OUTPUT_AUDIO_SAMPLE_RATE}:channel_layouts=${OUTPUT_AUDIO_CHANNEL_LAYOUT}[${label}]`
);

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
        const audioStream = streams.find((stream) => stream?.codec_type === 'audio');
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
            videoCodec: videoStream.codec_name || null,
            audioCodec: audioStream?.codec_name || null,
            hasAudio: Boolean(audioStream)
        };
    }

    async probePrepared(inputPath) {
        const probe = await this.probe(inputPath);
        if (probe.width !== OUTPUT_WIDTH || probe.height !== OUTPUT_HEIGHT) {
            throw new Error('Prepared-файл имеет неверное разрешение.');
        }
        return probe;
    }

    async assertAudibleAudio(inputPath, label) {
        const probe = await this.probe(inputPath);
        if (!probe.hasAudio) {
            throw new Error(`${label} не содержит audio stream.`);
        }

        const { stderr } = await this.runProcess(ffmpegPath(), [
            '-hide_banner',
            '-nostats',
            '-i', inputPath,
            '-map', '0:a:0',
            '-af', 'volumedetect',
            '-f', 'null',
            '-'
        ]);
        const maxVolumeDb = parseMaxVolumeDb(stderr);
        if (maxVolumeDb === Number.NEGATIVE_INFINITY) {
            throw new Error(`${label} содержит нулевую audio дорожку.`);
        }
    }

    async prepareSource({ inputPath, preparedPath, qualityPreset = 'standard', expectedDurationMs = 0, hasAudio = null, onProgress, signal }) {
        const preset = QUALITY_PRESETS[qualityPreset] || QUALITY_PRESETS.standard;
        const tmpOutput = this.fileStore.createTempPath(preparedPath);
        const sourceHasAudio = hasAudio === null ? (await this.probe(inputPath)).hasAudio : Boolean(hasAudio);
        const expectedDurationSec = toSec(expectedDurationMs);
        const inputArgs = sourceHasAudio
            ? ['-i', inputPath]
            : ['-i', inputPath, '-f', 'lavfi', '-t', expectedDurationSec, '-i', `anullsrc=channel_layout=${OUTPUT_AUDIO_CHANNEL_LAYOUT}:sample_rate=${OUTPUT_AUDIO_SAMPLE_RATE}`];
        const audioMap = sourceHasAudio ? '0:a:0' : '1:a:0';
        await fsp.mkdir(path.dirname(tmpOutput), { recursive: true });
        await fsp.rm(tmpOutput, { force: true }).catch(() => undefined);

        try {
            await this.runProcess(ffmpegPath(), [
                '-y',
                ...inputArgs,
                '-map', '0:v:0',
                '-map', audioMap,
                '-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},fps=${OUTPUT_FPS},setsar=1`,
                '-af', 'aresample=async=1:first_pts=0,apad',
                '-c:v', 'libx264',
                '-preset', preset.preset,
                '-crf', String(preset.crf),
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', OUTPUT_AUDIO_BITRATE,
                '-ar', String(OUTPUT_AUDIO_SAMPLE_RATE),
                '-ac', String(OUTPUT_AUDIO_CHANNELS),
                '-shortest',
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
            if (!tmpProbe.hasAudio) {
                throw new Error('Prepared-файл не содержит audio stream.');
            }
            if (sourceHasAudio) {
                await this.assertAudibleAudio(tmpOutput, 'Prepared-файл');
            }
            await this.fileStore.atomicMove(tmpOutput, preparedPath);
            const preparedProbe = await this.probePrepared(preparedPath);
            if (!preparedProbe.hasAudio) {
                throw new Error('Prepared-файл не содержит audio stream.');
            }
            if (sourceHasAudio) {
                await this.assertAudibleAudio(preparedPath, 'Prepared-файл');
            }
            const sizeBytes = await this.fileStore.getFileSize(preparedPath);
            if (sizeBytes <= 0) {
                throw new Error('Prepared-файл пустой.');
            }
            const checksumSha256 = await this.fileStore.sha256(preparedPath);
            onProgress?.(100);

            return {
                preparedPath,
                checksumSha256,
                preparedHasAudio: preparedProbe.hasAudio,
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

    async renderItem({ intro, tail, outputPath, qualityPreset = 'standard', requireAudibleAudio = false, onProgress, signal }) {
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

        const [introProbe, tailProbe] = await Promise.all([
            this.probePrepared(intro.preparedPath),
            this.probePrepared(tail.preparedPath)
        ]);
        const filterComplex = [
            `[0:v]trim=start=${toSec(intro.startMs)}:end=${toSec(intro.endMs)},setpts=PTS-STARTPTS[v0]`,
            introProbe.hasAudio
                ? trimAudioFilter(0, intro.startMs, intro.endMs, 'a0')
                : silentAudioFilter(introDurationMs, 'a0'),
            `[1:v]trim=start=${toSec(tail.startMs)}:end=${toSec(tail.endMs)},setpts=PTS-STARTPTS[v1]`,
            tailProbe.hasAudio
                ? trimAudioFilter(1, tail.startMs, tail.endMs, 'a1')
                : silentAudioFilter(tailDurationMs, 'a1'),
            '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]'
        ].join(';');

        await fsp.mkdir(path.dirname(tmpOutput), { recursive: true });
        await fsp.rm(tmpOutput, { force: true }).catch(() => undefined);

        try {
            await this.runProcess(ffmpegPath(), [
                '-y',
                '-i', intro.preparedPath,
                '-i', tail.preparedPath,
                '-filter_complex',
                filterComplex,
                '-map', '[v]',
                '-map', '[a]',
                '-c:v', 'libx264',
                '-preset', preset.preset,
                '-crf', String(preset.crf),
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', OUTPUT_AUDIO_BITRATE,
                '-ar', String(OUTPUT_AUDIO_SAMPLE_RATE),
                '-ac', String(OUTPUT_AUDIO_CHANNELS),
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
            if (!tmpProbe.hasAudio) {
                throw new Error('Rendered-файл не содержит audio stream.');
            }
            if (requireAudibleAudio) {
                await this.assertAudibleAudio(tmpOutput, 'Rendered-файл');
            }
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
            if (!finalProbe.hasAudio) {
                throw new Error('Rendered output не содержит audio stream.');
            }
            if (requireAudibleAudio) {
                await this.assertAudibleAudio(outputPath, 'Rendered output');
            }
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
