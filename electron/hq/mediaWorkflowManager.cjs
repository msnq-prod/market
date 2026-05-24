const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { EventEmitter } = require('events');

const heicConvert = require('heic-convert');

const ACTIVE_VIDEO_PHASES = new Set([
    'queued',
    'preparing_session',
    'importing_sources',
    'rendering_intro',
    'rendering_outputs',
    'uploading_outputs',
    'verifying',
    'paused_offline',
    'auth_required'
]);
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
const HELPER_BASE_URL = 'http://127.0.0.1:3012';
const HELPER_PROTOCOL_VERSION = 'stones-video-export-helper-v3';
const VIDEO_EXPORT_CROSSFADE_MS = 200;
const STATE_VERSION = 2;
const EVENT_BUFFER_SIZE = 10;
const WORKFLOW_STUCK_MS = 10 * 60_000;

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
    if (workflow.kind === 'VIDEO_EXPORT_WORKFLOW') {
        return ACTIVE_VIDEO_PHASES.has(workflow.phase);
    }

    return ACTIVE_PHOTO_PHASES.has(workflow.phase);
};

const getRoutePath = (workflow) => workflow.kind === 'VIDEO_EXPORT_WORKFLOW'
    ? `/admin/video-tool/${encodeURIComponent(workflow.batchId)}`
    : `/admin/photo-tool/${encodeURIComponent(workflow.batchId)}`;

const buildWorkflowSnapshot = (workflow) => {
    const total = workflow.kind === 'VIDEO_EXPORT_WORKFLOW'
        ? workflow.expectedCount
        : workflow.items.length;
    const completed = workflow.kind === 'VIDEO_EXPORT_WORKFLOW'
        ? workflow.confirmedSerials.length
        : workflow.phase === 'completed'
            ? workflow.items.length
            : 0;
    const currentSerial = workflow.kind === 'VIDEO_EXPORT_WORKFLOW'
        ? workflow.pendingSerials[0] || workflow.confirmedSerials.at(-1) || ''
        : '';

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
            title: workflow.summary?.title || (workflow.kind === 'VIDEO_EXPORT_WORKFLOW' ? 'Video workflow' : 'Photo workflow'),
            subtitle: workflow.summary?.subtitle || '',
            batchLabel: workflow.summary?.batchLabel || workflow.batchId,
            currentSerial
        },
        routePath: getRoutePath(workflow),
        sessionId: workflow.sessionId || null,
        sessionVersion: workflow.sessionVersion || null,
        progress: {
            completed,
            total
        },
        uploadState: workflow.kind === 'VIDEO_EXPORT_WORKFLOW'
            ? {
                pendingSerials: [...workflow.pendingSerials],
                confirmedSerials: [...workflow.confirmedSerials],
                failedSerials: [...workflow.failedSerials]
            }
            : null
    };
};

