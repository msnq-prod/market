import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ServerClient, VideoToolV3ServerError } = require('../../../electron/hq/videoToolV3/serverClient.cjs');

test('fetchBatch falls back to legacy video-tool endpoint when v3 route is unavailable', async (t) => {
    const originalFetch = globalThis.fetch;
    const requestedPaths: string[] = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = new URL(String(input));
        requestedPaths.push(url.pathname);
        if (url.pathname.startsWith('/api/video-tool-v3/')) {
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { 'content-type': 'application/json' }
            });
        }
        return new Response(JSON.stringify({
            batch: { id: 'batch-1', status: 'RECEIVED', expected_output_count: 1 },
            items: [{ id: 'item-1', serial_number: 'SERIAL-1' }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    }) as typeof fetch;

    const client = new ServerClient({
        getApiOrigin: async () => 'https://example.test',
        getAccessToken: () => 'token'
    });
    const payload = await client.fetchBatch('batch-1');

    assert.equal(payload.batch.id, 'batch-1');
    assert.deepEqual(requestedPaths, [
        '/api/video-tool-v3/batches/batch-1',
        '/api/batches/batch-1/video-tool'
    ]);
});

test('upload methods use resumable v3 endpoints and binary chunk headers', async (t) => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ path: string; method: string; headers: Headers; body: unknown }> = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        requests.push({
            path: url.pathname,
            method: init?.method || 'GET',
            headers: new Headers(init?.headers),
            body: init?.body
        });
        return new Response(JSON.stringify({
            upload_id: 'upload-1',
            uploaded_chunks: [0],
            chunk_size_bytes: 4,
            file_size_bytes: 8,
            checksum_sha256: 'a'.repeat(64)
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    }) as typeof fetch;

    const client = new ServerClient({
        getApiOrigin: async () => 'https://example.test',
        getAccessToken: () => 'token'
    });
    await client.createUploadIntent({
        runId: 'run-1',
        itemId: 'item-1',
        serialNumber: 'SERIAL-1',
        fileName: 'SERIAL-1.mp4',
        fileSizeBytes: 8,
        checksumSha256: 'a'.repeat(64),
        chunkSizeBytes: 4
    });
    await client.fetchUploadIntent({ runId: 'run-1', itemId: 'item-1', uploadId: 'upload-1' });
    await client.uploadChunk({
        runId: 'run-1',
        itemId: 'item-1',
        uploadId: 'upload-1',
        chunkIndex: 1,
        chunk: Buffer.from('test'),
        checksumSha256: 'b'.repeat(64)
    });

    assert.deepEqual(requests.map((request) => `${request.method} ${request.path}`), [
        'POST /api/video-tool-v3/runs/run-1/items/item-1/upload-intent',
        'GET /api/video-tool-v3/runs/run-1/items/item-1/upload-intent/upload-1',
        'PUT /api/video-tool-v3/runs/run-1/items/item-1/upload-intent/upload-1/chunks/1'
    ]);
    assert.equal(requests[2]?.headers.get('content-type'), 'application/octet-stream');
    assert.equal(requests[2]?.headers.get('x-chunk-sha256'), 'b'.repeat(64));
    assert.equal(requests[2]?.headers.get('content-length'), '4');
});

test('server client classifies 403 as AUTH_REQUIRED', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' }
    })) as typeof fetch;

    const client = new ServerClient({
        getApiOrigin: async () => 'https://example.test',
        getAccessToken: () => 'expired-token'
    });

    await assert.rejects(
        () => client.fetchRun('run-1'),
        (error: InstanceType<typeof VideoToolV3ServerError>) =>
            error instanceof VideoToolV3ServerError && error.kind === 'AUTH_REQUIRED'
    );
});
