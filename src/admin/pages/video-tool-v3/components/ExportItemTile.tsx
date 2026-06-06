import { ExternalLink, FolderOpen, RotateCcw, Square } from 'lucide-react';
import type { VideoToolV3ExportItem, VideoToolV3Item } from '../types';

const renderLabels: Record<string, string> = {
    PENDING: 'Ожидает',
    QUEUED: 'В очереди',
    RENDERING: 'Рендер',
    RENDERED: 'Готово',
    RENDER_FAILED: 'Ошибка рендера',
    CANCELLED: 'Отменено'
};

const uploadLabels: Record<string, string> = {
    PENDING: 'Ждет рендер',
    QUEUED: 'В очереди',
    UPLOADING: 'Загрузка',
    UPLOADED: 'Загружено',
    UPLOAD_FAILED: 'Ошибка загрузки',
    PAUSED_OFFLINE: 'Нет сети',
    AUTH_REQUIRED: 'Нужен вход',
    CANCELLED: 'Отменено'
};

const statusClassNames: Record<string, string> = {
    RENDERED: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
    UPLOADED: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
    RENDERING: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
    UPLOADING: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
    QUEUED: 'border-white/10 bg-white/10 text-gray-100',
    PENDING: 'border-white/10 bg-black/20 text-gray-300',
    RENDER_FAILED: 'border-red-400/30 bg-red-500/10 text-red-100',
    UPLOAD_FAILED: 'border-red-400/30 bg-red-500/10 text-red-100',
    PAUSED_OFFLINE: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
    AUTH_REQUIRED: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
    CANCELLED: 'border-white/10 bg-black/20 text-gray-400'
};

const clampProgress = (value: number) => Math.max(0, Math.min(100, Number(value) || 0));

const formatSize = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value >= 1024 ** 2) return `${(value / 1024 / 1024).toFixed(1)} МБ`;
    return `${Math.max(0, value / 1024).toFixed(0)} КБ`;
};

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
    return (
        <span className={[
            'rounded-md border px-2 py-1 text-xs font-medium',
            statusClassNames[status] || 'border-white/10 bg-black/20 text-gray-300'
        ].join(' ')}
        >
            {labels[status] || status}
        </span>
    );
}

function ProgressRow({
    label,
    status,
    progress,
    labels
}: {
    label: string;
    status: string;
    progress: number;
    labels: Record<string, string>;
}) {
    const safeProgress = clampProgress(progress);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-100">{label}</span>
                    <StatusBadge status={status} labels={labels} />
                </div>
                <span className="text-xs tabular-nums text-gray-400">{safeProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/30">
                <div
                    className="h-full rounded-full bg-white"
                    style={{ width: `${safeProgress}%` }}
                />
            </div>
        </div>
    );
}

type ExportItemTileProps = {
    item: VideoToolV3ExportItem;
    projectItem?: VideoToolV3Item;
    actionLoading: boolean;
    uploadRetryDisabled: boolean;
    onRetryRender(exportItemId: string): void;
    onRetryUpload(exportItemId: string): void;
    onCancel(exportItemId: string): void;
    onOpenClone(cloneUrl: string): void;
    onShowProjectFolder(): void;
};

export function ExportItemTile({
    item,
    projectItem,
    actionLoading,
    uploadRetryDisabled,
    onRetryRender,
    onRetryUpload,
    onCancel,
    onOpenClone,
    onShowProjectFolder
}: ExportItemTileProps) {
    const canRetryRender = item.render_status === 'RENDER_FAILED' && item.upload_status !== 'UPLOADED';
    const canRetryUpload = ['UPLOAD_FAILED', 'PAUSED_OFFLINE', 'AUTH_REQUIRED'].includes(item.upload_status)
        && item.render_status === 'RENDERED'
        && Boolean(item.output_path);
    const canCancel = ['PENDING', 'QUEUED', 'RENDERING'].includes(item.render_status)
        || ['QUEUED', 'UPLOADING', 'PAUSED_OFFLINE', 'AUTH_REQUIRED'].includes(item.upload_status);
    const cloneUrl = item.clone_url || projectItem?.clone_url || `/clone/${encodeURIComponent(item.serial_number)}`;
    const renderRetryCount = Number(item.retry_count_render || 0);
    const uploadRetryCount = Number(item.retry_count_upload || 0);

    return (
        <article className="rounded-lg border border-white/10 bg-[#15171b] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-sm text-gray-400">Товар {projectItem?.item_seq ?? projectItem?.position ?? '-'}</p>
                    <h3 className="mt-1 break-all text-base font-semibold text-white">{item.serial_number}</h3>
                </div>
                <button
                    type="button"
                    onClick={() => onOpenClone(cloneUrl)}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/10"
                >
                    <ExternalLink size={16} />
                    Проверить клон
                </button>
            </div>

            <div className="mt-4 space-y-4">
                <ProgressRow
                    label="Рендер"
                    status={item.render_status}
                    progress={item.render_progress}
                    labels={renderLabels}
                />
                <ProgressRow
                    label="Загрузка"
                    status={item.upload_status}
                    progress={item.upload_progress}
                    labels={uploadLabels}
                />
            </div>

            {(renderRetryCount > 0 || uploadRetryCount > 0) ? (
                <p className="mt-3 text-xs text-gray-500">
                    Попытки: рендер {renderRetryCount}, загрузка {uploadRetryCount}
                </p>
            ) : null}

            {item.error_message ? (
                <p className="mt-4 rounded-md border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-100">
                    {item.error_message}
                </p>
            ) : null}

            {item.output_path ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>Локальный файл готов{formatSize(item.output_size_bytes) ? `: ${formatSize(item.output_size_bytes)}` : ''}</span>
                    <button
                        type="button"
                        onClick={onShowProjectFolder}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/10"
                    >
                        <FolderOpen size={13} />
                        Папка
                    </button>
                </div>
            ) : null}
            {item.server_file_url ? (
                <a
                    href={item.server_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 block break-all text-sm text-emerald-300 hover:text-emerald-200"
                >
                    Серверный файл
                </a>
            ) : null}

            {(canRetryRender || canRetryUpload || canCancel) ? (
                <div className="mt-4 flex flex-wrap gap-2">
                    {canRetryRender ? (
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => onRetryRender(item.id)}
                            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                            <RotateCcw size={16} />
                            Повторить рендер
                        </button>
                    ) : null}
                    {canRetryUpload ? (
                        <button
                            type="button"
                            disabled={actionLoading || uploadRetryDisabled || item.upload_status === 'PAUSED_OFFLINE'}
                            onClick={() => onRetryUpload(item.id)}
                            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                            <RotateCcw size={16} />
                            Повторить загрузку
                        </button>
                    ) : null}
                    {canCancel ? (
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => onCancel(item.id)}
                            className="inline-flex items-center gap-2 rounded-md border border-red-400/30 px-3 py-2 text-sm text-red-100 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                            <Square size={14} />
                            Отменить
                        </button>
                    ) : null}
                </div>
            ) : null}
        </article>
    );
}
