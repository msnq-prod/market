const fs = require('fs');

const { nowIso } = require('./db.cjs');
const { VideoToolV3ServerError } = require('./serverClient.cjs');

const failMessage = (error) => (error instanceof Error ? error.message : 'Загрузка прервалась.');

class UploadWorker {
    constructor({ db, uploadService, networkService = null, exportService = null }) {
        if (!db) {
            throw new Error('UploadWorker requires db.');
        }
        if (!uploadService) {
            throw new Error('UploadWorker requires uploadService.');
        }

        this.db = db;
        this.uploadService = uploadService;
        this.networkService = networkService;
        this.exportService = exportService;
    }

    async handle(job, context = {}) {
        const exportItemId = job.export_item_id;
        if (!exportItemId) {
            return { status: 'FAILED', errorMessage: 'Upload job без export_item_id.' };
        }

        const record = this.db.get(`
            SELECT export_items.*, export_runs.manifest_json, export_runs.server_run_id,
                export_runs.batch_id, export_runs.project_id, export_runs.replace_existing,
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
        if (record.upload_status === 'CANCELLED' || ['CANCELLED', 'STALE'].includes(record.run_status)) {
            return { status: 'CANCELLED' };
        }
        if (record.render_status !== 'RENDERED' || !record.output_path || !record.output_checksum_sha256 || !record.output_size_bytes) {
            return this.fail(record, 'Upload доступен только для готового local output.', context);
        }
        if (!fs.existsSync(record.output_path)) {
            return this.fail(record, 'Rendered output не найден на диске.', context);
        }

        const network = this.networkService?.getState?.();
        if (network && (!network.online || !network.apiReachable)) {
            return this.pause(record, 'PAUSED_OFFLINE', 'WAITING_NETWORK', 'Нет сети. Загрузка будет возобновлена позже.', context);
        }
        if (network && !network.authenticated) {
            return this.pause(record, 'AUTH_REQUIRED', 'WAITING_AUTH', 'Нужно войти заново. Готовое видео сохранено локально.', context);
        }

        this.updateItem(record.id, {
            uploadStatus: 'UPLOADING',
            errorMessage: null
        });
        context.emitProjectUpdate?.(record.project_id);

        try {
            const completed = await this.uploadService.upload(record, {
                signal: context.signal,
                onProgress: (progress) => {
                    this.updateItem(record.id, {
                        uploadStatus: 'UPLOADING',
                        uploadProgress: progress,
                        errorMessage: null
                    });
                    context.emitProgress?.(progress);
                    context.emitProjectUpdate?.(record.project_id);
                }
            });
            if (context.signal?.aborted) {
                return { status: 'CANCELLED' };
            }

            this.db.run(`
                UPDATE export_items
                SET upload_status = 'UPLOADED',
                    upload_progress = 100,
                    server_file_url = ?,
                    clone_url = ?,
                    error_message = NULL,
                    updated_at = ?
                WHERE id = ?
            `, [
                completed.uploaded.file_url,
                completed.uploaded.clone_url || record.clone_url,
                nowIso(),
                record.id
            ]);
            this.exportService?.reconcileRun(record.run_id);
            context.emitProjectUpdate?.(record.project_id);
            return { status: 'DONE' };
        } catch (error) {
            if (context.signal?.aborted) {
                return { status: 'CANCELLED' };
            }
            if (error instanceof VideoToolV3ServerError && error.kind === 'AUTH_REQUIRED') {
                return this.pause(record, 'AUTH_REQUIRED', 'WAITING_AUTH', 'Нужно войти заново. Готовое видео сохранено локально.', context);
            }
            if (error instanceof VideoToolV3ServerError && error.kind === 'OFFLINE') {
                return this.pause(record, 'PAUSED_OFFLINE', 'WAITING_NETWORK', 'Нет сети. Загрузка будет возобновлена позже.', context);
            }

            const message = failMessage(error);
            this.updateItem(record.id, {
                uploadStatus: 'UPLOAD_FAILED',
                errorMessage: message
            });
            this.uploadService.setLatestAttemptStatus(record.id, 'UPLOAD_FAILED', message);
            this.exportService?.reconcileRun(record.run_id);
            context.emitProjectUpdate?.(record.project_id);
            throw error;
        }
    }

    pause(record, uploadStatus, jobStatus, message, context) {
        this.updateItem(record.id, { uploadStatus, errorMessage: message });
        this.uploadService.setLatestAttemptStatus(record.id, uploadStatus, message);
        this.exportService?.reconcileRun(record.run_id);
        context.emitProjectUpdate?.(record.project_id);
        return { status: jobStatus, errorMessage: message };
    }

    fail(record, message, context) {
        this.updateItem(record.id, { uploadStatus: 'UPLOAD_FAILED', errorMessage: message });
        this.uploadService.setLatestAttemptStatus(record.id, 'UPLOAD_FAILED', message);
        this.exportService?.reconcileRun(record.run_id);
        context.emitProjectUpdate?.(record.project_id);
        return { status: 'FAILED', errorMessage: message };
    }

    updateItem(exportItemId, { uploadStatus, uploadProgress = null, errorMessage }) {
        const fields = ['upload_status = ?', 'error_message = ?', 'updated_at = ?'];
        const values = [uploadStatus, errorMessage ?? null, nowIso()];
        if (uploadProgress !== null) {
            fields.splice(1, 0, 'upload_progress = ?');
            values.splice(1, 0, Math.max(0, Math.min(100, Number(uploadProgress) || 0)));
        }
        values.push(exportItemId);
        this.db.run(`UPDATE export_items SET ${fields.join(', ')} WHERE id = ?`, values);
    }
}

module.exports = {
    UploadWorker
};
