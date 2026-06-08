const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { EventEmitter } = require('events');

const ACTIVE_STATUSES = new Set(['queued', 'uploading', 'retrying', 'auth_required']);
const DONE_STATUSES = new Set(['done', 'cancelled']);
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 8;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const STATE_VERSION = 2;
const EVENT_BUFFER_SIZE = 10;
const QUEUE_STUCK_MS = 5 * 60_000;
const LEGACY_VIDEO_UPLOAD_JOB_TYPES = new Set([
    'VIDEO_' + 'INTRO_UPLOAD',
    'VIDEO_' + 'RENDER_UPLOAD',
    'VIDEO_' + 'EXPORT_RUN_ITEM_UPLOAD'
]);

const nowIso = () => new Date().toISOString();
const createId = () => crypto.randomUUID();
const safeFileName = (value) => String(value || 'file')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'file';

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
const appendEvent = (entry, type, detail) => {
    const event = {
        type,
        at: nowIso(),
        ...(detail ? { detail } : {})
    };
    entry.recentEvents = [...(Array.isArray(entry.recentEvents) ? entry.recentEvents : []), event].slice(-EVENT_BUFFER_SIZE);
};

const normalizeSummary = (summary, fallback = {}) => ({
    ...(isRecord(summary) ? summary : {}),
    ...fallback
});

const getBlockingReason = (job) => {
    if (job.status === 'auth_required') {
        return job.blockingReason || 'auth_required';
    }
    if (job.status === 'retrying') {
        return job.blockingReason || 'retry_scheduled';
    }
    return job.blockingReason || null;
};

const isStuckJob = (job) => {
    if (!['uploading', 'retrying'].includes(job.status)) {
        return false;
    }

    const updatedAt = Date.parse(job.updatedAt || '');
    return Number.isFinite(updatedAt) && Date.now() - updatedAt > QUEUE_STUCK_MS;
};

const getErrorCode = (error) => {
    if (typeof error?.code === 'string') {
        return error.code;
    }
    if (isRecord(error?.payload) && typeof error.payload.code === 'string') {
        return error.payload.code;
    }
    return '';
};

const ensureDir = async (dir) => {
    await fsp.mkdir(dir, { recursive: true });
};

const sha256File = async (filePath) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
});

const appendFileToForm = async (form, fieldName, filePath, fileName, mimeType) => {
    if (typeof fs.openAsBlob === 'function') {
        const blob = await fs.openAsBlob(filePath, { type: mimeType || 'application/octet-stream' });
        form.append(fieldName, blob, fileName);
        return;
    }

    const buffer = await fsp.readFile(filePath);
    form.append(fieldName, new Blob([buffer], { type: mimeType || 'application/octet-stream' }), fileName);
};

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

class MediaUploadQueue extends EventEmitter {
    constructor({ rootDir, getApiOrigin, getAccessToken, refreshAccessToken = null }) {
        super();
        this.rootDir = rootDir;
        this.filesDir = path.join(rootDir, 'files');
        this.statePath = path.join(rootDir, 'queue.json');
        this.getApiOrigin = getApiOrigin;
        this.getAccessToken = getAccessToken;
        this.refreshAccessToken = refreshAccessToken;
        this.jobs = [];
        this.stagedFiles = new Map();
        this.abortControllers = new Map();
        this.processing = false;
        this.timer = null;
        this.persistPromise = Promise.resolve();
    }

    async init() {
        await ensureDir(this.rootDir);
        await ensureDir(this.filesDir);
        await this.load();
        this.jobs = this.jobs.map((job) => (
            job.status === 'uploading'
                ? { ...job, status: 'retrying', nextAttemptAt: Date.now(), updatedAt: nowIso() }
                : job
        ));
        await this.persist();
        this.schedule(0);
    }

    async load() {
        try {
            const raw = await fsp.readFile(this.statePath, 'utf8');
            const parsed = JSON.parse(raw);
            this.jobs = Array.isArray(parsed?.jobs) ? parsed.jobs.filter(isRecord).map((job) => this.normalizeLoadedJob(job)) : [];
        } catch {
            this.jobs = [];
        }
    }

