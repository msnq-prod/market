import { authFetch } from '../../../utils/authFetch';
import type {
    VideoExportRunDetails,
    VideoExportRunListResponse,
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
