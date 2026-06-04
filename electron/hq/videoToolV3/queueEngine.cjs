const crypto = require('crypto');
const { EventEmitter } = require('events');

const { nowIso } = require('./db.cjs');

const DEFAULT_POLL_INTERVAL_MS = 1_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toIsoAfter = (delayMs = 0) => new Date(Date.now() + Math.max(0, delayMs)).toISOString();
const getRetryDelayMs = (attempt, random = Math.random) => {
    const exponentialDelay = Math.min(60_000, 1_000 * (2 ** Math.max(0, Number(attempt) || 0)));
    return Math.min(60_000, exponentialDelay + Math.floor(random() * 1_000));
};

class VideoToolV3QueueEngine extends EventEmitter {
    constructor({ db, networkService = null, workerId = `video-v3-${process.pid}`, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS }) {
        super();
        if (!db) {
            throw new Error('VideoToolV3QueueEngine requires db.');
        }

        this.db = db;
        this.networkService = networkService;
        this.workerId = workerId;
        this.pollIntervalMs = pollIntervalMs;
        this.handlers = new Map();
        this.running = false;
        this.timer = null;
        this.currentTick = null;
        this.activeControllers = new Map();
    }

    registerHandler(type, handler) {
        if (!type || typeof handler !== 'function') {
            throw new Error('Queue handler requires type and function.');
        }
        this.handlers.set(type, handler);
    }

    async start() {
        if (this.running) {
            return;
        }
        this.running = true;
        this.recoverStaleJobs();
        this.schedule(0);
    }

