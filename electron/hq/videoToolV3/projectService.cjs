const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { nowIso } = require('./db.cjs');
const { TimelineService } = require('./timelineService.cjs');

const DEFAULT_QUALITY_PRESET = 'standard';
const SUPPORTED_SOURCE_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

const normalizeSerial = (value) => (typeof value === 'string' ? value.trim() : '');

class ProjectService {
    constructor({ db, serverClient, fileStore, getQueueEngine = null }) {
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
        this.getQueueEngine = getQueueEngine;
        this.timelineService = new TimelineService();
    }

    async loadOrCreateProject(batchId) {
        const safeBatchId = typeof batchId === 'string' ? batchId.trim() : '';
        if (!safeBatchId) {
            const error = new Error('batchId is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const existing = this.db.get('SELECT id FROM projects WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1', [safeBatchId]);
        if (existing) {
            return this.db.getSnapshot(safeBatchId);
        }

        const payload = await this.serverClient.fetchBatch(safeBatchId);
        const projectId = crypto.randomUUID();
        const timestamp = nowIso();
        const items = Array.isArray(payload?.items) ? payload.items : [];

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
                payload.batch.id,
                payload.batch.status,
                Number(payload.batch.expected_output_count || items.length || 0),
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
                    item.id,
                    item.item_seq ?? null,
                    normalizeSerial(item.serial_number),
                    item.item_video_url || null,
                    item.clone_url || `/clone/${encodeURIComponent(normalizeSerial(item.serial_number))}`,
                    index,
                    timestamp,
                    timestamp
                ]);
            });
        });

        return this.db.getSnapshot(safeBatchId);
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

        const entries = await Promise.all(selectedPaths.map(async (filePath, index) => {
            const absolutePath = path.resolve(filePath);
            const extension = path.extname(absolutePath).toLowerCase();
            const sourceId = crypto.randomUUID();
            const base = {
                id: sourceId,
                position: Number(maxPosition?.position ?? -1) + 1 + index,
                originalName: path.basename(absolutePath),
                originalExternalPath: absolutePath,
                originalSizeBytes: 0,
                originalLastModified: 0,
                status: 'NEW',
                errorMessage: null,
                shouldEnqueue: true
            };

            if (!SUPPORTED_SOURCE_EXTENSIONS.has(extension)) {
                return {
                    ...base,
                    status: 'PREPARE_FAILED',
                    errorMessage: 'Неподдерживаемый формат. Выберите mp4, mov, m4v или webm.',
                    shouldEnqueue: false
                };
            }

            try {
                const stat = await fsp.stat(absolutePath);
                return {
                    ...base,
                    originalSizeBytes: stat.size,
                    originalLastModified: Math.round(stat.mtimeMs),
                    status: stat.isFile() && stat.size > 0 ? 'NEW' : 'MISSING',
                    errorMessage: stat.isFile() && stat.size > 0 ? null : 'Исходный файл не найден.',
                    shouldEnqueue: stat.isFile() && stat.size > 0
                };
            } catch {
                return {
                    ...base,
                    status: 'MISSING',
                    errorMessage: 'Исходный файл не найден.',
                    shouldEnqueue: false
                };
            }
        }));

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
                        prepared_path,
                        prepared_checksum_sha256,
                        duration_ms,
                        status,
                        error_message,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?, ?)
                `, [
                    entry.id,
                    project.id,
                    entry.position,
                    entry.originalName,
                    entry.originalExternalPath,
                    entry.originalSizeBytes,
                    entry.originalLastModified,
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
                    updated_at = ?
                WHERE id = ?
            `, [now, safeSourceId]);
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

            const activeRun = project.active_run_id
                ? this.db.get('SELECT id, status FROM export_runs WHERE id = ?', [project.active_run_id])
                : null;
            if (activeRun && activeRun.status !== 'COMPLETED') {
                this.db.run(`
                    UPDATE export_runs
                    SET status = 'STALE',
                        updated_at = ?
                    WHERE id = ?
                `, [now, activeRun.id]);
            }

            this.db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [now, project.id]);
        });

        return this.db.getSnapshot(safeBatchId);
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
    }
}

module.exports = {
    ProjectService
};
