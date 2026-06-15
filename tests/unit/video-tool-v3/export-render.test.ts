import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { VideoToolV3Database, nowIso } = require('../../../electron/hq/videoToolV3/db.cjs');
const { VideoToolV3FileStore } = require('../../../electron/hq/videoToolV3/fileStore.cjs');
const { FfmpegService } = require('../../../electron/hq/videoToolV3/ffmpegService.cjs');
const { ExportService } = require('../../../electron/hq/videoToolV3/exportService.cjs');
const { RenderWorker } = require('../../../electron/hq/videoToolV3/renderWorker.cjs');
const { VideoToolV3QueueEngine } = require('../../../electron/hq/videoToolV3/queueEngine.cjs');

const createPreparedVideo = (filePath: string, color: string) => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const result = spawnSync(ffmpegPath, [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=${color}:s=720x1280:r=24:d=1.2`,
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        filePath
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
};

const createVideoWithAudio = (
    filePath: string,
    {
        color,
        size,
        durationSec = 1.2,
        frequency = 440
    }: { color: string; size: string; durationSec?: number; frequency?: number }
) => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const result = spawnSync(ffmpegPath, [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=${color}:s=${size}:r=24:d=${durationSec}`,
        '-f', 'lavfi',
        '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${durationSec}`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-shortest',
        '-movflags', '+faststart',
        filePath
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
};

const createPreparedVideoWithAudio = (filePath: string, color: string, frequency: number) => {
    createVideoWithAudio(filePath, {
        color,
        frequency,
        size: '720x1280'
    });
};

const probeStreams = (filePath: string): Array<{ codec_type?: string }> => {
    const result = spawnSync(ffprobePath, [
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        filePath
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).streams || [];
};

const getMaxAudioVolume = (filePath: string) => {
    const result = spawnSync(ffmpegPath, [
        '-hide_banner',
        '-nostats',
        '-i', filePath,
        '-map', '0:a:0',
        '-af', 'volumedetect',
        '-f', 'null',
        '-'
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const match = result.stderr.match(/max_volume:\s*(-?(?:\d+(?:\.\d+)?|inf)) dB/i);
    assert.ok(match, result.stderr);
    return match[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(match[1]);
};

const assertAudibleAudio = (filePath: string) => {
    const streams = probeStreams(filePath);
    assert.equal(streams.some((stream) => stream.codec_type === 'audio'), true);
    assert.ok(getMaxAudioVolume(filePath) > -50);
};

const waitFor = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Timed out waiting for condition.');
};

const createHarness = async (itemCount: number, options: { withAudio?: boolean } = {}) => {
    const root = await mkdtemp(path.join(tmpdir(), 'stones-video-v3-export-'));
    const fileStore = await new VideoToolV3FileStore({ rootDir: root }).init();
    const db = await new VideoToolV3Database({ dbPath: fileStore.getDatabasePath() }).init();
    const queueEngine = new VideoToolV3QueueEngine({ db });
    const exportService = new ExportService({
        db,
        fileStore,
        getQueueEngine: () => queueEngine
    });
    const ffmpegService = new FfmpegService({ fileStore });
    const renderWorker = new RenderWorker({
        db,
        fileStore,
        ffmpegService,
        exportService
    });
    const batchId = `batch-${itemCount}-${Date.now()}`;
    const projectId = `project-${itemCount}-${Date.now()}`;
    const timestamp = nowIso();

    await fileStore.ensureProjectDirs({ batchId, projectId });
    db.run(`
        INSERT INTO projects (
            id, batch_id, batch_status, expected_output_count, quality_preset,
            active_run_id, created_at, updated_at
        )
        VALUES (?, ?, 'RECEIVED', ?, 'fast', NULL, ?, ?)
    `, [projectId, batchId, itemCount, timestamp, timestamp]);

    for (let index = 0; index < itemCount; index += 1) {
        db.run(`
            INSERT INTO project_items (
                id, project_id, item_id, item_seq, serial_number, existing_video_url,
                clone_url, position, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
        `, [
            `project-item-${index}`,
            projectId,
            `item-${index}`,
            index + 1,
            `SERIAL-${index + 1}`,
            `/clone/SERIAL-${index + 1}`,
            index,
            timestamp,
            timestamp
        ]);
    }

    const sourceIds = ['intro', ...Array.from({ length: itemCount }, (_, index) => `tail-${index}`)];
    for (const [index, sourceName] of sourceIds.entries()) {
        const sourceId = `source-${sourceName}`;
        const preparedPath = fileStore.getPreparedSourcePath({ batchId, projectId, sourceId });
        const color = index === 0 ? 'black' : (index % 2 === 0 ? 'blue' : 'red');
        if (options.withAudio) {
            createPreparedVideoWithAudio(preparedPath, color, 440 + (index * 110));
        } else {
            createPreparedVideo(preparedPath, color);
        }
        const checksum = await fileStore.sha256(preparedPath);
        db.run(`
            INSERT INTO source_assets (
                id, project_id, position, original_name, original_external_path,
                original_size_bytes, original_last_modified, original_checksum_sha256,
                original_has_audio, prepared_path, prepared_checksum_sha256,
                prepared_has_audio, source_revision, duration_ms, status, error_message,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, 1, 1200, 'READY', NULL, ?, ?)
        `, [
            sourceId,
            projectId,
            index,
            `${sourceName}.mp4`,
            preparedPath,
            checksum,
            options.withAudio ? 1 : 0,
            preparedPath,
            checksum,
            options.withAudio ? 1 : 0,
            timestamp,
            timestamp
        ]);
        db.run(`
            INSERT INTO timeline_segments (
                id, project_id, source_id, position, start_ms, end_ms, deleted,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 0, 1000, 0, ?, ?)
        `, [`segment-${sourceName}`, projectId, sourceId, index, timestamp, timestamp]);
    }

    const completeRenderJob = async (job: Record<string, unknown>) => {
        db.run(`
            UPDATE jobs
            SET status = 'RUNNING',
                attempts = attempts + 1,
                locked_at = ?,
                locked_by = 'test',
                updated_at = ?
            WHERE id = ?
        `, [nowIso(), nowIso(), job.id]);
        const runningJob = db.get('SELECT * FROM jobs WHERE id = ?', [job.id]);
        const result = await renderWorker.handle(runningJob, {
            signal: new AbortController().signal
        });
        db.run(`
            UPDATE jobs
            SET status = ?,
                locked_at = NULL,
                locked_by = NULL,
                error_message = ?,
                updated_at = ?
            WHERE id = ?
        `, [result.status, result.errorMessage || null, nowIso(), job.id]);
        exportService.reconcileRun(job.run_id);
        return result;
    };

    return {
        root,
        db,
        fileStore,
        queueEngine,
        exportService,
        projectId,
        batchId,
        completeRenderJob,
        close() {
            db.close();
            rmSync(root, { recursive: true, force: true });
        }
    };
};

test('prepareSource preserves audible source audio', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'stones-video-v3-prepare-audio-'));
    const fileStore = await new VideoToolV3FileStore({ rootDir: root }).init();
    const ffmpegService = new FfmpegService({ fileStore });
    t.after(() => {
        rmSync(root, { recursive: true, force: true });
    });

    const inputPath = path.join(root, 'input-with-audio.mp4');
    const preparedPath = fileStore.getPreparedSourcePath({
        batchId: 'batch-audio',
        projectId: 'project-audio',
        sourceId: 'source-audio'
    });
    createVideoWithAudio(inputPath, {
        color: 'green',
        frequency: 880,
        size: '160x240'
    });

    const inputProbe = await ffmpegService.probe(inputPath);
    const prepared = await ffmpegService.prepareSource({
        inputPath,
        preparedPath,
        qualityPreset: 'fast',
        expectedDurationMs: inputProbe.durationMs,
        hasAudio: inputProbe.hasAudio
    });

    assertAudibleAudio(prepared.preparedPath);
});

test('startRun creates manifest/items/jobs and renders items independently', async (t) => {
    const harness = await createHarness(2);
    t.after(() => harness.close());

    const run = await harness.exportService.startRun(harness.projectId);
    assert.equal(run.manifest.manifestVersion, 3);
    assert.equal(run.manifest.introSegment.segmentId, 'segment-intro');
    assert.equal(run.manifest.outputs.length, 2);

    const renderJobs = harness.db.all(`
        SELECT *
        FROM jobs
        WHERE run_id = ? AND type = 'RENDER_ITEM'
        ORDER BY created_at ASC, id ASC
    `, [run.id]);
    assert.equal(renderJobs.length, 2);

    await harness.completeRenderJob(renderJobs[0]);
    let items = harness.db.all('SELECT * FROM export_items WHERE run_id = ? ORDER BY serial_number ASC', [run.id]);
    const renderedItem = items.find((item: { id: string }) => item.id === renderJobs[0].export_item_id);
    assert.equal(renderedItem.render_status, 'RENDERED');
    assert.equal(items.filter((item: { render_status: string }) => item.render_status === 'QUEUED').length, 1);
    assert.equal(existsSync(renderedItem.output_path), true);
    assert.equal(renderedItem.output_checksum_sha256.length, 64);
    assert.equal(harness.db.all(`SELECT id FROM jobs WHERE export_item_id = ? AND type = 'UPLOAD_ITEM'`, [renderedItem.id]).length, 1);

    await harness.completeRenderJob(renderJobs[0]);
    assert.equal(harness.db.all(`SELECT id FROM jobs WHERE export_item_id = ? AND type = 'UPLOAD_ITEM'`, [renderedItem.id]).length, 1);

    await harness.completeRenderJob(renderJobs[1]);
    items = harness.db.all('SELECT * FROM export_items WHERE run_id = ? ORDER BY serial_number ASC', [run.id]);
    assert.equal(items.every((item: { render_status: string }) => item.render_status === 'RENDERED'), true);
    assert.equal(items.every((item: { upload_status: string }) => item.upload_status === 'QUEUED'), true);
});

test('startRun blocks existing item videos unless replaceExisting is confirmed', async (t) => {
    const harness = await createHarness(1);
    t.after(() => harness.close());

    harness.db.run(`
        UPDATE project_items
        SET existing_video_url = '/uploads/videos/v3/existing.mp4'
        WHERE project_id = ?
    `, [harness.projectId]);

    await assert.rejects(
        () => harness.exportService.startRun(harness.projectId, { replaceExisting: false }),
        (error: { code?: string }) => error.code === 'ITEM_VIDEO_EXISTS'
    );

    const run = await harness.exportService.startRun(harness.projectId, { replaceExisting: true });
    assert.equal(run.replace_existing, 1);
});

test('render preserves audible prepared audio in final output', async (t) => {
    const harness = await createHarness(1, { withAudio: true });
    t.after(() => harness.close());

    const run = await harness.exportService.startRun(harness.projectId);
    const renderJob = harness.db.get(`SELECT * FROM jobs WHERE run_id = ? AND type = 'RENDER_ITEM'`, [run.id]);
    await harness.completeRenderJob(renderJob);

    const item = harness.db.get('SELECT * FROM export_items WHERE run_id = ?', [run.id]);
    assert.equal(item.render_status, 'RENDERED');
    assertAudibleAudio(item.output_path);
});

test('startRun persists replace_existing for upload recovery', async (t) => {
    const harness = await createHarness(1);
    t.after(() => harness.close());

    const run = await harness.exportService.startRun(harness.projectId, { replaceExisting: true });

    assert.equal(harness.db.get('SELECT replace_existing FROM export_runs WHERE id = ?', [run.id]).replace_existing, 1);
});

test('failed item supports one strict render retry without duplicate jobs', async (t) => {
    const harness = await createHarness(1);
    t.after(() => harness.close());

    const run = await harness.exportService.startRun(harness.projectId);
    const renderJob = harness.db.get(`SELECT * FROM jobs WHERE run_id = ? AND type = 'RENDER_ITEM'`, [run.id]);
    const tailPath = harness.fileStore.getPreparedSourcePath({
        batchId: harness.batchId,
        projectId: harness.projectId,
        sourceId: 'source-tail-0'
    });
    unlinkSync(tailPath);

    await harness.completeRenderJob(renderJob);
    let item = harness.db.get('SELECT * FROM export_items WHERE run_id = ?', [run.id]);
    assert.equal(item.render_status, 'RENDER_FAILED');
    assert.equal(harness.db.get('SELECT status FROM export_runs WHERE id = ?', [run.id]).status, 'FAILED');

    createPreparedVideo(tailPath, 'green');
    harness.exportService.retryItemRender(item.id);
    assert.throws(() => harness.exportService.retryItemRender(item.id), /RENDER_FAILED/);
    assert.equal(harness.db.all(`
        SELECT id
        FROM jobs
        WHERE export_item_id = ?
          AND type = 'RENDER_ITEM'
          AND status IN ('QUEUED', 'RUNNING')
    `, [item.id]).length, 1);

    const retryJob = harness.db.get(`
        SELECT *
        FROM jobs
        WHERE export_item_id = ? AND type = 'RENDER_ITEM' AND status = 'QUEUED'
    `, [item.id]);
    await harness.completeRenderJob(retryJob);
    item = harness.db.get('SELECT * FROM export_items WHERE id = ?', [item.id]);
    assert.equal(item.render_status, 'RENDERED');
    assert.equal(item.retry_count_render, 1);
    assert.equal(existsSync(item.output_path), true);
});

test('restart recovery, cancel and reconcile keep run states consistent', async (t) => {
    const harness = await createHarness(2);
    t.after(() => harness.close());

    const run = await harness.exportService.startRun(harness.projectId);
    const items = harness.db.all('SELECT * FROM export_items WHERE run_id = ? ORDER BY serial_number ASC', [run.id]);
    const interruptedJob = harness.db.get(`
        SELECT *
        FROM jobs
        WHERE run_id = ? AND type = 'RENDER_ITEM' AND export_item_id = ?
    `, [run.id, items[0].id]);

    harness.db.run(`UPDATE export_items SET render_status = 'RENDERING' WHERE id = ?`, [items[0].id]);
    harness.db.run(`UPDATE jobs SET status = 'RUNNING', locked_at = ?, locked_by = 'old-process' WHERE id = ?`, [nowIso(), interruptedJob.id]);
    harness.queueEngine.recoverStaleJobs();
    harness.exportService.recoverOnStartup();

    assert.equal(harness.db.get('SELECT render_status FROM export_items WHERE id = ?', [items[0].id]).render_status, 'RENDER_FAILED');
    assert.equal(harness.db.get('SELECT status FROM jobs WHERE id = ?', [interruptedJob.id]).status, 'FAILED');

    harness.exportService.cancelItem(items[1].id);
    assert.equal(harness.db.get('SELECT render_status FROM export_items WHERE id = ?', [items[1].id]).render_status, 'CANCELLED');
    assert.equal(harness.db.get('SELECT status FROM export_runs WHERE id = ?', [run.id]).status, 'FAILED');

    harness.db.run(`UPDATE export_items SET render_status = 'RENDERED', upload_status = 'UPLOADED' WHERE run_id = ?`, [run.id]);
    assert.equal(harness.exportService.reconcileRun(run.id), 'COMPLETED');

    const nextRun = await harness.exportService.startRun(harness.projectId);
    harness.exportService.cancelRun(nextRun.id);
    assert.equal(harness.db.get('SELECT status FROM export_runs WHERE id = ?', [nextRun.id]).status, 'CANCELLED');
    assert.equal(harness.db.all('SELECT status FROM jobs WHERE run_id = ?', [nextRun.id]).every((job: { status: string }) => job.status === 'CANCELLED'), true);
});

test('cancelling a running render aborts worker and does not create upload job', async (t) => {
    const harness = await createHarness(1);
    t.after(() => harness.close());

    const run = await harness.exportService.startRun(harness.projectId);
    const renderJob = harness.db.get(`SELECT * FROM jobs WHERE run_id = ? AND type = 'RENDER_ITEM'`, [run.id]);
    const renderWorker = new RenderWorker({
        db: harness.db,
        fileStore: harness.fileStore,
        exportService: harness.exportService,
        ffmpegService: {
            renderItem: ({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
            })
        }
    });
    harness.queueEngine.registerHandler('RENDER_ITEM', (job: Record<string, unknown>, context: Record<string, unknown>) => (
        renderWorker.handle(job, context)
    ));
    harness.db.run(`
        UPDATE jobs
        SET status = 'RUNNING',
            attempts = 1,
            locked_at = ?,
            locked_by = 'test'
        WHERE id = ?
    `, [nowIso(), renderJob.id]);
    const runningJob = harness.db.get('SELECT * FROM jobs WHERE id = ?', [renderJob.id]);
    const running = harness.queueEngine.runJob(runningJob);

    await waitFor(() => harness.db.get('SELECT render_status FROM export_items WHERE id = ?', [renderJob.export_item_id]).render_status === 'RENDERING');
    harness.exportService.cancelItem(renderJob.export_item_id);
    await running;

    assert.equal(harness.db.get('SELECT render_status FROM export_items WHERE id = ?', [renderJob.export_item_id]).render_status, 'CANCELLED');
    assert.equal(harness.db.get('SELECT status FROM jobs WHERE id = ?', [renderJob.id]).status, 'CANCELLED');
    assert.equal(harness.db.all(`SELECT id FROM jobs WHERE export_item_id = ? AND type = 'UPLOAD_ITEM'`, [renderJob.export_item_id]).length, 0);
});

test('render worker does not store output after run becomes stale', async (t) => {
    const harness = await createHarness(1);
    t.after(() => harness.close());

    const run = await harness.exportService.startRun(harness.projectId);
    const renderJob = harness.db.get(`SELECT * FROM jobs WHERE run_id = ? AND type = 'RENDER_ITEM'`, [run.id]);
    const renderWorker = new RenderWorker({
        db: harness.db,
        fileStore: harness.fileStore,
        exportService: harness.exportService,
        ffmpegService: {
            renderItem: async ({ outputPath }: { outputPath: string }) => {
                harness.db.run(`UPDATE export_runs SET status = 'STALE' WHERE id = ?`, [run.id]);
                harness.db.run(`UPDATE jobs SET status = 'CANCELLED' WHERE id = ?`, [renderJob.id]);
                mkdirSync(path.dirname(outputPath), { recursive: true });
                writeFileSync(outputPath, 'stale-render');
                return {
                    outputPath,
                    checksumSha256: 'b'.repeat(64),
                    durationMs: 1000,
                    sizeBytes: 12
                };
            }
        }
    });

    harness.db.run(`
        UPDATE jobs
        SET status = 'RUNNING',
            attempts = 1,
            locked_at = ?,
            locked_by = 'test'
        WHERE id = ?
    `, [nowIso(), renderJob.id]);
    const result = await renderWorker.handle(harness.db.get('SELECT * FROM jobs WHERE id = ?', [renderJob.id]), {});
    const item = harness.db.get('SELECT * FROM export_items WHERE id = ?', [renderJob.export_item_id]);
    const staleOutputPath = harness.fileStore.getExportItemPath({
        batchId: harness.batchId,
        projectId: harness.projectId,
        runId: run.id,
        serialNumber: item.serial_number
    });

    assert.equal(result.status, 'CANCELLED');
    assert.equal(item.render_status, 'CANCELLED');
    assert.equal(item.output_path, null);
    assert.equal(harness.db.all(`SELECT id FROM jobs WHERE export_item_id = ? AND type = 'UPLOAD_ITEM'`, [renderJob.export_item_id]).length, 0);
    assert.equal(existsSync(staleOutputPath), false);
});

test('atomicMove replaces an existing output without leaving backup files', async (t) => {
    const harness = await createHarness(1);
    t.after(() => harness.close());

    const target = harness.fileStore.getExportItemPath({
        batchId: harness.batchId,
        projectId: harness.projectId,
        runId: 'replace-run',
        serialNumber: 'SERIAL-1'
    });
    const source = harness.fileStore.createTempPath(target);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'old-output');
    writeFileSync(source, 'new-output');

    await harness.fileStore.atomicMove(source, target);

    assert.equal(readFileSync(target, 'utf8'), 'new-output');
    assert.equal(existsSync(source), false);
});

