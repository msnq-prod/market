const fsp = require('fs/promises');
const path = require('path');

const STATE_VERSION = 1;

const ensureDir = async (directory) => {
    await fsp.mkdir(directory, { recursive: true });
};

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

class VideoWorkflowStore {
    constructor({ rootDir }) {
        this.rootDir = rootDir;
        this.statePath = path.join(rootDir, 'video-drafts.json');
        this.drafts = {};
        this.persistPromise = Promise.resolve();
    }

    async init() {
        await ensureDir(this.rootDir);
        await this.load();
    }

    async load() {
        try {
            const raw = await fsp.readFile(this.statePath, 'utf8');
            const parsed = JSON.parse(raw);
            this.drafts = isRecord(parsed?.drafts) ? parsed.drafts : {};
        } catch {
            this.drafts = {};
        }
    }

    async persist() {
        const payload = JSON.stringify({ version: STATE_VERSION, drafts: this.drafts }, null, 2);
        this.persistPromise = this.persistPromise
            .catch(() => undefined)
            .then(() => fsp.writeFile(this.statePath, `${payload}\n`, 'utf8'));
        await this.persistPromise;
    }

    normalizeDraft(batchId, draft) {
        if (!isRecord(draft)) {
            return null;
        }

        const sources = Array.isArray(draft.sources) ? draft.sources : [];
        const segments = Array.isArray(draft.segments) ? draft.segments : [];
        return {
            version: 3,
            batchId,
            sources,
            segments,
            runId: typeof draft.runId === 'string' ? draft.runId : (typeof draft.sessionId === 'string' ? draft.sessionId : null),
            runVersion: Number(draft.runVersion || draft.sessionVersion || 0) || null,
            pendingSerials: Array.isArray(draft.pendingSerials) ? draft.pendingSerials : [],
            introHelperSourceId: typeof draft.introHelperSourceId === 'string' ? draft.introHelperSourceId : null,
            renderManifest: isRecord(draft.renderManifest) ? draft.renderManifest : null,
            updatedAt: new Date().toISOString()
        };
    }

    async saveDraft(batchId, draft) {
        const safeBatchId = String(batchId || draft?.batchId || '').trim();
        if (!safeBatchId) {
            throw new Error('batchId обязателен для video draft.');
        }

        const normalized = this.normalizeDraft(safeBatchId, draft);
        if (!normalized) {
            throw new Error('Некорректный video draft.');
        }

        this.drafts[safeBatchId] = normalized;
        await this.persist();
        return normalized;
    }

    getDraft(batchId) {
        const draft = this.drafts[String(batchId || '')];
        return isRecord(draft) ? draft : null;
    }

    async discardDraft(batchId) {
        delete this.drafts[String(batchId || '')];
        await this.persist();
        return { ok: true };
    }
}

module.exports = {
    VideoWorkflowStore
};
