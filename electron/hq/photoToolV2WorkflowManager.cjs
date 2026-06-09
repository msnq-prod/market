const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { EventEmitter } = require('events');

const Database = require('better-sqlite3');
const heicConvert = require('heic-convert');
const sharp = require('sharp');

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed', 'stale']);
const ACTIVE_STATUSES = new Set(['staging', 'queued', 'normalizing', 'uploading', 'committing', 'paused_offline', 'auth_required']);
const IMAGE_CONVERT_EXTENSIONS = new Set(['.heic', '.heif']);
const RETRY_DELAY_MS = 3_000;
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
const API_REQUEST_TIMEOUT_MS = 60_000;
const CHUNK_UPLOAD_TIMEOUT_MS = 5 * 60_000;
const WORKFLOW_STUCK_MS = 10 * 60_000;
const MAX_LOCAL_SOURCE_FILE_SIZE_BYTES = 250 * 1024 * 1024;
const MAX_LOCAL_SOURCE_PIXELS = 80_000_000;
const DEFAULT_PHOTO_EXPORT_SETTINGS = {
    format: 'jpeg',
    quality: 80,
    maxWidth: 1200,
    maxHeight: 1200
};

const nowIso = () => new Date().toISOString();
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const safeFileName = (value) => String(value || 'photo')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'photo';
const fileCachePathFor = (rootDir, fileId) => path.join(rootDir, `${fileId}.bin`);

const clampInteger = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
};

const normalizePhotoExportSettings = (value) => {
    if (!isRecord(value)) return { ...DEFAULT_PHOTO_EXPORT_SETTINGS };
    return {
        format: 'jpeg',
        quality: clampInteger(value.quality, DEFAULT_PHOTO_EXPORT_SETTINGS.quality, 40, 95),
        maxWidth: clampInteger(value.maxWidth, DEFAULT_PHOTO_EXPORT_SETTINGS.maxWidth, 800, 4096),
        maxHeight: clampInteger(value.maxHeight, DEFAULT_PHOTO_EXPORT_SETTINGS.maxHeight, 800, 4096)
    };
};

const sha256Buffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const sha256File = async (filePath) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
});

