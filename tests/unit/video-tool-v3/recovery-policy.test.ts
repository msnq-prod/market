import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { VideoToolV3App } = require('../../../electron/hq/videoToolV3/index.cjs');
const { VideoToolV3Database } = require('../../../electron/hq/videoToolV3/db.cjs');
const { ProjectService } = require('../../../electron/hq/videoToolV3/projectService.cjs');
const { VideoToolV3QueueEngine, getRetryDelayMs } = require('../../../electron/hq/videoToolV3/queueEngine.cjs');
const Database = require('better-sqlite3');

test('auth jobs resume only after access token changes', () => {
    const app = new VideoToolV3App({
        app: { getPath: () => '/tmp' },
        getAccessToken: () => 'expired-token'
    });
    let resumed = 0;
    app.lastResumedAccessToken = 'expired-token';
    app.networkService = { setAccessToken: () => undefined };
    app.uploadService = { resumePausedJobs: () => { resumed += 1; } };
    app.queueEngine = { schedule: () => undefined };

    app.setAccessToken('expired-token');
    assert.equal(resumed, 0);
    app.setAccessToken(null);
    app.setAccessToken('expired-token');
    assert.equal(resumed, 0);
    app.setAccessToken('fresh-token');
    assert.equal(resumed, 1);
});

test('app schedules queue after runtime upload recovery repairs jobs', () => {
    const app = new VideoToolV3App({
        app: { getPath: () => '/tmp' }
    });
    let scheduled = 0;
    app.uploadService = { recoverUploadQueue: () => 1 };
    app.queueEngine = { schedule: () => { scheduled += 1; } };

    assert.equal(app.recoverUploadQueueAndSchedule(), 1);
    assert.equal(scheduled, 1);
});

test('app schedules queue for existing runnable jobs even without recovery repairs', () => {
    const app = new VideoToolV3App({
        app: { getPath: () => '/tmp' }
    });
    let scheduled = 0;
    app.uploadService = { recoverUploadQueue: () => 0 };
    app.queueEngine = { schedule: () => { scheduled += 1; } };
    app.db = { get: () => ({ id: 'queued-upload-job' }) };

    assert.equal(app.recoverUploadQueueAndSchedule(), 0);
    assert.equal(scheduled, 1);
});

test('network recovery resumes auth-paused upload jobs when token is available', () => {
    const app = new VideoToolV3App({
        app: { getPath: () => '/tmp' }
    });
    let scheduled = 0;
    let resumeInput: { network?: boolean; auth?: boolean } | null = null;
    app.uploadService = {
        resumePausedJobs: (input: { network?: boolean; auth?: boolean }) => {
            resumeInput = input;
            return 2;
        }
    };
    app.queueEngine = { schedule: () => { scheduled += 1; } };

    assert.equal(app.resumePausedUploadsForNetworkState({
        online: true,
        apiReachable: true,
        authenticated: true
    }), 2);
    assert.deepEqual(resumeInput, { network: true, auth: true });
    assert.equal(scheduled, 1);
});

test('prepare recovery recreates missing job for NEW source', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'stones-video-v3-prepare-recovery-'));
    const dbPath = path.join(root, 'state.sqlite');
    const db = await new VideoToolV3Database({ dbPath }).init();
    t.after(() => {
        db.close();
        rmSync(root, { recursive: true, force: true });
    });
    const now = new Date().toISOString();

    db.run(`
        INSERT INTO projects (
            id, batch_id, batch_status, expected_output_count, quality_preset, active_run_id, created_at, updated_at
        )
        VALUES ('project-prepare-recovery', 'batch-prepare-recovery', 'RECEIVED', 1, 'standard', NULL, ?, ?)
    `, [now, now]);
    db.run(`
        INSERT INTO source_assets (
            id, project_id, position, original_name, original_external_path, original_size_bytes,
            original_last_modified, duration_ms, status, created_at, updated_at
        )
        VALUES ('source-prepare-recovery', 'project-prepare-recovery', 0, 'source.mp4', ?, 1, 1, 0, 'NEW', ?, ?)
    `, [path.join(root, 'source.mp4'), now, now]);

    let scheduled = 0;
    const queued: Array<{ projectId: string; sourceId: string; type: string }> = [];
    const service = new ProjectService({
        db,
        serverClient: { fetchBatch: async () => ({ batch: {}, items: [] }) },
        fileStore: {},
        getQueueEngine: () => ({
            enqueue: (job: { projectId: string; sourceId: string; type: string }) => queued.push(job),
            schedule: () => { scheduled += 1; }
        })
    });

    assert.equal(service.recoverPrepareQueue(), 1);
    assert.deepEqual(queued, [{
        projectId: 'project-prepare-recovery',
        sourceId: 'source-prepare-recovery',
        type: 'PREPARE_SOURCE',
        priority: 20,
        maxAttempts: 1
    }]);
    assert.equal(scheduled, 1);
});