    normalizeLoadedJob(job) {
        const isLegacyPhotoToolStale = job.type === 'PHOTO_TOOL_APPLY'
            && job.status === 'failed'
            && /Данные photo-tool изменились|Фото партии уже обновились/i.test(String(job.lastError || ''));
        return {
            ...job,
            ...(LEGACY_VIDEO_UPLOAD_JOB_TYPES.has(job.type) && !DONE_STATUSES.has(job.status) ? {
                status: 'cancelled',
                lastError: 'Legacy video export upload отключен. Используйте V2 export-run.',
                nextAttemptAt: 0
            } : {}),
            blockingReason: typeof job.blockingReason === 'string'
                ? job.blockingReason
                : isLegacyPhotoToolStale ? 'photo_tool_state_stale' : null,
            recentEvents: Array.isArray(job.recentEvents) ? job.recentEvents.slice(-EVENT_BUFFER_SIZE) : [],
            progress: isRecord(job.progress) ? job.progress : null,
            summary: normalizeSummary(job.summary)
        };
    }

    async persist() {
        const payload = JSON.stringify({ version: STATE_VERSION, jobs: this.jobs }, null, 2);
        this.persistPromise = this.persistPromise
            .catch(() => undefined)
            .then(() => fsp.writeFile(this.statePath, `${payload}\n`, 'utf8'));
        await this.persistPromise;
    }

    getSnapshot() {
        const jobs = this.jobs.map((job) => ({
            id: job.id,
            type: job.type,
            status: job.status,
            attempts: job.attempts,
            nextAttemptAt: job.nextAttemptAt ?? null,
            lastError: job.lastError ?? null,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            doneAt: job.doneAt ?? null,
            result: job.result ?? null,
            blockingReason: getBlockingReason(job),
            recentEvents: Array.isArray(job.recentEvents) ? job.recentEvents : [],
            progress: isRecord(job.progress) ? job.progress : null,
            stuck: isStuckJob(job),
            summary: job.summary ?? null
        }));
        const counts = jobs.reduce((acc, job) => {
            acc[job.status] = (acc[job.status] || 0) + 1;
            return acc;
        }, {});

        return { jobs, counts };
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

    async stageFileStart(fileMeta) {
        const fileId = typeof fileMeta?.fileId === 'string' && fileMeta.fileId ? fileMeta.fileId : createId();
        const cachePath = path.join(this.filesDir, `${fileId}.bin`);
        await ensureDir(this.filesDir);
        await fsp.rm(cachePath, { force: true }).catch(() => undefined);
        await fsp.writeFile(cachePath, '');
        this.stagedFiles.set(fileId, {
            fileId,
            cachePath,
            originalName: safeFileName(fileMeta?.name),
            mimeType: typeof fileMeta?.mimeType === 'string' ? fileMeta.mimeType : 'application/octet-stream',
            size: Number(fileMeta?.size || 0)
        });
        return { fileId };
    }

    async stageFileChunk(fileId, chunk) {
        const staged = this.stagedFiles.get(fileId);
        if (!staged) {
            throw new Error('Файл очереди не найден для записи chunk.');
        }

        const buffer = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk);
        await fsp.appendFile(staged.cachePath, buffer);
        return { ok: true };
    }

    async stageFileFinish(fileId) {
        const staged = this.stagedFiles.get(fileId);
        if (!staged) {
            throw new Error('Файл очереди не найден для завершения staging.');
        }

        const stat = await fsp.stat(staged.cachePath);
        const checksumSha256 = await sha256File(staged.cachePath);
        const result = {
            ...staged,
            size: stat.size,
            checksumSha256
        };
        this.stagedFiles.set(fileId, result);
        return {
            fileId,
            size: result.size,
            checksumSha256
        };
    }

    getStagedFile(fileId) {
        const staged = this.stagedFiles.get(fileId);
        if (staged) {
            return staged;
        }

        return {
            fileId,
            cachePath: path.join(this.filesDir, `${fileId}.bin`),
            originalName: `${fileId}.bin`,
            mimeType: 'application/octet-stream'
        };
    }

    async enqueue(type, payload, files, summary) {
        const job = {
            id: createId(),
            type,
            status: 'queued',
            attempts: 0,
            nextAttemptAt: Date.now(),
            lastError: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            payload,
            files,
            blockingReason: null,
            recentEvents: [],
            summary: normalizeSummary(summary, {
                fileName: files?.[0]?.originalName,
                tool: type.startsWith('VIDEO') ? 'Video Tool' : 'Photo Tool'
            })
        };
        appendEvent(job, 'created');

        this.jobs.unshift(job);
        await this.persist();
        this.emitChange();
        this.schedule(0);
        return job;
    }

