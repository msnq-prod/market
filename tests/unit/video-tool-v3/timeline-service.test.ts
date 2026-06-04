import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { TimelineService } = require('../../../electron/hq/videoToolV3/timelineService.cjs');
const { VideoToolV3Database } = require('../../../electron/hq/videoToolV3/db.cjs');
const { ProjectService } = require('../../../electron/hq/videoToolV3/projectService.cjs');

const service = new TimelineService();
const batchId = 'batch-1';
const project = {
    id: 'project-1',
    batch_id: batchId,
    batch_status: 'RECEIVED',
    expected_output_count: 2,
    quality_preset: 'standard'
};
const sources = [{
    id: 'source-1',
    position: 0,
    prepared_path: '/tmp/source.mp4',
    prepared_checksum_sha256: 'a'.repeat(64),
    duration_ms: 10_000,
    status: 'READY'
}];
const items = [
    { id: 'project-item-1', item_id: 'item-1', serial_number: 'RUSLOC01000001' },
    { id: 'project-item-2', item_id: 'item-2', serial_number: 'RUSLOC01000002' }
];

const segment = (id: string, position: number, start: number, end: number, deleted = false) => ({
    id,
    project_id: project.id,
    source_id: sources[0].id,
    position,
    start_ms: start,
    end_ms: end,
    deleted
});

test('first active segment becomes intro', () => {
    const segments = [
        segment('deleted', 0, 0, 1000, true),
        segment('intro', 1, 1000, 2000),
        segment('tail', 2, 2000, 3000)
    ];

    assert.equal(service.getIntroSegment(segments)?.id, 'intro');
});

test('deleted segment is excluded from manifest outputs', () => {
    const manifest = service.buildManifest({
        batchId,
        project,
        runId: 'run-1',
        sources,
        items,
        segments: [
            segment('intro', 0, 0, 1000),
            segment('deleted', 1, 1000, 2000, true),
            segment('tail-1', 2, 2000, 3000),
            segment('tail-2', 3, 3000, 4000)
        ]
    });

    assert.deepEqual(manifest.outputs.map((output: { segmentId: string }) => output.segmentId), ['tail-1', 'tail-2']);
});

test('splitSegment creates two active segments with local source bounds', () => {
    const result = service.splitSegment({
        segments: [segment('intro', 0, 0, 2000)],
        segmentId: 'intro',
        splitMs: 1000,
        createId: () => 'tail-1'
    });

    assert.equal(result.length, 2);
    assert.equal(result[0].end_ms, 1000);
    assert.equal(result[1].start_ms, 1000);
    assert.equal(result[1].source_id, sources[0].id);
});

test('setDeleted keeps deleted segments visible and blocks deleting last active segment', () => {
    const result = service.setDeleted({
        segments: [segment('intro', 0, 0, 1000), segment('tail-1', 1, 1000, 2000)],
        segmentId: 'tail-1',
        deleted: true
    });

    assert.equal(result.length, 2);
    assert.equal(result[1].deleted, true);
    assert.throws(() => service.setDeleted({
        segments: result,
        segmentId: 'intro',
        deleted: true
    }));
});

test('moveBoundary enforces minimum duration and source duration', () => {
    const result = service.moveBoundary({
        segments: [segment('intro', 0, 0, 1000)],
        segmentId: 'intro',
        edge: 'end',
        nextMs: 20_000,
        sources
    });
    const clamped = service.moveBoundary({
        segments: result,
        segmentId: 'intro',
        edge: 'start',
        nextMs: 9900,
        sources
    });

    assert.equal(result[0].end_ms, sources[0].duration_ms);
    assert.equal(clamped[0].start_ms, sources[0].duration_ms - 500);
});

test('tail count mismatch returns blocker', () => {
    const less = service.validateForExport({
        project,
        sources,
        items,
        segments: [segment('intro', 0, 0, 1000), segment('tail-1', 1, 1000, 2000)]
    });
    const more = service.validateForExport({
        project,
        sources,
        items,
        segments: [
            segment('intro', 0, 0, 1000),
            segment('tail-1', 1, 1000, 2000),
            segment('tail-2', 2, 2000, 3000),
            segment('tail-3', 3, 3000, 4000)
        ]
    });

    assert.equal(less.blockers.some((blocker: { code: string }) => blocker.code === 'TAIL_COUNT_MISMATCH'), true);
    assert.equal(more.blockers.some((blocker: { code: string }) => blocker.code === 'TAIL_COUNT_MISMATCH'), true);
});

test('segment duration below 500ms returns blocker', () => {
    const result = service.validateForExport({
        project,
        sources,
        items,
        segments: [
            segment('intro', 0, 0, 1000),
            segment('short', 1, 1000, 1200),
            segment('tail-2', 2, 1200, 2200)
        ]
    });

    assert.equal(result.blockers.some((blocker: { code: string }) => blocker.code === 'INVALID_SEGMENTS'), true);
});

test('item without serial number returns blocker', () => {
    const result = service.validateForExport({
        project,
        sources,
        items: [items[0], { ...items[1], serial_number: '' }],
        segments: [
            segment('intro', 0, 0, 1000),
            segment('tail-1', 1, 1000, 2000),
            segment('tail-2', 2, 2000, 3000)
        ]
    });

    assert.equal(result.blockers.some((blocker: { code: string }) => blocker.code === 'ITEM_WITHOUT_SERIAL'), true);
});

test('saving changed segments marks active run stale when it is not completed', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'stones-video-v3-'));
    const db = await new VideoToolV3Database({
        dbPath: path.join(root, 'state.sqlite')
    }).init();
    const timestamp = new Date().toISOString();

    db.transaction(() => {
        db.run(`
            INSERT INTO projects (
                id, batch_id, batch_status, expected_output_count, quality_preset, active_run_id, created_at, updated_at
            ) VALUES (?, ?, 'RECEIVED', 1, 'standard', 'run-1', ?, ?)
        `, [project.id, batchId, timestamp, timestamp]);
        db.run(`
            INSERT INTO source_assets (
                id, project_id, position, original_name, original_size_bytes, original_last_modified,
                prepared_path, prepared_checksum_sha256, duration_ms, status, error_message, created_at, updated_at
            ) VALUES (?, ?, 0, 'source.mp4', 1, 1, '/tmp/source.mp4', ?, 3000, 'READY', NULL, ?, ?)
        `, [sources[0].id, project.id, 'a'.repeat(64), timestamp, timestamp]);
        db.run(`
            INSERT INTO timeline_segments (
                id, project_id, source_id, position, start_ms, end_ms, deleted, created_at, updated_at
            ) VALUES ('intro', ?, ?, 0, 0, 1000, 0, ?, ?)
        `, [project.id, sources[0].id, timestamp, timestamp]);
        db.run(`
            INSERT INTO export_runs (
                id, project_id, batch_id, server_run_id, status, manifest_json, quality_preset, created_at, updated_at
            ) VALUES ('run-1', ?, ?, 'server-run-1', 'ACTIVE', '{}', 'standard', ?, ?)
        `, [project.id, batchId, timestamp, timestamp]);
    });

    const projectService = new ProjectService({
        db,
        serverClient: { fetchBatch: async () => ({ batch: {}, items: [] }) },
        fileStore: {}
    });

    await projectService.saveSegments(batchId, [
        segment('intro', 0, 0, 1500)
    ]);

    assert.equal(db.get('SELECT status FROM export_runs WHERE id = ?', ['run-1']).status, 'STALE');
    db.close();
});
