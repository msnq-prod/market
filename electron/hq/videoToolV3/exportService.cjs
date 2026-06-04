const crypto = require('crypto');
const fs = require('fs');

const { nowIso } = require('./db.cjs');
const { TimelineService } = require('./timelineService.cjs');

const parseManifest = (row) => {
    if (!row?.manifest_json) {
        return null;
    }
    try {
        return JSON.parse(row.manifest_json);
    } catch {
        return null;
    }
};

const toSnapshot = (db, runId) => {
    const run = db.get('SELECT * FROM export_runs WHERE id = ?', [runId]);
    if (!run) {
        return null;
    }
    return {
        ...run,
        manifest: parseManifest(run),
        items: db.all('SELECT * FROM export_items WHERE run_id = ? ORDER BY serial_number ASC', [runId])
    };
};

const ACTIVE_JOB_STATUSES = ['QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH'];

class ExportService {
    constructor({ db, fileStore, getQueueEngine = null }) {
        if (!db) {
            throw new Error('ExportService requires db.');
        }
        if (!fileStore) {
            throw new Error('ExportService requires fileStore.');
        }

        this.db = db;
        this.fileStore = fileStore;
        this.getQueueEngine = getQueueEngine;
        this.timelineService = new TimelineService();
    }

    async startRun(projectId, { replaceExisting = false } = {}) {
        const safeProjectId = typeof projectId === 'string' ? projectId.trim() : '';
        if (!safeProjectId) {
            const error = new Error('projectId is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const project = this.db.get('SELECT * FROM projects WHERE id = ?', [safeProjectId]);
        if (!project) {
            throw new Error('Проект не найден.');
        }

        const items = this.db.all('SELECT * FROM project_items WHERE project_id = ? ORDER BY position ASC', [project.id]);
        const sources = this.db.all('SELECT * FROM source_assets WHERE project_id = ? ORDER BY position ASC', [project.id]);
        const segments = this.db.all('SELECT * FROM timeline_segments WHERE project_id = ? ORDER BY position ASC', [project.id]);
        const validation = this.timelineService.validateForExport({
            project,
            items,
            sources,
            segments
        });

        if (!validation.ok) {
            const error = new Error(validation.blockers.map((blocker) => blocker.message).join(' '));
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const runId = crypto.randomUUID();
        const serverRunId = runId;
        const timestamp = nowIso();
        const activeSegments = this.timelineService.getActiveSegments(segments);
        const tails = activeSegments.slice(1);
        const exportItems = items.map((item, index) => ({
            id: crypto.randomUUID(),
            projectItem: item,
            segment: tails[index]
        }));
        const manifest = this.timelineService.buildManifest({
            batchId: project.batch_id,
            project,
            runId,
            sources,
            segments,
            items,
            exportItems: exportItems.map((entry) => ({ id: entry.id })),
            qualityPreset: project.quality_preset
        });

        await this.fileStore.ensureProjectDirs({
            batchId: project.batch_id,
            projectId: project.id
        });

        this.db.transaction(() => {
            if (project.active_run_id) {
                this.db.run(`
                    UPDATE export_runs
                    SET status = 'STALE',
                        updated_at = ?
                    WHERE id = ?
                      AND status NOT IN ('COMPLETED', 'CANCELLED')
                `, [timestamp, project.active_run_id]);
            }

            this.db.run(`
                INSERT INTO export_runs (
                    id, project_id, batch_id, server_run_id, status, manifest_json,
                    quality_preset, replace_existing, created_at, updated_at, completed_at, error_message
                )
                VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, NULL, NULL)
            `, [
                runId,
                project.id,
                project.batch_id,
                serverRunId,
                JSON.stringify(manifest),
                project.quality_preset,
                replaceExisting ? 1 : 0,
                timestamp,
                timestamp
            ]);

            for (const entry of exportItems) {
                this.db.run(`
                    INSERT INTO export_items (
                        id, run_id, project_item_id, item_id, serial_number, segment_id,
                        render_status, upload_status, render_progress, upload_progress,
                        output_path, output_checksum_sha256, output_size_bytes,
                        server_file_url, clone_url, retry_count_render, retry_count_upload,
                        error_message, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', 'PENDING', 0, 0, NULL, NULL, NULL, NULL, ?, 0, 0, NULL, ?, ?)
                `, [
                    entry.id,
                    runId,
                    entry.projectItem.id,
                    entry.projectItem.item_id,
                    entry.projectItem.serial_number,
                    entry.segment.id,
                    entry.projectItem.clone_url,
                    timestamp,
                    timestamp
                ]);

                this.db.run(`
                    INSERT INTO jobs (
                        id, project_id, run_id, export_item_id, source_id, type, status,
                        priority, attempts, max_attempts, run_after, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, NULL, 'RENDER_ITEM', 'QUEUED', 40, 0, 1, ?, ?, ?)
                `, [
                    crypto.randomUUID(),
                    project.id,
                    runId,
                    entry.id,
                    timestamp,
                    timestamp,
                    timestamp
                ]);
            }

            this.db.run(`
                UPDATE projects
                SET active_run_id = ?,
                    updated_at = ?
                WHERE id = ?
            `, [runId, timestamp, project.id]);
        });

        this.getQueueEngine?.()?.schedule?.(0);
        return toSnapshot(this.db, runId);
    }

    retryItemRender(exportItemId) {
        const safeExportItemId = typeof exportItemId === 'string' ? exportItemId.trim() : '';
        if (!safeExportItemId) {
            const error = new Error('exportItemId is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const item = this.db.get(`
            SELECT export_items.*, export_runs.project_id, export_runs.id AS run_id, export_runs.status AS run_status
            FROM export_items
            JOIN export_runs ON export_runs.id = export_items.run_id
            WHERE export_items.id = ?
        `, [safeExportItemId]);
        if (!item) {
            throw new Error('Export item не найден.');
        }
        if (item.render_status !== 'RENDER_FAILED') {
            throw new Error('Render retry доступен только для RENDER_FAILED.');
        }
        if (['STALE', 'CANCELLED', 'COMPLETED'].includes(item.run_status)) {
            throw new Error('Render retry недоступен для завершенного export run.');
        }

        const timestamp = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE jobs
                SET status = 'CANCELLED',
                    updated_at = ?
                WHERE export_item_id = ?
                  AND type IN ('RENDER_ITEM', 'UPLOAD_ITEM')
                  AND status IN ('QUEUED', 'FAILED', 'CANCELLED', 'WAITING_NETWORK', 'WAITING_AUTH')
            `, [timestamp, safeExportItemId]);

            this.db.run(`
                UPDATE export_items
                SET render_status = 'QUEUED',
                    upload_status = 'PENDING',
                    render_progress = 0,
                    upload_progress = 0,
                    output_path = NULL,
                    output_checksum_sha256 = NULL,
                    output_size_bytes = NULL,
                    error_message = NULL,
                    retry_count_render = retry_count_render + 1,
                    updated_at = ?
                WHERE id = ?
            `, [timestamp, safeExportItemId]);

            this.insertUniqueJob({
                projectId: item.project_id,
                runId: item.run_id,
                exportItemId: safeExportItemId,
                type: 'RENDER_ITEM',
                priority: 30,
                maxAttempts: 1,
                timestamp
            });
        });

        this.reconcileRun(item.run_id);
        this.getQueueEngine?.()?.schedule?.(0);
    }

    retryItemUpload(exportItemId) {
        const safeExportItemId = typeof exportItemId === 'string' ? exportItemId.trim() : '';
        if (!safeExportItemId) {
            const error = new Error('exportItemId is required.');
            error.code = 'VALIDATION_FAILED';
            throw error;
        }

        const item = this.db.get(`
            SELECT export_items.*, export_runs.project_id, export_runs.status AS run_status
            FROM export_items
            JOIN export_runs ON export_runs.id = export_items.run_id
            WHERE export_items.id = ?
        `, [safeExportItemId]);
        if (!item) {
            throw new Error('Export item не найден.');
        }
        if (item.render_status !== 'RENDERED' || !item.output_path) {
            throw new Error('Upload retry доступен только для готового local output.');
        }
        if (!fs.existsSync(item.output_path)) {
            throw new Error('Local output не найден.');
        }
        if (!['UPLOAD_FAILED', 'PAUSED_OFFLINE', 'AUTH_REQUIRED'].includes(item.upload_status)) {
            throw new Error('Upload retry недоступен для текущего статуса.');
        }
        if (['STALE', 'CANCELLED', 'COMPLETED'].includes(item.run_status)) {
            throw new Error('Upload retry недоступен для завершенного export run.');
        }

        const timestamp = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE jobs
                SET status = 'CANCELLED',
                    updated_at = ?
                WHERE export_item_id = ?
                  AND type = 'UPLOAD_ITEM'
                  AND status IN ('QUEUED', 'FAILED', 'CANCELLED', 'WAITING_NETWORK', 'WAITING_AUTH')
            `, [timestamp, safeExportItemId]);

            this.db.run(`
                UPDATE export_items
                SET upload_status = 'QUEUED',
                    error_message = NULL,
                    retry_count_upload = retry_count_upload + ?,
                    updated_at = ?
                WHERE id = ?
            `, [item.upload_status === 'UPLOAD_FAILED' ? 1 : 0, timestamp, safeExportItemId]);

            this.insertUniqueJob({
                projectId: item.project_id,
                runId: item.run_id,
                exportItemId: safeExportItemId,
                type: 'UPLOAD_ITEM',
                priority: 60,
                maxAttempts: 5,
                timestamp
            });
        });

        this.reconcileRun(item.run_id);
        this.getQueueEngine?.()?.schedule?.(0);
    }

    insertUniqueJob({
        projectId,
        runId,
        exportItemId,
        type,
        priority,
        maxAttempts,
        timestamp = nowIso()
    }) {
        const placeholders = ACTIVE_JOB_STATUSES.map(() => '?').join(', ');
        const existing = this.db.get(`
            SELECT id
            FROM jobs
            WHERE export_item_id = ?
              AND type = ?
              AND status IN (${placeholders})
            LIMIT 1
        `, [exportItemId, type, ...ACTIVE_JOB_STATUSES]);
        if (existing) {
            return existing.id;
        }

        const jobId = crypto.randomUUID();
        this.db.run(`
            INSERT INTO jobs (
                id, project_id, run_id, export_item_id, source_id, type, status,
                priority, attempts, max_attempts, run_after, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, NULL, ?, 'QUEUED', ?, 0, ?, ?, ?, ?)
        `, [
            jobId,
            projectId,
            runId,
            exportItemId,
            type,
            priority,
            maxAttempts,
            timestamp,
            timestamp,
            timestamp
        ]);
        return jobId;
    }

    cancelItem(exportItemId) {
        const item = this.getExportItem(exportItemId);
        const jobs = this.db.all(`
            SELECT id
            FROM jobs
            WHERE export_item_id = ?
              AND status IN ('QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH')
        `, [item.id]);
        for (const job of jobs) {
            this.getQueueEngine?.()?.cancelJob?.(job.id);
        }

        const timestamp = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE jobs
                SET status = 'CANCELLED',
                    locked_at = NULL,
                    locked_by = NULL,
                    updated_at = ?
                WHERE export_item_id = ?
                  AND status IN ('QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH')
            `, [timestamp, item.id]);
            this.db.run(`
                UPDATE export_items
                SET render_status = CASE
                        WHEN render_status IN ('PENDING', 'QUEUED', 'RENDERING') THEN 'CANCELLED'
                        ELSE render_status
                    END,
                    upload_status = CASE
                        WHEN upload_status = 'UPLOADED' THEN upload_status
                        ELSE 'CANCELLED'
                    END,
                    error_message = NULL,
                    updated_at = ?
                WHERE id = ?
            `, [timestamp, item.id]);
        });
        this.reconcileRun(item.run_id);
    }

    cancelRun(runId) {
        const safeRunId = typeof runId === 'string' ? runId.trim() : '';
        const run = safeRunId ? this.db.get('SELECT * FROM export_runs WHERE id = ?', [safeRunId]) : null;
        if (!run) {
            throw new Error('Export run не найден.');
        }
        if (run.status === 'COMPLETED') {
            throw new Error('Completed export run нельзя отменить.');
        }

        const jobs = this.db.all(`
            SELECT id
            FROM jobs
            WHERE run_id = ?
              AND status IN ('QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH')
        `, [safeRunId]);
        for (const job of jobs) {
            this.getQueueEngine?.()?.cancelJob?.(job.id);
        }

        const timestamp = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE jobs
                SET status = 'CANCELLED',
                    locked_at = NULL,
                    locked_by = NULL,
                    updated_at = ?
                WHERE run_id = ?
                  AND status IN ('QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH')
            `, [timestamp, safeRunId]);
            this.db.run(`
                UPDATE export_items
                SET render_status = CASE
                        WHEN render_status IN ('PENDING', 'QUEUED', 'RENDERING') THEN 'CANCELLED'
                        ELSE render_status
                    END,
                    upload_status = CASE
                        WHEN upload_status = 'UPLOADED' THEN upload_status
                        ELSE 'CANCELLED'
                    END,
                    error_message = NULL,
                    updated_at = ?
                WHERE run_id = ?
            `, [timestamp, safeRunId]);
            this.db.run(`
                UPDATE export_runs
                SET status = 'CANCELLED',
                    updated_at = ?
                WHERE id = ?
            `, [timestamp, safeRunId]);
        });
    }

    reconcileRun(runId) {
        const safeRunId = typeof runId === 'string' ? runId.trim() : '';
        const run = safeRunId ? this.db.get('SELECT * FROM export_runs WHERE id = ?', [safeRunId]) : null;
        if (!run || ['COMPLETED', 'CANCELLED', 'STALE'].includes(run.status)) {
            return run?.status || null;
        }

        const items = this.db.all('SELECT * FROM export_items WHERE run_id = ?', [safeRunId]);
        const placeholders = ACTIVE_JOB_STATUSES.map(() => '?').join(', ');
        const activeJob = this.db.get(`
            SELECT id
            FROM jobs
            WHERE run_id = ?
              AND status IN (${placeholders})
            LIMIT 1
        `, [safeRunId, ...ACTIVE_JOB_STATUSES]);
        const allUploaded = items.length > 0 && items.every((item) => item.upload_status === 'UPLOADED');
        const anyUploaded = items.some((item) => item.upload_status === 'UPLOADED');
        const allTerminalFailure = items.every((item) => (
            ['RENDER_FAILED', 'CANCELLED'].includes(item.render_status)
            || ['UPLOAD_FAILED', 'CANCELLED'].includes(item.upload_status)
        ));

        let nextStatus = 'ACTIVE';
        let completedAt = null;
        if (allUploaded) {
            nextStatus = 'COMPLETED';
            completedAt = nowIso();
        } else if (anyUploaded) {
            nextStatus = 'PARTIAL';
        } else if (!activeJob && allTerminalFailure) {
            nextStatus = 'FAILED';
        }

        this.db.run(`
            UPDATE export_runs
            SET status = ?,
                completed_at = ?,
                updated_at = ?
            WHERE id = ?
        `, [nextStatus, completedAt, nowIso(), safeRunId]);
        return nextStatus;
    }

    recoverOnStartup() {
        const timestamp = nowIso();
        this.db.run(`
            UPDATE export_items
            SET render_status = 'RENDER_FAILED',
                error_message = 'Render был прерван при перезапуске приложения.',
                updated_at = ?
            WHERE render_status = 'RENDERING'
              AND NOT EXISTS (
                SELECT 1
                FROM jobs
                WHERE jobs.export_item_id = export_items.id
                  AND jobs.type = 'RENDER_ITEM'
                  AND jobs.status = 'RUNNING'
              )
        `, [timestamp]);

        const runs = this.db.all(`
            SELECT id
            FROM export_runs
            WHERE status IN ('ACTIVE', 'PARTIAL', 'FAILED')
        `);
        for (const run of runs) {
            this.reconcileRun(run.id);
        }
    }

    getExportItem(exportItemId) {
        const safeExportItemId = typeof exportItemId === 'string' ? exportItemId.trim() : '';
        const item = safeExportItemId
            ? this.db.get('SELECT * FROM export_items WHERE id = ?', [safeExportItemId])
            : null;
        if (!item) {
            throw new Error('Export item не найден.');
        }
        return item;
    }
}

module.exports = {
    ExportService
};
