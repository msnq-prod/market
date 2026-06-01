import { authFetch } from '../../../utils/authFetch';
import type {
    VideoExportRunDetails,
    VideoExportRunListResponse,
    VideoUploadStatusResponse,
    VideoToolPayload
} from './types';

export const fetchVideoToolPayload = async (batchId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-tool`);
    if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить данные инструмента.' }));
        throw new Error(payload.error || 'Не удалось загрузить данные инструмента.');
    }

    return await response.json() as VideoToolPayload;
};

export const fetchVideoExportRuns = async (batchId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-runs`);
    if (!response.ok) {
        throw new Error('Не удалось загрузить список запусков.');
    }
    return await response.json() as VideoExportRunListResponse;
};

export const fetchVideoUploadStatus = async (batchId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-uploads`);
    if (!response.ok) {
        throw new Error('Не удалось загрузить статус видео.');
    }
    return await response.json() as VideoUploadStatusResponse;
};

export const fetchVideoExportRunDetails = async (batchId: string, runId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-runs/${runId}`);
    if (!response.ok) {
        throw new Error('Не удалось получить детали запуска экспорта.');
    }
    const payload = await response.json() as { run: VideoExportRunDetails };
    return payload.run;
};

export const cancelVideoExportRun = async (batchId: string, runId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-runs/${runId}/cancel`, {
        method: 'POST'
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось отменить запуск.' }));
    if (!response.ok || !payload.run) {
        throw new Error(payload.error || 'Не удалось отменить запуск.');
    }
    return payload.run as VideoExportRunDetails;
};

const sha256Hex = async (buffer: ArrayBuffer) => {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
};

export const runVideoExportServerHealthcheck = async (batchId: string) => {
    const probeBytes = new TextEncoder().encode(`stones-video-export-healthcheck:${batchId}`);
    const checksumSha256 = await sha256Hex(probeBytes.buffer as ArrayBuffer);
    const formData = new FormData();
    formData.append('checksum_sha256', checksumSha256);
    formData.append('file', new Blob([probeBytes], { type: 'video/mp4' }), 'video-export-healthcheck.mp4');

    const uploadResponse = await authFetch(`/api/batches/${batchId}/video-export-healthcheck`, {
        method: 'POST',
        body: formData
    });
    const uploadPayload = await uploadResponse.json().catch(() => ({ error: 'Не удалось проверить готовность сервера.' })) as {
        check_id?: string;
        file_url?: string;
        checksum_sha256?: string;
        error?: string;
    };

    if (!uploadResponse.ok || !uploadPayload.check_id || !uploadPayload.file_url) {
        throw new Error(uploadPayload.error || 'Не удалось проверить готовность сервера.');
    }

    try {
        const downloadResponse = await fetch(uploadPayload.file_url, { cache: 'no-store' });
        if (!downloadResponse.ok) {
            throw new Error('Сервер принял probe-файл, но не отдал его обратно.');
        }

        const downloadedChecksum = await sha256Hex(await downloadResponse.arrayBuffer());
        if (downloadedChecksum !== checksumSha256 || uploadPayload.checksum_sha256 !== checksumSha256) {
            throw new Error('Контрольная сумма server readiness probe не совпала.');
        }

        return uploadPayload;
    } finally {
        await authFetch(`/api/batches/${batchId}/video-export-healthcheck/${encodeURIComponent(uploadPayload.check_id)}`, {
            method: 'DELETE'
        }).catch(() => undefined);
    }
};
