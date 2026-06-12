import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { VideoToolV3Database, nowIso } = require('../../../electron/hq/videoToolV3/db.cjs');
const { VideoToolV3FileStore } = require('../../../electron/hq/videoToolV3/fileStore.cjs');
const { PrepareWorker } = require('../../../electron/hq/videoToolV3/prepareWorker.cjs');

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

test('PrepareWorker does not store prepared output after source revision changes', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'stones-video-v3-prepare-race-'));
    const fileStore = await new VideoToolV3FileStore({ rootDir: root }).init();
    const db = await new VideoToolV3Database({ dbPath: fileStore.getDatabasePath() }).init();
    t.after(() => {
        db.close();
        rmSync(root, { recursive: true, force: true });
    });

    const batchId = 'batch-prepare-race';
    const projectId = 'project-prepare-race';
    const sourceId = 'source-prepare-race';
    const originalPath = path.join(root, 'source.mp4');
    const timestamp = nowIso();
    writeFileSync(originalPath, 'source-video');

    db.transaction(() => {
        db.run(`
            INSERT INTO projects (
                id, batch_id, batch_status, expected_output_count, quality_preset,
                active_run_id, created_at, updated_at
            )
            VALUES (?, ?, 'RECEIVED', 0, 'standard', NULL, ?, ?)
        `, [projectId, batchId, timestamp, timestamp]);
        db.run(`
            INSERT INTO source_assets (
                id, project_id, position, original_name, original_external_path,
                original_size_bytes, original_last_modified, original_checksum_sha256,
                original_has_audio, prepared_path, prepared_checksum_sha256,
                prepared_has_audio, source_revision, duration_ms, status, error_message,
                created_at, updated_at
            )
            VALUES (?, ?, 0, 'source.mp4', ?, 10, 1, NULL, NULL, NULL, NULL, NULL, 1, 0, 'NEW', NULL, ?, ?)
        `, [sourceId, projectId, originalPath, timestamp, timestamp]);
    });

    let receivedSignal = false;
    const ffmpegService = {
        probe: async () => ({ durationMs: 1000, hasAudio: true }),
        prepareSource: async ({ preparedPath, signal }: { preparedPath: string; signal?: AbortSignal }) => {
            receivedSignal = Boolean(signal);
            db.run(`
                UPDATE source_assets
                SET source_revision = 2,
                    status = 'NEW',
                    prepared_path = NULL,
                    prepared_checksum_sha256 = NULL,
                    prepared_has_audio = NULL
                WHERE id = ?
            `, [sourceId]);
            mkdirSync(path.dirname(preparedPath), { recursive: true });
            writeFileSync(preparedPath, 'stale-prepared');
            return {
                preparedPath,
                checksumSha256: sha256('stale-prepared'),
                preparedHasAudio: true,
                durationMs: 1000,
                sizeBytes: 14
            };
        }
    };

    const worker = new PrepareWorker({ db, fileStore, ffmpegService });
    const result = await worker.handle({ source_id: sourceId }, { signal: new AbortController().signal });

    const source = db.get('SELECT * FROM source_assets WHERE id = ?', [sourceId]);
    const stalePreparedPath = fileStore.getPreparedSourcePath({ batchId, projectId, sourceId });
    assert.equal(result.status, 'CANCELLED');
    assert.equal(receivedSignal, true);
    assert.equal(source.source_revision, 2);
    assert.equal(source.status, 'NEW');
    assert.equal(source.prepared_path, null);
    assert.equal(existsSync(stalePreparedPath), false);
});

