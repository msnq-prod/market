import React from 'react';
import { AlertTriangle, XCircle, ExternalLink } from 'lucide-react';
import { resolveServerUrl } from '../../../../utils/serverUrls';
import type { PreflightIssue } from '../engine/preflight';

interface VideoExportRunItem {
    item_id: string;
    serial_number: string;
    segment_seq: number;
    status: string;
    render_status: string;
    upload_status: string;
    file_url?: string | null;
    item_card_url?: string | null;
    error_message?: string | null;
    checksum?: string | null;
    updated_at?: string;
    created_at?: string;
}

interface ExportMenuProps {
    run: {
        run_id: string;
        status: string;
        version: number;
        items: VideoExportRunItem[];
    } | null;
    localRunSnapshot: {
        status: string;
        items: Record<string, {
            itemId: string;
            serialNumber: string;
            renderStatus: string;
            renderProgress: number;
            renderJobId: string;
            uploadStatus: string;
            uploadProgress: number;
            uploadJobId: string;
            errorMessage: string;
        }>;
    } | null;
    preflightIssues?: PreflightIssue[];
    onCancelRun: () => void;
    onStartRun: () => void;
    serverAssetOrigin?: string | null;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
    run,
    localRunSnapshot,
    preflightIssues: _preflightIssues,
    onCancelRun,
    onStartRun,
    serverAssetOrigin
}) => {
    if (!run) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500">
                <AlertTriangle size={32} className="text-zinc-600 mb-3" />
                <p className="text-sm font-semibold text-zinc-300">Для экспорта нет активного запуска</p>
                <p className="text-xs text-zinc-500 mt-2 max-w-sm mb-4">
                    Убедитесь, что все исходные файлы привязаны и настроены параметры экспорта на вкладке "Подготовка".
                </p>
                <button
                    type="button"
                    data-testid="start-run"
                    onClick={onStartRun}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition"
                >
                    Начать экспорт
                </button>
            </div>
        );
    }

    const getMergedItem = (item: VideoExportRunItem) => {
        const local = localRunSnapshot?.items?.[item.item_id];
        return {
            itemId: item.item_id,
            serialNumber: item.serial_number,
            segmentSeq: item.segment_seq,
            status: local?.uploadStatus === 'completed'
                ? 'UPLOADED'
                : local?.uploadStatus === 'uploading'
                    ? 'UPLOADING'
                    : local?.renderStatus === 'rendering'
                        ? 'RENDERING'
                        : item.status,
            renderStatus: local?.renderStatus || item.render_status || 'PENDING',
            uploadStatus: local?.uploadStatus || item.upload_status || 'PENDING',
            renderProgress: local?.renderProgress ?? (item.render_status === 'RENDERED' ? 100 : 0),
            uploadProgress: local?.uploadProgress ?? (item.upload_status === 'UPLOADED' ? 100 : 0),
            fileUrl: item.file_url,
            itemCardUrl: item.item_card_url || `/clone/${encodeURIComponent(item.serial_number)}`,
            errorMessage: local?.errorMessage || item.error_message || ''
        };
    };

    const mergedItems = run.items.map(getMergedItem);
    const allTerminal = mergedItems.every(
        (it) => it.status === 'UPLOADED' || it.status === 'SKIPPED' || it.status === 'CANCELLED' || it.uploadStatus === 'completed'
    );

    return (
        <div className="flex-1 overflow-y-auto bg-[#0f1013] p-6 max-w-5xl mx-auto w-full flex flex-col gap-6">
            {/* Header / Info panel */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div>
                    <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
                        Версия запуска #{run.version} · Статус: {run.status}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                        Всего роликов для выгрузки: {run.items.length}. Рендеринг и загрузка происходят поштучно.
                    </p>
                </div>
                
                <div className="flex items-center gap-2">
                    {run.status !== 'COMPLETED' && run.status !== 'CANCELLED' && (
                        <button
                            type="button"
                            data-testid="cancel-run"
                            onClick={onCancelRun}
                            className="px-3.5 py-2 rounded-xl border border-red-500/20 bg-red-950/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition"
                        >
                            Отменить запуск
                        </button>
                    )}
                </div>
            </div>

            {/* List of cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mergedItems.map((item) => {
                    const isRendering = item.renderStatus === 'rendering' || item.renderStatus === 'RENDERING';
                    const isCompleted = item.status === 'UPLOADED' || item.uploadStatus === 'completed' || item.uploadStatus === 'UPLOADED';
                    const isReadyToUpload = Boolean(
                        item.fileUrl
                        || isCompleted
                        || item.renderStatus === 'completed'
                        || item.renderStatus === 'RENDERED'
                        || item.renderStatus === 'COMPLETED'
                        || item.uploadStatus === 'uploading'
                        || item.uploadStatus === 'UPLOADING'
                    );
                    const isFailed = item.renderStatus === 'failed' || item.renderStatus === 'FAILED' || item.uploadStatus === 'failed' || item.uploadStatus === 'FAILED';
                    const resolvedFileUrl = resolveServerUrl(item.fileUrl, { serverOrigin: serverAssetOrigin });
                    const resolvedCardUrl = resolveServerUrl(item.itemCardUrl, { serverOrigin: serverAssetOrigin });

                    return (
                        <div
                            key={item.itemId}
                            data-testid={`export-item-${item.itemId}`}
                            className={`rounded-2xl border p-5 bg-[#16171c] shadow-md transition-all duration-200 ${
                                isCompleted
                                    ? 'border-emerald-500/20 bg-emerald-950/5 shadow-[0_0_15px_rgba(16,185,129,0.02)]'
                                    : isRendering
                                        ? 'border-blue-500/30 bg-blue-950/5 shadow-[0_0_15px_rgba(59,130,246,0.02)]'
                                        : isFailed
                                            ? 'border-red-500/20 bg-red-950/5'
                                            : 'border-zinc-800'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <span className="text-[10px] font-bold text-zinc-400 font-mono uppercase bg-zinc-950 px-2 py-0.5 rounded-md">
                                        Фрагмент #{String(item.segmentSeq).padStart(3, '0')}
                                    </span>
                                    <h3 className="text-sm font-semibold text-zinc-100 mt-2 font-mono">
                                        {item.serialNumber}
                                    </h3>
                                </div>

                                <div className="text-right">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                        isCompleted
                                            ? 'bg-emerald-950 text-emerald-400'
                                            : isRendering
                                                ? 'bg-blue-950 text-blue-400 animate-pulse'
                                                : isReadyToUpload
                                                    ? 'bg-emerald-950 text-emerald-400'
                                                    : 'bg-zinc-900 text-zinc-500'
                                    }`}>
                                        {isRendering ? 'Рендеринг' : isReadyToUpload ? 'Готов к загрузке' : 'В очереди'}
                                    </span>
                                </div>
                            </div>

                            {/* Progress bars */}
                            <div className="mt-4 space-y-3">
                                {/* Render progress */}
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                                        <span>Рендеринг видео:</span>
                                        <span>{item.renderProgress}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                            style={{ width: `${item.renderProgress}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Upload progress */}
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                                        <span>Загрузка на сервер:</span>
                                        <span>{item.uploadProgress}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                            style={{ width: `${item.uploadProgress}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* File URL / Error message */}
                            {resolvedFileUrl && (
                                <div className="mt-3.5 grid gap-2 text-[11px] border-t border-zinc-850 pt-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-zinc-500">Серверный файл:</span>
                                        <a
                                            data-testid={`server-file-link-${item.itemId}`}
                                            href={resolvedFileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-emerald-400 inline-flex items-center gap-1 hover:underline"
                                        >
                                            <ExternalLink size={12} />
                                            Смотреть файл
                                        </a>
                                    </div>
                                    {resolvedCardUrl && (
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-zinc-500">Карточка:</span>
                                            <a
                                                data-testid={`item-card-link-${item.itemId}`}
                                                href={resolvedCardUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-emerald-400 inline-flex items-center gap-1 hover:underline"
                                            >
                                                <ExternalLink size={12} />
                                                Проверить
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}

                            {item.errorMessage && (
                                <div className="mt-3.5 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5 text-xs text-red-200 leading-relaxed flex gap-2">
                                    <XCircle size={14} className="shrink-0 text-red-400 mt-0.5" />
                                    <span>{item.errorMessage}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {allTerminal && run.status !== 'CANCELLED' && (
                <section className="rounded-2xl border border-zinc-800 bg-[#16171c] p-6 text-center shadow-lg space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
                            Все элементы выгружены
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                            Сервер принял ролики и записал ссылки в карточки Item.
                        </p>
                    </div>
                </section>
            )}
        </div>
    );
};
