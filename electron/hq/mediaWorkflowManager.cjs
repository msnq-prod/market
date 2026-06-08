const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { EventEmitter } = require('events');

const heicConvert = require('heic-convert');

const ACTIVE_PHOTO_PHASES = new Set([
    'queued',
    'converting',
    'uploading',
    'verifying',
    'paused_offline',
    'auth_required'
]);
const TERMINAL_PHASES = new Set(['completed', 'cancelled', 'failed']);
const IMAGE_CONVERT_EXTENSIONS = new Set(['.heic', '.heif']);
const RETRY_DELAY_MS = 3_000;
const VERIFY_DELAY_MS = 1_200;
const STATE_VERSION = 2;
const EVENT_BUFFER_SIZE = 10;
const WORKFLOW_STUCK_MS = 10 * 60_000;
const DEFAULT_PHOTO_EXPORT_SETTINGS = {
    format: 'jpeg',
    quality: 80,
    maxWidth: 1200,
    maxHeight: 1200
};

const nowIso = () => new Date().toISOString();
const createId = () => crypto.randomUUID();
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const safeFileName = (value) => String(value || 'file')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'file';
const appendEvent = (entry, type, detail) => {
    const event = {
        type,
        at: nowIso(),
        ...(detail ? { detail } : {})
    };
    entry.recentEvents = [...(Array.isArray(entry.recentEvents) ? entry.recentEvents : []), event].slice(-EVENT_BUFFER_SIZE);
};

const getBlockingReason = (workflow) => {
    if (workflow.phase === 'auth_required') {
        return workflow.blockingReason || 'auth_required';
    }
    if (workflow.phase === 'paused_offline') {
        return workflow.blockingReason || 'offline';
    }
    return workflow.blockingReason || null;
};

const isStuckWorkflow = (workflow) => {
    if (!isActiveWorkflow(workflow) || ['paused_offline', 'auth_required'].includes(workflow.phase)) {
        return false;
    }

    const updatedAt = Date.parse(workflow.updatedAt || '');
    return Number.isFinite(updatedAt) && Date.now() - updatedAt > WORKFLOW_STUCK_MS;
};

const ensureDir = async (directory) => {
    await fsp.mkdir(directory, { recursive: true });
};

const safeRemove = async (targetPath) => {
    if (!targetPath) {
        return;
    }

    await fsp.rm(targetPath, { force: true, recursive: true }).catch(() => undefined);
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

const createWorkflowHash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileCachePathFor = (rootDir, fileId) => path.join(rootDir, `${fileId}.bin`);
const isLikelyOfflineError = (message) => /Failed to fetch|fetch failed|network|ECONNREFUSED|ECONNRESET|ENOTFOUND|timed out|timeout|socket hang up|offline/i.test(String(message || ''));
const clampInteger = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
};
const normalizePhotoExportSettings = (value) => {
    if (!isRecord(value)) {
        return { ...DEFAULT_PHOTO_EXPORT_SETTINGS };
    }

    return {
        format: 'jpeg',
        quality: clampInteger(value.quality, DEFAULT_PHOTO_EXPORT_SETTINGS.quality, 40, 95),
        maxWidth: clampInteger(value.maxWidth, DEFAULT_PHOTO_EXPORT_SETTINGS.maxWidth, 800, 4096),
        maxHeight: clampInteger(value.maxHeight, DEFAULT_PHOTO_EXPORT_SETTINGS.maxHeight, 800, 4096)
    };
};

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

const isActiveWorkflow = (workflow) => {
    return ACTIVE_PHOTO_PHASES.has(workflow.phase);
};

const getRoutePath = (workflow) => `/admin/photo-tool/${encodeURIComponent(workflow.batchId)}`;

const getWorkflowPhaseCompletedUnits = (workflow, total) => {
    if (total <= 0) {
        return 0;
    }

    switch (workflow.phase) {
        case 'completed':
            return total;
        case 'verifying':
            return Math.max(1, Math.floor(total * 0.9));
        case 'uploading':
        case 'paused_offline':
        case 'auth_required':
            return Math.max(1, Math.floor(total * 0.6));
        case 'converting':
            return Math.max(1, Math.floor(total * 0.25));
        default:
            return 0;
    }
};

