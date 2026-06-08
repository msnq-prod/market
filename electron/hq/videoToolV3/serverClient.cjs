class VideoToolV3ServerError extends Error {
    constructor(message, { status = 0, code = 'UNKNOWN', kind = 'UNKNOWN', details = undefined } = {}) {
        super(message);
        this.status = status;
        this.code = code;
        this.kind = kind;
        this.details = details;
    }
}

const joinUrl = (origin, path) => `${String(origin || '').replace(/\/+$/, '')}${path}`;
const encode = (value) => encodeURIComponent(String(value));

const classifyResponseError = (status) => {
    if (status === 401 || status === 403) return 'AUTH_REQUIRED';
    if (status === 409 || status === 410) return 'CONFLICT';
    if (status >= 400 && status < 500) return 'BAD_REQUEST';
    if (status >= 500) return 'SERVER_ERROR';
    return 'UNKNOWN';
};

class ServerClient {
    constructor({ getApiOrigin, getAccessToken, refreshAccessToken = null }) {
        if (typeof getApiOrigin !== 'function') {
            throw new Error('ServerClient requires getApiOrigin.');
        }
        if (typeof getAccessToken !== 'function') {
            throw new Error('ServerClient requires getAccessToken.');
        }

        this.getApiOrigin = getApiOrigin;
        this.getAccessToken = getAccessToken;
        this.refreshAccessToken = refreshAccessToken;
    }

    async request(path, options = {}, retryAuth = true) {
        let token = this.getAccessToken();
        if (!token && this.refreshAccessToken) {
            token = await this.refreshAccessToken().catch(() => null);
        }
        if (!token) {
            throw new VideoToolV3ServerError('Нужно войти заново.', {
                status: 401,
                code: 'AUTH_REQUIRED',
                kind: 'AUTH_REQUIRED'
            });
        }

        let response;
        try {
            const apiOrigin = await this.getApiOrigin();
            response = await fetch(joinUrl(apiOrigin, path), {
                ...options,
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                    ...(options.headers || {})
                }
            });
        } catch (error) {
            throw new VideoToolV3ServerError(
                error instanceof Error ? error.message : 'Сервер недоступен.',
                { code: 'NETWORK_ERROR', kind: 'OFFLINE' }
            );
        }

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            if (retryAuth && (response.status === 401 || response.status === 403) && this.refreshAccessToken) {
                const refreshedToken = await this.refreshAccessToken().catch(() => null);
                if (refreshedToken) {
                    return this.request(path, options, false);
                }
            }

            throw new VideoToolV3ServerError(
                payload?.error || `Ошибка API Video Tool v3: ${response.status}.`,
                {
                    status: response.status,
                    code: payload?.code || (response.status === 401 || response.status === 403 ? 'AUTH_REQUIRED' : 'UNKNOWN'),
                    kind: classifyResponseError(response.status),
                    details: payload?.details
                }
            );
        }

        return payload;
    }

    async fetchBatch(batchId) {
        const safeBatchId = encode(batchId);
        try {
            return await this.request(`/api/video-tool-v3/batches/${safeBatchId}`);
        } catch (error) {
            if (!(error instanceof VideoToolV3ServerError) || error.status !== 404) {
                throw error;
            }
            return this.request(`/api/batches/${safeBatchId}/video-tool`);
        }
    }

    async createRun({ batchId, clientRunId, manifest, expectedCount, replaceExisting = false, signal = undefined }) {
        return this.request(`/api/video-tool-v3/batches/${encode(batchId)}/runs`, {
            method: 'POST',
            signal,
            body: JSON.stringify({
                client_run_id: clientRunId,
                manifest,
                expected_count: expectedCount,
                replace_existing: Boolean(replaceExisting)
            })
        });
    }

    async fetchRun(runId, { signal = undefined } = {}) {
        return this.request(`/api/video-tool-v3/runs/${encode(runId)}`, { signal });
    }

    async createUploadIntent({
        runId,
        itemId,
        serialNumber,
        fileName,
        fileSizeBytes,
        checksumSha256,
        chunkSizeBytes,
        signal = undefined
    }) {
        return this.request(`/api/video-tool-v3/runs/${encode(runId)}/items/${encode(itemId)}/upload-intent`, {
            method: 'POST',
            signal,
            body: JSON.stringify({
                serial_number: serialNumber,
                file_name: fileName,
                file_size_bytes: fileSizeBytes,
                checksum_sha256: checksumSha256,
                chunk_size_bytes: chunkSizeBytes
            })
        });
    }

    async fetchUploadIntent({ runId, itemId, uploadId, signal = undefined }) {
        return this.request(
            `/api/video-tool-v3/runs/${encode(runId)}/items/${encode(itemId)}/upload-intent/${encode(uploadId)}`,
            { signal }
        );
    }

    async uploadChunk({
        runId,
        itemId,
        uploadId,
        chunkIndex,
        chunk,
        checksumSha256,
        signal = undefined
    }) {
        return this.request(
            `/api/video-tool-v3/runs/${encode(runId)}/items/${encode(itemId)}/upload-intent/${encode(uploadId)}/chunks/${encode(chunkIndex)}`,
            {
                method: 'PUT',
                signal,
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': String(chunk.length),
                    'X-Chunk-Sha256': checksumSha256
                },
                body: chunk
            }
        );
    }

    async completeUploadIntent({ runId, itemId, uploadId, signal = undefined }) {
        return this.request(
            `/api/video-tool-v3/runs/${encode(runId)}/items/${encode(itemId)}/upload-intent/${encode(uploadId)}/complete`,
            { method: 'POST', signal }
        );
    }

    async cancelRun(runId, { signal = undefined } = {}) {
        return this.request(`/api/video-tool-v3/runs/${encode(runId)}/cancel`, {
            method: 'POST',
            signal
        });
    }
}

module.exports = {
    ServerClient,
    VideoToolV3ServerError
};
