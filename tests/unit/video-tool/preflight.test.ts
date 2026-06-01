import test from 'node:test';
import assert from 'node:assert/strict';
import { runPreflight } from '../../../src/admin/pages/video-tool/engine/preflight.ts';
import type { Segment, WorkingSource, VideoToolItem } from '../../../src/admin/pages/video-tool/types.ts';

const mockSource: WorkingSource = {
    sourceIndex: 0,
    role: 'WITH_INTRO',
    name: 'source.mp4',
    size: 1024 * 1024 * 10,
    lastModified: Date.now(),
    durationMs: 10000,
    file: null,
    helperSourceId: 'id1',
    previewUrl: '',
    previewUnavailable: false
};

const mockItem1: VideoToolItem = {
    id: 'item_1',
    temp_id: 't1',
    item_seq: 1,
    serial_number: 'SN001',
    item_video_url: null
};

const mockItem2: VideoToolItem = {
    id: 'item_2',
    temp_id: 't2',
    item_seq: 2,
    serial_number: 'SN002',
    item_video_url: null
};

test('preflight passes with valid conditions', () => {
    const segments: Segment[] = [
        { sequence: 0, sourceIndex: 0, startMs: 0, endMs: 2000 }, // intro
        { sequence: 1, sourceIndex: 0, startMs: 2000, endMs: 6000 },
        { sequence: 2, sourceIndex: 0, startMs: 6000, endMs: 10000 }
    ];

    const result = runPreflight({
        helperStatus: 'ready',
        helperHealth: { ok: true, free_bytes: 10 * 1024 * 1024 * 1024 }, // 10GB free
        sources: [mockSource],
        segments,
        items: [mockItem1, mockItem2],
        expectedOutputCount: 2
    });

    assert.equal(result.passed, true);
    assert.equal(result.issues.length, 0);
});

test('preflight fails if helper status is not ready', () => {
    const result = runPreflight({
        helperStatus: 'unavailable',
        helperHealth: null,
        sources: [mockSource],
        segments: [],
        items: [mockItem1],
        expectedOutputCount: 1
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((issue) => issue.type === 'blocker' && issue.message.includes('Helper недоступен')));
});

test('preflight fails if free space is insufficient', () => {
    const result = runPreflight({
        helperStatus: 'ready',
        helperHealth: { ok: true, free_bytes: 10 * 1024 * 1024 }, // Only 10MB free
        sources: [mockSource],
        segments: [
            { sequence: 0, sourceIndex: 0, startMs: 0, endMs: 2000 },
            { sequence: 1, sourceIndex: 0, startMs: 2000, endMs: 10000 }
        ],
        items: [mockItem1],
        expectedOutputCount: 1
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((issue) => issue.type === 'blocker' && issue.message.includes('Недостаточно свободного места')));
});

test('preflight fails if serial_number is missing', () => {
    const result = runPreflight({
        helperStatus: 'ready',
        helperHealth: { ok: true, free_bytes: 5 * 1024 * 1024 * 1024 },
        sources: [mockSource],
        segments: [
            { sequence: 0, sourceIndex: 0, startMs: 0, endMs: 2000 },
            { sequence: 1, sourceIndex: 0, startMs: 2000, endMs: 10000 }
        ],
        items: [{ ...mockItem1, serial_number: '' }],
        expectedOutputCount: 1
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((issue) => issue.type === 'blocker' && issue.message.includes('отсутствует серийный номер')));
});

test('preflight warns if segments are too short', () => {
    const result = runPreflight({
        helperStatus: 'ready',
        helperHealth: { ok: true, free_bytes: 5 * 1024 * 1024 * 1024 },
        sources: [mockSource],
        segments: [
            { sequence: 0, sourceIndex: 0, startMs: 0, endMs: 2000 },
            { sequence: 1, sourceIndex: 0, startMs: 2000, endMs: 3000 } // only 1000ms duration
        ],
        items: [mockItem1],
        expectedOutputCount: 1
    });

    assert.equal(result.passed, true); // It's just a warning, not a blocker
    assert.ok(result.issues.some((issue) => issue.type === 'warning' && issue.message.includes('очень маленькую длительность')));
});