const buildWorkflowSnapshot = (workflow) => {
    const total = workflow.items.length;
    const completed = getWorkflowPhaseCompletedUnits(workflow, total);

    return {
        id: workflow.id,
        kind: workflow.kind,
        batchId: workflow.batchId,
        phase: workflow.phase,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
        lastError: workflow.lastError || null,
        nextAttemptAt: workflow.nextAttemptAt || null,
        blockingReason: getBlockingReason(workflow),
        recentEvents: Array.isArray(workflow.recentEvents) ? workflow.recentEvents : [],
        stuck: isStuckWorkflow(workflow),
        summary: {
            title: workflow.summary?.title || 'Photo workflow',
            subtitle: workflow.summary?.subtitle || '',
            batchLabel: workflow.summary?.batchLabel || workflow.batchId
        },
        routePath: getRoutePath(workflow),
        progress: {
            completed,
            total
        },
        uploadState: null
    };
};

class MediaWorkflowManager extends EventEmitter {
    constructor({ rootDir, stagedFilesDir, mediaQueue, getApiOrigin, getAccessToken, refreshAccessToken = null }) {
        super();
        this.rootDir = rootDir;
        this.stagedFilesDir = stagedFilesDir;
        this.statePath = path.join(rootDir, 'workflows.json');
        this.mediaQueue = mediaQueue;
        this.getApiOrigin = getApiOrigin;
        this.getAccessToken = getAccessToken;
        this.refreshAccessToken = refreshAccessToken;
        this.workflows = [];
        this.processing = false;
        this.persistPromise = Promise.resolve();
        this.timer = null;
    }

    async init() {
        await ensureDir(this.rootDir);
        await this.load();
        this.mediaQueue.on('change', () => {
            this.emitChange();
            this.schedule(0);
        });
        this.schedule(0);
    }

    async load() {
        try {
            const raw = await fsp.readFile(this.statePath, 'utf8');
            const parsed = JSON.parse(raw);
            const workflows = Array.isArray(parsed?.workflows) ? parsed.workflows : [];
            this.workflows = workflows
                .filter((workflow) => isRecord(workflow) && workflow.kind === 'PHOTO_APPLY_WORKFLOW')
                .map((workflow) => this.normalizeLoadedWorkflow(workflow));
        } catch {
            this.workflows = [];
        }
    }

    normalizeLoadedWorkflow(workflow) {
        const nextWorkflow = {
            ...workflow,
            lastError: typeof workflow.lastError === 'string' ? workflow.lastError : '',
            nextAttemptAt: Number(workflow.nextAttemptAt || 0) || 0
        };
        nextWorkflow.blockingReason = typeof workflow.blockingReason === 'string' ? workflow.blockingReason : null;
        nextWorkflow.recentEvents = Array.isArray(workflow.recentEvents) ? workflow.recentEvents.slice(-EVENT_BUFFER_SIZE) : [];
        nextWorkflow.summary = isRecord(workflow.summary) ? workflow.summary : {};
        nextWorkflow.photoExportSettings = normalizePhotoExportSettings(workflow.photoExportSettings);

        nextWorkflow.items = Array.isArray(workflow.items) ? workflow.items : [];
        nextWorkflow.files = Array.isArray(workflow.files) ? workflow.files : [];

        return nextWorkflow;
    }

    async persist() {
        const payload = JSON.stringify({ version: STATE_VERSION, workflows: this.workflows }, null, 2);
        this.persistPromise = this.persistPromise
            .catch(() => undefined)
            .then(() => fsp.writeFile(this.statePath, `${payload}\n`, 'utf8'));
        await this.persistPromise;
    }

