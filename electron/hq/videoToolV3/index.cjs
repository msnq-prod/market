const path = require('path');
const { EventEmitter } = require('events');

const { VideoToolV3Database } = require('./db.cjs');
const { VideoToolV3FileStore } = require('./fileStore.cjs');
const { VideoToolV3NetworkService } = require('./networkService.cjs');
const { VideoToolV3QueueEngine } = require('./queueEngine.cjs');
const { ProjectService } = require('./projectService.cjs');
const { ServerClient } = require('./serverClient.cjs');
const { FfmpegService } = require('./ffmpegService.cjs');
const { PrepareWorker } = require('./prepareWorker.cjs');
const { ExportService } = require('./exportService.cjs');
const { RenderWorker } = require('./renderWorker.cjs');
const { UploadService } = require('./uploadService.cjs');
const { UploadWorker } = require('./uploadWorker.cjs');

const DEFAULT_STORAGE_FOLDER = 'ZAGARAMI HQ';
const PREVIEW_PROTOCOL = 'stones-video-v3-preview';

class VideoToolV3App extends EventEmitter {
    constructor({
        app,
        rootDir = null,
        getApiOrigin = null,
        getNetworkStatus = null,
        getAccessToken = null
    }) {
        super();
        if (!app) {
            throw new Error('VideoToolV3App requires Electron app.');
        }

        this.app = app;
        this.rootDir = rootDir || path.join(app.getPath('appData'), DEFAULT_STORAGE_FOLDER, 'video-tool-v3');
        this.getApiOrigin = getApiOrigin || (() => 'http://127.0.0.1:3001');
        this.getNetworkStatus = getNetworkStatus;
        this.getAccessToken = getAccessToken;
        this.fileStore = new VideoToolV3FileStore({ rootDir: this.rootDir });
        this.db = null;
        this.serverClient = null;
        this.projectService = null;
        this.networkService = null;
        this.queueEngine = null;
        this.ffmpegService = null;
        this.prepareWorker = null;
        this.exportService = null;
        this.renderWorker = null;
        this.uploadService = null;
        this.uploadWorker = null;
        this.lastResumedAccessToken = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) {
            return this;
        }

        await this.fileStore.init();
        this.lastResumedAccessToken = this.getAccessToken?.() || null;
        this.db = await new VideoToolV3Database({
            dbPath: this.fileStore.getDatabasePath()
        }).init();
        this.serverClient = new ServerClient({
            getApiOrigin: this.getApiOrigin,
            getAccessToken: this.getAccessToken
        });
        this.projectService = new ProjectService({
            db: this.db,
            serverClient: this.serverClient,
            fileStore: this.fileStore,
            getQueueEngine: () => this.queueEngine
        });
        this.networkService = new VideoToolV3NetworkService({
            getNetworkStatus: this.getNetworkStatus,
            getAccessToken: this.getAccessToken
        });
        this.queueEngine = new VideoToolV3QueueEngine({
            db: this.db,
            networkService: this.networkService
        });
        this.ffmpegService = new FfmpegService({
            fileStore: this.fileStore
        });
        this.prepareWorker = new PrepareWorker({
            db: this.db,
            fileStore: this.fileStore,
            ffmpegService: this.ffmpegService
        });
        this.exportService = new ExportService({
            db: this.db,
            fileStore: this.fileStore,
            getQueueEngine: () => this.queueEngine
        });
        this.renderWorker = new RenderWorker({
            db: this.db,
            fileStore: this.fileStore,
            ffmpegService: this.ffmpegService,
            exportService: this.exportService
        });
        this.uploadService = new UploadService({
            db: this.db,
            serverClient: this.serverClient,
            exportService: this.exportService
        });
        this.uploadWorker = new UploadWorker({
            db: this.db,
            uploadService: this.uploadService,
            networkService: this.networkService,
            exportService: this.exportService
        });
        this.queueEngine.registerHandler('PREPARE_SOURCE', (job, context) => this.prepareWorker.handle(job, context));
        this.queueEngine.registerHandler('RENDER_ITEM', (job, context) => this.renderWorker.handle(job, context));
        this.queueEngine.registerHandler('UPLOAD_ITEM', (job, context) => this.uploadWorker.handle(job, context));