    async enqueuePhotoToolApply(payload) {
        const files = (payload.files || []).map((file) => ({
            ...this.getStagedFile(file.fileId),
            ...file
        }));
        return this.enqueue('PHOTO_TOOL_APPLY', {
            batchId: payload.batchId,
            manifest: payload.manifest,
            basePhotoStateToken: payload.basePhotoStateToken
        }, files, {
            title: 'Photo Tool',
            batchId: payload.batchId,
            batchLabel: payload.batchLabel,
            subtitle: payload.subtitle,
            total: files.length
        });
    }

    async retry(jobId) {
        const job = this.jobs.find((entry) => entry.id === jobId);
        if (!job || DONE_STATUSES.has(job.status)) {
            return this.getSnapshot();
        }

        job.status = 'queued';
        job.nextAttemptAt = Date.now();
        job.lastError = null;
        job.blockingReason = null;
        job.progress = null;
        job.updatedAt = nowIso();
        appendEvent(job, 'retry_scheduled');
        await this.persist();
        this.emitChange();
        this.schedule(0);
        return this.getSnapshot();
    }

    async cancel(jobId) {
        const job = this.jobs.find((entry) => entry.id === jobId);
        if (!job || job.status === 'done') {
            return this.getSnapshot();
        }

        const wasUploading = job.status === 'uploading';
        this.abortControllers.get(job.id)?.abort();
        job.status = 'cancelled';
        job.updatedAt = nowIso();
        job.blockingReason = null;
        appendEvent(job, 'cancelled');
        if (!wasUploading) {
            await this.cleanupJobFiles(job);
        }
        await this.persist();
        this.emitChange();
        return this.getSnapshot();
    }

    async clearCompleted() {
        const completed = this.jobs.filter((job) => ['done', 'cancelled'].includes(job.status));
        await Promise.all(completed.map((job) => this.cleanupJobFiles(job)));
        this.jobs = this.jobs.filter((job) => !['done', 'cancelled'].includes(job.status));
        await this.persist();
        this.emitChange();
        return this.getSnapshot();
    }

    async cleanupJobFiles(job) {
        await Promise.all((job.files || []).map((file) => (
            file.cachePath ? fsp.rm(file.cachePath, { force: true }).catch(() => undefined) : Promise.resolve()
        )));
    }

    getNextReadyJob() {
        const now = Date.now();
        const hasAccessToken = Boolean(this.getAccessToken());
        return this.jobs
            .slice()
            .reverse()
            .find((job) => ACTIVE_STATUSES.has(job.status)
                && job.status !== 'uploading'
                && (job.status !== 'auth_required' || hasAccessToken)
                && (job.nextAttemptAt ?? 0) <= now);
    }

    async processNext() {
        if (this.processing) {
            return;
        }

        const job = this.getNextReadyJob();
        if (!job) {
            const hasAccessToken = Boolean(this.getAccessToken());
            const nextAt = this.jobs
                .filter((entry) => ACTIVE_STATUSES.has(entry.status)
                    && entry.status !== 'uploading'
                    && (entry.status !== 'auth_required' || hasAccessToken)
                    && entry.nextAttemptAt)
                .map((entry) => entry.nextAttemptAt)
                .sort((left, right) => left - right)[0];
            if (nextAt) {
                this.schedule(Math.max(500, nextAt - Date.now()));
            }
            return;
        }

        this.processing = true;
        await this.runJob(job).finally(() => {
            this.processing = false;
            this.schedule(250);
        });
    }

