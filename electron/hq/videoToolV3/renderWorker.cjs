const crypto = require('crypto');
const fs = require('fs');

const { nowIso } = require('./db.cjs');

const failMessage = (error) => (error instanceof Error ? error.message : 'Render завершился ошибкой.');

const parseManifest = (manifestJson) => {
    try {
        return JSON.parse(manifestJson);
    } catch {
        throw new Error('Manifest export run поврежден.');
    }
};

class RenderWorker {
    constructor({ db, fileStore, ffmpegService, exportService = null }) {
        if (!db) {
            throw new Error('RenderWorker requires db.');
        }
        if (!fileStore) {
            throw new Error('RenderWorker requires fileStore.');
        }
        if (!ffmpegService) {
            throw new Error('RenderWorker requires ffmpegService.');
        }

        this.db = db;
        this.fileStore = fileStore;
        this.ffmpegService = ffmpegService;
        this.exportService = exportService;
    }

    async handle(job, context = {}) {
        const exportItemId = job.export_item_id;
        if (!exportItemId) {
            return { status: 'FAILED', errorMessage: 'Render job без export_item_id.' };
        }

        const record = this.db.get(`
            SELECT
                export_items.*,
                export_runs.manifest_json,
                export_runs.quality_preset,
                export_runs.batch_id,
                export_runs.project_id,
                export_runs.status AS run_status
            FROM export_items
            JOIN export_runs ON export_runs.id = export_items.run_id
            WHERE export_items.id = ?
        `, [exportItemId]);
        if (!record) {
            return { status: 'FAILED', errorMessage: 'Export item не найден.' };
        }
        if (record.upload_status === 'UPLOADED') {
            return { status: 'DONE' };
        }
        if (record.render_status === 'RENDERED') {
            return { status: 'DONE' };
        }
        if (record.render_status === 'CANCELLED') {
            return { status: 'CANCELLED' };
        }
        if (record.render_status !== 'QUEUED') {
            return { status: 'FAILED', errorMessage: `Render job недоступен для статуса ${record.render_status}.` };
        }
        if (record.run_status === 'STALE' || record.run_status === 'CANCELLED') {
            this.updateItem(exportItemId, {
                renderStatus: 'CANCELLED',
                errorMessage: 'Export run уже не активен.'
            });
            context.emitProjectUpdate?.(record.project_id);
            return { status: 'CANCELLED', errorMessage: 'Export run уже не активен.' };
        }

        try {
            const manifest = parseManifest(record.manifest_json);
            const output = manifest.outputs.find((entry) => entry.exportItemId === exportItemId);
            const introSource = manifest.sources.find((source) => source.sourceId === manifest.introSegment.sourceId);
            const tailSource = manifest.sources.find((source) => source.sourceId === output?.sourceId);
            if (!output || !introSource || !tailSource) {
                throw new Error('Manifest не содержит render input для item.');
            }
            if (!fs.existsSync(introSource.preparedPath) || !fs.existsSync(tailSource.preparedPath)) {
                throw new Error('Prepared-файл не найден на диске.');
            }

            const outputPath = this.fileStore.getExportItemPath({
                batchId: record.batch_id,
                projectId: record.project_id,
                runId: record.run_id,
                serialNumber: record.serial_number
            });

            this.updateItem(exportItemId, {
                renderStatus: 'RENDERING',
                renderProgress: 0,
                errorMessage: null
            });
            context.emitProjectUpdate?.(record.project_id);

            const rendered = await this.ffmpegService.renderItem({
                intro: {
                    preparedPath: introSource.preparedPath,
                    startMs: manifest.introSegment.startMs,
                    endMs: manifest.introSegment.endMs
                },
                tail: {
                    preparedPath: tailSource.preparedPath,
                    startMs: output.startMs,
                    endMs: output.endMs
                },
                outputPath,
                qualityPreset: manifest.settings?.qualityPreset || record.quality_preset,
                signal: context.signal,
                onProgress: (progress) => {
                    this.updateItem(exportItemId, {
                        renderStatus: 'RENDERING',
                        renderProgress: progress,
                        errorMessage: null
                    });
                    context.emitProgress?.(progress);
                    context.emitProjectUpdate?.(record.project_id);
                }
            });
            if (context.signal?.aborted) {
                throw new Error('Render отменен.');
            }

            const timestamp = nowIso();
            this.db.transaction(() => {
                this.db.run(`
                    UPDATE export_items
                    SET render_status = 'RENDERED',
                        upload_status = 'QUEUED',
                        render_progress = 100,
                        upload_progress = 0,
                        output_path = ?,
                        output_checksum_sha256 = ?,
                        output_size_bytes = ?,
                        error_message = NULL,
                        updated_at = ?
                    WHERE id = ?
                `, [rendered.outputPath, rendered.checksumSha256, rendered.sizeBytes, timestamp, exportItemId]);

                if (this.exportService) {
                    this.exportService.insertUniqueJob({
                        projectId: record.project_id,
                        runId: record.run_id,
                        exportItemId,
                        type: 'UPLOAD_ITEM',
                        priority: 60,
                        maxAttempts: 5,
                        timestamp
                    });
                } else {
                    this.db.run(`
                        INSERT INTO jobs (
                            id, project_id, run_id, export_item_id, source_id, type, status,
                            priority, attempts, max_attempts, run_after, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, NULL, 'UPLOAD_ITEM', 'QUEUED', 60, 0, 5, ?, ?, ?)
                    `, [
                        crypto.randomUUID(),
                        record.project_id,
                        record.run_id,
                        exportItemId,
                        timestamp,
                        timestamp,
                        timestamp
                    ]);
                }
            });

            this.exportService?.reconcileRun(record.run_id);
            context.emitProjectUpdate?.(record.project_id);
            return { status: 'DONE' };
        } catch (error) {
            if (context.signal?.aborted) {
                this.updateItem(exportItemId, {
                    renderStatus: 'CANCELLED',
                    errorMessage: null
                });
                this.exportService?.reconcileRun(record.run_id);
                context.emitProjectUpdate?.(record.project_id);
                return { status: 'CANCELLED' };
            }
            const message = failMessage(error);
            this.updateItem(exportItemId, {
                renderStatus: 'RENDER_FAILED',
                errorMessage: message
            });
            this.exportService?.reconcileRun(record.run_id);
            context.emitProjectUpdate?.(record.project_id);
            return { status: 'FAILED', errorMessage: message };
        }
    }

    updateItem(exportItemId, { renderStatus, renderProgress = null, errorMessage }) {
        const fields = ['render_status = ?', 'error_message = ?', 'updated_at = ?'];
        const values = [renderStatus, errorMessage ?? null, nowIso()];
        if (renderProgress !== null) {
            fields.splice(1, 0, 'render_progress = ?');
            values.splice(1, 0, Math.max(0, Math.min(100, Number(renderProgress) || 0)));
        }
        values.push(exportItemId);
        this.db.run(`UPDATE export_items SET ${fields.join(', ')} WHERE id = ?`, values);
    }
}

module.exports = {
    RenderWorker
};
