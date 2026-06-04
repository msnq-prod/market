import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { createPreviewFileResponse, parseByteRange } = require('../../../electron/hq/videoToolV3/previewProtocol.cjs');

test('preview protocol parses open, bounded and suffix byte ranges', () => {
    assert.deepEqual(parseByteRange('bytes=10-', 100), { start: 10, end: 99 });
    assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 });
    assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
    assert.deepEqual(parseByteRange('bytes=100-', 100), { invalid: true });
});

test('preview protocol returns seekable partial content', async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stones-preview-protocol-'));
    const filePath = path.join(root, 'preview.mp4');
    await writeFile(filePath, Buffer.from('0123456789'));
    t.after(() => rm(root, { recursive: true, force: true }));

    const response = await createPreviewFileResponse({
        filePath,
        request: new Request('https://preview.test/video', {
            headers: { range: 'bytes=3-6' }
        })
    });

    assert.equal(response.status, 206);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('content-range'), 'bytes 3-6/10');
    assert.equal(response.headers.get('content-length'), '4');
    assert.equal(await response.text(), '3456');
});
