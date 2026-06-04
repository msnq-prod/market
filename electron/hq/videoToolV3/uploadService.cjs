const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { nowIso } = require('./db.cjs');
const { VideoToolV3ServerError } = require('./serverClient.cjs');

const DEFAULT_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
const ACTIVE_JOB_STATUSES = ['QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH'];

const parseManifest = (manifestJson) => {
    try {
        return JSON.parse(manifestJson);
    } catch {
        throw new Error('Manifest export run поврежден.');
    }
};

const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

class UploadService {
    constructor({ db, serverClient, exportService = null, chunkSizeBytes = DEFAULT_CHUNK_SIZE_BYTES }) {
        if (!db) {
            throw new Error('UploadService requires db.');
        }
        if (!serverClient) {
            throw new Error('UploadService requires serverClient.');
        }

        this.db = db;
        this.serverClient = serverClient;
        this.exportService = exportService;
        this.chunkSizeBytes = chunkSizeBytes;
    }

    async upload(record, { signal = undefined, onProgress = null, retryMissingChunks = true } = {}) {
        const { serverRunId, uploaded } = await this.ensureServerRun(record, signal);
        if (uploaded) {
            onProgress?.(100);
            return uploaded;
        }
        const attempt = this.getOrCreateAttempt(record);
        const intent = await this.getOrCreateIntent(record, serverRunId, attempt, signal);
        const uploadedChunks = new Set(intent.uploaded_chunks || []);
        const chunkCount = Math.ceil(record.output_size_bytes / intent.chunk_size_bytes);

        this.updateAttempt(attempt.id, {
            status: 'UPLOADING',
            uploadId: intent.upload_id,
            bytesUploaded: this.getUploadedBytes(uploadedChunks, record.output_size_bytes, intent.chunk_size_bytes),
            errorMessage: null
        });
        const resumedBytes = this.getUploadedBytes(uploadedChunks, record.output_size_bytes, intent.chunk_size_bytes);
        if (resumedBytes > 0) {
            onProgress?.(Math.min(99, Math.floor((resumedBytes / record.output_size_bytes) * 100)));
        }

        let currentIntent = intent;
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
            if (uploadedChunks.has(chunkIndex)) {
                continue;
            }
            const chunk = await this.readChunk(record.output_path, chunkIndex, intent.chunk_size_bytes);
            const result = await this.serverClient.uploadChunk({
                runId: serverRunId,
                itemId: record.item_id,
                uploadId: intent.upload_id,
                chunkIndex,
                chunk,
                checksumSha256: hashBuffer(chunk),
                signal
            }).catch((error) => {
                if (this.shouldResetIntent(error)) {
                    this.resetAttemptIntent(attempt.id, error.message);
                }
                throw error;
            });
            for (const acceptedIndex of result.uploaded_chunks || [chunkIndex]) {
                uploadedChunks.add(acceptedIndex);
            }
            const bytesUploaded = this.getUploadedBytes(uploadedChunks, record.output_size_bytes, intent.chunk_size_bytes);
            this.updateAttempt(attempt.id, { status: 'UPLOADING', bytesUploaded, errorMessage: null });
            onProgress?.(Math.min(99, Math.floor((bytesUploaded / record.output_size_bytes) * 100)));
            currentIntent = { ...currentIntent, uploaded_chunks: [...uploadedChunks] };
        }

        let completed;
        try {
            completed = await this.serverClient.completeUploadIntent({
                runId: serverRunId,
                itemId: record.item_id,
                uploadId: currentIntent.upload_id,
                signal
            });
        } catch (error) {
            if (
                !(error instanceof VideoToolV3ServerError)
                || error.code !== 'UPLOAD_CHUNKS_MISSING'
                || !retryMissingChunks
            ) {
                if (this.shouldResetIntent(error)) {
                    this.resetAttemptIntent(attempt.id, error.message);
                }
                throw error;
            }
            await this.serverClient.fetchUploadIntent({
                runId: serverRunId,
                itemId: record.item_id,
                uploadId: currentIntent.upload_id,
                signal
            });
            return this.upload(record, { signal, onProgress, retryMissingChunks: false });
        }

        if (
            completed?.uploaded?.item_id !== record.item_id
            || completed?.uploaded?.checksum_sha256 !== record.output_checksum_sha256
            || !completed?.uploaded?.file_url
        ) {
            throw new Error('Server complete response не совпадает с local output.');
        }

