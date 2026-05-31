const fsp = require('fs/promises');
const path = require('path');
const { EventEmitter } = require('events');

const ACTIVE_QUEUE_STATUSES = new Set(['queued', 'uploading', 'retrying', 'auth_required']);
const VIDEO_EXPORT_CROSSFADE_MS = 200;
const STATE_VERSION = 1;

const ensureDir = async (directory) => {
    await fsp.mkdir(directory, { recursive: true });
};

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

const parseJsonResponse = async (response, fallbackMessage) => {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const message = isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : fallbackMessage;
        const error = new Error(message);
        error.statusCode = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
};

const isLikelyOfflineError = (message) => /Failed to fetch|fetch failed|network|ECONNREFUSED|ECONNRESET|ENOTFOUND|timed out|timeout|socket hang up|offline/i.test(String(message || ''));

const toOfflineError = (message) => {
    const error = new Error(message || 'Сеть недоступна.');
    error.code = 'OFFLINE';
    return error;
};

const toAuthError = (message) => {
    const error = new Error(message || 'Нужно войти в HQ заново.');
    error.code = 'AUTH_REQUIRED';
    return error;
};

const normalizeFailure = (error, fallbackMessage) => {
    if (error?.code === 'OFFLINE' || error?.code === 'AUTH_REQUIRED') {
        return error;
    }

    const statusCode = Number(error?.statusCode || 0);
    if (statusCode === 401 || statusCode === 403) {
        return toAuthError(error.message || fallbackMessage);
    }

    if (statusCode === 0 || isLikelyOfflineError(error?.message)) {
        return toOfflineError(error.message || fallbackMessage);
    }

    return error instanceof Error ? error : new Error(fallbackMessage);
};

class VideoExportRunManager extends EventEmitter {
    constructor({ rootDir, mediaQueue, getApiOrigin, getAccessToken, helperRuntime = null }) {
        super();
        this.rootDir = rootDir;
        this.statePath = path.join(rootDir, 'video-runs-v2.json');
        this.mediaQueue = mediaQueue;
        this.getApiOrigin = getApiOrigin;
        this.getAccessToken = getAccessToken;
        this.helperRuntime = helperRuntime;
        this.runs = {};
        this.processing = false;
        this.persistPromise = Promise.resolve();
        this.timer = null;
    }

    async init() {
        await ensureDir(this.rootDir);
        await this.load();
        this.mediaQueue.on('change', () => {
            this.schedule(0);
            this.emitChange();
        });
        this.schedule(0);
    }

    async load() {
        try {
            const raw = await fsp.readFile(this.statePath, 'utf8');
            const parsed = JSON.parse(raw);
            this.runs = isRecord(parsed?.runs) ? parsed.runs : {};
        } catch {
            this.runs = {};
        }
    }

    async persist() {
        const payload = JSON.stringify({ version: STATE_VERSION, runs: this.runs }, null, 2);
        this.persistPromise = this.persistPromise
            .catch(() => undefined)
            .then(() => fsp.writeFile(this.statePath, `${payload}\n`, 'utf8'));
        await this.persistPromise;
    }

    getSnapshot() {
        return { videoExportRuns: this.runs };
    }

    emitChange() {
        this.emit('change', this.getSnapshot());
    }

    schedule(delayMs = 0) {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.timer = setTimeout(() => {
            this.timer = null;
            void this.processNext();
        }, delayMs);
    }

    async markChanged() {
        await this.persist();
        this.emitChange();
    }

    buildApiUrl(pathname) {
        return `${this.getApiOrigin().replace(/\/+$/, '')}${pathname}`;
    }

    async apiRequest(pathname, init = {}, fallbackMessage = 'Запрос не выполнен.') {
        const token = this.getAccessToken();
        if (!token) {
            throw toAuthError('Нужно войти в HQ заново.');
        }

        try {
            const response = await fetch(this.buildApiUrl(pathname), {
                ...init,
                headers: {
                    ...(init.headers || {}),
                    Authorization: `Bearer ${token}`
                }
            });
            return await parseJsonResponse(response, fallbackMessage);
        } catch (error) {
            throw normalizeFailure(error, fallbackMessage);
        }
    }

