import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { VideoToolV3Database, nowIso } = require('../../../electron/hq/videoToolV3/db.cjs');
const { ExportService } = require('../../../electron/hq/videoToolV3/exportService.cjs');
const { UploadService } = require('../../../electron/hq/videoToolV3/uploadService.cjs');
const { UploadWorker } = require('../../../electron/hq/videoToolV3/uploadWorker.cjs');
const { VideoToolV3QueueEngine } = require('../../../electron/hq/videoToolV3/queueEngine.cjs');
const { VideoToolV3ServerError } = require('../../../electron/hq/videoToolV3/serverClient.cjs');

const ids = {
    project: '11111111-1111-4111-8111-111111111111',
    run: '22222222-2222-4222-8222-222222222222',
    source: '33333333-3333-4333-8333-333333333333',
    segment: '44444444-4444-4444-8444-444444444444',
    projectItem: '55555555-5555-4555-8555-555555555555',
    item: '66666666-6666-4666-8666-666666666666',
    exportItem: '77777777-7777-4777-8777-777777777777',
    job: '88888888-8888-4888-8888-888888888888'
};

const createHarness = async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'stones-video-v3-upload-'));
    const db = await new VideoToolV3Database({ dbPath: path.join(root, 'state.sqlite') }).init();
    const timestamp = nowIso();
    const outputPath = path.join(root, 'output.mp4');
    const output = Buffer.from('0123456789');
    writeFileSync(outputPath, output);
    const checksum = require('crypto').createHash('sha256').update(output).digest('hex');
    const manifest = {
        manifestVersion: 3,
        batchId: 'batch-1',
        projectId: ids.project,
        runId: ids.run,
        settings: { width: 720, height: 1280, fps: 24, qualityPreset: 'standard', audio: 'disabled' },
        sources: [{
            sourceId: ids.source,
            position: 0,
            preparedPath: '/tmp/source.mp4',
            checksumSha256: 'a'.repeat(64),
            durationMs: 1000
        }],
        introSegment: { segmentId: ids.segment, sourceId: ids.source, startMs: 0, endMs: 500 },
        outputs: [{
            exportItemId: ids.exportItem,
            itemId: ids.item,
            serialNumber: 'SERIAL-1',
            segmentId: ids.segment,
            sourceId: ids.source,
            startMs: 500,
            endMs: 1000
        }]
    };

    db.transaction(() => {
        db.run(`
            INSERT INTO projects (
                id, batch_id, batch_status, expected_output_count, quality_preset,
                active_run_id, created_at, updated_at
            ) VALUES (?, 'batch-1', 'RECEIVED', 1, 'standard', ?, ?, ?)
        `, [ids.project, ids.run, timestamp, timestamp]);
        db.run(`
            INSERT INTO project_items (
                id, project_id, item_id, item_seq, serial_number, existing_video_url,
                clone_url, position, created_at, updated_at
            ) VALUES (?, ?, ?, 1, 'SERIAL-1', NULL, '/clone/SERIAL-1', 0, ?, ?)
        `, [ids.projectItem, ids.project, ids.item, timestamp, timestamp]);
        db.run(`
            INSERT INTO source_assets (
                id, project_id, position, original_name, original_size_bytes,
                original_last_modified, duration_ms, status, created_at, updated_at
            ) VALUES (?, ?, 0, 'source.mp4', 1, 1, 1000, 'READY', ?, ?)
        `, [ids.source, ids.project, timestamp, timestamp]);
        db.run(`
            INSERT INTO timeline_segments (
                id, project_id, source_id, position, start_ms, end_ms, deleted, created_at, updated_at
            ) VALUES (?, ?, ?, 0, 0, 1000, 0, ?, ?)
        `, [ids.segment, ids.project, ids.source, timestamp, timestamp]);
        db.run(`
            INSERT INTO export_runs (
                id, project_id, batch_id, server_run_id, status, manifest_json,
                quality_preset, created_at, updated_at
            ) VALUES (?, ?, 'batch-1', 'wrong-preallocated-id', 'ACTIVE', ?, 'standard', ?, ?)
        `, [ids.run, ids.project, JSON.stringify(manifest), timestamp, timestamp]);
        db.run(`
            INSERT INTO export_items (
                id, run_id, project_item_id, item_id, serial_number, segment_id,
                render_status, upload_status, render_progress, upload_progress,
                output_path, output_checksum_sha256, output_size_bytes, server_file_url,
                clone_url, retry_count_render, retry_count_upload, error_message, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'SERIAL-1', ?, 'RENDERED', 'QUEUED', 100, 0, ?, ?, ?, NULL,
                '/clone/SERIAL-1', 0, 0, NULL, ?, ?)
        `, [
            ids.exportItem,
            ids.run,
            ids.projectItem,
            ids.item,
            ids.segment,
            outputPath,
            checksum,
            output.length,
            timestamp,
            timestamp
        ]);
        db.run(`
            INSERT INTO jobs (
                id, project_id, run_id, export_item_id, type, status, priority,
                attempts, max_attempts, run_after, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'UPLOAD_ITEM', 'RUNNING', 60, 1, 5, ?, ?, ?)
        `, [ids.job, ids.project, ids.run, ids.exportItem, timestamp, timestamp, timestamp]);
    });

    const uploadedChunks = new Set<number>();
    const chunkCalls: number[] = [];
    const replaceExistingCalls: boolean[] = [];
    let failChunkOnce = false;
    let failComplete = false;
    let failAuthOnce = false;
    let remoteUploaded = false;
    let expireIntentOnce = false;
    let conflictChunkOnce = false;
    let staleDuringComplete = false;
    const serverClient = {
        createRun: async ({ replaceExisting }: { replaceExisting: boolean }) => {
            if (failAuthOnce) {
                failAuthOnce = false;
                throw new VideoToolV3ServerError('auth required', {
                    status: 401,
                    code: 'AUTH_REQUIRED',
                    kind: 'AUTH_REQUIRED'
                });
            }
            replaceExistingCalls.push(replaceExisting);
            return { run: { id: ids.run } };
        },
        fetchRun: async () => ({
            run: { id: ids.run, status: remoteUploaded ? 'COMPLETED' : 'OPEN' },
            items: [{
                item_id: ids.item,
                serial_number: 'SERIAL-1',
                status: remoteUploaded ? 'UPLOADED' : 'PENDING',
                file_url: remoteUploaded ? '/uploads/videos/v3/batch-1/run/SERIAL-1.mp4' : null,
                checksum_sha256: remoteUploaded ? checksum : null,
                clone_url: '/clone/SERIAL-1'
            }]
        }),
        createUploadIntent: async () => ({
            upload_id: 'upload-1',
            uploaded_chunks: [...uploadedChunks],
            chunk_size_bytes: 4,
            file_size_bytes: output.length,
            checksum_sha256: checksum
        }),
        fetchUploadIntent: async () => {
            if (expireIntentOnce) {
                expireIntentOnce = false;
                throw new VideoToolV3ServerError('expired', {
                    status: 410,
                    code: 'UPLOAD_INTENT_EXPIRED',
                    kind: 'CONFLICT'
                });
            }
            return {
                upload_id: 'upload-1',
                uploaded_chunks: [...uploadedChunks],
                chunk_size_bytes: 4,
                file_size_bytes: output.length,
                checksum_sha256: checksum
            };
        },
        uploadChunk: async ({ chunkIndex }: { chunkIndex: number }) => {
            chunkCalls.push(chunkIndex);
            if (conflictChunkOnce) {
                conflictChunkOnce = false;
                uploadedChunks.clear();
                throw new VideoToolV3ServerError('chunk conflict', {
                    status: 409,
                    code: 'UPLOAD_CHUNK_CONFLICT',
                    kind: 'CONFLICT'
                });
            }
            if (failChunkOnce && chunkIndex === 1) {
                failChunkOnce = false;
                throw new VideoToolV3ServerError('offline', { code: 'NETWORK_ERROR', kind: 'OFFLINE' });
            }
            uploadedChunks.add(chunkIndex);
            return { uploaded_chunks: [...uploadedChunks] };
        },
        completeUploadIntent: async () => {
            if (failComplete) {
                throw new VideoToolV3ServerError('complete failed', { status: 500, kind: 'SERVER_ERROR' });
            }
            if (staleDuringComplete) {
                db.run(`UPDATE export_runs SET status = 'STALE' WHERE id = ?`, [ids.run]);
                db.run(`UPDATE jobs SET status = 'CANCELLED' WHERE id = ?`, [ids.job]);
            }
            return {
                run: { id: ids.run, status: 'COMPLETED', expected_count: 1, uploaded_count: 1 },
                uploaded: {
                    item_id: ids.item,
                    serial_number: 'SERIAL-1',
                    file_url: '/uploads/videos/v3/batch-1/run/SERIAL-1.mp4',
                    checksum_sha256: checksum,
                    clone_url: '/clone/SERIAL-1'
                }
            };
        }
    };
    const queueEngine = new VideoToolV3QueueEngine({ db });
    const exportService = new ExportService({
        db,
        fileStore: {},
        getQueueEngine: () => queueEngine
    });
    const uploadService = new UploadService({ db, serverClient, exportService, chunkSizeBytes: 4 });
    const networkState = { online: true, apiReachable: true, authenticated: true };
    const worker = new UploadWorker({
        db,
        uploadService,
        exportService,
        networkService: { getState: () => ({ ...networkState }) }
    });

    return {
        root,
        db,
        outputPath,
        chunkCalls,
        replaceExistingCalls,
        networkState,
        queueEngine,
        uploadService,
        worker,
        setFailChunkOnce() {
            failChunkOnce = true;
        },
        setFailComplete() {
            failComplete = true;
        },
        setFailAuthOnce() {
            failAuthOnce = true;
        },
        setRemoteUploaded() {
            remoteUploaded = true;
        },
        setExpireIntentOnce() {
            expireIntentOnce = true;
        },
        setConflictChunkOnce() {
            conflictChunkOnce = true;
        },
        setStaleDuringComplete() {
            staleDuringComplete = true;
        },
        clearUploadedChunks() {
            uploadedChunks.clear();
        },
        close() {
            db.close();
            rmSync(root, { recursive: true, force: true });
        }
    };
};

