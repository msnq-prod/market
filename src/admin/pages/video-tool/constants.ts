import type { ExportPhase } from './types';

export const normalizeHelperUrl = (value: string) => value.trim().replace(/\/+$/, '');

export const VIDEO_EXPORT_HELPER_URL = normalizeHelperUrl(import.meta.env.VITE_VIDEO_EXPORT_HELPER_URL || 'http://127.0.0.1:3012');
export const DESKTOP_VIDEO_HELPER_URL = '/desktop-helper';
export const VIDEO_EXPORT_HELPER_PROTOCOL_VERSION = 'stones-video-export-helper-v3';
export const HELPER_HEALTH_TIMEOUT_MS = 2500;
export const DEFAULT_VIDEO_HELPER_DOWNLOAD_URL = '/uploads/downloads/ZAGARAMI-Video-Helper.dmg';
export const DEFAULT_VIDEO_HELPER_DOWNLOAD_URL_ARM64 = '/uploads/downloads/ZAGARAMI-Video-Helper-arm64.dmg';
export const VIDEO_HELPER_DOWNLOAD_URL = (import.meta.env.VITE_VIDEO_HELPER_DOWNLOAD_URL || DEFAULT_VIDEO_HELPER_DOWNLOAD_URL).trim();
export const VIDEO_HELPER_DOWNLOAD_URL_ARM64 = (import.meta.env.VITE_VIDEO_HELPER_DOWNLOAD_URL_ARM64 || DEFAULT_VIDEO_HELPER_DOWNLOAD_URL_ARM64).trim();
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