test('retry upload queues only the selected rendered item', async (t) => {
    const harness = await createHarness(2);
    t.after(() => harness.close());

    const run = await harness.exportService.startRun(harness.projectId);
    const renderJobs = harness.db.all(`
        SELECT *
        FROM jobs
        WHERE run_id = ? AND type = 'RENDER_ITEM'
        ORDER BY created_at ASC, id ASC
    `, [run.id]);
    await harness.completeRenderJob(renderJobs[0]);
    await harness.completeRenderJob(renderJobs[1]);

    const items = harness.db.all('SELECT * FROM export_items WHERE run_id = ? ORDER BY serial_number ASC', [run.id]);
    harness.db.run(`UPDATE export_items SET upload_status = 'UPLOAD_FAILED' WHERE run_id = ?`, [run.id]);
    harness.db.run(`UPDATE jobs SET status = 'FAILED' WHERE run_id = ? AND type = 'UPLOAD_ITEM'`, [run.id]);

    harness.exportService.retryItemUpload(items[0].id);

    const selected = harness.db.get('SELECT * FROM export_items WHERE id = ?', [items[0].id]);
    const untouched = harness.db.get('SELECT * FROM export_items WHERE id = ?', [items[1].id]);
    assert.equal(selected.upload_status, 'QUEUED');
    assert.equal(selected.retry_count_upload, 1);
    assert.equal(selected.render_status, 'RENDERED');
    assert.equal(untouched.upload_status, 'UPLOAD_FAILED');
    assert.equal(untouched.retry_count_upload, 0);
    assert.equal(untouched.render_status, 'RENDERED');
    assert.equal(existsSync(selected.output_path), true);
    assert.equal(existsSync(untouched.output_path), true);
});