test('upload worker resumes accepted chunks after offline restart and completes local item', async (t) => {
    const harness = await createHarness();
    t.after(() => harness.close());
    harness.setFailChunkOnce();

    let job = harness.db.get('SELECT * FROM jobs WHERE id = ?', [ids.job]);
    const paused = await harness.worker.handle(job, {});
    assert.equal(paused.status, 'WAITING_NETWORK');
    assert.equal(harness.db.get('SELECT upload_status FROM export_items WHERE id = ?', [ids.exportItem]).upload_status, 'PAUSED_OFFLINE');
    assert.equal(harness.db.get('SELECT retry_count_upload FROM export_items WHERE id = ?', [ids.exportItem]).retry_count_upload, 0);
    assert.equal(existsSync(harness.outputPath), true);
    assert.deepEqual(harness.chunkCalls, [0, 1]);

    harness.db.run(`UPDATE jobs SET status = 'RUNNING' WHERE id = ?`, [ids.job]);
    harness.db.run(`UPDATE export_items SET upload_status = 'UPLOADING' WHERE id = ?`, [ids.exportItem]);
    harness.queueEngine.recoverStaleJobs();
    harness.uploadService.recoverOnStartup();
    assert.equal(harness.db.get('SELECT status FROM jobs WHERE id = ?', [ids.job]).status, 'QUEUED');
    assert.equal(harness.db.get('SELECT upload_status FROM export_items WHERE id = ?', [ids.exportItem]).upload_status, 'QUEUED');

    harness.db.run(`UPDATE jobs SET status = 'RUNNING' WHERE id = ?`, [ids.job]);
    job = harness.db.get('SELECT * FROM jobs WHERE id = ?', [ids.job]);
    const completed = await harness.worker.handle(job, {});
    const item = harness.db.get('SELECT * FROM export_items WHERE id = ?', [ids.exportItem]);

    assert.equal(completed.status, 'DONE');
    assert.equal(item.upload_status, 'UPLOADED');
    assert.equal(item.upload_progress, 100);
    assert.equal(item.server_file_url, '/uploads/videos/v3/batch-1/run/SERIAL-1.mp4');
    assert.equal(harness.db.get('SELECT server_run_id FROM export_runs WHERE id = ?', [ids.run]).server_run_id, ids.run);
    assert.equal(harness.chunkCalls.filter((index) => index === 0).length, 1);
    assert.equal(existsSync(harness.outputPath), true);
});

