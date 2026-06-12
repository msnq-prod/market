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
const { ProjectService } = require('../../../electron/hq/videoToolV3/projectService.cjs');

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

test('replaceSource hard reloads the same file path and stales completed local artifacts', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'stones-video-v3-source-reload-'));
    const fileStore = await new VideoToolV3FileStore({ rootDir: root }).init();
    const db = await new VideoToolV3Database({ dbPath: fileStore.getDatabasePath() }).init();
    t.after(() => {
        db.close();
        rmSync(root, { recursive: true, force: true });
    });

    const batchId = 'batch-reload';
    const projectId = 'project-reload';
    const sourceId = 'source-reload';
    const runId = 'run-reload';
    const exportItemId = 'export-item-reload';
    const timestamp = nowIso();
    const originalPath = path.join(root, 'same-source.mp4');
    writeFileSync(originalPath, 'new-source-content');

    const preparedPath = fileStore.getPreparedSourcePath({ batchId, projectId, sourceId });
    const outputPath = fileStore.getExportItemPath({ batchId, projectId, runId, serialNumber: 'SERIAL-1' });
    mkdirSync(path.dirname(preparedPath), { recursive: true });
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(preparedPath, 'old-prepared');
    writeFileSync(outputPath, 'old-output');

    db.transaction(() => {
        db.run(`
            INSERT INTO projects (
                id, batch_id, batch_status, expected_output_count, quality_preset,
                active_run_id, created_at, updated_at
            )
            VALUES (?, ?, 'RECEIVED', 1, 'standard', ?, ?, ?)
        `, [projectId, batchId, runId, timestamp, timestamp]);
        db.run(`
            INSERT INTO source_assets (
                id, project_id, position, original_name, original_external_path,
                original_size_bytes, original_last_modified, original_checksum_sha256,
                original_has_audio, prepared_path, prepared_checksum_sha256,
                prepared_has_audio, source_revision, duration_ms, status, error_message,
                created_at, updated_at
            )
            VALUES (?, ?, 0, 'same-source.mp4', ?, 1, 1, ?, 1, ?, ?, 1, 1, 1000, 'READY', NULL, ?, ?)
        `, [sourceId, projectId, originalPath, sha256('old-source'), preparedPath, sha256('old-prepared'), timestamp, timestamp]);
        db.run(`
            INSERT INTO timeline_segments (
                id, project_id, source_id, position, start_ms, end_ms, deleted, created_at, updated_at
            )
            VALUES ('segment-reload', ?, ?, 0, 0, 1000, 0, ?, ?)
        `, [projectId, sourceId, timestamp, timestamp]);
        db.run(`
            INSERT INTO project_items (
                id, project_id, item_id, item_seq, serial_number, existing_video_url,
                clone_url, position, created_at, updated_at
            )
            VALUES ('project-item-reload', ?, 'item-reload', 1, 'SERIAL-1', NULL, '/clone/SERIAL-1', 0, ?, ?)
        `, [projectId, timestamp, timestamp]);
        db.run(`
            INSERT INTO export_runs (
                id, project_id, batch_id, server_run_id, status, manifest_json,
                quality_preset, replace_existing, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'COMPLETED', '{}', 'standard', 1, ?, ?)
        `, [runId, projectId, batchId, runId, timestamp, timestamp]);
        db.run(`
            INSERT INTO export_items (
                id, run_id, project_item_id, item_id, serial_number, segment_id,
                render_status, upload_status, render_progress, upload_progress,
                output_path, output_checksum_sha256, output_size_bytes,
                server_file_url, clone_url, retry_count_render, retry_count_upload,
                error_message, created_at, updated_at
            )
            VALUES (?, ?, 'project-item-reload', 'item-reload', 'SERIAL-1', 'segment-reload',
                'RENDERED', 'UPLOADED', 100, 100, ?, ?, 10, '/uploads/old.mp4',
                '/clone/SERIAL-1', 0, 0, NULL, ?, ?)
        `, [exportItemId, runId, outputPath, sha256('old-output'), timestamp, timestamp]);
        db.run(`
            INSERT INTO upload_attempts (
                id, export_item_id, attempt_number, status, bytes_total, bytes_uploaded,
                checksum_sha256, upload_id, started_at, finished_at, error_message
            )
            VALUES ('attempt-reload', ?, 1, 'UPLOADED', 10, 10, ?, 'upload-reload', ?, ?, NULL)
        `, [exportItemId, sha256('old-output'), timestamp, timestamp]);
    });

    const queued: Array<{ sourceId: string }> = [];
    const projectService = new ProjectService({
        db,
        serverClient: { fetchBatch: async () => ({ batch: {}, items: [] }) },
        fileStore,
        ffmpegService: {
            probe: async () => ({ durationMs: 1500, hasAudio: true })
        },
        getQueueEngine: () => ({
            enqueue: ({ sourceId: queuedSourceId }: { sourceId: string }) => queued.push({ sourceId: queuedSourceId }),
            schedule: () => undefined,
            cancelJob: () => undefined
        })
    });

    await projectService.replaceSource(batchId, sourceId, originalPath);

    const source = db.get('SELECT * FROM source_assets WHERE id = ?', [sourceId]);
    assert.equal(source.source_revision, 2);
    assert.equal(source.original_checksum_sha256, sha256('new-source-content'));
    assert.equal(source.original_has_audio, 1);
    assert.equal(source.prepared_path, null);
    assert.equal(source.prepared_checksum_sha256, null);
    assert.equal(source.prepared_has_audio, null);
    assert.equal(source.duration_ms, 1500);
    assert.equal(db.get('SELECT status FROM export_runs WHERE id = ?', [runId]).status, 'STALE');
    assert.equal(db.all('SELECT id FROM upload_attempts WHERE export_item_id = ?', [exportItemId]).length, 0);
    assert.equal(db.get('SELECT output_path FROM export_items WHERE id = ?', [exportItemId]).output_path, null);
    assert.equal(existsSync(preparedPath), false);
    assert.equal(existsSync(outputPath), false);
    assert.deepEqual(queued, [{ sourceId }]);
});
