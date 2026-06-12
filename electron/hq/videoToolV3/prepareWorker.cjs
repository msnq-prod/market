const fsp = require('fs/promises');

const { nowIso } = require('./db.cjs');

const failMessage = (error) => (error instanceof Error ? error.message : 'Подготовка source завершилась ошибкой.');

class PrepareWorker {
    constructor({ db, fileStore, ffmpegService }) {
        if (!db) {
            throw new Error('PrepareWorker requires db.');
        }
        if (!fileStore) {
            throw new Error('PrepareWorker requires fileStore.');
        }
        if (!ffmpegService) {
            throw new Error('PrepareWorker requires ffmpegService.');
        }

        this.db = db;
        this.fileStore = fileStore;
        this.ffmpegService = ffmpegService;
    }

    async handle(job, context = {}) {
        const sourceId = job.source_id;
        if (!sourceId) {
            return { status: 'FAILED', errorMessage: 'Prepare job без source_id.' };
        }

        const source = this.db.get(`
            SELECT source_assets.*, projects.batch_id, projects.quality_preset
            FROM source_assets
            JOIN projects ON projects.id = source_assets.project_id
            WHERE source_assets.id = ?
        `, [sourceId]);
        if (!source) {
            return { status: 'FAILED', errorMessage: 'Source не найден.' };
        }
        const expectedRevision = Number(source.source_revision || 1);

        try {
            await this.ensureOriginalExists(source.original_external_path);
            if (!this.updateSource(sourceId, {
                status: 'PROBING',
                errorMessage: null,
                expectedRevision
            })) {
                return { status: 'CANCELLED', errorMessage: 'Source уже заменен.' };
            }
            context.emitProjectUpdate?.(source.project_id);

            const inputProbe = await this.ffmpegService.probe(source.original_external_path);
            const originalChecksumSha256 = await this.fileStore.sha256(source.original_external_path);
            if (!this.updateSource(sourceId, {
                durationMs: inputProbe.durationMs,
                originalChecksumSha256,
                originalHasAudio: inputProbe.hasAudio,
                status: 'PREPARING',
                errorMessage: null,
                expectedRevision
            })) {
                return { status: 'CANCELLED', errorMessage: 'Source уже заменен.' };
            }
            context.emitProjectUpdate?.(source.project_id);
            context.emitProgress?.(1);

            await this.fileStore.ensureProjectDirs({
                batchId: source.batch_id,
                projectId: source.project_id
            });
            const preparedPath = this.fileStore.getPreparedSourcePath({
                batchId: source.batch_id,
                projectId: source.project_id,
                sourceId
            });

            const prepared = await this.ffmpegService.prepareSource({
                inputPath: source.original_external_path,
                preparedPath,
                qualityPreset: source.quality_preset,
                expectedDurationMs: inputProbe.durationMs,
                hasAudio: inputProbe.hasAudio,
                signal: context.signal,
                onProgress: (progress) => context.emitProgress?.(progress)
            });
            if (context.signal?.aborted) {
                return { status: 'CANCELLED' };
            }

            let stored = false;
            this.db.transaction(() => {
                const now = nowIso();
                const result = this.db.run(`
                    UPDATE source_assets
                    SET prepared_path = ?,
                        prepared_checksum_sha256 = ?,
                        prepared_has_audio = ?,
                        duration_ms = ?,
                        status = 'READY',
                        error_message = NULL,
                        updated_at = ?
                    WHERE id = ?
                      AND source_revision = ?
                      AND status = 'PREPARING'
                `, [prepared.preparedPath, prepared.checksumSha256, prepared.preparedHasAudio ? 1 : 0, prepared.durationMs, now, sourceId, expectedRevision]);
                stored = result.changes > 0;
                if (!stored) {
                    return;
                }

                const existingSegment = this.db.get('SELECT id FROM timeline_segments WHERE source_id = ? LIMIT 1', [sourceId]);
                if (!existingSegment && prepared.durationMs > 0) {
                    const maxPosition = this.db.get(`
                        SELECT COALESCE(MAX(position), -1) AS position
                        FROM timeline_segments
                        WHERE project_id = ?
                    `, [source.project_id]);
                    this.db.run(`
                        INSERT INTO timeline_segments (
                            id, project_id, source_id, position, start_ms, end_ms, deleted, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?)
                    `, [
                        cryptoRandomId(),
                        source.project_id,
                        sourceId,
                        Number(maxPosition?.position ?? -1) + 1,
                        prepared.durationMs,
                        now,
                        now
                    ]);
                }
            });
            if (!stored) {
                await fsp.rm(prepared.preparedPath, { force: true }).catch(() => undefined);
                return { status: 'CANCELLED', errorMessage: 'Source уже заменен.' };
            }

            context.emitProjectUpdate?.(source.project_id);
            return { status: 'DONE' };
        } catch (error) {
            if (context.signal?.aborted) {
                return { status: 'CANCELLED' };
            }
            const status = error?.code === 'SOURCE_MISSING' ? 'MISSING' : 'PREPARE_FAILED';
            this.updateSource(sourceId, {
                status,
                errorMessage: failMessage(error),
                expectedRevision
            });
            context.emitProjectUpdate?.(source.project_id);
            return { status: 'FAILED', errorMessage: failMessage(error) };
        }
    }

    async ensureOriginalExists(inputPath) {
        try {
            const stat = await fsp.stat(inputPath);
            if (!stat.isFile() || stat.size <= 0) {
                throw new Error('not-file');
            }
        } catch (error) {
            const missing = new Error('Исходный файл не найден.');
            missing.code = 'SOURCE_MISSING';
            throw missing;
        }
    }

    updateSource(sourceId, {
        status,
        durationMs = null,
        originalChecksumSha256 = undefined,
        originalHasAudio = undefined,
        preparedHasAudio = undefined,
        expectedRevision = null,
        errorMessage
    }) {
        const fields = ['status = ?', 'error_message = ?', 'updated_at = ?'];
        const values = [status, errorMessage ?? null, nowIso()];
        if (durationMs !== null) {
            fields.unshift('duration_ms = ?');
            values.unshift(durationMs);
        }
        if (originalChecksumSha256 !== undefined) {
            fields.unshift('original_checksum_sha256 = ?');
            values.unshift(originalChecksumSha256);
        }
        if (originalHasAudio !== undefined) {
            fields.unshift('original_has_audio = ?');
            values.unshift(originalHasAudio === null ? null : (originalHasAudio ? 1 : 0));
        }
        if (preparedHasAudio !== undefined) {
            fields.unshift('prepared_has_audio = ?');
            values.unshift(preparedHasAudio === null ? null : (preparedHasAudio ? 1 : 0));
        }
        values.push(sourceId);
        let where = 'WHERE id = ?';
        if (expectedRevision !== null) {
            where += ' AND source_revision = ?';
            values.push(expectedRevision);
        }
        return this.db.run(`UPDATE source_assets SET ${fields.join(', ')} ${where}`, values).changes > 0;
    }
}

const cryptoRandomId = () => require('crypto').randomUUID();

module.exports = {
    PrepareWorker
};
