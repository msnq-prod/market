const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { nowIso } = require('./db.cjs');
const { TimelineService } = require('./timelineService.cjs');

const DEFAULT_QUALITY_PRESET = 'standard';
const QUALITY_PRESETS = new Set(['fast', 'standard', 'high']);
const SUPPORTED_SOURCE_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

const normalizeSerial = (value) => (typeof value === 'string' ? value.trim() : '');

const isSoftRefreshError = (error) => {
    const kind = typeof error?.kind === 'string' ? error.kind : '';
    return kind === 'OFFLINE' || kind === 'AUTH_REQUIRED';
};

const normalizeBatchPayload = (payload, fallbackBatchId) => {
    const batch = payload?.batch || {};
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return {
        batch: {
            id: typeof batch.id === 'string' && batch.id.trim() ? batch.id.trim() : fallbackBatchId,
            status: typeof batch.status === 'string' && batch.status.trim() ? batch.status.trim() : 'DRAFT',
            expectedOutputCount: Number(batch.expected_output_count || items.length || 0)
        },
        items: items.map((item, index) => {
            const serialNumber = normalizeSerial(item?.serial_number);
            return {
                itemId: String(item?.id || '').trim(),
                itemSeq: item?.item_seq ?? null,
                serialNumber,
                existingVideoUrl: item?.item_video_url || null,
                cloneUrl: item?.clone_url || `/clone/${encodeURIComponent(serialNumber)}`,
                position: index
            };
        }).filter((item) => item.itemId)
    };
};

const normalizeQualityPreset = (value) => {
    const preset = typeof value === 'string' ? value.trim() : '';
    if (!QUALITY_PRESETS.has(preset)) {
        const error = new Error('Некорректное качество видео.');
        error.code = 'VALIDATION_FAILED';
        throw error;
    }
    return preset;
};

class ProjectService {
    constructor({ db, serverClient, fileStore, ffmpegService = null, getQueueEngine = null }) {
        if (!db) {
            throw new Error('ProjectService requires db.');
        }
        if (!serverClient) {
            throw new Error('ProjectService requires serverClient.');
        }
        if (!fileStore) {
            throw new Error('ProjectService requires fileStore.');
        }

        this.db = db;
        this.serverClient = serverClient;
        this.fileStore = fileStore;
        this.ffmpegService = ffmpegService;
        this.getQueueEngine = getQueueEngine;
        this.timelineService = new TimelineService();
    }

