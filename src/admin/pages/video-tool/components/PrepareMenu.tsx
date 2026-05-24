import React from 'react';
import { Upload, Plus, RefreshCw, HardDrive, Clipboard, AlertTriangle } from 'lucide-react';
import type { VideoToolDraft, WorkingSource } from '../types';
import type { PreflightIssue } from '../engine/preflight';

interface PrepareMenuProps {
    sources: WorkingSource[];
    activeSourceIndex: number;
    setActiveSourceIndex: (idx: number) => void;
    onSourcePicked: (file: File | null, role: 'first' | 'append', sourceIndex?: number) => void;
    exportResolution: '1080p' | '720p';
    setExportResolution: (res: '1080p' | '720p') => void;
    exportQuality: 'high' | 'medium' | 'low';
    setExportQuality: (q: 'high' | 'medium' | 'low') => void;
    exportFps: 30 | 60;
    setExportFps: (fps: 30 | 60) => void;
    exportAudioNormalize: boolean;
    setExportAudioNormalize: (normalize: boolean) => void;
    checkHelper: () => void;
    normalizedStatusMessage: string;
    statusMessageToneClass: string;
    exportBlockedReason: string | null;
    preflightIssues: PreflightIssue[];
    draft: VideoToolDraft | null;
    handleDiscardDraft: () => void;
    cacheBytes?: number;
    isExporting: boolean;
    handleCleanupCache: () => void;
    handleCollectDiagnostics: () => void;
}