    async helperRequest(pathname, init = {}, fallbackMessage = 'Helper недоступен.') {
        if (this.helperRuntime) {
            try {
                const method = String(init.method || 'GET').toUpperCase();
                const parseBody = () => {
                    if (!init.body) {
                        return {};
                    }
                    if (typeof init.body === 'string') {
                        return JSON.parse(init.body);
                    }
                    throw new Error('Внутренний helper принимает JSON payload.');
                };

                if (method === 'POST' && pathname === '/intro-jobs') {
                    return await this.helperRuntime.createIntroJob(parseBody());
                }
                if (method === 'POST' && pathname === '/render-jobs') {
                    return await this.helperRuntime.createRenderJob(parseBody());
                }

                const introMatch = pathname.match(/^\/intro-jobs\/([^/]+)$/);
                if (method === 'GET' && introMatch) {
                    return await this.helperRuntime.getIntroJob(decodeURIComponent(introMatch[1]));
                }

                const renderMatch = pathname.match(/^\/render-jobs\/([^/]+)$/);
                if (method === 'GET' && renderMatch) {
                    return await this.helperRuntime.getRenderJob(decodeURIComponent(renderMatch[1]));
                }

                throw new Error(`Внутренний helper endpoint не поддержан: ${method} ${pathname}`);
            } catch (error) {
                throw normalizeFailure(error, fallbackMessage);
            }
        }

        throw normalizeFailure(new Error('Внутренний video helper недоступен.'), fallbackMessage);
    }

    async startVideoExportRun(payload) {
        const { batchId, runId, renderManifest, sources } = payload;
        const run = {
            runId,
            batchId,
            status: 'importing_sources',
            sources: (sources || []).map((s) => ({
                sourceIndex: s.sourceIndex,
                role: s.role,
                helperSourceId: s.helperSourceId || '',
                cachePath: s.cachePath,
                originalName: s.originalName || s.name || 'source.mp4',
                mimeType: s.mimeType || 'video/mp4',
                size: s.size,
                checksumSha256: s.checksumSha256,
                lastModified: s.lastModified
            })),
            renderManifest,
            introHelperSourceId: '',
            introJobId: '',
            introJobStatus: '',
            errorMessage: '',
            items: {}
        };

        const outputs = renderManifest?.outputs || [];
        for (const output of outputs) {
            run.items[output.item_id] = {
                itemId: output.item_id,
                serialNumber: output.serial_number,
                segmentSeq: output.segment_seq,
                renderStatus: 'pending',
                renderJobId: '',
                renderProgress: 0,
                uploadStatus: 'pending',
                uploadJobId: '',
                uploadProgress: 0,
                errorMessage: ''
            };
        }

        this.runs[batchId] = run;
        await this.markChanged();
        this.schedule(0);
        return { run };
    }

