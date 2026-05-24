import { authFetch } from '../../../utils/authFetch';
import type {
    VideoExportManifest,
    VideoExportRunDetails,
    VideoExportRunListResponse,
    VideoExportRunMutationResponse,
    VideoExportSettings,
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

export const createVideoExportRun = async (
    batchId: string,
    expectedCount: number,
    manifest: VideoExportManifest,
    settings: VideoExportSettings
) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            expected_count: expectedCount,
            render_manifest: manifest,
            export_settings: settings
        })
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось создать запуск экспорта.' }));
    if (!response.ok || !payload.run) {
        throw new Error(payload.error || 'Не удалось создать запуск экспорта.');
    }
    return payload as VideoExportRunMutationResponse;
};

export const fetchVideoExportRunDetails = async (batchId: string, runId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-runs/${runId}`);
    if (!response.ok) {
        throw new Error('Не удалось получить детали запуска экспорта.');
    }
    const payload = await response.json() as { run: VideoExportRunDetails };
    return payload.run;
};

export const uploadVideoExportRunItemManual = async (
    batchId: string,
    runId: string,
    itemId: string,
    serialNumber: string,
    file: Blob
) => {
    const form = new FormData();
    form.append('file', file, `${serialNumber}.mp4`);
    form.append('serial_number', serialNumber);

    const response = await authFetch(`/api/batches/${batchId}/video-export-runs/${runId}/items/${itemId}/upload`, {
        method: 'POST',
        body: form
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить файл.' }));
    if (!response.ok || !payload.run) {
        throw new Error(payload.error || 'Не удалось загрузить файл.');
    }
    return payload.run as VideoExportRunDetails;
};

export const commitVideoExportRun = async (batchId: string, runId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-runs/${runId}/commit`, {
        method: 'POST'
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось закоммитить запуск.' }));
    if (!response.ok || !payload.run) {
        throw new Error(payload.error || 'Не удалось закоммитить запуск.');
    }
    return payload.run as VideoExportRunDetails;
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