test('retry delay uses capped exponential backoff with jitter', () => {
    assert.equal(getRetryDelayMs(1, () => 0), 2_000);
    assert.equal(getRetryDelayMs(3, () => 0.5), 8_500);
    assert.equal(getRetryDelayMs(20, () => 0.9), 60_000);
});

test('queue scheduler preempts later timer with earlier work', async () => {
    const engine = new VideoToolV3QueueEngine({
        db: {
            transaction: (fn: () => void) => fn(),
            run: () => ({ changes: 0 })
        },
        pollIntervalMs: 1_000
    });
    engine.running = true;
    let ticks = 0;
    engine.tick = async () => {
        ticks += 1;
        engine.running = false;
    };

    engine.schedule(60_000);
    engine.schedule(0);
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(ticks, 1);
    await engine.stop();
});

test('local snapshot counts waiting upload jobs separately', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'stones-video-v3-counts-'));
    const dbPath = path.join(root, 'state.sqlite');
    const db = await new VideoToolV3Database({ dbPath }).init();
    t.after(() => {
        db.close();
        rmSync(root, { recursive: true, force: true });
    });
    const now = new Date().toISOString();

    db.run(`
        INSERT INTO projects (
            id, batch_id, batch_status, expected_output_count, quality_preset, active_run_id, created_at, updated_at
        )
        VALUES ('project-counts', 'batch-counts', 'RECEIVED', 1, 'standard', NULL, ?, ?)
    `, [now, now]);

    for (const [id, status] of [
        ['job-queued', 'QUEUED'],
        ['job-running', 'RUNNING'],
        ['job-network', 'WAITING_NETWORK'],
        ['job-auth', 'WAITING_AUTH']
    ] as const) {
        db.run(`
            INSERT INTO jobs (
                id, project_id, type, status, priority, attempts, max_attempts, run_after, created_at, updated_at
            )
            VALUES (?, 'project-counts', 'UPLOAD_ITEM', ?, 100, 0, 5, ?, ?, ?)
        `, [id, status, now, now, now]);
    }

    const snapshot = db.getSnapshot('batch-counts');
    assert.equal(snapshot.counts.queuedJobs, 1);
    assert.equal(snapshot.counts.runningJobs, 1);
    assert.equal(snapshot.counts.waitingNetworkJobs, 1);
    assert.equal(snapshot.counts.waitingAuthJobs, 1);
});

test('local database migrates existing export_runs to replace_existing', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'stones-video-v3-migration-'));
    const dbPath = path.join(root, 'state.sqlite');
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const legacy = new Database(dbPath);
    legacy.exec(`
        CREATE TABLE schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );
        INSERT INTO schema_migrations VALUES (1, 'initial_video_tool_v3_schema', '2026-06-04T00:00:00.000Z');
        CREATE TABLE export_runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            batch_id TEXT NOT NULL,
            server_run_id TEXT NOT NULL,
            status TEXT NOT NULL,
            manifest_json TEXT NOT NULL,
            quality_preset TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,
            error_message TEXT
        );
    `);
    legacy.close();

    const migrated = await new VideoToolV3Database({ dbPath }).init();
    const columns = migrated.all('PRAGMA table_info(export_runs)');

    assert.equal(columns.some((column: { name: string }) => column.name === 'replace_existing'), true);
    assert.equal(migrated.get('SELECT version FROM schema_migrations WHERE version = 3').version, 3);
    migrated.close();
});