    async renderVideoExportItem(payload) {
        const { batchId, itemId } = payload;
        const run = this.runs[batchId];
        if (!run) {
            throw new Error('Run не найден для этой партии.');
        }

        const item = run.items[itemId];
        if (!item) {
            throw new Error('Товар не найден в этом запуске.');
        }

        const output = run.renderManifest.outputs.find((entry) => entry.item_id === itemId);
        const introSegment = run.renderManifest.segments[0];
        const introDurationMs = Number(introSegment.end_ms) - Number(introSegment.start_ms);

        const itemSegment = run.renderManifest.segments.find((entry) => Number(entry.sequence) === output.segment_seq);
        if (!itemSegment) {
            throw new Error(`Сегмент ${output.segment_seq} не найден в манифесте.`);
        }

        const itemSourceIndex = Number(itemSegment.source_index ?? 0);
        const itemSource = run.sources.find((entry) => Number(entry.sourceIndex) === itemSourceIndex);
        if (!itemSource || !itemSource.helperSourceId) {
            throw new Error(`Исходник ${itemSourceIndex} не импортирован в хелпер.`);
        }

        const renderJob = await this.helperRequest('/render-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sources: [
                    { source_index: 0, source_id: run.introHelperSourceId },
                    { source_index: itemSourceIndex + 1, source_id: itemSource.helperSourceId }
                ],
                crossfade_ms: VIDEO_EXPORT_CROSSFADE_MS,
                segments: [
                    {
                        sequence: 0,
                        source_index: 0,
                        start_ms: 0,
                        end_ms: introDurationMs
                    },
                    {
                        ...itemSegment,
                        source_index: itemSourceIndex + 1
                    }
                ],
                outputs: [
                    {
                        item_id: itemId,
                        serial_number: output.serial_number,
                        segment_seq: output.segment_seq
                    }
                ]
            })
        }, 'Не удалось запустить render job в helper.');

        if (!renderJob?.job_id) {
            throw new Error('Helper не вернул render job ID.');
        }

        item.renderStatus = 'rendering';
        item.renderJobId = renderJob.job_id;
        item.renderProgress = 0;
        item.uploadStatus = 'pending';
        item.uploadJobId = '';
        item.uploadProgress = 0;
        item.errorMessage = '';

        await this.markChanged();
        this.schedule(0);

        return { success: true };
    }

    async uploadVideoExportItem(payload) {
        const { batchId, itemId } = payload;
        const run = this.runs[batchId];
        if (!run) {
            throw new Error('Run не найден.');
        }

        const item = run.items[itemId];
        if (!item) {
            throw new Error('Товар не найден.');
        }

        if (!item.renderJobId) {
            throw new Error('Видео ещё не отрендерено.');
        }

        if (item.uploadJobId) {
            const existingJob = this.mediaQueue.jobs.find((job) => job.id === item.uploadJobId);
            if (existingJob && ACTIVE_QUEUE_STATUSES.has(existingJob.status)) {
                return { success: true, jobId: existingJob.id };
            }
            if (existingJob?.status === 'done') {
                item.uploadStatus = 'completed';
                item.uploadProgress = 100;
                item.errorMessage = '';
                await this.markChanged();
                return { success: true, jobId: existingJob.id };
            }
        }

        const queuedJob = await this.enqueueItemUpload(run, item);

        item.uploadStatus = 'uploading';
        item.uploadJobId = queuedJob.id;
        item.uploadProgress = 0;
        item.errorMessage = '';

        await this.markChanged();
        this.schedule(0);

        return { success: true };
    }

    getVideoExportRunSnapshot(batchId) {
        return this.runs[batchId] || null;
    }

    findRunByRunId(runId) {
        return Object.values(this.runs).find((run) => run.runId === runId) || null;
    }

    async importSourceToHelper(run, source) {
        if (!this.helperRuntime) {
            throw new Error('Внутренний video helper недоступен.');
        }

        const payload = await this.helperRuntime.importSourceFile({
            sourcePath: source.cachePath,
            originalName: source.originalName,
            lastModified: source.lastModified || 0,
            copyToSourceRoot: true
        });
        if (!payload?.source_id) {
            throw new Error('Helper не вернул source_id.');
        }

        source.helperSourceId = payload.source_id;
    }

    async processNext() {
        if (this.processing) {
            return;
        }

        this.processing = true;
        try {
            await this.processRuns().catch((err) => console.error('Error processing V2 runs:', err));
        } finally {
            this.processing = false;
            this.schedule(2000);
        }
    }

    async processRuns() {
        let changed = false;

        for (const batchId of Object.keys(this.runs)) {
            const run = this.runs[batchId];
            if (run.status === 'cancelled' || run.status === 'completed') {
                continue;
            }

            if (run.status === 'importing_sources') {
                const nextSource = run.sources.find((source) => !source.helperSourceId);
                if (nextSource) {
                    try {
                        await this.importSourceToHelper(run, nextSource);
                        changed = true;
                    } catch (err) {
                        console.error(`Error importing source for run ${run.runId}:`, err);
                        run.status = 'failed';
                        run.errorMessage = `Ошибка импорта исходника: ${err.message}`;
                        changed = true;
                    }
                } else {
                    run.status = 'rendering_intro';
                    changed = true;
                }
            }

            if (run.status === 'rendering_intro') {
                if (!run.introJobId) {
                    try {
                        await this.startIntroRender(run);
                        changed = true;
                    } catch (err) {
                        console.error(`Error starting intro job for run ${run.runId}:`, err);
                        run.status = 'failed';
                        run.errorMessage = `Ошибка запуска рендера интро: ${err.message}`;
                        changed = true;
                    }
                } else {
                    try {
                        const introChanged = await this.refreshIntroRender(run);
                        changed = introChanged || changed;
                    } catch (err) {
                        console.error(`Error checking/importing intro job for run ${run.runId}:`, err);
                        run.status = 'failed';
                        run.errorMessage = `Ошибка рендера/импорта интро: ${err.message}`;
                        changed = true;
                    }
                }
            }

            if (run.status === 'ready') {
                const items = Object.values(run.items || {});
                const hasActiveItem = items.some((item) => (
                    item.renderStatus === 'rendering'
                    || item.uploadStatus === 'uploading'
                ));
                const nextPendingItem = items.find((item) => (
                    item.renderStatus === 'pending'
                    && item.uploadStatus !== 'completed'
                    && item.uploadStatus !== 'cancelled'
                ));

                if (!hasActiveItem && nextPendingItem) {
                    await this.renderVideoExportItem({
                        batchId: run.batchId,
                        runId: run.runId,
                        itemId: nextPendingItem.itemId
                    });
                    changed = true;
                    continue;
                }
            }

            const itemsChanged = await this.processRunItems(run);
            changed = itemsChanged || changed;

            const runItems = Object.values(run.items || {});
            if (runItems.length > 0 && runItems.every((item) => item.uploadStatus === 'completed' || item.uploadStatus === 'cancelled')) {
                if (run.status !== 'completed') {
                    run.status = 'completed';
                    changed = true;
                }
            }
        }

        if (changed) {
            await this.markChanged();
        }
    }

    async startIntroRender(run) {
        const introSegment = run.renderManifest?.segments?.[0];
        if (!introSegment) {
            throw new Error('В render_manifest нет intro-сегмента.');
        }
        const introSourceIndex = Number(introSegment.source_index ?? 0);
        const source = run.sources.find((entry) => Number(entry.sourceIndex) === introSourceIndex);
        if (!source?.helperSourceId) {
            throw new Error('Первый source ещё не импортирован.');
        }

        const payload = await this.helperRequest('/intro-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sources: [{ source_index: introSourceIndex, source_id: source.helperSourceId }],
                segment: introSegment
            })
        }, 'Не удалось запустить intro job в helper.');
        if (!payload?.job_id) {
            throw new Error('Helper не вернул intro job id.');
        }
        run.introJobId = payload.job_id;
    }

    async refreshIntroRender(run) {
        const payload = await this.helperRequest(`/intro-jobs/${encodeURIComponent(run.introJobId)}`, undefined, 'Не удалось получить статус intro job.');
        const previousStatus = run.introJobStatus;
        run.introJobStatus = payload.status;
        if (payload.status === 'FAILED') {
            run.status = 'failed';
            run.errorMessage = payload.error || 'Рендер интро завершился с ошибкой.';
            return true;
        }
        if (payload.status !== 'COMPLETED') {
            return payload.status !== previousStatus;
        }
        if (!this.helperRuntime) {
            throw new Error('Внутренний video helper недоступен.');
        }

        const introFilePath = await this.helperRuntime.getIntroJobFilePath(run.introJobId);
        const importPayload = await this.helperRuntime.importSourceFile({
            sourcePath: introFilePath,
            originalName: 'intro.mp4',
            lastModified: Date.now(),
            copyToSourceRoot: true
        });
        if (!importPayload?.source_id) {
            throw new Error('Helper не вернул source_id для intro.');
        }

        run.introHelperSourceId = importPayload.source_id;
        run.status = 'ready';
        return true;
    }

    async processRunItems(run) {
        let changed = false;

        for (const itemId of Object.keys(run.items)) {
            const item = run.items[itemId];

            if (item.renderStatus === 'rendering' && item.renderJobId) {
                const renderChanged = await this.refreshItemRender(run, item);
                changed = renderChanged || changed;
            }

            if (
                item.renderStatus === 'completed'
                && item.renderJobId
                && item.uploadStatus !== 'completed'
                && item.uploadStatus !== 'failed'
                && item.uploadStatus !== 'cancelled'
            ) {
                const queued = await this.ensureItemUploadQueued(run, item);
                changed = queued || changed;
            }

            if (item.uploadStatus === 'uploading' && item.uploadJobId) {
                const uploadChanged = this.refreshItemUploadStatus(item);
                changed = uploadChanged || changed;
            }
        }

        return changed;
    }

    async refreshItemRender(run, item) {
        try {
            const payload = await this.helperRequest(`/render-jobs/${encodeURIComponent(item.renderJobId)}`, undefined, 'Не удалось получить статус render job.');
            if (payload.status === 'FAILED') {
                item.renderStatus = 'failed';
                item.errorMessage = payload.error || 'Ошибка рендеринга.';
                return true;
            }
            if (payload.status === 'COMPLETED') {
                item.renderStatus = 'completed';
                item.renderProgress = 100;
                await this.ensureItemUploadQueued(run, item);
                return true;
            }

            const progress = Number(payload.progress || 0);
            if (progress !== item.renderProgress) {
                item.renderProgress = progress;
                return true;
            }
        } catch (err) {
            console.error(`Error checking render status for run item ${item.serialNumber}:`, err);
        }

        return false;
    }

    async ensureItemUploadQueued(run, item) {
        if (run.status === 'cancelled') {
            return false;
        }

        const existingJob = item.uploadJobId
            ? this.mediaQueue.jobs.find((job) => job.id === item.uploadJobId)
            : null;
        const hasActiveUpload = existingJob && ACTIVE_QUEUE_STATUSES.has(existingJob.status);

        if (hasActiveUpload) {
            return false;
        }

        const queuedJob = await this.enqueueItemUpload(run, item);
        item.uploadStatus = 'uploading';
        item.uploadJobId = queuedJob.id;
        item.uploadProgress = 0;
        return true;
    }

    enqueueItemUpload(run, item) {
        return this.mediaQueue.enqueue('VIDEO_EXPORT_RUN_ITEM_UPLOAD', {
            batchId: run.batchId,
            runId: run.runId,
            itemId: item.itemId,
            serialNumber: item.serialNumber,
            helperJobId: item.renderJobId,
            renderManifest: run.renderManifest,
            exportSettings: run.renderManifest?.export_settings || {}
        }, [], {
            title: `${item.serialNumber}.mp4`,
            batchId: run.batchId,
            fileName: `${item.serialNumber}.mp4`,
            serialNumber: item.serialNumber
        });
    }

    async cancelVideoExportRun(runId) {
        const run = this.findRunByRunId(runId);
        if (!run) {
            return { success: true };
        }

        for (const item of Object.values(run.items || {})) {
            if (item.uploadJobId) {
                await this.mediaQueue.cancel(item.uploadJobId).catch(() => undefined);
            }
            if (item.renderStatus !== 'completed') {
                item.renderStatus = 'cancelled';
            }
            if (item.uploadStatus !== 'completed') {
                item.uploadStatus = 'cancelled';
            }
            item.errorMessage = 'Cancelled by user';
        }

        run.status = 'cancelled';
        run.errorMessage = 'Cancelled by user';
        await this.markChanged();

        return { success: true };
    }

    refreshItemUploadStatus(item) {
        const queueJob = this.mediaQueue.jobs.find((job) => job.id === item.uploadJobId);
        if (!queueJob) {
            return false;
        }

        if (queueJob.status === 'done') {
            item.uploadStatus = 'completed';
            item.uploadProgress = 100;
            return true;
        }
        if (queueJob.status === 'failed') {
            item.uploadStatus = 'failed';
            item.errorMessage = queueJob.lastError || 'Ошибка загрузки.';
            return true;
        }

        return false;
    }
}

module.exports = {
    VideoExportRunManager
};
