import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EditorView } from './components/EditorView';
import { ExportView } from './components/ExportView';
import { PrepareView } from './components/PrepareView';
import { createVideoToolV3DevMock } from './devMock';
import type { VideoToolV3Api, VideoToolV3Event, VideoToolV3IpcError, VideoToolV3Snapshot, VideoToolV3Tab, VideoToolV3UiState } from './types';

const initialUiState: VideoToolV3UiState = {
    activeTab: 'prepare',
    selectedSourceId: null,
    selectedSegmentId: null,
    playheadMs: 0,
    previewPlaying: false
};

const tabs: Array<{ id: VideoToolV3Tab; label: string }> = [
    { id: 'prepare', label: 'Подготовка' },
    { id: 'editor', label: 'Монтаж' },
    { id: 'export', label: 'Экспорт' }
];

const isIpcError = (value: unknown): value is VideoToolV3IpcError =>
    value !== null && typeof value === 'object' && 'error' in value && typeof value.error === 'string';

const getApi = (): VideoToolV3Api | null => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('videoV3Mock')) {
        return createVideoToolV3DevMock();
    }
    return window.stones?.videoToolV3 ?? window.stonesDesktop?.videoToolV3 ?? null;
};

export function VideoToolV3Controller() {
    const { batchId = '' } = useParams();
    const [uiState, setUiState] = useState<VideoToolV3UiState>(initialUiState);
    const [snapshot, setSnapshot] = useState<VideoToolV3Snapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sourceProgress, setSourceProgress] = useState<Record<string, number>>({});
    const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

    const api = useMemo(() => getApi(), []);

    const applySnapshotResult = useCallback((result: VideoToolV3Snapshot | VideoToolV3IpcError) => {
        if (isIpcError(result)) {
            setError(result.error);
            return false;
        }
        setError(null);
        setSnapshot(result);
        return true;
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadSnapshot = async () => {
            if (!batchId) {
                setError('batchId не указан.');
                setLoading(false);
                return;
            }
            if (!api) {
                setError('Video Tool v3 доступен только в ZAGARAMI admin Desktop app.');
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const result = await api.getSnapshot(batchId);
                if (cancelled) return;
                applySnapshotResult(result);
            } catch (nextError) {
                if (!cancelled) {
                    setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить Video Tool v3.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadSnapshot();
        return () => {
            cancelled = true;
        };
    }, [api, applySnapshotResult, batchId]);

    useEffect(() => {
        if (!api || !batchId) return undefined;

        return api.onEvent((event: VideoToolV3Event) => {
            if (event.type === 'snapshot' && event.batchId === batchId) {
                setSnapshot(event.snapshot);
            }
            if (event.type === 'job-progress' && event.sourceId) {
                setSourceProgress((current) => ({
                    ...current,
                    [String(event.sourceId)]: event.progress
                }));
            }
            if (event.type === 'network-changed') {
                setSnapshot((current) => current ? ({
                    ...current,
                    network: {
                        online: event.online,
                        apiReachable: event.apiReachable ?? current.network?.apiReachable,
                        authenticated: event.authenticated ?? current.network?.authenticated ?? false
                    }
                }) : current);
            }
            if (event.type === 'error' && (!event.batchId || event.batchId === batchId)) {
                setError(event.message);
            }
        });
    }, [api, batchId]);

    const handleSelectSources = useCallback(async () => {
        if (!api || !batchId) return;
        setActionLoading(true);
        setError(null);
        try {
            const result = await api.selectSources(batchId);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось выбрать видео.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, batchId]);

    const handleRetryPrepareSource = useCallback(async (sourceId: string) => {
        if (!api || !batchId) return;
        setActionLoading(true);
        setError(null);
        setSourceProgress((current) => ({ ...current, [sourceId]: 0 }));
        try {
            const result = await api.retryPrepareSource(batchId, sourceId);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось повторить подготовку.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, batchId]);

    const handleReplaceSource = useCallback(async (sourceId: string) => {
        if (!api || !batchId) return;
        setActionLoading(true);
        setError(null);
        setSourceProgress((current) => ({ ...current, [sourceId]: 0 }));
        try {
            const result = await api.replaceSource(batchId, sourceId);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось заменить source.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, batchId]);

    const handleDeleteSource = useCallback(async (sourceId: string) => {
        if (!api || !batchId) return;
        if (!window.confirm('Удалить source из подготовки? Связанный export run станет устаревшим.')) return;
        setActionLoading(true);
        setError(null);
        try {
            const result = await api.deleteSource(batchId, sourceId);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось удалить source.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, batchId]);

    const handleQualityChange = useCallback(async (preset: 'fast' | 'standard' | 'high') => {
        if (!api || !snapshot?.project || snapshot.project.quality_preset === preset) return;
        const hasPreparedSources = snapshot.sources.some((source) => source.status === 'READY' || source.prepared_path);
        if (hasPreparedSources && !window.confirm('Источники нужно подготовить заново. Сменить качество?')) {
            return;
        }
        setActionLoading(true);
        setError(null);
        try {
            const result = await api.updateQuality(snapshot.project.id, preset);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось изменить качество.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, snapshot?.project, snapshot?.sources]);

    const handleSaveSegments = useCallback(async (segments: VideoToolV3Snapshot['segments']) => {
        if (!api || !batchId) return false;
        setActionLoading(true);
        setError(null);
        try {
            const result = await api.saveSegments(batchId, segments);
            return applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось сохранить timeline.');
            return false;
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, batchId]);

    const startExport = useCallback(async (replaceExisting = false) => {
        if (!api || !snapshot?.project) return;
        setActionLoading(true);
        setError(null);
        try {
            const result = await api.startExport(snapshot.project.id, replaceExisting);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось начать export.');
        } finally {
            setActionLoading(false);
            setReplaceConfirmOpen(false);
        }
    }, [api, applySnapshotResult, snapshot?.project]);

    const handleStartExport = useCallback(async () => {
        if (!snapshot?.project) return;
        const hasExistingVideos = snapshot.items.some((item) => Boolean(item.existing_video_url));
        if (hasExistingVideos) {
            setReplaceConfirmOpen(true);
            return;
        }
        await startExport(false);
    }, [snapshot?.items, snapshot?.project, startExport]);

    const handleRetryItemRender = useCallback(async (exportItemId: string) => {
        if (!api) return;
        setActionLoading(true);
        setError(null);
        try {
            const result = await api.retryItemRender(exportItemId);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось повторить render.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult]);

    const handleRetryItemUpload = useCallback(async (exportItemId: string) => {
        if (!api) return;
        setActionLoading(true);
        setError(null);
        try {
            const result = await api.retryItemUpload(exportItemId);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось повторить upload.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult]);

    const handleCancelItem = useCallback(async (exportItemId: string) => {
        if (!api) return;
        if (!window.confirm('Отменить обработку этого товара?')) return;
        setActionLoading(true);
        setError(null);
        try {
            const result = await api.cancelItem(exportItemId);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось отменить item.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult]);

    const handleCancelRun = useCallback(async (runId: string) => {
        if (!api) return;
        if (!window.confirm('Отменить весь export run? Уже загруженные видео останутся на сервере.')) return;
        setActionLoading(true);
        setError(null);
        try {
            const result = await api.cancelRun(runId);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось отменить export run.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult]);

    const handleOpenClone = useCallback(async (cloneUrl: string) => {
        if (!api) {
            window.open(cloneUrl, '_blank', 'noopener,noreferrer');
            return;
        }
        try {
            const result = await api.openClone(cloneUrl);
            if (isIpcError(result)) {
                setError(result.error);
            }
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось открыть клон.');
        }
    }, [api]);

    const handleShowProjectFolder = useCallback(async () => {
        if (!api || !snapshot?.project) return;
        try {
            const result = await api.showProjectFolder(snapshot.project.id);
            if (isIpcError(result)) {
                setError(result.error);
            }
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось открыть папку проекта.');
        }
    }, [api, snapshot?.project]);

    const handleSyncAuth = useCallback(async () => {
        const token = localStorage.getItem('accessToken');
        if (!window.stonesDesktop?.syncAuthToken || !batchId) return;
        setActionLoading(true);
        setError(null);
        try {
            await window.stonesDesktop.syncAuthToken(token);
            if (api) {
                const result = await api.getSnapshot(batchId);
                applySnapshotResult(result);
            }
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось синхронизировать вход.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, batchId]);

    const handleRetryFailedRenders = useCallback(async () => {
        if (!api || !snapshot) return;
        const failed = snapshot.exportItems.filter((item) => item.render_status === 'RENDER_FAILED' && item.upload_status !== 'UPLOADED');
        if (failed.length === 0) return;
        setActionLoading(true);
        setError(null);
        try {
            for (const item of failed) {
                const result = await api.retryItemRender(item.id);
                applySnapshotResult(result);
            }
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось повторить render.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, snapshot]);

    const handleRetryFailedUploads = useCallback(async () => {
        if (!api || !snapshot) return;
        const failed = snapshot.exportItems.filter((item) => (
            ['UPLOAD_FAILED', 'AUTH_REQUIRED'].includes(item.upload_status)
            && item.render_status === 'RENDERED'
            && Boolean(item.output_path)
        ));
        if (failed.length === 0) return;
        setActionLoading(true);
        setError(null);
        try {
            for (const item of failed) {
                const result = await api.retryItemUpload(item.id);
                applySnapshotResult(result);
            }
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось повторить upload.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, snapshot]);

    const handleCancelPendingItems = useCallback(async () => {
        if (!api || !snapshot) return;
        const cancellable = snapshot.exportItems.filter((item) => (
            ['PENDING', 'QUEUED', 'RENDERING'].includes(item.render_status)
            || ['QUEUED', 'UPLOADING', 'PAUSED_OFFLINE', 'AUTH_REQUIRED'].includes(item.upload_status)
        ));
        if (cancellable.length === 0) return;
        if (!window.confirm(`Отменить оставшиеся товары: ${cancellable.length}?`)) return;
        setActionLoading(true);
        setError(null);
        try {
            for (const item of cancellable) {
                const result = await api.cancelItem(item.id);
                applySnapshotResult(result);
            }
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось отменить товары.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, snapshot]);

    const activeTab = uiState.activeTab;

    return (
        <div className="h-screen overflow-hidden bg-[#0f1115] text-white">
            <main className="mx-auto flex h-full w-full max-w-none flex-col gap-2 px-3 py-2">
                <nav className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-[#15171b] p-1">
                    <Link
                        to="/admin/acceptance"
                        className="rounded-md border border-white/10 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-white"
                    >
                        ← Приемка
                    </Link>
                    <span className="h-7 w-px bg-white/10" />
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setUiState((current) => ({ ...current, activeTab: tab.id }))}
                            className={[
                                'rounded-md px-4 py-2 text-sm transition',
                                activeTab === tab.id ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10'
                            ].join(' ')}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>

                {loading && !snapshot ? (
                    <div className="rounded-lg border border-white/10 bg-[#15171b] p-6 text-sm text-gray-300">
                        Загружаем snapshot...
                    </div>
                ) : error && !snapshot ? (
                    <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-6 text-sm text-red-100">
                        {error}
                    </div>
                ) : snapshot ? (
                    <div className={[
                        'min-h-0 flex-1',
                        activeTab === 'editor' ? 'overflow-hidden' : 'overflow-y-auto pb-4'
                    ].join(' ')}>
                        {error ? (
                            <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                <span className="inline-flex items-start gap-2">
                                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                    {error}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setError(null)}
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-amber-100 hover:bg-white/10"
                                    aria-label="Скрыть ошибку"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        ) : null}
                        {activeTab !== 'editor' ? (
                        <section className="mb-3 grid shrink-0 gap-3 rounded-lg border border-white/10 bg-[#15171b] p-5 text-sm text-gray-300 sm:grid-cols-4">
                            <div>Items: {snapshot.items.length}</div>
                            <div>Sources: {snapshot.sources.length}</div>
                            <div>Jobs: {snapshot.counts.queuedJobs + snapshot.counts.runningJobs}</div>
                            <div>Run: {snapshot.activeRun?.status ?? 'нет'}</div>
                        </section>
                        ) : null}

                        {activeTab === 'prepare' ? (
                            <PrepareView
                                snapshot={snapshot}
                                sourceProgress={sourceProgress}
                                actionLoading={actionLoading}
                                onSelectSources={handleSelectSources}
                                onRetryPrepareSource={handleRetryPrepareSource}
                                onReplaceSource={handleReplaceSource}
                                onDeleteSource={handleDeleteSource}
                                onQualityChange={handleQualityChange}
                                onShowProjectFolder={handleShowProjectFolder}
                            />
                        ) : null}
                        {activeTab === 'editor' ? (
                            <EditorView
                                snapshot={snapshot}
                                uiState={uiState}
                                onSaveSegments={handleSaveSegments}
                                onUiStateChange={(patch) => setUiState((current) => ({ ...current, ...patch }))}
                            />
                        ) : null}
                        {activeTab === 'export' ? (
                            <ExportView
                                snapshot={snapshot}
                                actionLoading={actionLoading}
                                onStartExport={handleStartExport}
                                onRetryItemRender={handleRetryItemRender}
                                onRetryItemUpload={handleRetryItemUpload}
                                onRetryFailedRenders={handleRetryFailedRenders}
                                onRetryFailedUploads={handleRetryFailedUploads}
                                onCancelPendingItems={handleCancelPendingItems}
                                onCancelItem={handleCancelItem}
                                onCancelRun={handleCancelRun}
                                onOpenClone={handleOpenClone}
                                onShowProjectFolder={handleShowProjectFolder}
                                onSyncAuth={handleSyncAuth}
                            />
                        ) : null}
                        {replaceConfirmOpen ? (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
                                <section className="w-full max-w-lg rounded-lg border border-white/10 bg-[#15171b] p-5 shadow-2xl">
                                    <h2 className="text-lg font-semibold text-white">Заменить существующие видео?</h2>
                                    <p className="mt-3 text-sm leading-6 text-gray-300">
                                        У {snapshot.items.filter((item) => Boolean(item.existing_video_url)).length} товаров уже есть видео. Новый export перезапишет их после загрузки.
                                    </p>
                                    <div className="mt-5 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={() => setReplaceConfirmOpen(false)}
                                            className="rounded-md border border-white/10 px-4 py-2 text-sm text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500"
                                        >
                                            Отмена
                                        </button>
                                        <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={() => void startExport(true)}
                                            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
                                        >
                                            Заменить и начать
                                        </button>
                                    </div>
                                </section>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </main>
        </div>
    );
}