    getSnapshot() {
        const workflows = this.workflows.map(buildWorkflowSnapshot);
        const counts = workflows.reduce((acc, workflow) => {
            acc[workflow.phase] = (acc[workflow.phase] || 0) + 1;
            return acc;
        }, {});

        return { workflows, counts };
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

    findDuplicate(kind, batchId, manifestHash) {
        return this.workflows.find((workflow) =>
            workflow.kind === kind
            && workflow.batchId === batchId
            && workflow.manifestHash === manifestHash
            && !TERMINAL_PHASES.has(workflow.phase)
        ) || null;
    }

    findActiveBatchWorkflow(kind, batchId) {
        return this.workflows.find((workflow) =>
            workflow.kind === kind
            && workflow.batchId === batchId
            && !TERMINAL_PHASES.has(workflow.phase)
        ) || null;
    }

    async cleanupPayloadFiles(payload) {
        await Promise.all((payload.files || [])
            .filter((file) => isNonEmptyString(file?.fileId))
            .map((file) => safeRemove(fileCachePathFor(this.stagedFilesDir, file.fileId))));
    }

    async startPhotoApplyWorkflow(payload) {
        const manifestHash = createWorkflowHash({
            batchId: payload.batchId,
            basePhotoStateToken: payload.basePhotoStateToken,
            items: payload.items
        });
        const duplicate = this.findActiveBatchWorkflow('PHOTO_APPLY_WORKFLOW', payload.batchId);
        if (duplicate) {
            await this.cleanupPayloadFiles(payload);
            appendEvent(duplicate, 'duplicate_ignored', { stagedFilesCleaned: Array.isArray(payload.files) ? payload.files.length : 0 });
            await this.markChanged();
            return buildWorkflowSnapshot(duplicate);
        }

        const files = (payload.files || []).map((file) => ({
            fileId: file.fileId,
            cachePath: fileCachePathFor(this.stagedFilesDir, file.fileId),
            originalName: safeFileName(file.originalName || file.name),
            mimeType: file.mimeType || 'application/octet-stream',
            size: Number(file.size || 0) || 0,
            checksumSha256: file.checksumSha256 || ''
        }));
        const workflow = {
            id: createId(),
            kind: 'PHOTO_APPLY_WORKFLOW',
            batchId: payload.batchId,
            phase: 'queued',
            createdAt: nowIso(),
            updatedAt: nowIso(),
            nextAttemptAt: 0,
            lastError: '',
            blockingReason: null,
            recentEvents: [],
            summary: {
                title: 'Photo workflow',
                subtitle: payload.subtitle || `${files.length} фото`,
                batchLabel: payload.batchLabel || payload.batchId
            },
            manifestHash,
            basePhotoStateToken: payload.basePhotoStateToken,
            photoExportSettings: normalizePhotoExportSettings(payload.photoExportSettings),
            items: Array.isArray(payload.items) ? payload.items : [],
            files
        };
        appendEvent(workflow, 'created');

        this.workflows.unshift(workflow);
        await this.markChanged();
        this.schedule(0);
        return buildWorkflowSnapshot(workflow);
    }

    async retryWorkflow(workflowId) {
        const workflow = this.workflows.find((entry) => entry.id === workflowId);
        if (!workflow) {
            return this.getSnapshot();
        }

        workflow.lastError = '';
        workflow.updatedAt = nowIso();
        workflow.nextAttemptAt = 0;
        workflow.blockingReason = null;
        appendEvent(workflow, 'retry_scheduled');
        workflow.phase = 'queued';

        await this.markChanged();
        this.schedule(0);
        return this.getSnapshot();
    }

    async cancelWorkflow(workflowId) {
        const workflow = this.workflows.find((entry) => entry.id === workflowId);
        if (!workflow) {
            return this.getSnapshot();
        }

        workflow.phase = 'cancelled';
        workflow.updatedAt = nowIso();
        workflow.nextAttemptAt = 0;
        workflow.blockingReason = null;
        appendEvent(workflow, 'cancelled');
        await this.cleanupWorkflowFiles(workflow);
        await this.markChanged();
        return this.getSnapshot();
    }

    async cleanupWorkflowFiles(workflow) {
        await Promise.all((workflow.files || []).map((file) => safeRemove(file.cachePath)));
        await Promise.all((workflow.files || []).map((file) => safeRemove(file.convertedPath)));
    }

    getNextReadyWorkflow() {
        const now = Date.now();
        return this.workflows.find((workflow) =>
            isActiveWorkflow(workflow)
            && (workflow.nextAttemptAt || 0) <= now
        ) || null;
    }

    async processNext() {
        if (this.processing) {
            return;
        }

        this.processing = true;
        try {
            const workflow = this.getNextReadyWorkflow();
            if (workflow) {
                await this.processPhotoWorkflow(workflow);
            }
        } finally {
            this.processing = false;
            const nextAt = this.workflows
                .filter(isActiveWorkflow)
                .map((entry) => entry.nextAttemptAt || 0)
                .filter(Boolean)
                .sort((left, right) => left - right)[0];
            const delay = nextAt ? Math.max(500, nextAt - Date.now()) : 2000;
            this.schedule(delay);
        }
    }

    buildApiUrl(pathname) {
        return `${this.getApiOrigin().replace(/\/+$/, '')}${pathname}`;
    }

    async apiRequest(pathname, init = {}, fallbackMessage = 'Запрос не выполнен.') {
        let token = this.getAccessToken();
        if (!token && this.refreshAccessToken) {
            token = await this.refreshAccessToken().catch(() => null);
        }
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

    async setWorkflowPhase(workflow, phase, overrides = {}) {
        const previousPhase = workflow.phase;
        workflow.phase = phase;
        workflow.updatedAt = nowIso();
        workflow.lastError = overrides.lastError !== undefined ? overrides.lastError : workflow.lastError;
        workflow.nextAttemptAt = overrides.nextAttemptAt !== undefined ? overrides.nextAttemptAt : workflow.nextAttemptAt;
        workflow.blockingReason = overrides.blockingReason !== undefined
            ? overrides.blockingReason
            : ['auth_required', 'paused_offline'].includes(phase) ? getBlockingReason(workflow) : null;
        Object.assign(workflow, overrides);
        if (previousPhase !== phase) {
            appendEvent(workflow, phase === 'completed' ? 'completed' : phase === 'failed' ? 'failed' : 'started', { phase });
        }
        await this.markChanged();
    }

    async handleWorkflowError(workflow, error) {
        const normalized = normalizeFailure(error, 'Фото workflow завершился с ошибкой.');
        workflow.lastError = normalized.message || workflow.lastError;
        workflow.updatedAt = nowIso();

        if (normalized.code === 'AUTH_REQUIRED') {
            const refreshedToken = this.refreshAccessToken
                ? await this.refreshAccessToken().catch(() => null)
                : null;
            if (refreshedToken) {
                workflow.phase = 'uploading';
                workflow.nextAttemptAt = Date.now() + RETRY_DELAY_MS;
                workflow.blockingReason = 'retry_scheduled';
                appendEvent(workflow, 'auth_refreshed');
            } else {
                workflow.phase = 'auth_required';
                workflow.nextAttemptAt = Date.now() + RETRY_DELAY_MS;
                workflow.blockingReason = 'auth_required';
                appendEvent(workflow, 'blocked_auth');
            }
        } else if (normalized.code === 'OFFLINE') {
            workflow.phase = 'paused_offline';
            workflow.nextAttemptAt = Date.now() + RETRY_DELAY_MS;
            workflow.blockingReason = 'offline';
            appendEvent(workflow, 'blocked_offline');
        } else {
            workflow.phase = 'failed';
            workflow.nextAttemptAt = 0;
            workflow.blockingReason = null;
            appendEvent(workflow, 'failed');
        }

        await this.markChanged();
    }

    async normalizePhotoFiles(workflow) {
        let changed = false;
        for (const file of workflow.files) {
            const extension = path.extname(file.originalName).toLowerCase();
            if (!IMAGE_CONVERT_EXTENSIONS.has(extension) || file.convertedPath) {
                continue;
            }

            const sourceBuffer = await fsp.readFile(file.cachePath);
            const converted = await heicConvert({
                buffer: sourceBuffer,
                format: 'JPEG',
                quality: 0.92
            });
            const convertedBuffer = converted instanceof ArrayBuffer
                ? Buffer.from(new Uint8Array(converted))
                : Buffer.from(converted);
            const convertedPath = `${file.cachePath}.jpg`;
            await fsp.writeFile(convertedPath, convertedBuffer);
            file.convertedPath = convertedPath;
            file.uploadName = `${path.parse(file.originalName).name || 'photo'}.jpg`;
            file.mimeType = 'image/jpeg';
            file.checksumSha256 = await sha256File(convertedPath);
            changed = true;
        }

        if (changed) {
            await this.markChanged();
        }
    }

    buildPhotoManifest(workflow) {
        const fileIndexById = new Map(workflow.files.map((file, index) => [file.fileId, index]));
        return workflow.items.map((item) => {
            if (item.source === 'existing') {
                return {
                    item_id: item.itemId,
                    item_seq: item.itemSeq,
                    source: 'existing',
                    existing_url: item.existingUrl
                };
            }

            const fileIndex = fileIndexById.get(item.fileId);
            const file = workflow.files.find((entry) => entry.fileId === item.fileId);
            return {
                item_id: item.itemId,
                item_seq: item.itemSeq,
                source: 'upload',
                file_index: fileIndex,
                queue_job_id: workflow.id,
                queue_file_id: item.fileId
            };
        });
    }

    verifyPhotoApplyResponse(workflow, payload) {
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const photoUrlByItemId = new Map(items.map((item) => [item.id, item.item_photo_url || null]));
        return workflow.items.every((item) => {
            const value = photoUrlByItemId.get(item.itemId) || null;
            if (item.source === 'existing') {
                return value === item.existingUrl;
            }
            return isNonEmptyString(value);
        });
    }

    async processPhotoWorkflow(workflow) {
        try {
            if (workflow.phase === 'queued' || workflow.phase === 'converting') {
                await this.setWorkflowPhase(workflow, 'converting', { nextAttemptAt: 0, lastError: '' });
                await this.normalizePhotoFiles(workflow);
                await this.setWorkflowPhase(workflow, 'uploading', { nextAttemptAt: 0, lastError: '' });
            }

            if (workflow.phase === 'paused_offline' || workflow.phase === 'auth_required') {
                await this.setWorkflowPhase(workflow, 'uploading', { nextAttemptAt: 0, lastError: '' });
            }

            if (workflow.phase !== 'uploading' && workflow.phase !== 'verifying') {
                return;
            }

            const form = new FormData();
            for (const file of workflow.files) {
                const uploadPath = file.convertedPath || file.cachePath;
                const uploadName = file.uploadName || file.originalName;
                await appendFileToForm(form, 'files', uploadPath, uploadName, file.mimeType);
            }
            form.append('manifest', JSON.stringify(this.buildPhotoManifest(workflow)));
            form.append('base_photo_state_token', workflow.basePhotoStateToken);
            form.append('photo_export_settings', JSON.stringify(normalizePhotoExportSettings(workflow.photoExportSettings)));
            form.append('queue_job_id', workflow.id);

            const payload = await this.apiRequest(`/api/batches/${encodeURIComponent(workflow.batchId)}/photo-tool/apply`, {
                method: 'POST',
                body: form
            }, 'Не удалось сохранить назначения photo-tool.');

            await this.setWorkflowPhase(workflow, 'verifying', { nextAttemptAt: Date.now() + VERIFY_DELAY_MS, lastError: '' });
            if (!this.verifyPhotoApplyResponse(workflow, payload)) {
                throw new Error('Photo workflow не прошёл проверку итоговых item_photo_url.');
            }

            await this.cleanupWorkflowFiles(workflow);
            await this.setWorkflowPhase(workflow, 'completed', { nextAttemptAt: 0, lastError: '' });
        } catch (error) {
            await this.handleWorkflowError(workflow, error);
        }
    }

}

module.exports = {
    MediaWorkflowManager
};
