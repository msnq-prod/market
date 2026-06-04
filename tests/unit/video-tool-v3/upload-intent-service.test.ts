import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
    __videoToolV3UploadIntentTestUtils,
    completeVideoToolV3UploadIntent,
    getVideoToolV3UploadIntent,
    putVideoToolV3UploadChunk
} from '../../../server/services/videoToolV3UploadIntentService.ts';

const runId = 'test-run';
const itemId = 'test-item';
const chunk = Buffer.from('test');
const checksum = crypto.createHash('sha256').update(chunk).digest('hex');

const writeIntent = async (uploadId: string, overrides: Record<string, unknown> = {}) => {
    await __videoToolV3UploadIntentTestUtils.writeIntent({
        upload_id: uploadId,
        run_id: runId,
        item_id: itemId,
        serial_number: 'SERIAL-1',
        file_name: 'SERIAL-1.mp4',
        file_size_bytes: 8,
        checksum_sha256: 'a'.repeat(64),
        chunk_size_bytes: 4,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        chunks: {},
        ...overrides
    });
};

test('backend upload intent reports expired intent', async (t) => {
    const uploadId = `test-expired-${crypto.randomUUID()}`;
    t.after(() => __videoToolV3UploadIntentTestUtils.removeIntent(uploadId));
    await writeIntent(uploadId, { expires_at: new Date(Date.now() - 1_000).toISOString() });

    await assert.rejects(
        () => getVideoToolV3UploadIntent(runId, itemId, uploadId),
        (error: { statusCode?: number; code?: string }) => error.statusCode === 410 && error.code === 'UPLOAD_INTENT_EXPIRED'
    );
});

test('backend upload intent reports and removes conflicting chunk', async (t) => {
    const uploadId = `test-conflict-${crypto.randomUUID()}`;
    t.after(() => __videoToolV3UploadIntentTestUtils.removeIntent(uploadId));
    await writeIntent(uploadId, { chunks: { 0: 'b'.repeat(64) } });

    await assert.rejects(
        () => putVideoToolV3UploadChunk(runId, itemId, uploadId, '0', checksum, chunk),
        (error: { statusCode?: number; code?: string }) => error.statusCode === 409 && error.code === 'UPLOAD_CHUNK_CONFLICT'
    );
    await assert.rejects(() => getVideoToolV3UploadIntent(runId, itemId, uploadId), /не найден/);
});

test('backend upload intent reports missing chunks and chunk checksum mismatch', async (t) => {
    const missingId = `test-missing-${crypto.randomUUID()}`;
    const checksumId = `test-checksum-${crypto.randomUUID()}`;
    t.after(async () => {
        await __videoToolV3UploadIntentTestUtils.removeIntent(missingId);
        await __videoToolV3UploadIntentTestUtils.removeIntent(checksumId);
    });
    await writeIntent(missingId);
    await writeIntent(checksumId);

    await assert.rejects(
        () => completeVideoToolV3UploadIntent(runId, itemId, missingId, 'user-id'),
        (error: { statusCode?: number; code?: string; details?: { missing_chunks?: number[] } }) =>
            error.statusCode === 409
            && error.code === 'UPLOAD_CHUNKS_MISSING'
            && error.details?.missing_chunks?.length === 2
    );
    await assert.rejects(
        () => putVideoToolV3UploadChunk(runId, itemId, checksumId, '0', 'c'.repeat(64), chunk),
        (error: { statusCode?: number; code?: string }) => error.statusCode === 409 && error.code === 'CHECKSUM_MISMATCH'
    );
});
