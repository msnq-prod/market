const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const safePathSegment = (value) => String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);

const ensureSafeSegment = (value, label) => {
    const safeValue = safePathSegment(value);
    if (!safeValue) {
        throw new Error(`${label} is required.`);
    }
    return safeValue;
};

const pathInside = (root, target) => {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

class VideoToolV3FileStore {
    constructor({ rootDir }) {
        if (!rootDir) {
            throw new Error('VideoToolV3FileStore requires rootDir.');
        }

        this.rootDir = path.resolve(rootDir);
        this.batchesDir = path.join(this.rootDir, 'batches');
    }

    async init() {
        await fsp.mkdir(this.batchesDir, { recursive: true });
        return this;
    }

    getDatabasePath() {
        return path.join(this.rootDir, 'video-tool-v3.sqlite');
    }

    getBatchRoot(batchId) {
        return path.join(this.batchesDir, ensureSafeSegment(batchId, 'batchId'));
    }

    getProjectRoot(projectId, batchId) {
        return path.join(this.getBatchRoot(batchId), 'projects', ensureSafeSegment(projectId, 'projectId'));
    }

    getPreparedDir(projectId, batchId) {
        return path.join(this.getProjectRoot(projectId, batchId), 'sources', 'prepared');
    }

    getExportsDir(projectId, batchId, runId) {
        return path.join(this.getProjectRoot(projectId, batchId), 'exports', ensureSafeSegment(runId, 'runId'));
    }

    getTmpDir(projectId, batchId) {
        return path.join(this.getProjectRoot(projectId, batchId), 'tmp');
    }

    getPreparedSourcePath({ batchId, projectId, sourceId }) {
        return path.join(this.getPreparedDir(projectId, batchId), `${ensureSafeSegment(sourceId, 'sourceId')}.mp4`);
    }

    getExportItemPath({ batchId, projectId, runId, serialNumber }) {
        return path.join(this.getExportsDir(projectId, batchId, runId), `${ensureSafeSegment(serialNumber, 'serialNumber')}.mp4`);
    }

    async ensureProjectDirs({ batchId, projectId }) {
        await Promise.all([
            fsp.mkdir(this.getPreparedDir(projectId, batchId), { recursive: true }),
            fsp.mkdir(this.getTmpDir(projectId, batchId), { recursive: true })
        ]);
    }

    assertInsideRoot(targetPath) {
        const resolved = path.resolve(targetPath);
        if (!pathInside(this.rootDir, resolved)) {
            throw new Error('Path is outside Video Tool v3 storage root.');
        }
        return resolved;
    }

    createTempPath(targetPath) {
        const safeTarget = this.assertInsideRoot(targetPath);
        const name = `${path.basename(safeTarget)}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
        return path.join(path.dirname(safeTarget), name);
    }

    async atomicWriteFile(targetPath, data) {
        const safeTarget = this.assertInsideRoot(targetPath);
        await fsp.mkdir(path.dirname(safeTarget), { recursive: true });
        const tempPath = this.createTempPath(safeTarget);

        try {
            await fsp.writeFile(tempPath, data);
            await fsp.rename(tempPath, safeTarget);
            return safeTarget;
        } catch (error) {
            await fsp.rm(tempPath, { force: true }).catch(() => undefined);
            throw error;
        }
    }

    async atomicMove(sourcePath, targetPath) {
        const safeTarget = this.assertInsideRoot(targetPath);
        await fsp.mkdir(path.dirname(safeTarget), { recursive: true });
        const tempPath = this.createTempPath(safeTarget);
        const backupPath = this.createTempPath(safeTarget);

        try {
            await fsp.rename(sourcePath, tempPath);
        } catch (error) {
            if (error?.code !== 'EXDEV') {
                await fsp.rm(tempPath, { force: true }).catch(() => undefined);
                throw error;
            }
            await fsp.copyFile(sourcePath, tempPath);
            await fsp.rm(sourcePath, { force: true });
        }

        try {
            await fsp.rename(tempPath, safeTarget);
            return safeTarget;
        } catch (error) {
            if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) {
                await fsp.rm(tempPath, { force: true }).catch(() => undefined);
                throw error;
            }
        }

        let hasBackup = false;
        try {
            await fsp.rename(safeTarget, backupPath);
            hasBackup = true;
            await fsp.rename(tempPath, safeTarget);
            await fsp.rm(backupPath, { force: true });
            return safeTarget;
        } catch (error) {
            if (hasBackup && !(await this.fileExists(safeTarget))) {
                await fsp.rename(backupPath, safeTarget).catch(() => undefined);
            }
            await Promise.all([
                fsp.rm(tempPath, { force: true }).catch(() => undefined),
                fsp.rm(backupPath, { force: true }).catch(() => undefined)
            ]);
            throw error;
        }
    }

    async fileExists(filePath) {
        try {
            await fsp.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    async getFileSize(filePath) {
        const stat = await fsp.stat(filePath);
        return stat.size;
    }

    removeFileSync(filePath) {
        if (!filePath) return;
        const safeTarget = this.assertInsideRoot(filePath);
        fs.rmSync(safeTarget, { force: true });
    }

    removeDirectorySync(directoryPath) {
        if (!directoryPath) return;
        const safeTarget = this.assertInsideRoot(directoryPath);
        fs.rmSync(safeTarget, { recursive: true, force: true });
    }

    async getDiskSnapshot() {
        try {
            await fsp.mkdir(this.rootDir, { recursive: true });
            if (typeof fsp.statfs !== 'function') {
                return { freeBytes: null, totalBytes: null, checkedAt: new Date().toISOString(), error: null };
            }
            const stat = await fsp.statfs(this.rootDir);
            const blockSize = Number(stat.bsize || 0);
            return {
                freeBytes: Number(stat.bavail || 0) * blockSize,
                totalBytes: Number(stat.blocks || 0) * blockSize,
                checkedAt: new Date().toISOString(),
                error: null
            };
        } catch (error) {
            return {
                freeBytes: null,
                totalBytes: null,
                checkedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Disk status unavailable.'
            };
        }
    }

    async sha256(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('error', reject);
            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    }
}

module.exports = {
    VideoToolV3FileStore
};
