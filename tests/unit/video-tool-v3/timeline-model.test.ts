import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSegmentDisplayMeta,
    canCutAtPlayhead,
    clampViewport,
    getPlayhead,
    getSourceOffsets,
    getTotalTimelineDuration,
    globalToSegment,
    globalToSourceTime,
    splitSegmentsAtPlayhead
} from '../../../src/admin/pages/video-tool-v3/timelineModel.ts';
import type { VideoToolV3Segment, VideoToolV3Snapshot, VideoToolV3Source } from '../../../src/admin/pages/video-tool-v3/types.ts';

const sources: VideoToolV3Source[] = [
    {
        id: 'source-1',
        project_id: 'project-1',
        position: 0,
        original_name: 'a.mp4',
        original_size_bytes: 1,
        duration_ms: 10_000,
        status: 'READY',
        error_message: null
    },
    {
        id: 'source-2',
        project_id: 'project-1',
        position: 1,
        original_name: 'b.mp4',
        original_size_bytes: 1,
        duration_ms: 5_000,
        status: 'READY',
        error_message: null
    }
];

const segment = (id: string, sourceId: string, position: number, startMs: number, endMs: number, deleted = false): VideoToolV3Segment => ({
    id,
    project_id: 'project-1',
    source_id: sourceId,
    position,
    start_ms: startMs,
    end_ms: endMs,
    deleted
});

const snapshot = (segments: VideoToolV3Segment[]): Pick<VideoToolV3Snapshot, 'items' | 'segments' | 'sources'> => ({
    sources,
    segments,
    items: [
        {
            id: 'project-item-1',
            project_id: 'project-1',
            item_id: 'item-1',
            item_seq: 1,
            serial_number: 'SN-001',
            existing_video_url: null,
            clone_url: '/clone/SN-001',
            position: 0
        },
        {
            id: 'project-item-2',
            project_id: 'project-1',
            item_id: 'item-2',
            item_seq: 2,
            serial_number: 'SN-002',
            existing_video_url: null,
            clone_url: '/clone/SN-002',
            position: 1
        }
    ]
});

test('timeline model computes source offsets and total duration', () => {
    const offsets = getSourceOffsets(sources);

    assert.equal(offsets.get('source-1'), 0);
    assert.equal(offsets.get('source-2'), 10_000);
    assert.equal(getTotalTimelineDuration(sources), 15_000);
});

test('timeline model converts global time to source local time', () => {
    assert.deepEqual(globalToSourceTime(12_500, sources), {
        sourceId: 'source-2',
        localMs: 2_500
    });
});

test('timeline model finds playhead source and segment', () => {
    const segments = [
        segment('intro', 'source-1', 0, 0, 1_000),
        segment('tail-1', 'source-1', 1, 1_000, 3_000)
    ];

    assert.equal(globalToSegment(1_500, segments, sources)?.id, 'tail-1');
    assert.deepEqual(getPlayhead(1_500, segments, sources), {
        globalMs: 1_500,
        sourceId: 'source-1',
        sourceLocalMs: 1_500,
        segmentId: 'tail-1'
    });
});

test('timeline model builds intro and ordered item display labels', () => {
    const meta = buildSegmentDisplayMeta(snapshot([
        segment('intro', 'source-1', 0, 0, 1_000),
        segment('tail-1', 'source-1', 1, 1_000, 2_000),
        segment('tail-2', 'source-1', 2, 2_000, 3_000),
        segment('deleted', 'source-1', 3, 3_000, 4_000, true)
    ]), 'tail-1');

    assert.deepEqual(meta.map((entry) => entry.label), ['Интро', '001', '002', '']);
    assert.equal(meta[1].selected, true);
    assert.equal(meta[3].deleted, true);
});

test('timeline model blocks cut near segment edges', () => {
    const segments = [segment('intro', 'source-1', 0, 0, 2_000)];

    assert.equal(canCutAtPlayhead(getPlayhead(200, segments, sources), segments, sources).ok, false);
    assert.equal(canCutAtPlayhead(getPlayhead(1_000, segments, sources), segments, sources).ok, true);
});

test('timeline model splits segment at playhead', () => {
    const segments = [segment('intro', 'source-1', 0, 0, 2_000)];
    const result = splitSegmentsAtPlayhead(segments, getPlayhead(1_100, segments, sources), sources, () => 'right');

    assert.equal(result.length, 2);
    assert.equal(result[0].end_ms, 1_100);
    assert.equal(result[1].id, 'right');
    assert.equal(result[1].start_ms, 1_100);
});

test('timeline model clamps viewport to total duration', () => {
    assert.deepEqual(clampViewport({ startMs: 14_000, durationMs: 4_000 }, 15_000), {
        startMs: 11_000,
        durationMs: 4_000
    });
    assert.deepEqual(clampViewport({ startMs: -1_000, durationMs: 30_000 }, 15_000), {
        startMs: 0,
        durationMs: 15_000
    });
});
