import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MediaUploadQueue } = require('../../../electron/hq/mediaQueue.cjs');

test('MediaUploadQueue streams video export upload with progress and export settings', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'stones-media-queue-'));
    const filePath = path.join(rootDir, 'rendered.mp4');
    await writeFile(filePath, Buffer.from('fake-rendered-video'));

    let requestBody = '';
    const originalRequest = http.request;
    http.request = ((url: URL, options: http.RequestOptions, callback: (response: EventEmitter & { statusCode: number }) => void) => {
        const chunks: Buffer[] = [];
        const request = new EventEmitter() as EventEmitter & {
            write: (chunk: Buffer, callback?: (error?: Error) => void) => boolean;
            end: () => void;
            destroy: (error?: Error) => void;
        };

        assert.equal(url.pathname, '/api/batches/batch-1/video-export-runs/run-1/items/item-1/upload');
        assert.equal(options.headers?.Authorization, 'Bearer token');
        request.write = (chunk, writeCallback) => {
            chunks.push(Buffer.from(chunk));
            writeCallback?.();
            return true;
        };
        request.end = () => {
            requestBody = Buffer.concat(chunks).toString('utf8');
            const response = new EventEmitter() as EventEmitter & { statusCode: number };
            response.statusCode = 200;
            callback(response);
            response.emit('data', Buffer.from(JSON.stringify({ ok: true })));
            response.emit('end');
        };
        request.destroy = (error) => {
            if (error) {
                request.emit('error', error);
            }
        };
        return request;
    }) as typeof http.request;

    try {
        const queue = new MediaUploadQueue({
            rootDir,
            getApiOrigin: () => 'http://127.0.0.1:3101',
            getAccessToken: () => 'token'
        });
        const job = {
            id: 'queue-job-1',
            type: 'VIDEO_EXPORT_RUN_ITEM_UPLOAD',
            status: 'uploading',
            updatedAt: new Date().toISOString(),
            payload: {
                batchId: 'batch-1',
                runId: 'run-1',
                itemId: 'item-1',
                serialNumber: 'SERIAL001',
                exportSettings: { resolution: '1080p', quality: 'high', fps: 30, audio_normalize: true }
            },
            files: [{
                fileId: 'file-1',
                cachePath: filePath,
                originalName: 'SERIAL001.mp4',
                mimeType: 'video/mp4',
                checksumSha256: 'checksum-1',
                size: Buffer.byteLength('fake-rendered-video')
            }],
            progress: null
        };

        await queue.uploadVideoExportRunItem(job, 'token', new AbortController().signal);

        assert.match(requestBody, /name="serial_number"\r\n\r\nSERIAL001/);
        assert.match(requestBody, /name="queue_job_id"\r\n\r\nqueue-job-1/);
        assert.match(requestBody, /name="checksum_sha256"\r\n\r\nchecksum-1/);
        assert.match(requestBody, /name="export_settings"/);
        assert.match(requestBody, /"resolution":"1080p"/);
        assert.match(requestBody, /fake-rendered-video/);
        assert.equal(job.progress?.percent, 100);
    } finally {
        http.request = originalRequest;
    }
});