test('upload queue recovery recreates missing queued upload job during active run', async (t) => {
    const harness = await createHarness();
    t.after(() => harness.close());

    harness.db.run(`UPDATE jobs SET status = 'DONE' WHERE id = ?`, [ids.job]);

    assert.equal(harness.db.all(`
        SELECT id
        FROM jobs
        WHERE export_item_id = ?
          AND type = 'UPLOAD_ITEM'
          AND status IN ('QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH')
    `, [ids.exportItem]).length, 0);

    assert.equal(harness.uploadService.recoverUploadQueue(), 1);

    const activeJob = harness.db.get(`
        SELECT *
        FROM jobs
        WHERE export_item_id = ?
          AND type = 'UPLOAD_ITEM'
          AND status = 'QUEUED'
    `, [ids.exportItem]);
    assert.ok(activeJob);
    assert.equal(harness.db.get('SELECT upload_status FROM export_items WHERE id = ?', [ids.exportItem]).upload_status, 'QUEUED');
});

test('upload worker waits for auth and resumes only its upload job', async (t) => {
    const harness = await createHarness();
    t.after(() => harness.close());
    harness.networkState.authenticated = false;

    const job = harness.db.get('SELECT * FROM jobs WHERE id = ?', [ids.job]);
    const paused = await harness.worker.handle(job, {});
    assert.equal(paused.status, 'WAITING_AUTH');
    assert.equal(harness.db.get('SELECT upload_status FROM export_items WHERE id = ?', [ids.exportItem]).upload_status, 'AUTH_REQUIRED');
    assert.equal(harness.db.get('SELECT retry_count_upload FROM export_items WHERE id = ?', [ids.exportItem]).retry_count_upload, 0);
    assert.deepEqual(harness.chunkCalls, []);

    harness.db.run(`UPDATE jobs SET status = 'WAITING_AUTH' WHERE id = ?`, [ids.job]);
    harness.networkState.authenticated = true;
    assert.equal(harness.uploadService.resumePausedJobs({ auth: true }), 1);
    assert.equal(harness.db.get('SELECT status FROM jobs WHERE id = ?', [ids.job]).status, 'QUEUED');
    assert.equal(harness.db.get('SELECT upload_status FROM export_items WHERE id = ?', [ids.exportItem]).upload_status, 'QUEUED');
});