export const PrepareMenu: React.FC<PrepareMenuProps> = ({
    sources,
    activeSourceIndex,
    setActiveSourceIndex,
    onSourcePicked,
    exportResolution,
    setExportResolution,
    exportQuality,
    setExportQuality,
    exportFps,
    setExportFps,
    exportAudioNormalize,
    setExportAudioNormalize,
    checkHelper,
    normalizedStatusMessage,
    statusMessageToneClass,
    exportBlockedReason,
    preflightIssues,
    draft,
    handleDiscardDraft,
    cacheBytes,
    isExporting,
    handleCleanupCache,
    handleCollectDiagnostics
}) => {

    const formatBytes = (bytes?: number) => {
        if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '—';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const getSourceStatus = (source: WorkingSource) => {
        if (source.helperSourceId) return 'ready';
        if (source.stagedSourceId) return 'staged';
        return 'missing_local_file';
    };

    const statusBadge = (source: WorkingSource) => {
        const status = getSourceStatus(source);
        switch (status) {
            case 'ready':
                return <span className="shrink-0 rounded-full bg-emerald-950 text-emerald-400 px-2 py-0.5 text-[9px] font-semibold uppercase">Helper Ready</span>;
            case 'staged':
                return <span className="shrink-0 rounded-full bg-blue-950 text-blue-400 px-2 py-0.5 text-[9px] font-semibold uppercase">Staged</span>;
            case 'missing_local_file':
            default:
                return <span className="shrink-0 rounded-full bg-amber-950 text-amber-400 px-2 py-0.5 text-[9px] font-semibold uppercase">Missing File</span>;
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-[#0f1013] p-6 max-w-4xl mx-auto w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left side: Sources list */}
                <div className="space-y-6">
                    <section className="rounded-2xl border border-zinc-800 bg-[#16171c] p-5 shadow-lg">
                        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                            <div>
                                <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Исходные видеофайлы</h2>
                                <p className="text-xs text-zinc-400 mt-1">Загрузите или перепривяжите оригинальные видео</p>
                            </div>
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-950 text-zinc-300">
                                {sources.length} шт
                            </span>
                        </div>

                        {sources.length > 0 ? (
                            <div data-testid="source-list" className="mt-4 space-y-3">
                                {sources.map((source) => {
                                    const sourceNeedsLocalFile = !source.stagedSourceId;
                                    const isActive = activeSourceIndex === source.sourceIndex;

                                    return (
                                        <div
                                            key={`src-${source.sourceIndex}`}
                                            onClick={() => setActiveSourceIndex(source.sourceIndex)}
                                            className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                                                isActive
                                                    ? 'border-emerald-500/40 bg-emerald-950/10 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                                                    : 'border-zinc-850 bg-zinc-950/50 hover:bg-zinc-900/60'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-semibold text-zinc-200 truncate">
                                                            {source.name}
                                                        </span>
                                                        <span className="text-[10px] text-zinc-500 font-mono">
                                                            [{source.role === 'WITH_INTRO' ? 'С интро' : 'Без интро'}]
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                                                        Индекс: {source.sourceIndex} · Длительность: {Math.round(source.durationMs / 1000)}с
                                                    </p>
                                                </div>
                                                {statusBadge(source)}
                                            </div>

                                            {sourceNeedsLocalFile && (
                                                <div className="mt-3 flex items-center justify-between gap-4 bg-amber-500/10 rounded-lg border border-amber-500/20 px-3 py-2 text-xs text-amber-100">
                                                    <span>Локальный кэш отсутствует</span>
                                                    <label className="shrink-0 inline-flex cursor-pointer items-center rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-amber-300">
                                                        <Upload size={12} className="mr-1" />
                                                        Привязать
                                                        <input
                                                            data-testid={`source-rebind-${source.sourceIndex}`}
                                                            type="file"
                                                            accept="video/mp4,video/quicktime,.mov,video/x-m4v,video/webm"
                                                            className="hidden"
                                                            onChange={(e) => {
                                                                onSourcePicked(e.target.files?.[0] || null, source.sourceIndex === 0 ? 'first' : 'append', source.sourceIndex);
                                                                e.currentTarget.value = '';
                                                            }}
                                                        />
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                <div className="pt-2">
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:text-white">
                                        <Plus size={14} />
                                        Добавить видео без интро
                                        <input
                                            data-testid="append-source-input"
                                            type="file"
                                            accept="video/mp4,video/quicktime,.mov,video/x-m4v,video/webm"
                                            className="hidden"
                                            onChange={(e) => {
                                                onSourcePicked(e.target.files?.[0] || null, 'append');
                                                e.currentTarget.value = '';
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-6 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
                                <Upload size={28} className="text-zinc-600 mb-3" />
                                <p className="text-xs font-medium text-zinc-300">Добавьте первый видеофайл с интро</p>
                                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400">
                                    <Upload size={14} />
                                    Открыть видео
                                    <input
                                        data-testid="source-input"
                                        type="file"
                                        accept="video/mp4,video/quicktime,.mov,video/x-m4v,video/webm"
                                        className="hidden"
                                        onChange={(e) => {
                                            onSourcePicked(e.target.files?.[0] || null, 'first');
                                            e.currentTarget.value = '';
                                        }}
                                    />
                                </label>
                            </div>
                        )}
                    </section>

                    {draft && (
                        <div data-testid="draft-banner" className="rounded-2xl border border-zinc-800 bg-[#16171c] p-4 flex items-center justify-between">
                            <div className="text-xs">
                                <p className="font-semibold text-zinc-200">Обнаружен локальный черновик</p>
                                <p className="text-zinc-400 mt-1">Загружено {draft.sources?.length} файлов, {draft.segments?.length} склеек</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleDiscardDraft}
                                className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/10 transition"
                            >
                                Сбросить
                            </button>
                        </div>
                    )}
                </div>

                {/* Right side: Project options & Diagnostics */}
                <div className="space-y-6">
                    {/* Settings Panel */}
                    <section className="rounded-2xl border border-zinc-800 bg-[#16171c] p-5 shadow-lg">
                        <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider pb-3 border-b border-zinc-800">
                            Параметры экспорта
                        </h2>
                        
                        <div className="mt-4 space-y-4 text-xs font-sans">
                            <div className="flex flex-col gap-1">
                                <label className="text-zinc-400">Разрешение видео</label>
                                <select
                                    value={exportResolution}
                                    onChange={(e) => setExportResolution(e.target.value as '1080p' | '720p')}
                                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-700"
                                >
                                    <option value="1080p">1080p (Full HD)</option>
                                    <option value="720p">720p (HD)</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-zinc-400">Качество (CRF пресет)</label>
                                <select
                                    value={exportQuality}
                                    onChange={(e) => setExportQuality(e.target.value as 'high' | 'medium' | 'low')}
                                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-700"
                                >
                                    <option value="high">Высокое (crf 20)</option>
                                    <option value="medium">Среднее (crf 23)</option>
                                    <option value="low">Низкое (crf 26)</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-zinc-400">Частота кадров (FPS)</label>
                                <select
                                    value={exportFps}
                                    onChange={(e) => setExportFps(Number(e.target.value) as 30 | 60)}
                                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-700"
                                >
                                    <option value="30">30 FPS</option>
                                    <option value="60">60 FPS</option>
                                </select>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-850">
                                <span className="text-zinc-400">Нормализация аудио (Loudness)</span>
                                <input
                                    type="checkbox"
                                    checked={exportAudioNormalize}
                                    onChange={(e) => setExportAudioNormalize(e.target.checked)}
                                    className="h-4 w-4 rounded border-zinc-800 bg-zinc-950 accent-emerald-500"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Preflight & Diagnostics */}
                    <section className="rounded-2xl border border-zinc-800 bg-[#16171c] p-5 shadow-lg">
                        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
                                Состояние Helper
                            </h2>
                            <button
                                type="button"
                                onClick={checkHelper}
                                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                            >
                                <RefreshCw size={12} />
                                Проверить
                            </button>
                        </div>

                        <div className="mt-4 space-y-3 text-xs">
                            <div className={`rounded-xl border px-3 py-2.5 leading-5 ${statusMessageToneClass}`}>
                                {normalizedStatusMessage}
                            </div>

                            {exportBlockedReason && (
                                <p data-testid="blocking-status" className="text-zinc-400 font-mono text-[11px]">
                                    Блокировка: {exportBlockedReason}
                                </p>
                            )}

                            {preflightIssues.length > 0 && (
                                <div className="space-y-2 pt-2">
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Замечания preflight-проверки:</p>
                                    {preflightIssues.map((issue, idx) => (
                                        <div
                                            key={idx}
                                            className={`rounded-lg border px-3 py-2 leading-relaxed flex gap-2 ${
                                                issue.type === 'blocker'
                                                    ? 'border-red-500/20 bg-red-950/20 text-red-200'
                                                    : 'border-amber-400/20 bg-amber-950/20 text-amber-200'
                                            }`}
                                        >
                                            <AlertTriangle size={14} className="shrink-0" />
                                            <div>
                                                <span className="font-semibold">{issue.type === 'blocker' ? 'Ошибка: ' : 'Предупреждение: '}</span>
                                                {issue.message}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="border-t border-zinc-800 pt-4 space-y-3">
                                <div className="flex items-center justify-between text-zinc-400 font-sans">
                                    <span>Использовано кэша:</span>
                                    <span className="font-mono text-zinc-200 font-medium">
                                        {formatBytes(cacheBytes)}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        disabled={isExporting}
                                        onClick={handleCleanupCache}
                                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-semibold text-zinc-200 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <HardDrive size={13} />
                                        Очистить кэш
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCollectDiagnostics}
                                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-semibold text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                                    >
                                        <Clipboard size={13} />
                                        Собрать отчет
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
                
            </div>
        </div>
    );
};
