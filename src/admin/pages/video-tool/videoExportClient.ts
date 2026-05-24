import { authFetch } from '../../../utils/authFetch';
import type { RetryTailPayload, VideoExportManifest, VideoExportSessionDetails, VideoToolPayload } from './types';

export const fetchVideoToolPayload = async (batchId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-tool`);
    if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить данные инструмента.' }));
        throw new Error(payload.error || 'Не удалось загрузить данные инструмента.');
    }

    return await response.json() as VideoToolPayload;
};

export const fetchVideoExportSession = async (batchId: string, sessionId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-sessions/${sessionId}`);
    if (!response.ok) {
        return null;
    }

    const payload = await response.json() as { session: VideoExportSessionDetails };
    return payload.session;
};

export const createVideoExportSession = async (
    batchId: string,
    manifest: VideoExportManifest,
    expectedCount: number,
    sourceFingerprint: NonNullable<VideoExportManifest['sources']>[number]['fingerprint'],
    crossfadeMs: number
) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            expected_count: expectedCount,
            crossfade_ms: crossfadeMs,
            source_fingerprint: sourceFingerprint,
            render_manifest: manifest
        })
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось создать сессию экспорта.' }));
    if (!response.ok || !payload.session) {
        throw new Error(payload.error || 'Не удалось создать сессию экспорта.');
    }

    return payload.session as VideoExportSessionDetails;
};

export const retryTailVideoExportSession = async (batchId: string, sessionId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-sessions/${sessionId}/retry-tail`, {
        method: 'POST'
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось восстановить export-session.' }));
    if (!response.ok || !payload.session) {
        throw new Error(payload.error || 'Не удалось восстановить export-session.');
    }

    return payload as RetryTailPayload;
};

export const uploadVideoExportIntroFile = async (batchId: string, sessionId: string, file: Blob) => {
    const form = new FormData();
    form.append('file', file, 'intro.mp4');

    const response = await authFetch(`/api/batches/${batchId}/video-export-sessions/${sessionId}/intro-file`, {
        method: 'POST',
        body: form
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось сохранить intro на сервере.' }));
    if (!response.ok || !payload.session) {
        throw new Error(payload.error || 'Не удалось сохранить intro на сервере.');
    }

    return payload.session as VideoExportSessionDetails;
};

export const uploadVideoExportFile = async (batchId: string, sessionId: string, serialNumber: string, file: Blob) => {
    const form = new FormData();
    form.append('file', file, `${serialNumber}.mp4`);
    form.append('serial_number', serialNumber);

    const response = await authFetch(`/api/batches/${batchId}/video-export-sessions/${sessionId}/files`, {
        method: 'POST',
        body: form
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить финальный ролик на сервер.' }));
    if (!response.ok || !payload.session) {
        throw new Error(payload.error || 'Не удалось загрузить финальный ролик на сервер.');
    }

    return payload.session as VideoExportSessionDetails;
};

export const cancelVideoExportSession = async (batchId: string, sessionId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-sessions/${sessionId}/cancel`, {
        method: 'POST'
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось отменить export-session.' }));
    if (!response.ok || !payload.session) {
        throw new Error(payload.error || 'Не удалось отменить export-session.');
    }

    return payload.session as VideoExportSessionDetails;
};

export const createVideoExportPlan = async (
    batchId: string,
    manifest: VideoExportManifest,
    expectedCount: number,
    sourceFingerprint: NonNullable<VideoExportManifest['sources']>[number]['fingerprint'],
    crossfadeMs: number
) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            expected_count: expectedCount,
            crossfade_ms: crossfadeMs,
            source_fingerprint: sourceFingerprint,
            render_manifest: manifest
        })
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось создать план экспорта.' }));
    if (!response.ok || !payload.session) {
        throw new Error(payload.error || 'Не удалось создать план экспорта.');
    }

    return payload.session as VideoExportSessionDetails;
};

export const uploadVideoExportPlanArtifact = async (batchId: string, sessionId: string, serialNumber: string, file: Blob) => {
    const form = new FormData();
    form.append('file', file, `${serialNumber}.mp4`);
    form.append('serial_number', serialNumber);

    const response = await authFetch(`/api/batches/${batchId}/video-export-plans/${sessionId}/artifacts`, {
        method: 'POST',
        body: form
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить артефакт на сервер.' }));
    if (!response.ok || !payload.session) {
        throw new Error(payload.error || 'Не удалось загрузить артефакт на сервер.');
    }

    return payload.session as VideoExportSessionDetails;
};

export const commitVideoExportPlan = async (batchId: string, sessionId: string) => {
    const response = await authFetch(`/api/batches/${batchId}/video-export-plans/${sessionId}/commit`, {
        method: 'POST'
    });
    const payload = await response.json().catch(() => ({ error: 'Не удалось закоммитить результаты экспорта.' }));
    if (!response.ok || !payload.session) {
        throw new Error(payload.error || 'Не удалось закоммитить результаты экспорта.');
    }

    return payload.session as VideoExportSessionDetails;
};

