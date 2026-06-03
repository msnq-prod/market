import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { VideoExportRunManager } = require('../../../electron/hq/videoExportRunManager.cjs');

const makeRun = () => ({
    runId: 'run-1',
    batchId: 'batch-1',
    status: 'ready',
    sources: [{
        sourceIndex: 0,
        role: 'WITH_INTRO',
        helperSourceId: 'source-1',
        cachePath: '/tmp/source-1.mp4',
        originalName: 'source-1.mp4',
        mimeType: 'video/mp4',
        size: 10,
        checksumSha256: 'sha-source',
        lastModified: 1
    }],
    renderManifest: {
        segments: [
            { sequence: 0, source_index: 0, start_ms: 0, end_ms: 1000 },
            { sequence: 1, source_index: 0, start_ms: 1000, end_ms: 2000 },
            { sequence: 2, source_index: 0, start_ms: 2000, end_ms: 3000 }
        ],
        outputs: [
            { item_id: 'item-1', serial_number: 'SERIAL001', segment_seq: 1 },
            { item_id: 'item-2', serial_number: 'SERIAL002', segment_seq: 2 }
        ],
        export_settings: { resolution: '1080p', quality: 'high', fps: 30, audio_normalize: true }
    },
    introHelperSourceId: 'intro-source',
    introJobId: 'intro-job',
    introJobStatus: 'COMPLETED',
    errorMessage: '',
    items: {
        'item-1': {
            itemId: 'item-1',
            serialNumber: 'SERIAL001',
            segmentSeq: 1,
            renderStatus: 'completed',
            renderJobId: 'render-1',
            renderProgress: 100,
            uploadStatus: 'uploading',
            uploadJobId: 'upload-1',
            uploadProgress: 0,
            errorMessage: ''
        },
        'item-2': {
            itemId: 'item-2',
            serialNumber: 'SERIAL002',
            segmentSeq: 2,
            renderStatus: 'pending',
            renderJobId: '',
            renderProgress: 0,
            uploadStatus: 'pending',
            uploadJobId: '',
            uploadProgress: 0,
            errorMessage: ''
        }
    }
});

const createManager = async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'stones-video-run-manager-'));
    const mediaQueue = Object.assign(new EventEmitter(), {
        jobs: [] as Array<Record<string, unknown>>,
        enqueueCalls: [] as Array<Record<string, unknown>>,
        enqueue: async function enqueue(type: string, payload: unknown, files: unknown[], summary: unknown) {
            const job = {
                id: `upload-${this.enqueueCalls.length + 2}`,
                type,
                status: 'queued',
                payload,
                files,
                summary
            };
            this.enqueueCalls.push(job);
            this.jobs.push(job);
            return job;
        }
    });
    const renderJobs: unknown[] = [];
    const helperRuntime = {
        createRenderJob: async (payload: unknown) => {
            renderJobs.push(payload);
            return {
                job_id: `render-${renderJobs.length + 1}`,
                status: 'QUEUED',
                processed_count: 0,
                total_count: 1,
                outputs: [{ serial_number: 'SERIAL002', status: 'QUEUED' }]
            };
        },
        getRenderJob: async () => ({
            job_id: 'render-2',
            status: 'QUEUED',
            processed_count: 0,
            total_count: 1,
            outputs: [{ serial_number: 'SERIAL002', status: 'QUEUED' }]
        }),
        getRenderOutputFilePath: async () => '/tmp/rendered.mp4'
    };
    const manager = new VideoExportRunManager({
        rootDir,
        mediaQueue,
        getApiOrigin: () => 'http://127.0.0.1:3101',
        getAccessToken: () => 'token',
        helperRuntime
    });
    manager.schedule = () => undefined;

    return { manager, mediaQueue, renderJobs };
};

test('VideoExportRunManager marks stale done upload as completed before starting next render', async () => {
    const { manager, mediaQueue, renderJobs } = await createManager();
    manager.runs['batch-1'] = makeRun();
    mediaQueue.jobs = [{
        id: 'upload-1',
        type: 'VIDEO_EXPORT_RUN_ITEM_UPLOAD',
        status: 'done',
        progress: { percent: 100 }
    }];

    await manager.processRuns();

    const run = manager.runs['batch-1'];
    assert.equal(run.items['item-1'].uploadStatus, 'completed');
    assert.equal(run.items['item-1'].uploadProgress, 100);
    assert.equal(run.items['item-2'].renderStatus, 'rendering');
    assert.equal(run.items['item-2'].renderProgress, 8);
    assert.equal(mediaQueue.enqueueCalls.length, 0);
    assert.equal(renderJobs.length, 1);
    
    const renderJobPayload = renderJobs[0] as any;
    assert.equal(renderJobPayload.segments[1].sequence, 1);
    assert.equal(renderJobPayload.outputs[0].segment_seq, 1);
});

test('VideoExportRunManager copies active upload queue progress into local snapshot', async () => {
    const { manager, mediaQueue } = await createManager();
    manager.runs['batch-1'] = makeRun();
    manager.runs['batch-1'].items['item-2'].renderStatus = 'failed';
    mediaQueue.jobs = [{
        id: 'upload-1',
        type: 'VIDEO_EXPORT_RUN_ITEM_UPLOAD',
        status: 'uploading',
        progress: { percent: 47, uploadedBytes: 47, totalBytes: 100 }
    }];

    await manager.processRuns();

    const run = manager.runs['batch-1'];
    assert.equal(run.items['item-1'].uploadStatus, 'uploading');
    assert.equal(run.items['item-1'].uploadProgress, 47);
});
