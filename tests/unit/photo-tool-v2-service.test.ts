import test from 'node:test';
import assert from 'node:assert/strict';
import { PhotoToolV2HttpError, __photoToolV2TestUtils } from '../../server/services/photoToolV2Service.ts';

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