    async stop() {
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.currentTick) {
            await this.currentTick.catch(() => undefined);
        }
    }

    schedule(delayMs = this.pollIntervalMs) {
        if (!this.running || this.timer) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            this.currentTick = this.tick()
                .catch((error) => this.emit('error', error))
                .finally(() => {
                    this.currentTick = null;
                    if (this.running) {
                        this.schedule(this.pollIntervalMs);
                    }
                });
        }, delayMs);
    }

    enqueue({
        projectId,
        type,
        runId = null,
        exportItemId = null,
        sourceId = null,
        priority = 100,
        maxAttempts = 5,
        runAfter = nowIso()
    }) {
        if (!projectId || !type) {
            throw new Error('Queue job requires projectId and type.');
        }

        const id = crypto.randomUUID();
        const now = nowIso();
        this.db.run(`
            INSERT INTO jobs (
                id, project_id, run_id, export_item_id, source_id, type, status, priority,
                attempts, max_attempts, run_after, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, 0, ?, ?, ?, ?)
        `, [id, projectId, runId, exportItemId, sourceId, type, priority, maxAttempts, runAfter, now, now]);
        this.schedule(0);
        return id;
    }

    recoverStaleJobs() {
        const now = nowIso();
        this.db.transaction(() => {
            this.db.run(`
                UPDATE jobs
                SET status = 'FAILED',
                    locked_at = NULL,
                    locked_by = NULL,
                    error_message = 'Job was interrupted by application restart.',
                    updated_at = ?
                WHERE status = 'RUNNING'
                  AND type IN ('PREPARE_SOURCE', 'RENDER_ITEM')
            `, [now]);
            this.db.run(`
                UPDATE jobs
                SET status = 'QUEUED',
                    locked_at = NULL,
                    locked_by = NULL,
                    updated_at = ?
                WHERE status = 'RUNNING'
                  AND type = 'UPLOAD_ITEM'
            `, [now]);
        });
    }

    cancelJob(jobId) {
        const safeJobId = typeof jobId === 'string' ? jobId.trim() : '';
        if (!safeJobId) {
            return false;
        }

        this.activeControllers.get(safeJobId)?.abort();
        const result = this.db.run(`
            UPDATE jobs
            SET status = 'CANCELLED',
                locked_at = NULL,
                locked_by = NULL,
                error_message = NULL,
                updated_at = ?
            WHERE id = ?
              AND status IN ('QUEUED', 'RUNNING', 'WAITING_NETWORK', 'WAITING_AUTH')
        `, [nowIso(), safeJobId]);
        return result.changes > 0;
    }

    async tick() {
        if (!this.running || this.handlers.size === 0) {
            return;
        }

        while (this.running) {
            const job = this.claimNextJob();
            if (!job) {
                return;
            }
            await this.runJob(job);
            await sleep(0);
        }
    }

    claimNextJob() {
        const runnableTypes = [...this.handlers.keys()];
        if (runnableTypes.length === 0) {
            return null;
        }

        return this.db.transaction(() => {
            const placeholders = runnableTypes.map(() => '?').join(', ');
            const job = this.db.get(`
                SELECT *
                FROM jobs
                WHERE status = 'QUEUED'
                  AND run_after <= ?
                  AND type IN (${placeholders})
                ORDER BY priority ASC, run_after ASC, created_at ASC
                LIMIT 1
            `, [nowIso(), ...runnableTypes]);

            if (!job) {
                return null;
            }

            const now = nowIso();
            this.db.run(`
                UPDATE jobs
                SET status = 'RUNNING',
                    attempts = attempts + 1,
                    locked_at = ?,
                    locked_by = ?,
                    updated_at = ?
                WHERE id = ? AND status = 'QUEUED'
            `, [now, this.workerId, now, job.id]);

            return this.db.get('SELECT * FROM jobs WHERE id = ?', [job.id]);
        });
    }

    async runJob(job) {
        const handler = this.handlers.get(job.type);
        if (!handler) {
            return;
        }

        this.emit('job-started', job);
        const controller = new AbortController();
        this.activeControllers.set(job.id, controller);

        try {
            const result = await handler(job, {
                db: this.db,
                networkService: this.networkService,
                signal: controller.signal,
                emitProgress: (progress) => this.emit('job-progress', {
                    jobId: job.id,
                    sourceId: job.source_id || null,
                    exportItemId: job.export_item_id || null,
                    progress
                }),
                emitProjectUpdate: (projectId = job.project_id) => this.emit('project-updated', { projectId })
            });
            this.completeJob(job, result);
        } catch (error) {
            this.failJob(job, error);
        } finally {
            this.activeControllers.delete(job.id);
        }
    }

    completeJob(job, result = {}) {
        const status = result.status || 'DONE';
        const allowed = new Set(['DONE', 'WAITING_NETWORK', 'WAITING_AUTH', 'FAILED', 'CANCELLED']);
        if (!allowed.has(status)) {
            throw new Error(`Unsupported job completion status: ${status}`);
        }

        const now = nowIso();
        const runAfter = result.retryDelayMs ? toIsoAfter(result.retryDelayMs) : now;
        this.db.run(`
            UPDATE jobs
            SET status = ?,
                run_after = ?,
                locked_at = NULL,
                locked_by = NULL,
                error_message = ?,
                updated_at = ?
            WHERE id = ?
              AND status != 'CANCELLED'
        `, [status, runAfter, result.errorMessage || null, now, job.id]);
        this.emit('job-finished', { ...job, status });
    }

    failJob(job, error) {
        const message = error instanceof Error ? error.message : 'Job failed.';
        const attempts = Number(job.attempts || 0);
        const maxAttempts = Number(job.max_attempts || 1);
        const shouldRetry = attempts < maxAttempts;
        const status = shouldRetry ? 'QUEUED' : 'FAILED';
        const runAfter = shouldRetry ? toIsoAfter(getRetryDelayMs(attempts)) : nowIso();
        const now = nowIso();

        this.db.run(`
            UPDATE jobs
            SET status = ?,
                run_after = ?,
                locked_at = NULL,
                locked_by = NULL,
                error_message = ?,
                updated_at = ?
            WHERE id = ?
              AND status != 'CANCELLED'
        `, [status, runAfter, message, now, job.id]);
        this.emit('job-failed', { ...job, status, errorMessage: message });
    }
}

module.exports = {
    getRetryDelayMs,
    VideoToolV3QueueEngine
};