        this.networkService.on('change', (state) => {
            const resumed = this.uploadService.resumePausedJobs({
                network: state.online && state.apiReachable
            });
            this.emit('event', {
                type: 'network-changed',
                online: state.online,
                apiReachable: state.apiReachable,
                authenticated: state.authenticated
            });
            if (resumed > 0 || (state.online && this.queueEngine)) {
                this.queueEngine.schedule(0);
            }
        });
        this.networkService.on('checked', (state) => {
            const resumed = this.uploadService.resumePausedJobs({
                network: state.online && state.apiReachable
            });
            if (resumed > 0) {
                this.queueEngine.schedule(0);
            }
        });
        this.queueEngine.on('job-progress', (event) => {
            this.emit('event', {
                type: 'job-progress',
                jobId: event.jobId,
                sourceId: event.sourceId,
                exportItemId: event.exportItemId,
                progress: event.progress
            });
        });
        this.queueEngine.on('job-started', (job) => {
            this.emitSnapshotForProjectId(job.project_id);
        });
        this.queueEngine.on('job-finished', (job) => {
            if (job.run_id) {
                this.exportService.reconcileRun(job.run_id);
            }
            this.emitSnapshotForProjectId(job.project_id);
        });
        this.queueEngine.on('job-failed', (job) => {
            if (job.run_id) {
                this.exportService.reconcileRun(job.run_id);
            }
            this.emitSnapshotForProjectId(job.project_id);
        });
        this.queueEngine.on('project-updated', (event) => {
            this.emitSnapshotForProjectId(event.projectId);
        });
        this.queueEngine.on('error', (error) => {
            this.emit('event', {
                type: 'error',
                message: error instanceof Error ? error.message : 'Queue engine error.'
            });
        });

