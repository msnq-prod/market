import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRenderManifestV3, VideoToolV3HttpError } from '../../../server/services/videoToolV3RunService.ts';

const batchId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

const buildManifest = () => ({
    manifestVersion: 3,
    batchId,
    projectId: '33333333-3333-4333-8333-333333333333',
    runId,
    settings: {
        width: 720,
        height: 1280,
        fps: 24,
        qualityPreset: 'medium',
        audio: 'source'
    },
    sources: [{
        sourceId: '44444444-4444-4444-8444-444444444444',
        position: 0,
        preparedPath: '/tmp/source.mp4',
        checksumSha256: 'a'.repeat(64),
        durationMs: 10_000,
        sourceRevision: 2,
        originalChecksumSha256: 'b'.repeat(64),
        originalHasAudio: true,
        preparedHasAudio: true
    }],
    introSegment: {
        segmentId: '55555555-5555-4555-8555-555555555555',
        sourceId: '44444444-4444-4444-8444-444444444444',
        startMs: 0,
        endMs: 1000
    },
    outputs: [{
        exportItemId: '66666666-6666-4666-8666-666666666666',
        itemId: '77777777-7777-4777-8777-777777777777',
        serialNumber: 'RUSLOC01000001',
        segmentId: '88888888-8888-4888-8888-888888888888',
        sourceId: '44444444-4444-4444-8444-444444444444',
        startMs: 1000,
        endMs: 2000
    }]
});

test('parseRenderManifestV3 accepts strict v3 manifest', () => {
    const manifest = parseRenderManifestV3(buildManifest(), batchId, runId);

    assert.equal(manifest.manifestVersion, 3);
    assert.equal(manifest.outputs[0]?.serialNumber, 'RUSLOC01000001');
    assert.equal(manifest.settings.audio, 'source');
    assert.equal(manifest.sources[0]?.sourceRevision, 2);
    assert.equal(manifest.sources[0]?.originalHasAudio, true);
});

test('parseRenderManifestV3 accepts legacy disabled audio manifest', () => {
    const legacy = buildManifest();
    legacy.settings.audio = 'disabled';
    delete legacy.sources[0].sourceRevision;
    delete legacy.sources[0].originalChecksumSha256;
    delete legacy.sources[0].originalHasAudio;
    delete legacy.sources[0].preparedHasAudio;

    const manifest = parseRenderManifestV3(legacy, batchId, runId);

    assert.equal(manifest.settings.audio, 'disabled');
});

test('parseRenderManifestV3 rejects extra keys', () => {
    assert.throws(
        () => parseRenderManifestV3({ ...buildManifest(), extra: true }, batchId, runId),
        VideoToolV3HttpError
    );
});

test('parseRenderManifestV3 rejects mismatched batch/run', () => {
    assert.throws(
        () => parseRenderManifestV3(buildManifest(), '99999999-9999-4999-8999-999999999999', runId),
        VideoToolV3HttpError
    );
});
