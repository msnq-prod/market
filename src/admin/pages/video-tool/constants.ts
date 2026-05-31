import type { ExportPhase } from './types';

export const normalizeHelperUrl = (value: string) => value.trim().replace(/\/+$/, '');

export const DESKTOP_VIDEO_HELPER_URL = 'desktop-ipc';
export const VIDEO_EXPORT_HELPER_PROTOCOL_VERSION = 'stones-video-export-helper-v3';
export const HELPER_HEALTH_TIMEOUT_MS = 2500;
export const ZAGARAMI_PRODUCTION_ORIGIN = 'https://zagarami.com';
export const MIN_SEGMENT_DURATION_MS = 200;
export const CROSSFADE_MS = 200;
export const TIMELINE_ZOOM_STEP = 1.2;
export const PREVIEW_PANEL_WIDTH_STORAGE_KEY = 'video-tool-preview-panel-width';
export const PREVIEW_PANEL_MIN_WIDTH = 264;
export const PREVIEW_PANEL_DEFAULT_WIDTH = 352;
export const PREVIEW_PANEL_MAX_WIDTH = 760;
export const TIMELINE_RULER_STEPS_MS = [
    500,
    1000,
    2000,
    5000,
    10000,
    15000,
    30000,
    60000,
    120000,
    300000,
    600000,
    900000
];

export const exportPhaseLabel: Record<ExportPhase, string> = {
    idle: 'Ожидание',
    loading: 'Загрузка данных',
    draft_ready: 'Черновик готов',
    preflight: 'Проверка (Preflight)',
    ready: 'Готов к экспорту',
    rendering: 'Рендеринг',
    uploading: 'Загрузка роликов',
    verifying: 'Проверка загрузки',
    completed: 'Готово',
    failed: 'Ошибка',
    paused_offline: 'Пауза: оффлайн',
    auth_required: 'Требуется авторизация',
    cancelled: 'Отменено'
};

export const sessionStatusLabel: Record<string, string> = {
    OPEN: 'Черновик',
    UPLOADING: 'Загрузка',
    COMPLETED: 'Готово',
    FAILED: 'Ошибка',
    CANCELLED: 'Отменено',
    ABANDONED: 'Зависло'
};
