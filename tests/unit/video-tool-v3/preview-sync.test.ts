import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePreviewTimeUpdate } from '../../../src/admin/pages/video-tool-v3/previewSync.ts';

test('preview sync ignores stale timeupdate while programmatic seek is pending', () => {
    assert.deepEqual(resolvePreviewTimeUpdate({
        isPlaying: true,
        mediaSeeking: false,
        pendingSeekMs: 12_000,
        currentLocalMs: 0
    }), {
        clearPendingSeek: false,
        publish: false
    });
});

test('preview sync resumes updates after programmatic seek settles', () => {
    assert.deepEqual(resolvePreviewTimeUpdate({
        isPlaying: true,
        mediaSeeking: false,
        pendingSeekMs: 12_000,
        currentLocalMs: 12_040
    }), {
        clearPendingSeek: true,
        publish: true
    });
});