test('upload worker pauses on server 401 without deleting output', async (t) => {
    const harness = await createHarness();
    t.after(() => harness.close());
    harness.setFailAuthOnce();

    const job = harness.db.get('SELECT * FROM jobs WHERE id = ?', [ids.job]);
    const paused = await harness.worker.handle(job, {});

    assert.equal(paused.status, 'WAITING_AUTH');
    assert.equal(harness.db.get('SELECT upload_status FROM export_items WHERE id = ?', [ids.exportItem]).upload_status, 'AUTH_REQUIRED');
    assert.equal(existsSync(harness.outputPath), true);
});

test('upload item is not marked uploaded when complete response fails', async (t) => {
    const harness = await createHarness();
    t.after(() => harness.close());
    harness.setFailComplete();

    const job = harness.db.get('SELECT * FROM jobs WHERE id = ?', [ids.job]);
    await assert.rejects(() => harness.worker.handle(job, {}), /complete failed/);

    const item = harness.db.get('SELECT * FROM export_items WHERE id = ?', [ids.exportItem]);
    assert.equal(item.upload_status, 'UPLOAD_FAILED');
    assert.equal(item.server_file_url, null);
    assert.equal(existsSync(harness.outputPath), true);
});

test('upload recovery accepts matching server-completed item without uploading chunks', async (t) => {
    const harness = await createHarness();
    t.after(() => harness.close());
    harness.setRemoteUploaded();

    const job = harness.db.get('SELECT * FROM jobs WHERE id = ?', [ids.job]);
    const result = await harness.worker.handle(job, {});

    assert.equal(result.status, 'DONE');
    assert.deepEqual(harness.chunkCalls, []);
    assert.equal(harness.db.get('SELECT upload_status FROM export_items WHERE id = ?', [ids.exportItem]).upload_status, 'UPLOADED');
});

