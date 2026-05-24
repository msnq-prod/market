import React, { useRef } from 'react';
import { Play, RotateCcw, AlertTriangle, RefreshCw, XCircle, ExternalLink, Upload, Ban } from 'lucide-react';
import type { PreflightIssue } from '../engine/preflight';

interface VideoExportRunItem {
    item_id: string;
    serial_number: string;
    segment_seq: number;
    status: string;
    render_status: string;
    upload_status: string;
    file_url?: string | null;
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
    onStartRender: (itemId: string) => void;
    onRetryUpload: (itemId: string) => void;
    onRerender: (itemId: string) => void;
    onCancelItem: (itemId: string) => void;
    onManualReplace: (itemId: string, file: File) => void;
    onCommitRun: () => void;
    onCancelRun: () => void;
    onStartRun: () => void;
    isExporting?: boolean;
    isCommitting: boolean;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
    run,
    localRunSnapshot,
    preflightIssues: _preflightIssues,
    onStartRender,
    onRetryUpload,
    onRerender,
    onCancelItem,
    onManualReplace,
    onCommitRun,
    onCancelRun,
    onStartRun,
    isExporting: _isExporting,
    isCommitting
}) => {
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
            status: local?.uploadStatus === 'completed' ? 'UPLOADED' : (local?.renderStatus === 'rendering' ? 'RENDERING' : item.status),
            renderStatus: local?.renderStatus || item.render_status || 'PENDING',
            uploadStatus: local?.uploadStatus || item.upload_status || 'PENDING',
            renderProgress: local?.renderProgress ?? (item.render_status === 'RENDERED' ? 100 : 0),
            uploadProgress: local?.uploadProgress ?? (item.upload_status === 'UPLOADED' ? 100 : 0),
            fileUrl: item.file_url,
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
                    const isUploading = item.uploadStatus === 'uploading' || item.uploadStatus === 'UPLOADING';
                    const isCompleted = item.status === 'UPLOADED' || item.uploadStatus === 'completed' || item.uploadStatus === 'UPLOADED';
                    const isFailed = item.renderStatus === 'failed' || item.renderStatus === 'FAILED' || item.uploadStatus === 'failed' || item.uploadStatus === 'FAILED';
                    const isCancelled = item.status === 'CANCELLED' || item.renderStatus === 'cancelled' || item.uploadStatus === 'cancelled';

                    return (
                        <div
                            key={item.itemId}
                            data-testid={`export-item-${item.itemId}`}
                            className={`rounded-2xl border p-5 bg-[#16171c] shadow-md transition-all duration-200 ${
                                isCompleted
                                    ? 'border-emerald-500/20 bg-emerald-950/5 shadow-[0_0_15px_rgba(16,185,129,0.02)]'
                                    : isRendering || isUploading
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
                                                : isUploading
                                                    ? 'bg-indigo-950 text-indigo-400 animate-pulse'
                                                    : isFailed
                                                        ? 'bg-red-950 text-red-400'
                                                        : isCancelled
                                                            ? 'bg-zinc-800 text-zinc-400'
                                                            : 'bg-zinc-900 text-zinc-500'
                                    }`}>
                                        {isCompleted ? 'Готово' : isRendering ? 'Рендер' : isUploading ? 'Загрузка' : isFailed ? 'Ошибка' : isCancelled ? 'Отмена' : 'В очереди'}
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
                            {item.fileUrl && (
                                <div className="mt-3.5 flex items-center justify-between text-[11px] border-t border-zinc-850 pt-3">
                                    <span className="text-zinc-500">Серверный URL:</span>
                                    <a
                                        href={item.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-emerald-400 inline-flex items-center gap-1 hover:underline"
                                    >
                                        <ExternalLink size={12} />
                                        Смотреть файл
                                    </a>
                                </div>
                            )}

                            {item.errorMessage && (
                                <div className="mt-3.5 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5 text-xs text-red-200 leading-relaxed flex gap-2">
                                    <XCircle size={14} className="shrink-0 text-red-400 mt-0.5" />
                                    <span>{item.errorMessage}</span>
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="mt-4 border-t border-zinc-850 pt-3 flex flex-wrap gap-2">
                                {!isCompleted && !isRendering && !isUploading && (
                                    <button
                                        type="button"
                                        data-testid={`render-upload-${item.itemId}`}
                                        onClick={() => onStartRender(item.itemId)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition"
                                    >
                                        <Play size={12} fill="currentColor" />
                                        Рендер + Загрузка
                                    </button>
                                )}

                                {isFailed && item.uploadStatus === 'failed' && (
                                    <button
                                        type="button"
                                        data-testid={`retry-upload-${item.itemId}`}
                                        onClick={() => onRetryUpload(item.itemId)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-500 px-3 text-xs font-bold text-white hover:bg-indigo-400 transition"
                                    >
                                        <RefreshCw size={12} />
                                        Повторить загрузку
                                    </button>
                                )}

                                {(isCompleted || isFailed) && (
                                    <button
                                        type="button"
                                        data-testid={`rerender-${item.itemId}`}
                                        onClick={() => onRerender(item.itemId)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white transition"
                                        title="Рендерить заново с актуальной таймлайн-нарезкой"
                                    >
                                        <RotateCcw size={12} />
                                        Перерендерить
                                    </button>
                                )}

                                {(isRendering || isUploading) && (
                                    <button
                                        type="button"
                                        data-testid={`cancel-item-${item.itemId}`}
                                        onClick={() => onCancelItem(item.itemId)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition"
                                    >
                                        <Ban size={12} />
                                        Отмена
                                    </button>
                                )}

                                {/* Manual File Upload Replacement */}
                                <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:text-white">
                                    <Upload size={12} />
                                    Выбрать MP4
                                    <input
                                        data-testid={`manual-file-${item.itemId}`}
                                        ref={(el) => {
                                            fileInputRefs.current[item.itemId] = el;
                                        }}
                                        type="file"
                                        accept="video/mp4"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                onManualReplace(item.itemId, file);
                                            }
                                            e.currentTarget.value = '';
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Commit section */}
            {allTerminal && run.status !== 'CANCELLED' && (
                <section className="rounded-2xl border border-zinc-800 bg-[#16171c] p-6 text-center shadow-lg space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
                            Все элементы обработаны
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                            Подтвердите запуск, чтобы сохранить видеоролики в карточках товаров в базе данных.
                        </p>
                    </div>
                    <button
                        type="button"
                        data-testid="commit-run"
                        disabled={isCommitting}
                        onClick={onCommitRun}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-2 text-xs font-bold text-zinc-950 shadow-md hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        {isCommitting ? 'Применяем...' : 'Применить результаты (Commit)'}
                    </button>
                </section>
            )}
        </div>
    );
};
