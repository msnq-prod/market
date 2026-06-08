import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { MediaWorkflowManager } = require('../../electron/hq/mediaWorkflowManager.cjs') as {
    MediaWorkflowManager: new (options: {
        rootDir: string;
        stagedFilesDir: string;
        mediaQueue: { on: () => undefined };
        getApiOrigin: () => string;
        getAccessToken: () => string;
    }) => {
        init: () => Promise<void>;
        schedule: () => undefined;
        startPhotoApplyWorkflow: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
        processPhotoWorkflow: (workflow: Record<string, unknown>) => Promise<void>;
        workflows: Array<Record<string, unknown>>;
    };
};

test('photo workflow forwards export settings without stale source checksum', async (t) => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'stones-photo-workflow-'));
    const workflowsRoot = path.join(rootDir, 'workflows');
    const stagedFilesRoot = path.join(rootDir, 'files');
    const fileId = 'file-1';
    await mkdir(stagedFilesRoot, { recursive: true });
    await writeFile(path.join(stagedFilesRoot, `${fileId}.bin`), Buffer.from('tiny-photo'));
    t.after(() => rm(rootDir, { recursive: true, force: true }));

    let capturedForm: FormData | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        capturedForm = init?.body instanceof FormData ? init.body : null;
        return new Response(JSON.stringify({
            items: [
                {
                    id: 'item-1',
                    item_photo_url: '/uploads/photos/batch_001_photo.jpg'
                }
            ]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    }) as typeof fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    const manager = new MediaWorkflowManager({
        rootDir: workflowsRoot,
        stagedFilesDir: stagedFilesRoot,
        mediaQueue: { on: () => undefined },
        getApiOrigin: () => 'http://127.0.0.1:3101',
        getAccessToken: () => 'access-token'
    });
    manager.schedule = () => undefined;
    await manager.init();

    await manager.startPhotoApplyWorkflow({
        batchId: 'batch-1',
        basePhotoStateToken: 'base-token-1',
        photoExportSettings: {
            format: 'jpeg',
            quality: 92,
            maxWidth: 2048,
            maxHeight: 2048
        },
        items: [
            {
                itemId: 'item-1',
                itemSeq: 1,
                source: 'upload',
                fileId
            }
        ],
        files: [
            {
                fileId,
                originalName: 'photo.png',
                mimeType: 'image/png',
                size: 10,
                checksumSha256: 'source-checksum'
            }
        ]
    });
    await manager.processPhotoWorkflow(manager.workflows[0]);

    assert.ok(capturedForm);
    const form = capturedForm as FormData;
    assert.equal(form.get('base_photo_state_token'), 'base-token-1');
    assert.deepEqual(JSON.parse(String(form.get('photo_export_settings'))), {
        format: 'jpeg',
        quality: 92,
        maxWidth: 2048,
        maxHeight: 2048
    });

    const manifest = JSON.parse(String(form.get('manifest'))) as Array<Record<string, unknown>>;
    assert.equal(manifest[0].queue_file_id, fileId);
    assert.equal(Object.hasOwn(manifest[0], 'checksum_sha256'), false);
});