        this.queueEngine.recoverStaleJobs();
        this.exportService.recoverOnStartup();
        this.uploadService.recoverOnStartup();
        await this.projectService.recoverSourcesOnStartup();
        this.networkService.start();
        await this.queueEngine.start();
        this.initialized = true;
        return this;
    }

    ensureInitialized() {
        if (!this.initialized || !this.db || !this.projectService || !this.exportService || !this.networkService || !this.queueEngine) {
            throw new Error('Video Tool v3 is not initialized.');
        }
    }

    async getSnapshot(batchId) {
        this.ensureInitialized();
        const snapshot = await this.projectService.loadOrCreateProject(batchId);
        return {
            ...snapshot,
            network: this.networkService.getState()
        };
    }

    async selectSources(batchId, filePaths) {
        this.ensureInitialized();
        const snapshot = await this.projectService.importSources(batchId, filePaths);
        this.queueEngine.schedule(0);
        return {
            ...snapshot,
            network: this.networkService.getState()
        };
    }

    async retryPrepareSource(batchId, sourceId) {
        this.ensureInitialized();
        const snapshot = await this.projectService.retryPrepareSource(batchId, sourceId);
        return {
            ...snapshot,
            network: this.networkService.getState()
        };
    }

    async saveSegments(batchId, segments) {
        this.ensureInitialized();
        const snapshot = await this.projectService.saveSegments(batchId, segments);
        return {
            ...snapshot,
            network: this.networkService.getState()
        };
    }

    async getSourcePreviewUrl(sourceId) {
        this.ensureInitialized();
        await this.projectService.getSourcePreviewPath(sourceId);
        return {
            previewUrl: `${PREVIEW_PROTOCOL}://source/${encodeURIComponent(sourceId)}`
        };
    }

    async getSourcePreviewPath(sourceId) {
        this.ensureInitialized();
        return this.projectService.getSourcePreviewPath(sourceId);
    }

    async startExport(projectId, options = {}) {
        this.ensureInitialized();
        await this.exportService.startRun(projectId, options);
        const project = this.db.get('SELECT batch_id FROM projects WHERE id = ?', [projectId]);
        if (!project?.batch_id) {
            throw new Error('Проект не найден.');
        }
        this.queueEngine.schedule(0);
        return {
            ...this.db.getSnapshot(project.batch_id),
            network: this.networkService.getState()
        };
    }

    async retryItemRender(exportItemId) {
        this.ensureInitialized();
        this.exportService.retryItemRender(exportItemId);
        const row = this.db.get(`
            SELECT projects.batch_id
            FROM export_items
            JOIN export_runs ON export_runs.id = export_items.run_id
            JOIN projects ON projects.id = export_runs.project_id
            WHERE export_items.id = ?
        `, [exportItemId]);
        if (!row?.batch_id) {
            throw new Error('Export item не найден.');
        }
        this.queueEngine.schedule(0);
        return {
            ...this.db.getSnapshot(row.batch_id),
            network: this.networkService.getState()
        };
    }

    async retryItemUpload(exportItemId) {
        this.ensureInitialized();
        this.exportService.retryItemUpload(exportItemId);
        const row = this.db.get(`
            SELECT projects.batch_id
            FROM export_items
            JOIN export_runs ON export_runs.id = export_items.run_id
            JOIN projects ON projects.id = export_runs.project_id
            WHERE export_items.id = ?
        `, [exportItemId]);
        if (!row?.batch_id) {
            throw new Error('Export item не найден.');
        }
        this.queueEngine.schedule(0);
        return {
            ...this.db.getSnapshot(row.batch_id),
            network: this.networkService.getState()
        };
    }

    async cancelItem(exportItemId) {
        this.ensureInitialized();
        this.exportService.cancelItem(exportItemId);
        return this.getSnapshotForExportItem(exportItemId);
    }

    async cancelRun(runId) {
        this.ensureInitialized();
        const run = this.db.get('SELECT server_run_id FROM export_runs WHERE id = ?', [runId]);
        this.exportService.cancelRun(runId);
        if (run?.server_run_id) {
            await this.serverClient.cancelRun(run.server_run_id).catch(() => undefined);
        }
        const project = this.db.get(`
            SELECT projects.batch_id
            FROM export_runs
            JOIN projects ON projects.id = export_runs.project_id
            WHERE export_runs.id = ?
        `, [runId]);
        if (!project?.batch_id) {
            throw new Error('Export run не найден.');
        }
        return {
            ...this.db.getSnapshot(project.batch_id),
            network: this.networkService.getState()
        };
    }

    getSnapshotForExportItem(exportItemId) {
        const row = this.db.get(`
            SELECT projects.batch_id
            FROM export_items
            JOIN export_runs ON export_runs.id = export_items.run_id
            JOIN projects ON projects.id = export_runs.project_id
            WHERE export_items.id = ?
        `, [exportItemId]);
        if (!row?.batch_id) {
            throw new Error('Export item не найден.');
        }
        return {
            ...this.db.getSnapshot(row.batch_id),
            network: this.networkService.getState()
        };
    }

    setAccessToken(accessToken) {
        if (this.networkService) {
            this.networkService.setAccessToken(accessToken);
        }
        if (accessToken && accessToken !== this.lastResumedAccessToken && this.uploadService && this.queueEngine) {
            this.lastResumedAccessToken = accessToken;
            this.uploadService.resumePausedJobs({ auth: true });
            this.queueEngine.schedule(0);
        }
    }

    emitSnapshotForProjectId(projectId) {
        if (!this.db || !projectId) {
            return;
        }
        const project = this.db.get('SELECT batch_id FROM projects WHERE id = ?', [projectId]);
        if (!project?.batch_id) {
            return;
        }
        const snapshot = this.db.getSnapshot(project.batch_id);
        this.emit('event', {
            type: 'snapshot',
            batchId: project.batch_id,
            snapshot: {
                ...snapshot,
                network: this.networkService?.getState?.()
            }
        });
    }

    async stop() {
        if (this.queueEngine) {
            await this.queueEngine.stop();
        }
        if (this.networkService) {
            this.networkService.stop();
        }
        if (this.db) {
            this.db.close();
        }
        this.initialized = false;
    }
}

const createVideoToolV3App = (options) => new VideoToolV3App(options);

module.exports = {
    VideoToolV3App,
    createVideoToolV3App,
    PREVIEW_PROTOCOL
};