class MediaWorkflowManager extends EventEmitter {
    constructor({ rootDir, stagedFilesDir, mediaQueue, getApiOrigin, getAccessToken, getAppOrigin }) {
        super();
        this.rootDir = rootDir;
        this.stagedFilesDir = stagedFilesDir;
        this.statePath = path.join(rootDir, 'workflows.json');
        this.mediaQueue = mediaQueue;
        this.getApiOrigin = getApiOrigin;
        this.getAccessToken = getAccessToken;
        this.getAppOrigin = getAppOrigin || getApiOrigin;
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
            this.workflows = workflows.filter(isRecord).map((workflow) => this.normalizeLoadedWorkflow(workflow));
            await this.validateLoadedVideoSources();
        } catch {
            this.workflows = [];
        }
    }

    async validateLoadedVideoSources() {
        let changed = false;
        for (const workflow of this.workflows) {
            if (workflow.kind !== 'VIDEO_EXPORT_WORKFLOW' || TERMINAL_PHASES.has(workflow.phase)) {
                continue;
            }

            for (const source of workflow.sources) {
                if (!source.cachePath) {
                    continue;
                }

                const exists = await fsp.stat(source.cachePath).then((stat) => stat.isFile()).catch(() => false);
                if (!exists) {
                    workflow.phase = 'failed';
                    workflow.lastError = 'local_cache_missing';
                    workflow.blockingReason = 'local_cache_missing';
                    workflow.nextAttemptAt = 0;
                    workflow.updatedAt = nowIso();
                    appendEvent(workflow, 'failed', { reason: 'local_cache_missing' });
                    changed = true;
                    break;
                }

                if (source.checksumSha256) {
                    const actualChecksum = await sha256File(source.cachePath).catch(() => '');
                    if (actualChecksum && actualChecksum !== source.checksumSha256) {
                        workflow.phase = 'failed';
                        workflow.lastError = 'local_cache_missing';
                        workflow.blockingReason = 'local_cache_missing';
                        workflow.nextAttemptAt = 0;
                        workflow.updatedAt = nowIso();
                        appendEvent(workflow, 'failed', { reason: 'local_cache_checksum_mismatch' });
                        changed = true;
                        break;
                    }
                }
            }
        }

        if (changed) {
            await this.persist();
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

        if (nextWorkflow.kind === 'VIDEO_EXPORT_WORKFLOW') {
            nextWorkflow.sources = Array.isArray(workflow.sources) ? workflow.sources : [];
            nextWorkflow.pendingSerials = Array.isArray(workflow.pendingSerials) ? workflow.pendingSerials : [];
            nextWorkflow.confirmedSerials = Array.isArray(workflow.confirmedSerials) ? workflow.confirmedSerials : [];
            nextWorkflow.failedSerials = Array.isArray(workflow.failedSerials) ? workflow.failedSerials : [];
            nextWorkflow.uploadJobIds = isRecord(workflow.uploadJobIds) ? workflow.uploadJobIds : {};
            nextWorkflow.expectedCount = Number(workflow.expectedCount || 0) || 0;
        } else {
            nextWorkflow.items = Array.isArray(workflow.items) ? workflow.items : [];
            nextWorkflow.files = Array.isArray(workflow.files) ? workflow.files : [];
        }

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

    async startPhotoApplyWorkflow(payload) {
        const manifestHash = createWorkflowHash({
            batchId: payload.batchId,
            basePhotoStateToken: payload.basePhotoStateToken,
            items: payload.items
        });
        const duplicate = this.findActiveBatchWorkflow('PHOTO_APPLY_WORKFLOW', payload.batchId);
        if (duplicate) {
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
            items: Array.isArray(payload.items) ? payload.items : [],
            files
        };
        appendEvent(workflow, 'created');

        this.workflows.unshift(workflow);
        await this.markChanged();
        this.schedule(0);
        return buildWorkflowSnapshot(workflow);
    }

    async startVideoExportWorkflow(payload) {
        const manifestHash = createWorkflowHash({
            batchId: payload.batchId,
            renderManifest: payload.renderManifest
        });
        const duplicate = this.findDuplicate('VIDEO_EXPORT_WORKFLOW', payload.batchId, manifestHash);
        if (duplicate) {
            return buildWorkflowSnapshot(duplicate);
        }

        const sources = (payload.sources || []).map((source) => ({
            sourceIndex: source.sourceIndex,
            role: source.role,
            helperSourceId: source.helperSourceId || '',
            originalName: safeFileName(source.originalName || source.name),
            mimeType: source.mimeType || 'video/mp4',
            size: Number(source.size || 0) || 0,
            checksumSha256: source.checksumSha256 || '',
            lastModified: Number(source.lastModified || 0) || 0,
            fileId: source.fileId,
            cachePath: source.cachePath || fileCachePathFor(this.stagedFilesDir, source.fileId),
            fingerprint: source.fingerprint || null
        }));
        const outputs = Array.isArray(payload.renderManifest?.outputs) ? payload.renderManifest.outputs : [];
        const expectedCount = outputs.length;
        const pendingSerials = outputs.map((output) => String(output.serial_number || '').trim().toUpperCase()).filter(Boolean);
        const workflow = {
            id: createId(),
            kind: 'VIDEO_EXPORT_WORKFLOW',
            batchId: payload.batchId,
            phase: 'queued',
            createdAt: nowIso(),
            updatedAt: nowIso(),
            nextAttemptAt: 0,
            lastError: '',
            blockingReason: null,
            recentEvents: [],
            summary: {
                title: 'Video workflow',
                subtitle: payload.subtitle || `${expectedCount} роликов`,
                batchLabel: payload.batchLabel || payload.batchId
            },
            manifestHash,
            expectedCount,
            renderManifest: payload.renderManifest,
            sourceFingerprint: payload.sourceFingerprint || null,
            helperBaseUrl: payload.helperBaseUrl || HELPER_BASE_URL,
            sessionId: payload.sessionId || '',
            sessionVersion: payload.sessionVersion || null,
            sources,
            introHelperSourceId: payload.introHelperSourceId || '',
            introJobId: '',
            introUploadJobId: '',
            renderJobId: '',
            uploadJobIds: {},
            pendingSerials,
            confirmedSerials: [],
            failedSerials: []
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
        if (workflow.kind === 'VIDEO_EXPORT_WORKFLOW') {
            workflow.phase = workflow.confirmedSerials.length >= workflow.expectedCount ? 'completed' : 'queued';
            workflow.failedSerials = [];
        } else {
            workflow.phase = 'queued';
        }

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
        if (workflow.kind === 'VIDEO_EXPORT_WORKFLOW') {
            await Promise.all((workflow.sources || []).map((source) => safeRemove(source.cachePath)));
            return;
        }

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

        const workflow = this.getNextReadyWorkflow();
        if (!workflow) {
            const nextAt = this.workflows
                .filter(isActiveWorkflow)
                .map((entry) => entry.nextAttemptAt || 0)
                .filter(Boolean)
                .sort((left, right) => left - right)[0];
            if (nextAt) {
                this.schedule(Math.max(500, nextAt - Date.now()));
            }
            return;
        }

        this.processing = true;
        try {
            if (workflow.kind === 'VIDEO_EXPORT_WORKFLOW') {
                await this.processVideoWorkflow(workflow);
            } else {
                await this.processPhotoWorkflow(workflow);
            }
        } finally {
            this.processing = false;
            this.schedule(250);
        }
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
        try {
            const method = String(init.method || 'GET').toUpperCase();
            const headers = new Headers(init.headers || {});

            if (method !== 'GET' && method !== 'HEAD') {
                headers.set('Origin', this.getAppOrigin());
                headers.set('X-Stones-Video-Helper-Version', HELPER_PROTOCOL_VERSION);
            }

            const response = await fetch(`${HELPER_BASE_URL}${pathname}`, {
                ...init,
                headers
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
        const normalized = normalizeFailure(error, workflow.kind === 'VIDEO_EXPORT_WORKFLOW' ? 'Видео workflow завершился с ошибкой.' : 'Фото workflow завершился с ошибкой.');
        workflow.lastError = normalized.message || workflow.lastError;
        workflow.updatedAt = nowIso();

        if (normalized.code === 'AUTH_REQUIRED') {
            workflow.phase = 'auth_required';
            workflow.nextAttemptAt = Date.now() + RETRY_DELAY_MS;
            workflow.blockingReason = 'auth_required';
            appendEvent(workflow, 'blocked_auth');
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
            if (workflow.kind === 'VIDEO_EXPORT_WORKFLOW') {
                const serials = new Set(workflow.failedSerials);
                for (const serial of workflow.pendingSerials) {
                    serials.add(serial);
                }
                workflow.failedSerials = Array.from(serials);
            }
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
                queue_file_id: item.fileId,
                checksum_sha256: file?.checksumSha256
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

    async reconcileVideoSession(workflow) {
        if (!workflow.sessionId) {
            return null;
        }

        const payload = await this.apiRequest(`/api/batches/${encodeURIComponent(workflow.batchId)}/video-export-sessions/${encodeURIComponent(workflow.sessionId)}`, undefined, 'Не удалось загрузить export-session.');
        const session = payload?.session || null;
        if (!session) {
            return null;
        }

        workflow.sessionVersion = session.version || workflow.sessionVersion;
        const uploadedManifest = Array.isArray(session.uploaded_manifest) ? session.uploaded_manifest : [];
        const confirmed = uploadedManifest
            .map((entry) => String(entry.serial_number || '').trim().toUpperCase())
            .filter(Boolean);
        const confirmedSet = new Set(confirmed);
        workflow.confirmedSerials = confirmed;
        workflow.pendingSerials = workflow.pendingSerials.filter((serial) => !confirmedSet.has(serial));
        for (const [serial, jobId] of Object.entries(workflow.uploadJobIds)) {
            if (confirmedSet.has(serial)) {
                delete workflow.uploadJobIds[serial];
            } else if (!jobId) {
                delete workflow.uploadJobIds[serial];
            }
        }
        workflow.updatedAt = nowIso();
        await this.markChanged();
        return session;
    }

    async reopenVideoSessionTail(workflow) {
        if (!workflow.sessionId) {
            return null;
        }

        const payload = await this.apiRequest(
            `/api/batches/${encodeURIComponent(workflow.batchId)}/video-export-sessions/${encodeURIComponent(workflow.sessionId)}/retry-tail`,
            { method: 'POST' },
            'Не удалось восстановить export-session.'
        );
        const session = payload?.session || null;
        if (!session) {
            throw new Error('Сервер не вернул export-session.');
        }

        workflow.sessionVersion = session.version || workflow.sessionVersion;
        const uploadedManifest = Array.isArray(session.uploaded_manifest) ? session.uploaded_manifest : [];
        const confirmed = uploadedManifest
            .map((entry) => String(entry.serial_number || '').trim().toUpperCase())
            .filter(Boolean);
        const confirmedSet = new Set(confirmed);
        const pendingSerials = Array.isArray(payload.pending_serials)
            ? payload.pending_serials.map((serial) => String(serial || '').trim().toUpperCase()).filter(Boolean)
            : (Array.isArray(session.render_manifest?.outputs) ? session.render_manifest.outputs : [])
                .map((output) => String(output.serial_number || '').trim().toUpperCase())
                .filter((serial) => serial && !confirmedSet.has(serial));

        workflow.confirmedSerials = confirmed;
        workflow.pendingSerials = pendingSerials;
        for (const [serial, jobId] of Object.entries(workflow.uploadJobIds)) {
            if (confirmedSet.has(serial) || !jobId) {
                delete workflow.uploadJobIds[serial];
            }
        }

        workflow.updatedAt = nowIso();
        await this.markChanged();
        return session;
    }

    getMediaQueueJob(jobId) {
        return this.mediaQueue.getSnapshot().jobs.find((job) => job.id === jobId) || null;
    }

    async ensureVideoSession(workflow) {
        const payload = await this.apiRequest(`/api/batches/${encodeURIComponent(workflow.batchId)}/video-export-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expected_count: workflow.expectedCount,
                crossfade_ms: VIDEO_EXPORT_CROSSFADE_MS,
                source_fingerprint: workflow.sourceFingerprint,
                render_manifest: workflow.renderManifest
            })
        }, 'Не удалось создать export-session.');
        const session = payload?.session || null;
        if (!session) {
            throw new Error('Сервер не вернул export-session.');
        }

        workflow.sessionId = session.session_id;
        workflow.sessionVersion = session.version;
        workflow.phase = 'importing_sources';
        workflow.updatedAt = nowIso();
        workflow.lastError = '';
        workflow.nextAttemptAt = 0;
        await this.markChanged();
        await this.reconcileVideoSession(workflow);
        return session;
    }

    async importSourceToHelper(workflow, source) {
        const form = new FormData();
        await appendFileToForm(form, 'file', source.cachePath, source.originalName, source.mimeType);
        form.append('lastModified', String(source.lastModified || 0));

        const payload = await this.helperRequest('/sources', {
            method: 'POST',
            body: form
        }, 'Не удалось загрузить source в helper.');
        if (!payload?.source_id) {
            throw new Error('Helper не вернул source_id.');
        }

        source.helperSourceId = payload.source_id;
        source.fingerprint = payload.fingerprint || source.fingerprint;
        workflow.updatedAt = nowIso();
        await this.markChanged();
    }

    async ensureVideoSources(workflow) {
        const nextSource = workflow.sources.find((source) => !source.helperSourceId);
        if (!nextSource) {
            return false;
        }

        await this.importSourceToHelper(workflow, nextSource);
        return true;
    }

    getRenderPendingOutputs(workflow) {
        const pendingSet = new Set(workflow.pendingSerials);
        return (workflow.renderManifest?.outputs || []).filter((output) => pendingSet.has(String(output.serial_number || '').trim().toUpperCase()));
    }

    getRenderSegmentsForPending(workflow) {
        const pendingOutputs = this.getRenderPendingOutputs(workflow);
        const pendingSegmentSeqs = new Set(pendingOutputs.map((output) => Number(output.segment_seq)));
        return (workflow.renderManifest?.segments || []).filter((segment) => pendingSegmentSeqs.has(Number(segment.sequence)));
    }

    async createIntroJob(workflow) {
        const introSegment = workflow.renderManifest?.segments?.[0];
        if (!introSegment) {
            throw new Error('В render_manifest нет intro-сегмента.');
        }

        const introSourceIndex = Number(introSegment.source_index ?? 0);
        const source = workflow.sources.find((entry) => Number(entry.sourceIndex) === introSourceIndex);
        if (!source?.helperSourceId) {
            throw new Error('Исходник intro не загружен в helper.');
        }

        const payload = await this.helperRequest('/intro-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sources: [{ source_index: introSourceIndex, source_id: source.helperSourceId }],
                segment: introSegment
            })
        }, 'Не удалось создать intro job в helper.');
        if (!payload?.job_id) {
            throw new Error('Helper не вернул intro job id.');
        }

        workflow.introJobId = payload.job_id;
        workflow.updatedAt = nowIso();
        await this.markChanged();
    }

    async ensureIntroHelperSource(workflow, introAsset) {
        if (workflow.introHelperSourceId) {
            return workflow.introHelperSourceId;
        }

        const introUrl = isNonEmptyString(introAsset?.public_url)
            ? introAsset.public_url.startsWith('http')
                ? introAsset.public_url
                : `${this.getApiOrigin().replace(/\/+$/, '')}${introAsset.public_url}`
            : '';
        if (!introUrl) {
            throw new Error('Intro asset URL отсутствует.');
        }

        let response;
        try {
            response = await fetch(introUrl);
        } catch (error) {
            throw normalizeFailure(error, 'Не удалось скачать intro с сервера.');
        }
        if (!response.ok) {
            throw new Error('Не удалось скачать intro с сервера.');
        }

        const blob = await response.blob();
        const form = new FormData();
        form.append('file', blob, introAsset.file_name || 'intro.mp4');
        form.append('lastModified', String(Date.parse(introAsset.uploaded_at) || Date.now()));

        const payload = await this.helperRequest('/sources', {
            method: 'POST',
            body: form
        }, 'Не удалось импортировать intro в helper.');
        if (!payload?.source_id) {
            throw new Error('Helper не вернул source_id для intro.');
        }

        workflow.introHelperSourceId = payload.source_id;
        workflow.updatedAt = nowIso();
        await this.markChanged();
        return payload.source_id;
    }

    async createRenderJob(workflow, introAsset) {
        const pendingOutputs = this.getRenderPendingOutputs(workflow);
        if (pendingOutputs.length === 0) {
            return null;
        }

        const pendingSegments = this.getRenderSegmentsForPending(workflow);
        const introSourceId = await this.ensureIntroHelperSource(workflow, introAsset);
        const requiredTailSourceIndexes = Array.from(new Set(pendingSegments.map((segment) => Number(segment.source_index ?? 0))));
        const renderSources = [
            { source_index: 0, source_id: introSourceId },
            ...requiredTailSourceIndexes.map((sourceIndex) => {
                const source = workflow.sources.find((entry) => Number(entry.sourceIndex) === sourceIndex);
                return {
                    source_index: sourceIndex + 1,
                    source_id: source?.helperSourceId || ''
                };
            })
        ];
        const introSegment = workflow.renderManifest?.segments?.[0];
        const introDurationMs = introSegment ? Number(introSegment.end_ms) - Number(introSegment.start_ms) : 0;
        const helperSegments = (workflow.renderManifest?.segments || []).map((segment) => (
            Number(segment.sequence) === 0
                ? {
                    ...segment,
                    source_index: 0,
                    start_ms: 0,
                    end_ms: introDurationMs
                }
                : {
                    ...segment,
                    source_index: Number(segment.source_index ?? 0) + 1
                }
        ));

        try {
            const payload = await this.helperRequest('/render-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources: renderSources,
                    crossfade_ms: VIDEO_EXPORT_CROSSFADE_MS,
                    segments: helperSegments,
                    outputs: pendingOutputs
                })
            }, 'Не удалось создать render job в helper.');
            if (!payload?.job_id) {
                throw new Error('Helper не вернул render job id.');
            }

            workflow.renderJobId = payload.job_id;
            workflow.updatedAt = nowIso();
            await this.markChanged();
            return payload;
        } catch (error) {
            if (/исходный файл.*не найден|source.*not found/i.test(String(error?.message || ''))) {
                workflow.introHelperSourceId = '';
                workflow.renderJobId = '';
                for (const source of workflow.sources) {
                    source.helperSourceId = '';
                }
                workflow.phase = 'importing_sources';
                workflow.updatedAt = nowIso();
                workflow.nextAttemptAt = 0;
                await this.markChanged();
                return null;
            }

            throw error;
        }
    }

    async enqueueRenderUploads(workflow, renderStatusPayload) {
        const outputs = Array.isArray(renderStatusPayload?.outputs) ? renderStatusPayload.outputs : [];
        const readySerials = outputs
            .filter((output) => output.status === 'COMPLETED')
            .map((output) => String(output.serial_number || '').trim().toUpperCase())
            .filter((serial) => serial && workflow.pendingSerials.includes(serial) && !workflow.uploadJobIds[serial]);

        if (readySerials.length === 0) {
            return;
        }

        const groupId = `${workflow.id}:${workflow.renderJobId || 'render'}`;
        const groupTitle = `Видео партии ${workflow.batchId.slice(0, 8)}`;
        for (const serialNumber of readySerials) {
            const queuedJob = await this.mediaQueue.enqueueVideoRenderUpload({
                batchId: workflow.batchId,
                sessionId: workflow.sessionId,
                helperBaseUrl: HELPER_BASE_URL,
                helperJobId: workflow.renderJobId,
                serialNumber,
                groupId,
                groupTitle,
                groupKind: 'VIDEO_EXPORT_UPLOAD',
                groupTotal: workflow.pendingSerials.length,
                notifyOnComplete: true,
                cleanupHelperJob: true
            });
            workflow.uploadJobIds[serialNumber] = queuedJob.id;
        }

        workflow.phase = 'uploading_outputs';
        workflow.updatedAt = nowIso();
        await this.markChanged();
    }

    async ensureIntroUploaded(workflow, session) {
        if (session?.render_manifest?.intro_asset) {
            return true;
        }

        if (!workflow.introJobId) {
            await this.createIntroJob(workflow);
            workflow.nextAttemptAt = Date.now() + VERIFY_DELAY_MS;
            await this.markChanged();
            return false;
        }

        const payload = await this.helperRequest(`/intro-jobs/${encodeURIComponent(workflow.introJobId)}`, undefined, 'Не удалось получить статус intro job.');
        if (payload.status === 'FAILED') {
            workflow.introJobId = '';
            workflow.introUploadJobId = '';
            workflow.updatedAt = nowIso();
            await this.markChanged();
            return false;
        }

        if (payload.status !== 'COMPLETED') {
            workflow.nextAttemptAt = Date.now() + VERIFY_DELAY_MS;
            await this.markChanged();
            return false;
        }

        if (!workflow.introUploadJobId) {
            const queuedJob = await this.mediaQueue.enqueueVideoIntroUpload({
                batchId: workflow.batchId,
                sessionId: workflow.sessionId,
                helperBaseUrl: HELPER_BASE_URL,
                helperJobId: workflow.introJobId
            });
            workflow.introUploadJobId = queuedJob.id;
            workflow.updatedAt = nowIso();
            workflow.nextAttemptAt = Date.now() + VERIFY_DELAY_MS;
            await this.markChanged();
            return false;
        }

        const queueJob = this.getMediaQueueJob(workflow.introUploadJobId);
        if (!queueJob) {
            workflow.introUploadJobId = '';
            workflow.updatedAt = nowIso();
            await this.markChanged();
            return false;
        }

        if (queueJob.status === 'done') {
            const refreshed = await this.reconcileVideoSession(workflow);
            if (refreshed?.render_manifest?.intro_asset) {
                workflow.introUploadJobId = '';
                workflow.introJobId = '';
                workflow.updatedAt = nowIso();
                await this.markChanged();
                return true;
            }

            throw new Error('Intro upload завершился, но session не содержит intro_asset.');
        }

        if (queueJob.status === 'auth_required') {
            throw toAuthError(queueJob.lastError || 'Нужно войти в HQ заново.');
        }

        if (queueJob.status === 'failed') {
            throw new Error(queueJob.lastError || 'Не удалось загрузить intro.');
        }

        if (queueJob.status === 'retrying' && isLikelyOfflineError(queueJob.lastError)) {
            throw toOfflineError(queueJob.lastError);
        }

        workflow.nextAttemptAt = Date.now() + VERIFY_DELAY_MS;
        await this.markChanged();
        return false;
    }

    async verifyQueuedUploads(workflow) {
        await this.reconcileVideoSession(workflow);
        if (workflow.confirmedSerials.length >= workflow.expectedCount) {
            await this.cleanupWorkflowFiles(workflow);
            await this.setWorkflowPhase(workflow, 'completed', { nextAttemptAt: 0, lastError: '' });
            return true;
        }

        const pendingJobs = Object.entries(workflow.uploadJobIds);
        let hasActiveJobs = false;
        let shouldRerender = false;
        for (const [serial, jobId] of pendingJobs) {
            const queueJob = this.getMediaQueueJob(jobId);
            if (!queueJob) {
                delete workflow.uploadJobIds[serial];
                shouldRerender = true;
                continue;
            }

            if (queueJob.status === 'done') {
                if (!workflow.confirmedSerials.includes(serial)) {
                    shouldRerender = true;
                }
                continue;
            }

            if (queueJob.status === 'auth_required') {
                throw toAuthError(queueJob.lastError || 'Нужно войти в HQ заново.');
            }

            if (queueJob.status === 'failed') {
                throw new Error(queueJob.lastError || `Не удалось загрузить ${serial}.`);
            }

            if (queueJob.status === 'retrying' && isLikelyOfflineError(queueJob.lastError)) {
                throw toOfflineError(queueJob.lastError);
            }

            hasActiveJobs = true;
        }

        workflow.updatedAt = nowIso();
        await this.markChanged();
        if (hasActiveJobs) {
            workflow.phase = 'verifying';
            workflow.nextAttemptAt = Date.now() + VERIFY_DELAY_MS;
            await this.markChanged();
            return false;
        }

        if (workflow.pendingSerials.length > 0 || shouldRerender) {
            workflow.renderJobId = '';
            workflow.phase = 'rendering_outputs';
            workflow.nextAttemptAt = 0;
            await this.markChanged();
            return false;
        }

        return false;
    }

    async processVideoWorkflow(workflow) {
        try {
            if (workflow.phase === 'queued' || workflow.phase === 'preparing_session') {
                await this.setWorkflowPhase(workflow, 'preparing_session', { nextAttemptAt: 0, lastError: '' });
                const session = workflow.sessionId
                    ? await this.reopenVideoSessionTail(workflow)
                    : await this.ensureVideoSession(workflow);
                if (workflow.confirmedSerials.length >= workflow.expectedCount) {
                    await this.cleanupWorkflowFiles(workflow);
                    await this.setWorkflowPhase(workflow, 'completed', { nextAttemptAt: 0, lastError: '' });
                    return;
                }
                if (!session) {
                    await this.ensureVideoSession(workflow);
                }
                if (workflow.phase === 'preparing_session') {
                    await this.setWorkflowPhase(workflow, 'importing_sources', { nextAttemptAt: 0, lastError: '' });
                }
            }

            if (workflow.phase === 'paused_offline' || workflow.phase === 'auth_required') {
                await this.setWorkflowPhase(workflow, workflow.pendingSerials.length > 0 ? 'preparing_session' : 'completed', { nextAttemptAt: 0, lastError: '' });
                if (workflow.phase === 'completed') {
                    return;
                }
            }

            if (workflow.phase === 'importing_sources') {
                const changed = await this.ensureVideoSources(workflow);
                if (changed) {
                    workflow.nextAttemptAt = Date.now() + 250;
                    await this.markChanged();
                    return;
                }

                await this.setWorkflowPhase(workflow, 'rendering_intro', { nextAttemptAt: 0, lastError: '' });
            }

            if (workflow.phase === 'rendering_intro') {
                const session = await this.reconcileVideoSession(workflow);
                const ready = await this.ensureIntroUploaded(workflow, session);
                if (!ready) {
                    return;
                }

                await this.setWorkflowPhase(workflow, 'rendering_outputs', { nextAttemptAt: 0, lastError: '' });
            }

            if (workflow.phase === 'rendering_outputs') {
                const session = await this.reconcileVideoSession(workflow);
                if (workflow.confirmedSerials.length >= workflow.expectedCount) {
                    await this.cleanupWorkflowFiles(workflow);
                    await this.setWorkflowPhase(workflow, 'completed', { nextAttemptAt: 0, lastError: '' });
                    return;
                }

                const introAsset = session?.render_manifest?.intro_asset || null;
                if (!introAsset) {
                    await this.setWorkflowPhase(workflow, 'rendering_intro', { nextAttemptAt: 0, lastError: '' });
                    return;
                }

                if (!workflow.renderJobId) {
                    const created = await this.createRenderJob(workflow, introAsset);
                    if (!created) {
                        return;
                    }
                    workflow.nextAttemptAt = Date.now() + VERIFY_DELAY_MS;
                    await this.markChanged();
                    return;
                }

                const payload = await this.helperRequest(`/render-jobs/${encodeURIComponent(workflow.renderJobId)}`, undefined, 'Не удалось получить статус render job.');
                await this.enqueueRenderUploads(workflow, payload);
                if (payload.status === 'FAILED') {
                    workflow.renderJobId = '';
                    workflow.updatedAt = nowIso();
                    await this.markChanged();
                }

                if (Object.keys(workflow.uploadJobIds).length > 0) {
                    await this.setWorkflowPhase(workflow, 'verifying', { nextAttemptAt: Date.now() + VERIFY_DELAY_MS, lastError: '' });
                    return;
                }

                workflow.nextAttemptAt = Date.now() + VERIFY_DELAY_MS;
                await this.markChanged();
                return;
            }

            if (workflow.phase === 'uploading_outputs') {
                await this.setWorkflowPhase(workflow, 'verifying', { nextAttemptAt: Date.now() + VERIFY_DELAY_MS, lastError: '' });
            }

            if (workflow.phase === 'verifying') {
                await this.verifyQueuedUploads(workflow);
            }
        } catch (error) {
            await this.handleWorkflowError(workflow, error);
        }
    }
}

module.exports = {
    MediaWorkflowManager
};