test('upload worker does not mark stale run item as uploaded after complete returns', async (t) => {
    const harness = await createHarness();
    t.after(() => harness.close());
    harness.setStaleDuringComplete();

    const job = harness.db.get('SELECT * FROM jobs WHERE id = ?', [ids.job]);
    const result = await harness.worker.handle(job, {});
    const item = harness.db.get('SELECT * FROM export_items WHERE id = ?', [ids.exportItem]);

    assert.equal(result.status, 'CANCELLED');
    assert.equal(item.upload_status, 'CANCELLED');
    assert.equal(item.server_file_url, null);
});

test('upload forwards persisted replace_existing to server run', async (t) => {
    const harness = await createHarness();
    t.after(() => harness.close());
    harness.db.run(`UPDATE export_runs SET replace_existing = 1 WHERE id = ?`, [ids.run]);

    const job = harness.db.get('SELECT * FROM jobs WHERE id = ?', [ids.job]);
    await harness.worker.handle(job, {});

    assert.deepEqual(harness.replaceExistingCalls, [true]);
});

test('expired intent is replaced and chunk conflict clears persisted upload id', async (t) => {
    const harness = await createHarness();
    t.after(() => harness.close());
    const record = harness.db.get(`
        SELECT export_items.*, export_runs.manifest_json, export_runs.server_run_id,
            export_runs.batch_id, export_runs.project_id, export_runs.replace_existing
        FROM export_items
        JOIN export_runs ON export_runs.id = export_items.run_id
        WHERE export_items.id = ?
    `, [ids.exportItem]);

    const attempt = harness.uploadService.getOrCreateAttempt(record);
    harness.db.run(`UPDATE upload_attempts SET upload_id = 'expired-upload' WHERE id = ?`, [attempt.id]);
    harness.setExpireIntentOnce();
    await harness.uploadService.upload(record);
    assert.equal(harness.db.get('SELECT status FROM upload_attempts WHERE id = ?', [attempt.id]).status, 'UPLOADED');

    harness.db.run(`UPDATE export_items SET upload_status = 'QUEUED' WHERE id = ?`, [ids.exportItem]);
    harness.db.run(`DELETE FROM upload_attempts WHERE export_item_id = ?`, [ids.exportItem]);
    harness.clearUploadedChunks();
    harness.setConflictChunkOnce();
    await assert.rejects(() => harness.uploadService.upload(record), /chunk conflict/);
    assert.equal(harness.db.get('SELECT upload_id FROM upload_attempts WHERE export_item_id = ?', [ids.exportItem]).upload_id, null);
});
