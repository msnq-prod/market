const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const Database = require('better-sqlite3');

const SCHEMA_VERSION = 3;
const SCHEMA_NAME = 'source_revision_audio_metadata';

const nowIso = () => new Date().toISOString();

const normalizeRow = (row) => {
    if (!row || typeof row !== 'object') {
        return row;
    }

    return Object.fromEntries(Object.entries(row).map(([key, value]) => {
        if (['deleted', 'original_has_audio', 'prepared_has_audio'].includes(key)) {
            return [key, value === null ? null : Boolean(value)];
        }
        return [key, value];
    }));
};

class VideoToolV3Database {
    constructor({ dbPath, schemaPath = path.join(__dirname, 'schema.sql') }) {
        if (!dbPath) {
            throw new Error('VideoToolV3Database requires dbPath.');
        }

        this.dbPath = dbPath;
        this.schemaPath = schemaPath;
        this.db = null;
    }

    async init() {
        await fsp.mkdir(path.dirname(this.dbPath), { recursive: true });
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('synchronous = NORMAL');
        this.ensureMigrationTable();
        this.applyMigrations();
        return this;
    }

    ensureOpen() {
        if (!this.db) {
            throw new Error('VideoToolV3Database is not initialized.');
        }
        return this.db;
    }

    ensureMigrationTable() {
        this.ensureOpen().exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              name TEXT NOT NULL,
              applied_at TEXT NOT NULL
            )
        `);
    }

    applyMigrations() {
        const db = this.ensureOpen();
        const migrate = db.transaction(() => {
            const hasTable = (tableName) => Boolean(db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
                .get(tableName));
            const initialApplied = db
                .prepare('SELECT version FROM schema_migrations WHERE version = 1')
                .get();
            if (!initialApplied) {
                db.exec(fs.readFileSync(this.schemaPath, 'utf8'));
                db.prepare(`
                    INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
                    VALUES (1, 'initial_video_tool_v3_schema', ?)
                `).run(nowIso());
            }

            const columns = db.prepare('PRAGMA table_info(export_runs)').all();
            if (!columns.some((column) => column.name === 'replace_existing')) {
                db.exec('ALTER TABLE export_runs ADD COLUMN replace_existing INTEGER NOT NULL DEFAULT 0');
            }

            if (hasTable('source_assets')) {
                const sourceColumns = db.prepare('PRAGMA table_info(source_assets)').all();
                if (!sourceColumns.some((column) => column.name === 'original_checksum_sha256')) {
                    db.exec('ALTER TABLE source_assets ADD COLUMN original_checksum_sha256 TEXT');
                }
                if (!sourceColumns.some((column) => column.name === 'original_has_audio')) {
                    db.exec('ALTER TABLE source_assets ADD COLUMN original_has_audio INTEGER');
                }
                if (!sourceColumns.some((column) => column.name === 'prepared_has_audio')) {
                    db.exec('ALTER TABLE source_assets ADD COLUMN prepared_has_audio INTEGER');
                }
                if (!sourceColumns.some((column) => column.name === 'source_revision')) {
                    db.exec('ALTER TABLE source_assets ADD COLUMN source_revision INTEGER NOT NULL DEFAULT 1');
                }
            }
            db.prepare(`
                INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
                VALUES (?, ?, ?)
            `).run(SCHEMA_VERSION, SCHEMA_NAME, nowIso());
        });
        migrate();
    }

    transaction(fn) {
        const tx = this.ensureOpen().transaction(fn);
        return tx();
    }

    get(sql, params = []) {
        return this.ensureOpen().prepare(sql).get(...params);
    }

    all(sql, params = []) {
        return this.ensureOpen().prepare(sql).all(...params);
    }

    run(sql, params = []) {
        return this.ensureOpen().prepare(sql).run(...params);
    }

    getSnapshot(batchId) {
        const safeBatchId = typeof batchId === 'string' ? batchId.trim() : '';
        if (!safeBatchId) {
            throw new Error('batchId is required.');
        }

        const project = this.get('SELECT * FROM projects WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1', [safeBatchId]);
        if (!project) {
            return {
                batchId: safeBatchId,
                project: null,
                items: [],
                sources: [],
                segments: [],
                activeRun: null,
                exportItems: [],
                jobs: [],
                counts: {
                    items: 0,
                    sources: 0,
                    activeSegments: 0,
                    queuedJobs: 0,
                    runningJobs: 0,
                    waitingNetworkJobs: 0,
                    waitingAuthJobs: 0
                }
            };
        }

        const normalizedProject = normalizeRow(project);
        const items = this.all('SELECT * FROM project_items WHERE project_id = ? ORDER BY position ASC', [project.id]).map(normalizeRow);
        const sources = this.all('SELECT * FROM source_assets WHERE project_id = ? ORDER BY position ASC', [project.id]).map(normalizeRow);
        const segments = this.all('SELECT * FROM timeline_segments WHERE project_id = ? ORDER BY position ASC', [project.id]).map(normalizeRow);
        const activeRun = project.active_run_id
            ? normalizeRow(this.get('SELECT * FROM export_runs WHERE id = ?', [project.active_run_id]))
            : null;
        const exportItems = activeRun
            ? this.all(`
                SELECT export_items.*
                FROM export_items
                JOIN project_items ON project_items.id = export_items.project_item_id
                WHERE export_items.run_id = ?
                ORDER BY project_items.position ASC, export_items.serial_number ASC
            `, [activeRun.id]).map(normalizeRow)
            : [];
        const jobs = this.all(`
            SELECT *
            FROM jobs
            WHERE project_id = ?
            ORDER BY priority ASC, run_after ASC, created_at ASC
        `, [project.id]).map(normalizeRow);

        return {
            batchId: safeBatchId,
            project: normalizedProject,
            items,
            sources,
            segments,
            activeRun,
            exportItems,
            jobs,
            counts: {
                items: items.length,
                sources: sources.length,
                activeSegments: segments.filter((segment) => !segment.deleted).length,
                queuedJobs: jobs.filter((job) => job.status === 'QUEUED').length,
                runningJobs: jobs.filter((job) => job.status === 'RUNNING').length,
                waitingNetworkJobs: jobs.filter((job) => job.status === 'WAITING_NETWORK').length,
                waitingAuthJobs: jobs.filter((job) => job.status === 'WAITING_AUTH').length
            }
        };
    }

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

module.exports = {
    VideoToolV3Database,
    nowIso
};
