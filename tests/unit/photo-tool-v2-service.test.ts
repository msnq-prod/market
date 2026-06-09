import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhotoToolV2UploadIntent, PhotoToolV2HttpError, __photoToolV2TestUtils } from '../../server/services/photoToolV2Service.ts';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = 'batch-photo-v2-unit';

const buildManifest = () => ({
    manifestVersion: 2,
    batchId: BATCH_ID,
    runId: RUN_ID,
    basePhotoStateToken: 'state-token',
    photoExportSettings: {
        format: 'jpeg',
        quality: 88,
        maxWidth: 1600,
        maxHeight: 1600
    },
    items: [
        {
            itemId: 'item-1',
            itemSeq: 1,
            source: 'existing',
            existingUrl: '/uploads/photos/item-1.jpg'
        },
        {
            itemId: 'item-2',
            itemSeq: 2,
            source: 'upload',
            fileName: 'item-2.jpg'
        }
    ]
});

test('photo v2 manifest parser accepts strict complete manifest', () => {
    const parsed = __photoToolV2TestUtils.parsePhotoManifestV2(buildManifest(), BATCH_ID, RUN_ID);

    assert.equal(parsed.manifestVersion, 2);
    assert.equal(parsed.batchId, BATCH_ID);
    assert.deepEqual(parsed.photoExportSettings, {
        format: 'jpeg',
        quality: 88,
        maxWidth: 1600,
        maxHeight: 1600
    });
    assert.deepEqual(parsed.items.map((item) => [item.itemId, item.itemSeq, item.source]), [
        ['item-1', 1, 'existing'],
        ['item-2', 2, 'upload']
    ]);
});

test('photo v2 manifest parser rejects invalid export settings and source payloads', () => {
    assert.throws(
        () => __photoToolV2TestUtils.parsePhotoManifestV2({
            ...buildManifest(),
            photoExportSettings: { format: 'webp', quality: 88, maxWidth: 1600, maxHeight: 1600 }
        }, BATCH_ID, RUN_ID),
        (error) => error instanceof PhotoToolV2HttpError
            && error.statusCode === 400
            && error.message === 'Некорректные photo_export_settings.'
    );

    assert.throws(
        () => __photoToolV2TestUtils.parsePhotoManifestV2({
            ...buildManifest(),
            items: [{ itemId: 'item-1', itemSeq: 1, source: 'existing' }]
        }, BATCH_ID, RUN_ID),
        (error) => error instanceof PhotoToolV2HttpError
            && error.statusCode === 400
            && error.message === 'existingUrl обязателен.'
    );
});

test('photo v2 stable manifest comparison and upload id are deterministic', () => {
    assert.equal(
        __photoToolV2TestUtils.stableJson({ b: 2, a: { d: 4, c: 3 } }),
        __photoToolV2TestUtils.stableJson({ a: { c: 3, d: 4 }, b: 2 })
    );

    const checksum = 'a'.repeat(64);
    const uploadId = __photoToolV2TestUtils.buildUploadId(RUN_ID, 'item-1', checksum);
    assert.equal(uploadId, __photoToolV2TestUtils.buildUploadId(RUN_ID, 'item-1', checksum));
    assert.notEqual(uploadId, __photoToolV2TestUtils.buildUploadId(RUN_ID, 'item-2', checksum));
});

test('photo v2 upload intent sizing rejects oversized files and pathological chunk counts', () => {
    assert.throws(
        () => __photoToolV2TestUtils.validateUploadIntentSizing(41 * 1024 * 1024, 1024 * 1024),
        (error) => error instanceof PhotoToolV2HttpError
            && error.statusCode === 413
            && error.code === 'UPLOAD_LIMIT_EXCEEDED'
    );

    assert.throws(
        () => __photoToolV2TestUtils.validateUploadIntentSizing(40 * 1024 * 1024, 128 * 1024),
        (error) => error instanceof PhotoToolV2HttpError
            && error.statusCode === 400
            && error.code === 'UPLOAD_LIMIT_EXCEEDED'
    );
});

test('photo v2 upload intent does not report missing chunk files as uploaded', async (t) => {
    const checksum = 'b'.repeat(64);
    const uploadId = __photoToolV2TestUtils.buildUploadId(RUN_ID, 'item-1', checksum);
    t.after(() => __photoToolV2TestUtils.removeIntent(uploadId));

    await __photoToolV2TestUtils.writeIntent({
        upload_id: uploadId,
        run_id: RUN_ID,
        item_id: 'item-1',
        item_seq: 1,
        file_name: 'item-1.jpg',
        file_size_bytes: 12,
        checksum_sha256: checksum,
        chunk_size_bytes: 12,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        chunks: { 0: checksum }
    });

    const intent = await getPhotoToolV2UploadIntent(RUN_ID, 'item-1', uploadId);

    assert.deepEqual(intent.uploaded_chunks, []);
});

test('photo v2 upload intent treats corrupt metadata as recoverable missing intent', async (t) => {
    const checksum = 'c'.repeat(64);
    const uploadId = __photoToolV2TestUtils.buildUploadId(RUN_ID, 'item-1', checksum);
    t.after(() => __photoToolV2TestUtils.removeIntent(uploadId));

    await __photoToolV2TestUtils.writeRawIntent(uploadId, '{not-json');

    await assert.rejects(
        () => getPhotoToolV2UploadIntent(RUN_ID, 'item-1', uploadId),
        (error) => error instanceof PhotoToolV2HttpError
            && error.statusCode === 404
            && error.code === 'UPLOAD_INTENT_CORRUPT'
    );
});

test('photo v2 maintenance removes expired and corrupt upload intents', async (t) => {
    const expiredChecksum = 'd'.repeat(64);
    const corruptChecksum = 'e'.repeat(64);
    const expiredUploadId = __photoToolV2TestUtils.buildUploadId(RUN_ID, 'item-expired', expiredChecksum);
    const corruptUploadId = __photoToolV2TestUtils.buildUploadId(RUN_ID, 'item-corrupt', corruptChecksum);
    t.after(() => Promise.all([
        __photoToolV2TestUtils.removeIntent(expiredUploadId),
        __photoToolV2TestUtils.removeIntent(corruptUploadId)
    ]));

    await __photoToolV2TestUtils.writeIntent({
        upload_id: expiredUploadId,
        run_id: RUN_ID,
        item_id: 'item-expired',
        item_seq: 3,
        file_name: 'expired.jpg',
        file_size_bytes: 12,
        checksum_sha256: expiredChecksum,
        chunk_size_bytes: 12,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        chunks: {}
    });
    await __photoToolV2TestUtils.writeRawIntent(corruptUploadId, '{not-json');

    const result = await __photoToolV2TestUtils.cleanupPhotoToolV2UploadIntents();

    assert.ok(result.scanned >= 2);
    assert.ok(result.removed_expired >= 1);
    assert.ok(result.removed_corrupt >= 1);
    await assert.rejects(() => getPhotoToolV2UploadIntent(RUN_ID, 'item-expired', expiredUploadId));
    await assert.rejects(() => getPhotoToolV2UploadIntent(RUN_ID, 'item-corrupt', corruptUploadId));
});