    async loadOrCreateProject(batchId, { requireFresh = false } = {}) {
        const safeBatchId = typeof batchId === 'string' ? batchId.trim() : '';
        if (!safeBatchId) {
            const error = new Error('batchId is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const existing = this.db.get('SELECT id FROM projects WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1', [safeBatchId]);
        if (existing) {
            try {
                await this.refreshProjectFromServer(safeBatchId, { requireFresh });
            } catch (error) {
                if (requireFresh || !isSoftRefreshError(error)) {
                    throw error;
                }
            }
            return this.db.getSnapshot(safeBatchId);
        }

        const payload = await this.serverClient.fetchBatch(safeBatchId);
        const normalizedPayload = normalizeBatchPayload(payload, safeBatchId);
        const projectId = crypto.randomUUID();
        const timestamp = nowIso();
        const items = normalizedPayload.items;

        this.db.transaction(() => {
            this.db.run(`
                INSERT INTO projects (
                    id,
                    batch_id,
                    batch_status,
                    expected_output_count,
                    quality_preset,
                    active_run_id,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
            `, [
                projectId,
                normalizedPayload.batch.id,
                normalizedPayload.batch.status,
                normalizedPayload.batch.expectedOutputCount,
                DEFAULT_QUALITY_PRESET,
                timestamp,
                timestamp
            ]);

            items.forEach((item, index) => {
                this.db.run(`
                    INSERT INTO project_items (
                        id,
                        project_id,
                        item_id,
                        item_seq,
                        serial_number,
                        existing_video_url,
                        clone_url,
                        position,
                        created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    crypto.randomUUID(),
                    projectId,
                    item.itemId,
                    item.itemSeq,
                    item.serialNumber,
                    item.existingVideoUrl,
                    item.cloneUrl,
                    index,
                    timestamp,
                    timestamp
                ]);
            });
        });

        return this.db.getSnapshot(safeBatchId);
    }

    async refreshProjectForExport(projectId) {
        const safeProjectId = typeof projectId === 'string' ? projectId.trim() : '';
        const project = safeProjectId ? this.db.get('SELECT batch_id FROM projects WHERE id = ?', [safeProjectId]) : null;
        if (!project?.batch_id) {
            throw new Error('Проект не найден.');
        }
        return this.loadOrCreateProject(project.batch_id, { requireFresh: true });
    }

    async refreshProjectFromServer(batchId, { requireFresh = false } = {}) {
        const safeBatchId = typeof batchId === 'string' ? batchId.trim() : '';
        if (!safeBatchId) {
            const error = new Error('batchId is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        let payload;
        try {
            payload = await this.serverClient.fetchBatch(safeBatchId);
        } catch (error) {
            if (!requireFresh && isSoftRefreshError(error)) {
                return this.db.getSnapshot(safeBatchId);
            }
            throw error;
        }

        const project = this.db.get('SELECT * FROM projects WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1', [safeBatchId]);
        if (!project) {
            return this.loadOrCreateProject(safeBatchId, { requireFresh });
        }

        this.reconcileProjectWithBatchPayload(project, payload);
        return this.db.getSnapshot(safeBatchId);
    }

    reconcileProjectWithBatchPayload(project, payload) {
        const normalizedPayload = normalizeBatchPayload(payload, project.batch_id);
        const timestamp = nowIso();
        const currentItems = this.db.all('SELECT * FROM project_items WHERE project_id = ? ORDER BY position ASC', [project.id]);
        const currentByItemId = new Map(currentItems.map((item) => [item.item_id, item]));
        const nextItemIds = new Set(normalizedPayload.items.map((item) => item.itemId));
        const itemSetChanged = currentItems.length !== normalizedPayload.items.length
            || currentItems.some((item) => !nextItemIds.has(item.item_id));
        const itemIdentityChanged = normalizedPayload.items.some((item) => {
            const current = currentByItemId.get(item.itemId);
            return !current || current.serial_number !== item.serialNumber;
        });
        const projectTruthChanged = project.batch_status !== normalizedPayload.batch.status
            || Number(project.expected_output_count) !== normalizedPayload.batch.expectedOutputCount
            || itemSetChanged
            || itemIdentityChanged;

        this.db.transaction(() => {
            if (itemSetChanged) {
                this.cleanupProjectExportState(project.id, timestamp);
            } else if (projectTruthChanged) {
                this.markActiveRunStale(project, timestamp);
            }

            this.db.run(`
                UPDATE projects
                SET batch_status = ?,
                    expected_output_count = ?,
                    updated_at = ?
                WHERE id = ?
            `, [
                normalizedPayload.batch.status,
                normalizedPayload.batch.expectedOutputCount,
                timestamp,
                project.id
            ]);

            this.db.run(`
                UPDATE project_items
                SET position = position + 100000,
                    updated_at = ?
                WHERE project_id = ?
            `, [timestamp, project.id]);

            for (const item of normalizedPayload.items) {
                this.db.run(`
                    INSERT INTO project_items (
                        id,
                        project_id,
                        item_id,
                        item_seq,
                        serial_number,
                        existing_video_url,
                        clone_url,
                        position,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(project_id, item_id) DO UPDATE SET
                        item_seq = excluded.item_seq,
                        serial_number = excluded.serial_number,
                        existing_video_url = excluded.existing_video_url,
                        clone_url = excluded.clone_url,
                        position = excluded.position,
                        updated_at = excluded.updated_at
                `, [
                    crypto.randomUUID(),
                    project.id,
                    item.itemId,
                    item.itemSeq,
                    item.serialNumber,
                    item.existingVideoUrl,
                    item.cloneUrl,
                    item.position,
                    timestamp,
                    timestamp
                ]);
            }

            if (itemSetChanged) {
                const placeholders = normalizedPayload.items.map(() => '?').join(', ');
                if (placeholders) {
                    this.db.run(`
                        DELETE FROM project_items
                        WHERE project_id = ?
                          AND item_id NOT IN (${placeholders})
                    `, [project.id, ...normalizedPayload.items.map((item) => item.itemId)]);
                } else {
                    this.db.run('DELETE FROM project_items WHERE project_id = ?', [project.id]);
                }
            }
        });
    }

    cleanupProjectExportState(projectId, timestamp = nowIso()) {
        const safeProjectId = typeof projectId === 'string' ? projectId.trim() : '';
        if (!safeProjectId) return;

        const queueEngine = this.getQueueEngine?.();
        const activeJobs = this.db.all(`
            SELECT id
            FROM jobs
            WHERE project_id = ?
              AND status IN ('QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH')
        `, [safeProjectId]);
        for (const job of activeJobs) {
            queueEngine?.cancelJob?.(job.id);
        }

        const runs = this.db.all('SELECT id FROM export_runs WHERE project_id = ?', [safeProjectId]);
        for (const run of runs) {
            this.cleanupLocalRunArtifacts(run.id);
        }

        this.db.run(`
            DELETE FROM jobs
            WHERE project_id = ?
              AND type IN ('RENDER_ITEM', 'UPLOAD_ITEM')
        `, [safeProjectId]);
        this.db.run('DELETE FROM export_runs WHERE project_id = ?', [safeProjectId]);
        this.db.run('UPDATE projects SET active_run_id = NULL, updated_at = ? WHERE id = ?', [timestamp, safeProjectId]);
    }

    async importSources(batchId, filePaths) {
        const snapshot = await this.loadOrCreateProject(batchId);
        const project = snapshot.project;
        if (!project) {
            throw new Error('Проект не найден.');
        }

        const selectedPaths = Array.isArray(filePaths)
            ? filePaths.map((filePath) => (typeof filePath === 'string' ? filePath.trim() : '')).filter(Boolean)
            : [];
        if (selectedPaths.length === 0) {
            return this.db.getSnapshot(batchId);
        }

        const timestamp = nowIso();
        const maxPosition = this.db.get(`
            SELECT COALESCE(MAX(position), -1) AS position
            FROM source_assets
            WHERE project_id = ?
        `, [project.id]);
        const inserted = [];

        const entries = await Promise.all(selectedPaths.map(async (filePath, index) => ({
            id: crypto.randomUUID(),
            ...(await this.inspectSourceFile(filePath, Number(maxPosition?.position ?? -1) + 1 + index))
        })));

        this.db.transaction(() => {
            for (const entry of entries) {
                this.db.run(`
                    INSERT INTO source_assets (
                        id,
                        project_id,
                        position,
                        original_name,
                        original_external_path,
                        original_size_bytes,
                        original_last_modified,
                        original_checksum_sha256,
                        original_has_audio,
                        prepared_path,
                        prepared_checksum_sha256,
                        prepared_has_audio,
                        source_revision,
                        duration_ms,
                        status,
                        error_message,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 1, ?, ?, ?, ?, ?)
                `, [
                    entry.id,
                    project.id,
                    entry.position,
                    entry.originalName,
                    entry.originalExternalPath,
                    entry.originalSizeBytes,
                    entry.originalLastModified,
                    entry.originalChecksumSha256,
                    entry.originalHasAudio === null ? null : (entry.originalHasAudio ? 1 : 0),
                    entry.durationMs,
                    entry.status,
                    entry.errorMessage,
                    timestamp,
                    timestamp
                ]);
                inserted.push(entry);
            }
        });

        await this.fileStore.ensureProjectDirs({
            batchId: project.batch_id,
            projectId: project.id
        });

        const queueEngine = this.getQueueEngine?.();
        for (const entry of inserted) {
            if (entry.shouldEnqueue && queueEngine) {
                queueEngine.enqueue({
                    projectId: project.id,
                    sourceId: entry.id,
                    type: 'PREPARE_SOURCE',
                    priority: 20,
                    maxAttempts: 1
                });
            }
        }

        return this.db.getSnapshot(batchId);
    }

    async updateQuality(projectId, preset) {
        const safeProjectId = typeof projectId === 'string' ? projectId.trim() : '';
        const qualityPreset = normalizeQualityPreset(preset);
        if (!safeProjectId) {
            const error = new Error('projectId is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const project = this.db.get('SELECT * FROM projects WHERE id = ?', [safeProjectId]);
        if (!project) {
            throw new Error('Проект не найден.');
        }
        if (project.quality_preset === qualityPreset) {
            return this.db.getSnapshot(project.batch_id);
        }

        const sources = this.db.all(`
            SELECT *
            FROM source_assets
            WHERE project_id = ? AND status != 'DELETED'
        `, [project.id]);
        const needsReprepare = sources.some((source) => source.status === 'READY' || source.prepared_path);
        const queueEngine = this.getQueueEngine?.();
        if (needsReprepare && !queueEngine) {
            throw new Error('Очередь подготовки не запущена.');
        }
        const activePrepareJobs = needsReprepare
            ? this.db.all(`
                SELECT id
                FROM jobs
                WHERE project_id = ?
                  AND type = 'PREPARE_SOURCE'
                  AND status IN ('QUEUED', 'RUNNING')
            `, [project.id])
            : [];
        for (const job of activePrepareJobs) {
            queueEngine?.cancelJob?.(job.id);
        }

        const timestamp = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE projects
                SET quality_preset = ?,
                    updated_at = ?
                WHERE id = ?
            `, [qualityPreset, timestamp, project.id]);

            if (needsReprepare) {
                for (const source of sources) {
                    this.cleanupPreparedPath(source.prepared_path);
                }
                this.db.run(`
                    UPDATE jobs
                    SET status = 'CANCELLED',
                        locked_at = NULL,
                        locked_by = NULL,
                        updated_at = ?
                    WHERE project_id = ?
                      AND type = 'PREPARE_SOURCE'
                      AND status IN ('QUEUED', 'RUNNING', 'FAILED', 'CANCELLED')
                `, [timestamp, project.id]);
                this.db.run(`
                    UPDATE source_assets
                    SET status = 'NEW',
                        prepared_path = NULL,
                        prepared_checksum_sha256 = NULL,
                        prepared_has_audio = NULL,
                        source_revision = source_revision + 1,
                        duration_ms = 0,
                        error_message = NULL,
                        updated_at = ?
                    WHERE project_id = ?
                      AND status != 'DELETED'
                `, [timestamp, project.id]);
            }

            this.markActiveRunStale(project, timestamp);
        });

        if (needsReprepare) {
            for (const source of sources) {
                if (source.original_external_path) {
                    queueEngine.enqueue({
                        projectId: project.id,
                        sourceId: source.id,
                        type: 'PREPARE_SOURCE',
                        priority: 10,
                        maxAttempts: 1
                    });
                }
            }
            queueEngine.schedule(0);
        }

        return this.db.getSnapshot(project.batch_id);
    }

    async deleteSource(batchId, sourceId) {
        const { project, source } = this.getProjectSource(batchId, sourceId);
        const queueEngine = this.getQueueEngine?.();
        const jobs = this.db.all(`
            SELECT id
            FROM jobs
            WHERE source_id = ?
              AND type = 'PREPARE_SOURCE'
              AND status IN ('QUEUED', 'RUNNING')
        `, [source.id]);
        for (const job of jobs) {
            queueEngine?.cancelJob?.(job.id);
        }

        const timestamp = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE jobs
                SET status = 'CANCELLED',
                    locked_at = NULL,
                    locked_by = NULL,
                    updated_at = ?
                WHERE source_id = ?
                  AND type = 'PREPARE_SOURCE'
                  AND status IN ('QUEUED', 'RUNNING', 'FAILED')
            `, [timestamp, source.id]);
            this.db.run(`
                UPDATE timeline_segments
                SET deleted = 1,
                    updated_at = ?
                WHERE source_id = ?
            `, [timestamp, source.id]);
            this.db.run(`
                UPDATE source_assets
                SET status = 'DELETED',
                    error_message = NULL,
                    source_revision = source_revision + 1,
                    updated_at = ?
                WHERE id = ?
            `, [timestamp, source.id]);
            this.cleanupPreparedPath(source.prepared_path);
            this.markActiveRunStale(project, timestamp);
            this.db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [timestamp, project.id]);
        });

        return this.db.getSnapshot(project.batch_id);
    }

    async replaceSource(batchId, sourceId, filePath) {
        const { project, source } = this.getProjectSource(batchId, sourceId);
        const entry = await this.inspectSourceFile(filePath, source.position);
        const queueEngine = this.getQueueEngine?.();
        if (entry.shouldEnqueue && !queueEngine) {
            throw new Error('Очередь подготовки не запущена.');
        }

        const jobs = this.db.all(`
            SELECT id
            FROM jobs
            WHERE source_id = ?
              AND type = 'PREPARE_SOURCE'
              AND status IN ('QUEUED', 'RUNNING')
        `, [source.id]);
        for (const job of jobs) {
            queueEngine?.cancelJob?.(job.id);
        }

        const timestamp = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE jobs
                SET status = 'CANCELLED',
                    locked_at = NULL,
                    locked_by = NULL,
                    updated_at = ?
                WHERE source_id = ?
                  AND type = 'PREPARE_SOURCE'
                  AND status IN ('QUEUED', 'RUNNING', 'FAILED', 'CANCELLED')
            `, [timestamp, source.id]);
            this.db.run(`
                UPDATE source_assets
                SET original_name = ?,
                    original_external_path = ?,
                    original_size_bytes = ?,
                    original_last_modified = ?,
                    original_checksum_sha256 = ?,
                    original_has_audio = ?,
                    prepared_path = NULL,
                    prepared_checksum_sha256 = NULL,
                    prepared_has_audio = NULL,
                    source_revision = source_revision + 1,
                    duration_ms = ?,
                    status = ?,
                    error_message = ?,
                    updated_at = ?
                WHERE id = ?
            `, [
                entry.originalName,
                entry.originalExternalPath,
                entry.originalSizeBytes,
                entry.originalLastModified,
                entry.originalChecksumSha256,
                entry.originalHasAudio === null ? null : (entry.originalHasAudio ? 1 : 0),
                entry.durationMs,
                entry.status,
                entry.errorMessage,
                timestamp,
                source.id
            ]);
            this.cleanupPreparedPath(source.prepared_path);
            this.markActiveRunStale(project, timestamp);
            this.db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [timestamp, project.id]);
        });

        if (entry.shouldEnqueue) {
            queueEngine.enqueue({
                projectId: project.id,
                sourceId: source.id,
                type: 'PREPARE_SOURCE',
                priority: 10,
                maxAttempts: 1
            });
            queueEngine.schedule(0);
        }

        return this.db.getSnapshot(project.batch_id);
    }

    async retryPrepareSource(batchId, sourceId) {
        const safeBatchId = typeof batchId === 'string' ? batchId.trim() : '';
        const safeSourceId = typeof sourceId === 'string' ? sourceId.trim() : '';
        if (!safeBatchId || !safeSourceId) {
            const error = new Error('batchId и sourceId обязательны.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const project = this.db.get('SELECT * FROM projects WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1', [safeBatchId]);
        if (!project) {
            throw new Error('Проект не найден.');
        }
        const source = this.db.get('SELECT * FROM source_assets WHERE id = ? AND project_id = ?', [safeSourceId, project.id]);
        if (!source) {
            throw new Error('Source не найден.');
        }
        if (!['PREPARE_FAILED', 'MISSING'].includes(source.status)) {
            throw new Error('Повтор доступен только для PREPARE_FAILED или MISSING.');
        }

        const queueEngine = this.getQueueEngine?.();
        if (!queueEngine) {
            throw new Error('Очередь подготовки не запущена.');
        }

        const now = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE jobs
                SET status = 'CANCELLED',
                    updated_at = ?
                WHERE source_id = ?
                  AND type = 'PREPARE_SOURCE'
                  AND status IN ('QUEUED', 'FAILED', 'CANCELLED')
            `, [now, safeSourceId]);
            this.db.run(`
                UPDATE source_assets
                SET status = 'NEW',
                    error_message = NULL,
                    prepared_path = NULL,
                    prepared_checksum_sha256 = NULL,
                    prepared_has_audio = NULL,
                    source_revision = source_revision + 1,
                    updated_at = ?
                WHERE id = ?
            `, [now, safeSourceId]);
            this.cleanupPreparedPath(source.prepared_path);
            this.markActiveRunStale(project, now);
        });

        queueEngine.enqueue({
            projectId: project.id,
            sourceId: safeSourceId,
            type: 'PREPARE_SOURCE',
            priority: 10,
            maxAttempts: 1
        });
        queueEngine.schedule(0);

        return this.db.getSnapshot(safeBatchId);
    }

    getProjectSource(batchId, sourceId) {
        const safeBatchId = typeof batchId === 'string' ? batchId.trim() : '';
        const safeSourceId = typeof sourceId === 'string' ? sourceId.trim() : '';
        if (!safeBatchId || !safeSourceId) {
            const error = new Error('batchId и sourceId обязательны.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const project = this.db.get('SELECT * FROM projects WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1', [safeBatchId]);
        if (!project) {
            throw new Error('Проект не найден.');
        }
        const source = this.db.get('SELECT * FROM source_assets WHERE id = ? AND project_id = ?', [safeSourceId, project.id]);
        if (!source) {
            throw new Error('Source не найден.');
        }
        return { project, source };
    }

    async inspectSourceFile(filePath, position = 0) {
        const rawPath = typeof filePath === 'string' ? filePath.trim() : '';
        if (!rawPath) {
            const error = new Error('filePath is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }
        const absolutePath = path.resolve(rawPath);
        const extension = path.extname(absolutePath).toLowerCase();
        const base = {
            position,
            originalName: path.basename(absolutePath),
            originalExternalPath: absolutePath,
            originalSizeBytes: 0,
            originalLastModified: 0,
            originalChecksumSha256: null,
            originalHasAudio: null,
            durationMs: 0,
            status: 'NEW',
            errorMessage: null,
            shouldEnqueue: true
        };

        if (!absolutePath || !SUPPORTED_SOURCE_EXTENSIONS.has(extension)) {
            return {
                ...base,
                status: 'PREPARE_FAILED',
                errorMessage: 'Неподдерживаемый формат. Выберите mp4, mov, m4v или webm.',
                shouldEnqueue: false
            };
        }

        try {
            const stat = await fsp.stat(absolutePath);
            if (!stat.isFile() || stat.size <= 0) {
                return {
                    ...base,
                    originalSizeBytes: stat.size,
                    originalLastModified: Math.round(stat.mtimeMs),
                    status: 'MISSING',
                    errorMessage: 'Исходный файл не найден.',
                    shouldEnqueue: false
                };
            }

            const [checksum, probe] = await Promise.all([
                typeof this.fileStore.sha256 === 'function' ? this.fileStore.sha256(absolutePath) : Promise.resolve(null),
                this.ffmpegService ? this.ffmpegService.probe(absolutePath) : Promise.resolve(null)
            ]).catch((error) => {
                const message = error instanceof Error ? error.message : 'Исходный файл не удалось прочитать.';
                return [null, { errorMessage: message }];
            });

            if (probe?.errorMessage) {
                return {
                    ...base,
                    originalSizeBytes: stat.size,
                    originalLastModified: Math.round(stat.mtimeMs),
                    originalChecksumSha256: checksum,
                    status: 'PREPARE_FAILED',
                    errorMessage: probe.errorMessage,
                    shouldEnqueue: false
                };
            }

            return {
                ...base,
                originalSizeBytes: stat.size,
                originalLastModified: Math.round(stat.mtimeMs),
                originalChecksumSha256: checksum,
                originalHasAudio: probe ? Boolean(probe.hasAudio) : null,
                durationMs: probe?.durationMs || 0,
                status: 'NEW',
                errorMessage: null,
                shouldEnqueue: true
            };
        } catch {
            return {
                ...base,
                status: 'MISSING',
                errorMessage: 'Исходный файл не найден.',
                shouldEnqueue: false
            };
        }
    }

    cleanupPreparedPath(preparedPath) {
        if (!preparedPath || typeof this.fileStore.removeFileSync !== 'function') {
            return;
        }
        try {
            this.fileStore.removeFileSync(preparedPath);
        } catch {
            // Best-effort cleanup; DB state still prevents reuse.
        }
    }

    cleanupLocalRunArtifacts(runId) {
        const safeRunId = typeof runId === 'string' ? runId.trim() : '';
        if (!safeRunId) return;

        const run = this.db.get('SELECT id, project_id, batch_id FROM export_runs WHERE id = ?', [safeRunId]);
        const items = this.db.all('SELECT id, output_path FROM export_items WHERE run_id = ?', [safeRunId]);

        for (const item of items) {
            if (!item.output_path || typeof this.fileStore.removeFileSync !== 'function') {
                continue;
            }
            try {
                this.fileStore.removeFileSync(item.output_path);
            } catch {
                // Best-effort cleanup; stale status disables retries.
            }
        }

        if (run && typeof this.fileStore.getExportsDir === 'function' && typeof this.fileStore.removeDirectorySync === 'function') {
            try {
                this.fileStore.removeDirectorySync(this.fileStore.getExportsDir(run.project_id, run.batch_id, safeRunId));
            } catch {
                // Best-effort cleanup.
            }
        }

        if (items.length > 0) {
            const placeholders = items.map(() => '?').join(', ');
            this.db.run(`
                DELETE FROM upload_attempts
                WHERE export_item_id IN (${placeholders})
            `, items.map((item) => item.id));
        }

        this.db.run(`
            UPDATE export_items
            SET output_path = NULL,
                output_checksum_sha256 = NULL,
                output_size_bytes = NULL,
                updated_at = ?
            WHERE run_id = ?
        `, [nowIso(), safeRunId]);
    }

    markActiveRunStale(project, timestamp = nowIso()) {
        if (!project?.active_run_id) {
            return;
        }
        const queueEngine = this.getQueueEngine?.();
        const activeJobs = this.db.all(`
            SELECT id
            FROM jobs
            WHERE run_id = ?
              AND status IN ('QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH')
        `, [project.active_run_id]);
        for (const job of activeJobs) {
            queueEngine?.cancelJob?.(job.id);
        }
        this.db.run(`
            UPDATE jobs
            SET status = 'CANCELLED',
                locked_at = NULL,
                locked_by = NULL,
                updated_at = ?
            WHERE run_id = ?
              AND status IN ('QUEUED', 'RUNNING', 'FAILED', 'CANCELLED', 'WAITING_NETWORK', 'WAITING_AUTH')
        `, [timestamp, project.active_run_id]);
        this.cleanupLocalRunArtifacts(project.active_run_id);
        this.db.run(`
            UPDATE export_runs
            SET status = 'STALE',
                updated_at = ?
            WHERE id = ?
              AND status NOT IN ('CANCELLED', 'STALE')
        `, [timestamp, project.active_run_id]);
    }

    async saveSegments(batchId, segments) {
        const safeBatchId = typeof batchId === 'string' ? batchId.trim() : '';
        if (!safeBatchId) {
            const error = new Error('batchId is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }
        if (!Array.isArray(segments)) {
            const error = new Error('segments must be an array.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const project = this.db.get('SELECT * FROM projects WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1', [safeBatchId]);
        if (!project) {
            throw new Error('Проект не найден.');
        }

        const projectSources = this.db.all('SELECT id FROM source_assets WHERE project_id = ?', [project.id]);
        const sourceIds = new Set(projectSources.map((source) => source.id));
        const normalized = this.timelineService.normalizeSegments(segments.map((segment) => ({
            ...segment,
            project_id: project.id
        })));

        if (this.timelineService.getActiveSegments(normalized).length === 0) {
            const error = new Error('Нельзя удалить последний active segment.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }
        for (const segment of normalized) {
            if (!sourceIds.has(segment.source_id)) {
                const error = new Error('Segment source не принадлежит проекту.');
                error.code = 'VALIDATION_FAILED';
                throw error;
            }
        }

        const now = nowIso();
        const segmentIds = normalized.map((segment) => segment.id);
        const existingRows = this.db.all('SELECT id, created_at FROM timeline_segments WHERE project_id = ?', [project.id]);
        const createdAtById = new Map(existingRows.map((row) => [row.id, row.created_at]));

        this.db.transaction(() => {
            if (segmentIds.length > 0) {
                const placeholders = segmentIds.map(() => '?').join(', ');
                this.db.run(`
                    DELETE FROM timeline_segments
                    WHERE project_id = ?
                      AND id NOT IN (${placeholders})
                `, [project.id, ...segmentIds]);
            } else {
                this.db.run('DELETE FROM timeline_segments WHERE project_id = ?', [project.id]);
            }

            for (const segment of normalized) {
                this.db.run(`
                    INSERT INTO timeline_segments (
                        id,
                        project_id,
                        source_id,
                        position,
                        start_ms,
                        end_ms,
                        deleted,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        source_id = excluded.source_id,
                        position = excluded.position,
                        start_ms = excluded.start_ms,
                        end_ms = excluded.end_ms,
                        deleted = excluded.deleted,
                        updated_at = excluded.updated_at
                `, [
                    segment.id,
                    project.id,
                    segment.source_id,
                    segment.position,
                    segment.start_ms,
                    segment.end_ms,
                    segment.deleted ? 1 : 0,
                    createdAtById.get(segment.id) || now,
                    now
                ]);
            }

            this.markActiveRunStale(project, now);

            this.db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [now, project.id]);
        });

        return this.db.getSnapshot(safeBatchId);
    }

    async getSourcePreviewPath(sourceId) {
        const safeSourceId = typeof sourceId === 'string' ? sourceId.trim() : '';
        if (!safeSourceId) {
            const error = new Error('sourceId is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const source = this.db.get(`
            SELECT source_assets.*, projects.batch_id
            FROM source_assets
            JOIN projects ON projects.id = source_assets.project_id
            WHERE source_assets.id = ?
            LIMIT 1
        `, [safeSourceId]);
        if (!source) {
            throw new Error('Source не найден.');
        }
        if (source.status !== 'READY') {
            throw new Error('Preview доступен только для READY source.');
        }
        if (!source.prepared_path) {
            throw new Error('Prepared-файл не задан.');
        }

        const preparedPath = this.fileStore.assertInsideRoot(source.prepared_path);
        if (!(await this.fileStore.fileExists(preparedPath))) {
            throw new Error('Prepared-файл не найден на диске.');
        }

        return preparedPath;
    }

    async recoverSourcesOnStartup() {
        const now = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE source_assets
                SET status = 'PREPARE_FAILED',
                    error_message = 'Подготовка была прервана при перезапуске приложения.',
                    updated_at = ?
                WHERE status IN ('COPYING', 'PROBING', 'PREPARING')
                  AND NOT EXISTS (
                    SELECT 1
                    FROM jobs
                    WHERE jobs.source_id = source_assets.id
                      AND jobs.status = 'RUNNING'
                  )
            `, [now]);
        });

        const readySources = this.db.all(`
            SELECT id, prepared_path
            FROM source_assets
            WHERE status = 'READY'
        `);

        for (const source of readySources) {
            if (!source.prepared_path || !fs.existsSync(source.prepared_path)) {
                this.db.run(`
                    UPDATE source_assets
                    SET status = 'MISSING',
                        error_message = 'Prepared-файл не найден на диске.',
                        updated_at = ?
                    WHERE id = ?
                `, [nowIso(), source.id]);
            }
        }

        this.recoverPrepareQueue();
    }

    recoverPrepareQueue() {
        const queueEngine = this.getQueueEngine?.();
        if (!queueEngine) {
            return 0;
        }
        const rows = this.db.all(`
            SELECT source_assets.id, source_assets.project_id
            FROM source_assets
            WHERE source_assets.status = 'NEW'
              AND source_assets.original_external_path IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM jobs
                WHERE jobs.source_id = source_assets.id
                  AND jobs.type = 'PREPARE_SOURCE'
                  AND jobs.status IN ('QUEUED', 'RUNNING')
              )
        `);
        for (const row of rows) {
            queueEngine.enqueue({
                projectId: row.project_id,
                sourceId: row.id,
                type: 'PREPARE_SOURCE',
                priority: 20,
                maxAttempts: 1
            });
        }
        if (rows.length > 0) {
            queueEngine.schedule?.(0);
        }
        return rows.length;
    }
}

module.exports = {
    ProjectService
};