    async runJob(job) {
        let token = this.getAccessToken();
        if (!token && this.refreshAccessToken) {
            token = await this.refreshAccessToken().catch(() => null);
        }
        if (!token) {
            job.status = 'auth_required';
            job.lastError = 'Нужно войти в HQ заново.';
            job.blockingReason = 'auth_required';
            job.updatedAt = nowIso();
            appendEvent(job, 'blocked_auth');
            await this.persist();
            this.emitChange();
            return;
        }

        job.status = 'uploading';
        job.attempts = Number(job.attempts || 0) + 1;
        job.blockingReason = null;
        job.progress = {
            percent: 0,
            uploadedBytes: 0,
            totalBytes: Number(job.progress?.totalBytes || 0)
        };
        job.updatedAt = nowIso();
        appendEvent(job, 'started');
        await this.persist();
        this.emitChange();

        const abortController = new AbortController();
        this.abortControllers.set(job.id, abortController);
        try {
            const result = await this.performJob(job, token);
            if (job.status === 'cancelled' || abortController.signal.aborted) {
                await this.cleanupJobFiles(job);
                await this.persist();
                this.emitChange();
                return;
            }
            job.status = 'done';
            job.result = result;
            job.lastError = null;
            job.blockingReason = null;
            job.progress = {
                ...(isRecord(job.progress) ? job.progress : {}),
                percent: 100
            };
            job.doneAt = nowIso();
            job.updatedAt = nowIso();
            appendEvent(job, 'completed');
            await this.cleanupJobFiles(job);
            await this.persist();
            this.emitChange();
        } catch (error) {
            if (job.status === 'cancelled' || abortController.signal.aborted || error?.name === 'AbortError') {
                job.status = 'cancelled';
                job.blockingReason = null;
                job.lastError = 'Cancelled by user';
                job.updatedAt = nowIso();
                appendEvent(job, 'cancelled');
                await this.cleanupJobFiles(job);
                await this.persist();
                this.emitChange();
                return;
            }

            const statusCode = Number(error?.statusCode || 0);
            const errorCode = getErrorCode(error);
            job.lastError = error instanceof Error ? error.message : 'Загрузка не выполнена.';
            job.updatedAt = nowIso();

            if (statusCode === 401 || statusCode === 403) {
                const refreshedToken = this.refreshAccessToken
                    ? await this.refreshAccessToken().catch(() => null)
                    : null;
                if (refreshedToken) {
                    job.status = 'retrying';
                    job.nextAttemptAt = Date.now() + 250;
                    job.blockingReason = 'retry_scheduled';
                    appendEvent(job, 'auth_refreshed');
                } else {
                    job.status = 'auth_required';
                    job.blockingReason = 'auth_required';
                    appendEvent(job, 'blocked_auth');
                }
            } else if (errorCode === 'PHOTO_TOOL_STATE_STALE') {
                job.status = 'failed';
                job.blockingReason = 'photo_tool_state_stale';
                job.nextAttemptAt = 0;
                appendEvent(job, 'failed', { code: errorCode });
            } else if (job.attempts < MAX_ATTEMPTS && (statusCode === 0 || RETRYABLE_STATUS_CODES.has(statusCode))) {
                const delay = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** Math.max(0, job.attempts - 1)));
                job.status = 'retrying';
                job.nextAttemptAt = Date.now() + delay;
                job.blockingReason = 'retry_scheduled';
                appendEvent(job, 'retry_scheduled');
            } else {
                job.status = 'failed';
                job.blockingReason = null;
                job.nextAttemptAt = 0;
                appendEvent(job, 'failed');
            }

            await this.persist();
            this.emitChange();
        } finally {
            this.abortControllers.delete(job.id);
        }
    }

    async performJob(job, token) {
        if (job.type === 'PHOTO_TOOL_APPLY') {
            return this.uploadPhotoToolApply(job, token);
        }

        throw new Error(`Неизвестный тип media queue job: ${job.type}`);
    }

    buildApiUrl(pathname) {
        return `${this.getApiOrigin().replace(/\/+$/, '')}${pathname}`;
    }

    async uploadPhotoToolApply(job, token) {
        const form = new FormData();
        const fileIndexToFile = new Map((job.files || []).map((file, index) => [index, file]));
        const manifest = (job.payload.manifest || []).map((entry) => {
            if (entry.source !== 'upload') {
                return entry;
            }

            const file = fileIndexToFile.get(entry.file_index);
            return {
                ...entry,
                queue_job_id: job.id,
                queue_file_id: file?.fileId
            };
        });

        for (const file of job.files || []) {
            await appendFileToForm(form, 'files', file.cachePath, file.originalName, file.mimeType);
        }
        form.append('manifest', JSON.stringify(manifest));
        form.append('base_photo_state_token', job.payload.basePhotoStateToken);
        form.append('queue_job_id', job.id);

        const response = await fetch(this.buildApiUrl(`/api/batches/${encodeURIComponent(job.payload.batchId)}/photo-tool/apply`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form
        });

        return parseJsonResponse(response, 'Не удалось сохранить назначения photo-tool.');
    }

    async updateUploadProgress(job, uploadedBytes, totalBytes, force = false) {
        const percent = totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))) : 0;
        const previousPercent = Number(job.progress?.percent ?? -1);
        const previousUpdatedAt = Date.parse(job.updatedAt || '');
        const enoughTimePassed = !Number.isFinite(previousUpdatedAt) || Date.now() - previousUpdatedAt > 500;
        if (!force && percent === previousPercent && !enoughTimePassed) {
            return;
        }

        job.progress = { percent, uploadedBytes, totalBytes };
        job.updatedAt = nowIso();
        await this.persist();
        this.emitChange();
    }
}

module.exports = {
    MediaUploadQueue
};
