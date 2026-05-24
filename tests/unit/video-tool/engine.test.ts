import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeSegments,
    createInitialSegments,
    getSourceTimelineStartMs,
    getTotalSourceDurationMs,
    getSourceForGlobalMs,
    splitSegmentAt,
    deleteSegmentAt,
    buildRenderManifest
} from '../../../src/admin/pages/video-tool/engine/index.ts';
import type { WorkingSource, VideoToolItem } from '../../../src/admin/pages/video-tool/types.ts';

// Mock data
const mockSource1: WorkingSource = {
    sourceIndex: 0,
    role: 'WITH_INTRO',
    name: 'source1.mp4',
    size: 1000,
    lastModified: 12345,
    durationMs: 10000, // 10s
    file: null,
    helperSourceId: 'src_1',
    previewUrl: '',
    previewUnavailable: false
};

const mockSource2: WorkingSource = {
    sourceIndex: 1,
    role: 'NO_INTRO',
    name: 'source2.mp4',
    size: 2000,
    lastModified: 12346,
    durationMs: 20000, // 20s
    file: null,
    helperSourceId: 'src_2',
    previewUrl: '',
    previewUnavailable: false
};

test('getTotalSourceDurationMs calculates sum correctly', () => {
    const total = getTotalSourceDurationMs([mockSource1, mockSource2]);
    assert.equal(total, 30000);
});

test('getSourceTimelineStartMs calculates offsets correctly', () => {
    const offset0 = getSourceTimelineStartMs([mockSource1, mockSource2], 0);
    const offset1 = getSourceTimelineStartMs([mockSource1, mockSource2], 1);
    assert.equal(offset0, 0);
    assert.equal(offset1, 10000);
});

test('getSourceForGlobalMs maps global ms to source and local ms', () => {
    const sources = [mockSource1, mockSource2];
    
    // Within first source
    const res1 = getSourceForGlobalMs(sources, 5000);
    assert.ok(res1);
    assert.equal(res1.source.sourceIndex, 0);
    assert.equal(res1.localMs, 5000);

    // Within second source
    const res2 = getSourceForGlobalMs(sources, 15000);
    assert.ok(res2);
    assert.equal(res2.source.sourceIndex, 1);
    assert.equal(res2.localMs, 5000); // 15000 - 10000
});

test('normalizeSegments sorts and updates sequences', () => {
    const rawSegments = [
        { sourceIndex: 0, startMs: 5000, endMs: 10000 },
        { sourceIndex: 0, startMs: 0, endMs: 5000 }
    ];
    const normalized = normalizeSegments(rawSegments);
    assert.equal(normalized.length, 2);
    assert.equal(normalized[0].sequence, 0);
    assert.equal(normalized[0].startMs, 0);
    assert.equal(normalized[1].sequence, 1);
    assert.equal(normalized[1].startMs, 5000);
});

test('splitSegmentAt splits a segment correctly', () => {
    const initial = createInitialSegments(10000, 0, 0);
    const next = splitSegmentAt(initial, 4000);
    assert.equal(next.length, 2);
    assert.equal(next[0].startMs, 0);
    assert.equal(next[0].endMs, 4000);
    assert.equal(next[1].startMs, 4000);
    assert.equal(next[1].endMs, 10000);
});

test('deleteSegmentAt merges boundaries correctly', () => {
    const segments = [
        { sequence: 0, sourceIndex: 0, startMs: 0, endMs: 3000 },
        { sequence: 1, sourceIndex: 0, startMs: 3000, endMs: 7000 },
        { sequence: 2, sourceIndex: 0, startMs: 7000, endMs: 10000 }
    ];
    const next = deleteSegmentAt(segments, 1); // Delete middle
    assert.equal(next.length, 2);
    assert.equal(next[0].startMs, 0);
    assert.equal(next[0].endMs, 7000); // endMs becomes next[1].endMs or prev.endMs = removed.endMs
    assert.equal(next[1].startMs, 7000);
    assert.equal(next[1].endMs, 10000);
});

test('buildRenderManifest formats expected JSON manifest structure', () => {
    const segments = [
        { sequence: 0, sourceIndex: 0, startMs: 0, endMs: 5000 },
        { sequence: 1, sourceIndex: 0, startMs: 5000, endMs: 10000 }
    ];
    const items: VideoToolItem[] = [
        { id: 'item_1', temp_id: 't1', item_seq: 1, serial_number: 'SN001', item_video_url: null }
    ];
    const manifest = buildRenderManifest(segments, [mockSource1], items);
    
    assert.equal(manifest.manifest_version, 2);
    assert.equal(manifest.sources?.length, 1);
    assert.equal(manifest.segments.length, 2);
    assert.equal(manifest.outputs.length, 1);
    assert.equal(manifest.outputs[0].serial_number, 'SN001');
});
