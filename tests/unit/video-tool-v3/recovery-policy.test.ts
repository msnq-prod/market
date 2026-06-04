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
const { getRetryDelayMs } = require('../../../electron/hq/videoToolV3/queueEngine.cjs');
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

test('retry delay uses capped exponential backoff with jitter', () => {
    assert.equal(getRetryDelayMs(1, () => 0), 2_000);
    assert.equal(getRetryDelayMs(3, () => 0.5), 8_500);
    assert.equal(getRetryDelayMs(20, () => 0.9), 60_000);
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
    assert.equal(migrated.get('SELECT version FROM schema_migrations WHERE version = 2').version, 2);
    migrated.close();
});