        this.updateAttempt(attempt.id, {
            status: 'UPLOADED',
            bytesUploaded: record.output_size_bytes,
            finishedAt: nowIso(),
            errorMessage: null
        });
        onProgress?.(100);
        return completed;
    }

    async ensureServerRun(record, signal) {
        const manifest = parseManifest(record.manifest_json);
        const clientRunId = manifest.runId || record.run_id;
        const response = await this.serverClient.createRun({
            batchId: record.batch_id,
            clientRunId,
            manifest,
            expectedCount: Array.isArray(manifest.outputs) ? manifest.outputs.length : 0,
            replaceExisting: Boolean(record.replace_existing),
            signal
        });
        const serverRunId = response?.run?.id;
        if (!serverRunId) {
            throw new Error('Server не вернул run id.');
        }
        if (record.server_run_id !== serverRunId) {
            this.db.run(`
                UPDATE export_runs
                SET server_run_id = ?,
                    updated_at = ?
                WHERE id = ?
            `, [serverRunId, nowIso(), record.run_id]);
        }
        const current = await this.serverClient.fetchRun(serverRunId, { signal }).catch((error) => {
            if (error instanceof VideoToolV3ServerError && error.status === 404) {
                return response;
            }
            throw error;
        });
        const remoteItem = current?.items?.find((item) => item.item_id === record.item_id);
        if (remoteItem?.status === 'UPLOADED') {
            if (remoteItem.checksum_sha256 !== record.output_checksum_sha256 || !remoteItem.file_url) {
                throw new VideoToolV3ServerError('Server item уже загружен с другим checksum.', {
                    status: 409,
                    code: 'RUN_ITEM_CHECKSUM_CONFLICT',
                    kind: 'CONFLICT'
                });
            }
            return {
                serverRunId,
                uploaded: {
                    run: current.run,
                    uploaded: remoteItem
                }
            };
        }
        return { serverRunId, uploaded: null };
    }

    getOrCreateAttempt(record) {
        const existing = this.db.get(`
            SELECT *
            FROM upload_attempts
            WHERE export_item_id = ?
              AND checksum_sha256 = ?
              AND status != 'UPLOADED'
            ORDER BY attempt_number DESC
            LIMIT 1
        `, [record.id, record.output_checksum_sha256]);
        if (existing) {
            return existing;
        }

        const last = this.db.get(`
            SELECT COALESCE(MAX(attempt_number), 0) AS attempt_number
            FROM upload_attempts
            WHERE export_item_id = ?
        `, [record.id]);
        const attempt = {
            id: crypto.randomUUID(),
            attempt_number: Number(last?.attempt_number || 0) + 1
        };
        this.db.run(`
            INSERT INTO upload_attempts (
                id, export_item_id, attempt_number, status, bytes_total, bytes_uploaded,
                checksum_sha256, upload_id, started_at, finished_at, error_message
            )
            VALUES (?, ?, ?, 'UPLOADING', ?, 0, ?, NULL, ?, NULL, NULL)
        `, [
            attempt.id,
            record.id,
            attempt.attempt_number,
            record.output_size_bytes,
            record.output_checksum_sha256,
            nowIso()
        ]);
        return this.db.get('SELECT * FROM upload_attempts WHERE id = ?', [attempt.id]);
    }

    async getOrCreateIntent(record, serverRunId, attempt, signal) {
        if (attempt.upload_id) {
            try {
                return await this.serverClient.fetchUploadIntent({
                    runId: serverRunId,
                    itemId: record.item_id,
                    uploadId: attempt.upload_id,
                    signal
                });
            } catch (error) {
                if (!(error instanceof VideoToolV3ServerError) || ![404, 410].includes(error.status)) {
                    throw error;
                }
                this.resetAttemptIntent(attempt.id, error.message);
            }
        }

        const intent = await this.serverClient.createUploadIntent({
            runId: serverRunId,
            itemId: record.item_id,
            serialNumber: record.serial_number,
            fileName: path.basename(record.output_path),
            fileSizeBytes: record.output_size_bytes,
            checksumSha256: record.output_checksum_sha256,
            chunkSizeBytes: this.chunkSizeBytes,
            signal
        });
        this.updateAttempt(attempt.id, {
            status: 'UPLOADING',
            uploadId: intent.upload_id,
            bytesUploaded: this.getUploadedBytes(
                new Set(intent.uploaded_chunks || []),
                record.output_size_bytes,
                intent.chunk_size_bytes
            ),
            errorMessage: null
        });
        return intent;
    }

    shouldResetIntent(error) {
        return error instanceof VideoToolV3ServerError
            && ['UPLOAD_INTENT_EXPIRED', 'UPLOAD_CHUNK_CONFLICT', 'CHECKSUM_MISMATCH'].includes(error.code);
    }

    resetAttemptIntent(attemptId, errorMessage = null) {
        this.updateAttempt(attemptId, {
            status: 'UPLOAD_FAILED',
            uploadId: null,
            bytesUploaded: 0,
            errorMessage
        });
    }

    async readChunk(filePath, chunkIndex, chunkSizeBytes) {
        const handle = await fsp.open(filePath, 'r');
        try {
            const buffer = Buffer.alloc(chunkSizeBytes);
            const { bytesRead } = await handle.read(buffer, 0, chunkSizeBytes, chunkIndex * chunkSizeBytes);
            return buffer.subarray(0, bytesRead);
        } finally {
            await handle.close();
        }
    }

    getUploadedBytes(uploadedChunks, fileSizeBytes, chunkSizeBytes) {
        let bytes = 0;
        for (const chunkIndex of uploadedChunks) {
            bytes += Math.min(chunkSizeBytes, fileSizeBytes - (chunkIndex * chunkSizeBytes));
        }
        return Math.max(0, Math.min(fileSizeBytes, bytes));
    }

    updateAttempt(attemptId, {
        status,
        uploadId = undefined,
        bytesUploaded = undefined,
        finishedAt = undefined,
        errorMessage = undefined
    }) {
        const fields = ['status = ?'];
        const values = [status];
        if (uploadId !== undefined) {
            fields.push('upload_id = ?');
            values.push(uploadId);
        }
        if (bytesUploaded !== undefined) {
            fields.push('bytes_uploaded = ?');
            values.push(bytesUploaded);
        }
        if (finishedAt !== undefined) {
            fields.push('finished_at = ?');
            values.push(finishedAt);
        }
        if (errorMessage !== undefined) {
            fields.push('error_message = ?');
            values.push(errorMessage);
        }
        values.push(attemptId);
        this.db.run(`UPDATE upload_attempts SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    setLatestAttemptStatus(exportItemId, status, errorMessage = null) {
        const attempt = this.db.get(`
            SELECT id
            FROM upload_attempts
            WHERE export_item_id = ?
            ORDER BY attempt_number DESC
            LIMIT 1
        `, [exportItemId]);
        if (attempt) {
            this.updateAttempt(attempt.id, { status, errorMessage });
        }
    }

    resumePausedJobs({ network = false, auth = false } = {}) {
        const statuses = [];
        if (network) statuses.push('WAITING_NETWORK');
        if (auth) statuses.push('WAITING_AUTH');
        if (statuses.length === 0) {
            return 0;
        }

        const placeholders = statuses.map(() => '?').join(', ');
        const jobs = this.db.all(`
            SELECT id, export_item_id
            FROM jobs
            WHERE type = 'UPLOAD_ITEM'
              AND status IN (${placeholders})
        `, statuses);
        const timestamp = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE jobs
                SET status = 'QUEUED',
                    run_after = ?,
                    error_message = NULL,
                    updated_at = ?
                WHERE type = 'UPLOAD_ITEM'
                  AND status IN (${placeholders})
            `, [timestamp, timestamp, ...statuses]);
            for (const job of jobs) {
                this.db.run(`
                    UPDATE export_items
                    SET upload_status = 'QUEUED',
                        error_message = NULL,
                        updated_at = ?
                    WHERE id = ?
                      AND upload_status IN ('PAUSED_OFFLINE', 'AUTH_REQUIRED')
                `, [timestamp, job.export_item_id]);
            }
        });
        return jobs.length;
    }

    recoverOnStartup() {
        const rows = this.db.all(`
            SELECT export_items.*, export_runs.project_id
            FROM export_items
            JOIN export_runs ON export_runs.id = export_items.run_id
            WHERE export_items.render_status = 'RENDERED'
              AND export_items.upload_status IN ('QUEUED', 'UPLOADING', 'PAUSED_OFFLINE', 'AUTH_REQUIRED')
        `);
        const timestamp = nowIso();
        for (const row of rows) {
            if (!row.output_path || !fs.existsSync(row.output_path)) {
                this.db.transaction(() => {
                    this.db.run(`
                        UPDATE export_items
                        SET upload_status = 'UPLOAD_FAILED',
                            error_message = 'Rendered output не найден на диске.',
                            updated_at = ?
                        WHERE id = ?
                    `, [timestamp, row.id]);
                    this.db.run(`
                        UPDATE jobs
                        SET status = 'FAILED',
                            error_message = 'Rendered output не найден на диске.',
                            updated_at = ?
                        WHERE export_item_id = ?
                          AND type = 'UPLOAD_ITEM'
                          AND status IN ('QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH')
                    `, [timestamp, row.id]);
                });
                continue;
            }

            const activeJob = this.db.get(`
                SELECT id
                FROM jobs
                WHERE export_item_id = ?
                  AND type = 'UPLOAD_ITEM'
                  AND status IN (${ACTIVE_JOB_STATUSES.map(() => '?').join(', ')})
                LIMIT 1
            `, [row.id, ...ACTIVE_JOB_STATUSES]);
            if (row.upload_status === 'UPLOADING') {
                this.db.run(`
                    UPDATE export_items
                    SET upload_status = 'QUEUED',
                        updated_at = ?
                    WHERE id = ?
                `, [timestamp, row.id]);
            }
            if (!activeJob) {
                this.exportService?.insertUniqueJob({
                    projectId: row.project_id,
                    runId: row.run_id,
                    exportItemId: row.id,
                    type: 'UPLOAD_ITEM',
                    priority: 60,
                    maxAttempts: 5,
                    timestamp
                });
            }
        }
    }
}

module.exports = {
    DEFAULT_CHUNK_SIZE_BYTES,
    UploadService
};