const safeRemove = async (targetPath) => {
    if (!targetPath) return;
    await fsp.rm(targetPath, { force: true, recursive: true }).catch(() => undefined);
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

const fetchWithTimeout = async (url, init = {}, timeoutMs = API_REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw toOfflineError('Запрос Photo Tool v2 превысил timeout.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

const normalizeFailure = (error, fallbackMessage) => {
    if (error?.code === 'OFFLINE' || error?.code === 'AUTH_REQUIRED') return error;
    const status = Number(error?.status || error?.statusCode || 0);
    if (status === 401 || status === 403) return toAuthError(error.message || fallbackMessage);
    if (status === 0 || isLikelyOfflineError(error?.message)) return toOfflineError(error.message || fallbackMessage);
    return error instanceof Error ? error : new Error(fallbackMessage);
};

const workflowPhaseForStatus = (status) => {
    switch (status) {
        case 'normalizing':
            return 'converting';
        case 'uploading':
            return 'uploading';
        case 'committing':
            return 'verifying';
        case 'paused_offline':
            return 'paused_offline';
        case 'auth_required':
            return 'auth_required';
        case 'completed':
            return 'completed';
        case 'cancelled':
            return 'cancelled';
        case 'failed':
            return 'failed';
        case 'stale':
            return 'stale';
        default:
            return 'queued';
    }
};

const localStatusFromServerRunStatus = (status) => {
    switch (String(status || '').toUpperCase()) {
        case 'OPEN':
            return 'queued';
        case 'UPLOADING':
            return 'uploading';
        case 'READY_TO_COMMIT':
        case 'COMMITTING':
            return 'committing';
        case 'COMPLETED':
            return 'completed';
        case 'STALE':
            return 'stale';
        case 'FAILED':
            return 'failed';
        case 'CANCELLED':
            return 'cancelled';
        default:
            return null;
    }
};

const localStatusFromServerItemStatus = (status) => {
    switch (String(status || '').toUpperCase()) {
        case 'REUSED':
            return 'reused';
        case 'UPLOADED':
            return 'uploaded';
        case 'UPLOADING':
            return 'uploading';
        case 'FAILED':
            return 'failed';
        case 'CANCELLED':
            return 'cancelled';
        default:
            return 'pending';
    }
};

const schemaSql = `
CREATE TABLE IF NOT EXISTS photo_runs (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  status TEXT NOT NULL,
  server_created INTEGER NOT NULL DEFAULT 0,
  base_photo_state_token TEXT NOT NULL,
  photo_export_settings_json TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  last_error TEXT,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_photo_runs_batch_status ON photo_runs(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_photo_runs_status_next ON photo_runs(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS photo_run_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_seq INTEGER NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  file_id TEXT,
  cache_path TEXT,
  original_name TEXT,
  mime_type TEXT,
  normalized_path TEXT,
  checksum_sha256 TEXT,
  file_size_bytes INTEGER,
  existing_url TEXT,
  server_file_url TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES photo_runs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_run_items_run_item ON photo_run_items(run_id, item_id);
CREATE INDEX IF NOT EXISTS idx_photo_run_items_status ON photo_run_items(status);
`;

class PhotoToolV2WorkflowManager extends EventEmitter {
    constructor({ rootDir, stagedFilesDir, getApiOrigin, getAccessToken, refreshAccessToken = null }) {
        super();
        this.rootDir = rootDir;
        this.stagedFilesDir = stagedFilesDir;
        this.dbPath = path.join(rootDir, 'photo-tool-v2.sqlite');
        this.filesRoot = path.join(rootDir, 'photo-tool-v2-files');
        this.getApiOrigin = getApiOrigin;
        this.getAccessToken = getAccessToken;
        this.refreshAccessToken = refreshAccessToken;
        this.db = null;
        this.processing = false;
        this.timer = null;
    }

    async init() {
        await fsp.mkdir(this.rootDir, { recursive: true });
        await fsp.mkdir(this.filesRoot, { recursive: true });
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('synchronous = NORMAL');
        this.db.exec(schemaSql);
        this.schedule(0);
    }

    ensureDb() {
        if (!this.db) throw new Error('Photo Tool v2 workflow DB is not initialized.');
        return this.db;
    }

    buildApiUrl(pathname) {
        return `${this.getApiOrigin().replace(/\/+$/, '')}${pathname}`;
    }

    async apiRequest(pathname, init = {}, fallbackMessage = 'Запрос не выполнен.', timeoutMs = API_REQUEST_TIMEOUT_MS) {
        let token = this.getAccessToken();
        if (!token && this.refreshAccessToken) {
            token = await this.refreshAccessToken().catch(() => null);
        }
        if (!token) throw toAuthError('Нужно войти в HQ заново.');

        try {
            const response = await fetchWithTimeout(this.buildApiUrl(pathname), {
                ...init,
                headers: {
                    ...(init.headers || {}),
                    Authorization: `Bearer ${token}`
                }
            }, timeoutMs);
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                const error = new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallbackMessage);
                error.status = response.status;
                error.code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : undefined;
                error.payload = payload;
                throw error;
            }
            return payload;
        } catch (error) {
            throw normalizeFailure(error, fallbackMessage);
        }
    }

    async apiRaw(pathname, init = {}, fallbackMessage = 'Запрос не выполнен.', timeoutMs = CHUNK_UPLOAD_TIMEOUT_MS) {
        let token = this.getAccessToken();
        if (!token && this.refreshAccessToken) {
            token = await this.refreshAccessToken().catch(() => null);
        }
        if (!token) throw toAuthError('Нужно войти в HQ заново.');
        try {
            const response = await fetchWithTimeout(this.buildApiUrl(pathname), {
                ...init,
                headers: {
                    ...(init.headers || {}),
                    Authorization: `Bearer ${token}`
                }
            }, timeoutMs);
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                const error = new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallbackMessage);
                error.status = response.status;
                error.code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : undefined;
                error.payload = payload;
                throw error;
            }
            return payload;
        } catch (error) {
            throw normalizeFailure(error, fallbackMessage);
        }
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

    emitChange() {
        this.emit('change', this.getSnapshot());
    }

    getActiveRunForBatch(batchId) {
        return this.ensureDb().prepare(`
            SELECT * FROM photo_runs
            WHERE batch_id = ?
              AND status NOT IN ('completed', 'cancelled', 'failed', 'stale')
            ORDER BY created_at DESC
            LIMIT 1
        `).get(batchId);
    }

    async cleanupPayloadFiles(payload) {
        await Promise.all((payload.files || [])
            .filter((file) => isNonEmptyString(file?.fileId))
            .map((file) => safeRemove(fileCachePathFor(this.stagedFilesDir, file.fileId))));
    }

    async startPhotoApplyWorkflow(payload) {
        const batchId = String(payload.batchId || '').trim();
        if (!batchId) throw new Error('batchId обязателен.');

        const duplicate = this.getActiveRunForBatch(batchId);
        if (duplicate) {
            await this.cleanupPayloadFiles(payload);
            return this.buildWorkflowSnapshot(duplicate);
        }

        const runId = isNonEmptyString(payload.clientWorkflowId) ? String(payload.clientWorkflowId) : crypto.randomUUID();
        const settings = normalizePhotoExportSettings(payload.photoExportSettings);
        const filesById = new Map((payload.files || []).map((file) => [file.fileId, file]));
        const items = Array.isArray(payload.items) ? payload.items : [];
        const manifestItems = items.map((item) => {
            if (item.source === 'existing') {
                return {
                    itemId: item.itemId,
                    itemSeq: item.itemSeq,
                    source: 'existing',
                    existingUrl: item.existingUrl
                };
            }
            const file = filesById.get(item.fileId);
            return {
                itemId: item.itemId,
                itemSeq: item.itemSeq,
                source: 'upload',
                fileName: safeFileName(file?.originalName || file?.name || 'photo.jpg')
            };
        });
        const manifest = {
            manifestVersion: 2,
            batchId,
            runId,
            basePhotoStateToken: payload.basePhotoStateToken,
            photoExportSettings: settings,
            items: manifestItems
        };
        const summary = {
            title: 'Photo workflow v2',
            subtitle: payload.subtitle || `${items.length} фото`,
            batchLabel: payload.batchLabel || batchId
        };
        const timestamp = nowIso();
        const db = this.ensureDb();
        const insertRun = db.prepare(`
            INSERT INTO photo_runs (
                id, batch_id, status, server_created, base_photo_state_token,
                photo_export_settings_json, manifest_json, summary_json,
                last_error, next_attempt_at, created_at, updated_at
            ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, NULL, 0, ?, ?)
        `);
        const insertItem = db.prepare(`
            INSERT INTO photo_run_items (
                id, run_id, item_id, item_seq, source, status, file_id, cache_path,
                original_name, mime_type, existing_url, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const tx = db.transaction(() => {
            insertRun.run(
                runId,
                batchId,
                payload.deferProcessingUntilFilesReady ? 'staging' : 'queued',
                String(payload.basePhotoStateToken || ''),
                JSON.stringify(settings),
                JSON.stringify(manifest),
                JSON.stringify(summary),
                timestamp,
                timestamp
            );
            for (const item of items) {
                if (item.source === 'existing') {
                    insertItem.run(
                        crypto.randomUUID(),
                        runId,
                        item.itemId,
                        item.itemSeq,
                        'existing',
                        'reused',
                        null,
                        null,
                        null,
                        null,
                        item.existingUrl,
                        timestamp
                    );
                    continue;
                }
                const file = filesById.get(item.fileId);
                insertItem.run(
                    crypto.randomUUID(),
                    runId,
                    item.itemId,
                    item.itemSeq,
                    'upload',
                    'pending',
                    item.fileId,
                    fileCachePathFor(this.stagedFilesDir, item.fileId),
                    safeFileName(file?.originalName || file?.name || 'photo.jpg'),
                    file?.mimeType || 'application/octet-stream',
                    null,
                    timestamp
                );
            }
        });
        tx();
        this.emitChange();
        if (!payload.deferProcessingUntilFilesReady) {
            this.schedule(0);
        }
        return this.buildWorkflowSnapshot(this.getRun(runId));
    }

    getRun(runId) {
        return this.ensureDb().prepare('SELECT * FROM photo_runs WHERE id = ?').get(runId);
    }

    getRunItems(runId) {
        return this.ensureDb().prepare('SELECT * FROM photo_run_items WHERE run_id = ? ORDER BY item_seq ASC').all(runId);
    }

    getSnapshot() {
        const rows = this.ensureDb().prepare('SELECT * FROM photo_runs ORDER BY created_at DESC LIMIT 50').all();
        const workflows = rows.map((row) => this.buildWorkflowSnapshot(row));
        const counts = workflows.reduce((acc, workflow) => {
            acc[workflow.phase] = (acc[workflow.phase] || 0) + 1;
            return acc;
        }, {});
        return { workflows, counts };
    }

    buildWorkflowSnapshot(run) {
        const items = this.getRunItems(run.id);
        const total = items.length;
        const ready = items.filter((item) => ['reused', 'uploaded', 'committed'].includes(item.status)).length;
        const phase = workflowPhaseForStatus(run.status);
        const updatedAt = Date.parse(run.updated_at || '');
        const summary = JSON.parse(run.summary_json || '{}');
        const pendingSerials = items.filter((item) => !['reused', 'uploaded', 'committed'].includes(item.status)).map((item) => String(item.item_seq));
        const confirmedSerials = items.filter((item) => ['reused', 'uploaded', 'committed'].includes(item.status)).map((item) => String(item.item_seq));
        const failedSerials = items.filter((item) => item.status === 'failed').map((item) => String(item.item_seq));
        return {
            id: run.id,
            kind: 'PHOTO_APPLY_WORKFLOW',
            batchId: run.batch_id,
            phase,
            createdAt: run.created_at,
            updatedAt: run.updated_at,
            lastError: run.last_error || null,
            nextAttemptAt: run.next_attempt_at || null,
            blockingReason: run.status === 'auth_required' ? 'auth_required' : run.status === 'paused_offline' ? 'offline' : null,
            recentEvents: [],
            stuck: ACTIVE_STATUSES.has(run.status) && Number.isFinite(updatedAt) && Date.now() - updatedAt > WORKFLOW_STUCK_MS,
            summary,
            routePath: `/admin/photo-tool/${encodeURIComponent(run.batch_id)}`,
            progress: {
                completed: phase === 'completed' ? total : phase === 'verifying' ? Math.max(ready, total - 1) : ready,
                total
            },
            uploadState: {
                pendingSerials,
                confirmedSerials,
                failedSerials
            }
        };
    }

    async retryWorkflow(workflowId) {
        const timestamp = nowIso();
        this.ensureDb().prepare(`
            UPDATE photo_runs
            SET status = 'queued', last_error = NULL, next_attempt_at = 0, updated_at = ?
            WHERE id = ?
        `).run(timestamp, workflowId);
        this.ensureDb().prepare(`
            UPDATE photo_run_items
            SET status = 'pending', last_error = NULL, updated_at = ?
            WHERE run_id = ? AND status = 'failed'
        `).run(timestamp, workflowId);
        this.emitChange();
        this.schedule(0);
        return this.getSnapshot();
    }

    async completeWorkflowStaging(workflowId) {
        const timestamp = nowIso();
        this.ensureDb().prepare(`
            UPDATE photo_runs
            SET status = 'queued', last_error = NULL, next_attempt_at = 0, updated_at = ?
            WHERE id = ? AND status = 'staging'
        `).run(timestamp, workflowId);
        this.emitChange();
        this.schedule(0);
        return this.getSnapshot();
    }

    async cleanupRunLocalFiles(workflowId) {
        const items = this.getRunItems(workflowId);
        await Promise.all(items.flatMap((item) => [
            safeRemove(item.cache_path),
            safeRemove(item.normalized_path)
        ]));
        await safeRemove(path.join(this.filesRoot, workflowId));
    }

    async cancelWorkflow(workflowId) {
        const run = this.getRun(workflowId);
        if (run?.server_created) {
            await this.apiRequest(`/api/photo-tool-v2/runs/${encodeURIComponent(workflowId)}/cancel`, { method: 'POST' }, 'Не удалось отменить Photo Tool v2 run.').catch(() => undefined);
        }
        const timestamp = nowIso();
        this.ensureDb().prepare(`
            UPDATE photo_runs
            SET status = 'cancelled', next_attempt_at = 0, updated_at = ?
            WHERE id = ?
        `).run(timestamp, workflowId);
        await this.cleanupRunLocalFiles(workflowId);
        this.emitChange();
        return this.getSnapshot();
    }

    async processNext() {
        if (this.processing) return;
        this.processing = true;
        try {
            const run = this.ensureDb().prepare(`
                SELECT * FROM photo_runs
                WHERE status IN ('queued', 'normalizing', 'uploading', 'committing', 'paused_offline', 'auth_required')
                  AND next_attempt_at <= ?
                ORDER BY created_at ASC
                LIMIT 1
            `).get(Date.now());
            if (run) {
                await this.processRun(run);
            }
        } finally {
            this.processing = false;
            const nextRun = this.ensureDb().prepare(`
                SELECT next_attempt_at FROM photo_runs
                WHERE status IN ('queued', 'normalizing', 'uploading', 'committing', 'paused_offline', 'auth_required')
                ORDER BY next_attempt_at ASC
                LIMIT 1
            `).get();
            const delay = nextRun?.next_attempt_at ? Math.max(500, Number(nextRun.next_attempt_at) - Date.now()) : 2000;
            this.schedule(delay);
        }
    }

    updateRun(runId, patch) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(patch)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
        fields.push('updated_at = ?');
        values.push(nowIso());
        const protectsCancelled = Object.prototype.hasOwnProperty.call(patch, 'status') && patch.status !== 'cancelled';
        const where = protectsCancelled ? `id = ? AND status != 'cancelled'` : 'id = ?';
        this.ensureDb().prepare(`UPDATE photo_runs SET ${fields.join(', ')} WHERE ${where}`).run(...values, runId);
        this.emitChange();
    }

    updateItem(itemId, patch) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(patch)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
        fields.push('updated_at = ?');
        values.push(nowIso(), itemId);
        this.ensureDb().prepare(`UPDATE photo_run_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    isRunCancelled(runId) {
        return this.getRun(runId)?.status === 'cancelled';
    }

    applyServerRunSnapshot(runId, serverRun) {
        if (!isRecord(serverRun)) return null;

        const timestamp = nowIso();
        const db = this.ensureDb();
        const updateItem = db.prepare(`
            UPDATE photo_run_items
            SET status = ?, server_file_url = COALESCE(?, server_file_url), last_error = ?, updated_at = ?
            WHERE run_id = ? AND item_id = ?
        `);
        if (Array.isArray(serverRun.items)) {
            for (const item of serverRun.items) {
                if (!isRecord(item) || !isNonEmptyString(item.item_id)) continue;
                updateItem.run(
                    localStatusFromServerItemStatus(item.status),
                    typeof item.file_url === 'string' ? item.file_url : null,
                    typeof item.error_message === 'string' ? item.error_message : null,
                    timestamp,
                    runId,
                    item.item_id
                );
            }
        }

        const localStatus = localStatusFromServerRunStatus(serverRun.status);
        if (!localStatus) return null;

        if (localStatus === 'completed') {
            db.prepare(`
                UPDATE photo_run_items
                SET status = 'committed', updated_at = ?
                WHERE run_id = ? AND status IN ('reused', 'uploaded')
            `).run(timestamp, runId);
        }

        const patch = {
            status: localStatus,
            last_error: typeof serverRun.error_message === 'string' ? serverRun.error_message : null,
            next_attempt_at: localStatus === 'committing' ? Date.now() + RETRY_DELAY_MS : 0
        };
        if (localStatus === 'completed') {
            patch.completed_at = nowIso();
        }
        this.updateRun(runId, patch);
        return localStatus;
    }

    async refreshServerRunStatus(runId) {
        const serverRun = await this.apiRequest(`/api/photo-tool-v2/runs/${encodeURIComponent(runId)}`, {
            method: 'GET'
        }, 'Не удалось получить статус Photo Tool v2 run.');
        return this.applyServerRunSnapshot(runId, serverRun);
    }

    async processRun(run) {
        try {
            if (['paused_offline', 'auth_required'].includes(run.status)) {
                this.updateRun(run.id, { status: 'queued', last_error: null, next_attempt_at: 0 });
                run = this.getRun(run.id);
            }
            if (!run.server_created) {
                const manifest = JSON.parse(run.manifest_json);
                const serverRun = await this.apiRequest(`/api/photo-tool-v2/batches/${encodeURIComponent(run.batch_id)}/runs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_run_id: run.id,
                        expected_count: manifest.items.length,
                        manifest
                    })
                }, 'Не удалось создать Photo Tool v2 run.');
                if (this.isRunCancelled(run.id)) {
                    await this.apiRequest(`/api/photo-tool-v2/runs/${encodeURIComponent(run.id)}/cancel`, { method: 'POST' }, 'Не удалось отменить Photo Tool v2 run.').catch(() => undefined);
                    return;
                }
                this.updateRun(run.id, { server_created: 1, status: 'uploading', last_error: null });
                const localStatus = this.applyServerRunSnapshot(run.id, serverRun);
                if (TERMINAL_STATUSES.has(localStatus)) {
                    return;
                }
                run = this.getRun(run.id);
            } else if (run.status === 'committing') {
                const localStatus = await this.refreshServerRunStatus(run.id);
                if (localStatus === 'committing' || TERMINAL_STATUSES.has(localStatus)) {
                    return;
                }
                run = this.getRun(run.id);
            }

            const items = this.getRunItems(run.id);
            for (const item of items) {
                if (this.isRunCancelled(run.id)) {
                    return;
                }
                if (item.source === 'existing' || item.status === 'reused' || item.status === 'uploaded') {
                    continue;
                }
                await this.processUploadItem(run.id, item);
                if (this.isRunCancelled(run.id)) {
                    return;
                }
            }

            if (this.isRunCancelled(run.id)) {
                return;
            }
            this.updateRun(run.id, { status: 'committing', last_error: null });
            await this.refreshServerRunStatus(run.id);
        } catch (error) {
            await this.handleRunError(run.id, error);
        }
    }

    async normalizeItemPhoto(runId, item) {
        const settings = normalizePhotoExportSettings(JSON.parse(this.getRun(runId).photo_export_settings_json || '{}'));
        const sourcePath = item.cache_path;
        if (!sourcePath) throw new Error('Нет staged photo file.');
        const sourceStat = await fsp.stat(sourcePath);
        if (sourceStat.size > MAX_LOCAL_SOURCE_FILE_SIZE_BYTES) {
            throw new Error('Исходное фото слишком большое для локальной обработки Photo Tool v2.');
        }
        const normalizedPath = path.join(this.filesRoot, runId, `${item.item_id}.jpg`);
        await fsp.mkdir(path.dirname(normalizedPath), { recursive: true });
        const extension = path.extname(item.original_name || '').toLowerCase();
        if (IMAGE_CONVERT_EXTENSIONS.has(extension)) {
            const sourceMetadata = await sharp(sourcePath, { animated: false }).metadata().catch(() => null);
            if (sourceMetadata?.width && sourceMetadata.height
                && sourceMetadata.width * sourceMetadata.height > MAX_LOCAL_SOURCE_PIXELS) {
                throw new Error('Исходное фото превышает лимит пикселей Photo Tool v2.');
            }
            let sourceBuffer = await fsp.readFile(sourcePath);
            const converted = await heicConvert({
                buffer: sourceBuffer,
                format: 'JPEG',
                quality: settings.quality / 100
            });
            sourceBuffer = converted instanceof ArrayBuffer
                ? Buffer.from(new Uint8Array(converted))
                : Buffer.from(converted);
            const convertedMetadata = await sharp(sourceBuffer, { animated: false }).metadata();
            if (convertedMetadata.width && convertedMetadata.height
                && convertedMetadata.width * convertedMetadata.height > MAX_LOCAL_SOURCE_PIXELS) {
                throw new Error('Исходное фото превышает лимит пикселей Photo Tool v2.');
            }
            await sharp(sourceBuffer)
                .rotate()
                .resize({
                    width: settings.maxWidth,
                    height: settings.maxHeight,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: settings.quality, mozjpeg: true })
                .toFile(normalizedPath);
        } else {
            const sourceMetadata = await sharp(sourcePath, { animated: false }).metadata();
            if (sourceMetadata.width && sourceMetadata.height
                && sourceMetadata.width * sourceMetadata.height > MAX_LOCAL_SOURCE_PIXELS) {
                throw new Error('Исходное фото превышает лимит пикселей Photo Tool v2.');
            }
            await sharp(sourcePath)
                .rotate()
                .resize({
                    width: settings.maxWidth,
                    height: settings.maxHeight,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: settings.quality, mozjpeg: true })
                .toFile(normalizedPath);
        }
        const stat = await fsp.stat(normalizedPath);
        return {
            normalizedPath,
            checksumSha256: await sha256File(normalizedPath),
            fileSizeBytes: stat.size
        };
    }

    async getReusableNormalizedPhoto(item) {
        if (!item.normalized_path || !item.checksum_sha256 || !item.file_size_bytes) {
            return null;
        }
        try {
            const stat = await fsp.stat(item.normalized_path);
            if (stat.size !== Number(item.file_size_bytes)) {
                await safeRemove(item.normalized_path);
                return null;
            }
            const checksumSha256 = await sha256File(item.normalized_path);
            if (checksumSha256 !== item.checksum_sha256) {
                await safeRemove(item.normalized_path);
                return null;
            }
            return {
                normalizedPath: item.normalized_path,
                checksumSha256,
                fileSizeBytes: Number(item.file_size_bytes)
            };
        } catch {
            return null;
        }
    }

    async processUploadItem(runId, item) {
        try {
            if (this.isRunCancelled(runId)) {
                return;
            }
            this.updateRun(runId, { status: 'normalizing', last_error: null });
            this.updateItem(item.id, { status: 'normalizing', last_error: null });
            const normalized = await this.getReusableNormalizedPhoto(item)
                || await this.normalizeItemPhoto(runId, item);
            if (this.isRunCancelled(runId)) {
                return;
            }
            this.updateItem(item.id, {
                normalized_path: normalized.normalizedPath,
                checksum_sha256: normalized.checksumSha256,
                file_size_bytes: normalized.fileSizeBytes,
                status: 'uploading'
            });
            this.updateRun(runId, { status: 'uploading', last_error: null });

            const intent = await this.apiRequest(`/api/photo-tool-v2/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(item.item_id)}/upload-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_name: `${safeFileName(item.original_name || 'photo')}.jpg`,
                    file_size_bytes: normalized.fileSizeBytes,
                    checksum_sha256: normalized.checksumSha256,
                    chunk_size_bytes: CHUNK_SIZE_BYTES
                })
            }, 'Не удалось создать photo upload intent.');
            if (this.isRunCancelled(runId)) {
                return;
            }

            if (intent?.completed === true) {
                this.updateItem(item.id, {
                    status: 'uploaded',
                    server_file_url: typeof intent.file_url === 'string' ? intent.file_url : null,
                    last_error: null
                });
                await safeRemove(item.cache_path);
                return;
            }

            const uploadedChunks = new Set(Array.isArray(intent.uploaded_chunks) ? intent.uploaded_chunks.map(Number) : []);
            const chunkCount = Math.ceil(normalized.fileSizeBytes / CHUNK_SIZE_BYTES);
            const fileHandle = await fsp.open(normalized.normalizedPath, 'r');
            try {
                for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
                    if (this.isRunCancelled(runId)) {
                        return;
                    }
                    if (uploadedChunks.has(chunkIndex)) continue;
                    const start = chunkIndex * CHUNK_SIZE_BYTES;
                    const expectedLength = Math.min(CHUNK_SIZE_BYTES, normalized.fileSizeBytes - start);
                    const chunk = Buffer.allocUnsafe(expectedLength);
                    const { bytesRead } = await fileHandle.read(chunk, 0, expectedLength, start);
                    if (bytesRead !== expectedLength) {
                        throw new Error('Normalized photo file was truncated during upload.');
                    }
                    const body = chunk;
                    await this.apiRaw(`/api/photo-tool-v2/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(item.item_id)}/upload-intent/${encodeURIComponent(intent.upload_id)}/chunks/${chunkIndex}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'X-Chunk-Sha256': sha256Buffer(body)
                        },
                        body
                    }, 'Не удалось загрузить photo chunk.', CHUNK_UPLOAD_TIMEOUT_MS);
                }
            } finally {
                await fileHandle.close();
            }

            if (this.isRunCancelled(runId)) {
                return;
            }
            const completedItem = await this.apiRequest(`/api/photo-tool-v2/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(item.item_id)}/upload-intent/${encodeURIComponent(intent.upload_id)}/complete`, {
                method: 'POST'
            }, 'Не удалось завершить photo upload intent.', CHUNK_UPLOAD_TIMEOUT_MS);
            if (this.isRunCancelled(runId)) {
                return;
            }
            this.updateItem(item.id, {
                status: 'uploaded',
                server_file_url: typeof completedItem?.file_url === 'string' ? completedItem.file_url : null,
                last_error: null
            });
            await safeRemove(item.cache_path);
        } catch (error) {
            const normalized = normalizeFailure(error, 'Photo Tool v2 item upload failed.');
            if (!['OFFLINE', 'AUTH_REQUIRED', 'PHOTO_TOOL_RUN_STALE', 'UPLOAD_INTENT_EXPIRED'].includes(normalized.code)) {
                this.updateItem(item.id, {
                    status: 'failed',
                    last_error: normalized.message || 'Photo Tool v2 item upload failed.'
                });
            }
            throw error;
        }
    }

    async handleRunError(runId, error) {
        const normalized = normalizeFailure(error, 'Photo Tool v2 workflow завершился с ошибкой.');
        const run = this.getRun(runId);
        const nextAttemptAt = Date.now() + RETRY_DELAY_MS;
        if (normalized.code === 'AUTH_REQUIRED') {
            const refreshedToken = this.refreshAccessToken
                ? await this.refreshAccessToken().catch(() => null)
                : null;
            this.updateRun(runId, {
                status: refreshedToken ? 'queued' : 'auth_required',
                last_error: normalized.message,
                next_attempt_at: nextAttemptAt
            });
            return;
        }
        if (normalized.code === 'OFFLINE') {
            this.updateRun(runId, {
                status: 'paused_offline',
                last_error: normalized.message,
                next_attempt_at: nextAttemptAt
            });
            return;
        }
        if (normalized.code === 'UPLOAD_INTENT_EXPIRED') {
            this.updateRun(runId, {
                status: 'queued',
                last_error: normalized.message,
                next_attempt_at: nextAttemptAt
            });
            return;
        }
        if (normalized.code === 'PHOTO_TOOL_RUN_STALE') {
            this.updateRun(runId, { status: 'stale', last_error: normalized.message, next_attempt_at: 0 });
            return;
        }
        this.updateRun(runId, { status: 'failed', last_error: normalized.message || run?.last_error || 'Workflow failed.', next_attempt_at: 0 });
    }
}

module.exports = {
    PhotoToolV2WorkflowManager
};
