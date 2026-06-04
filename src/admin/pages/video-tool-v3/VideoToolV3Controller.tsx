import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EditorView } from './components/EditorView';
import { ExportView } from './components/ExportView';
import { PrepareView } from './components/PrepareView';
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

const isIpcError = (value: VideoToolV3Snapshot | VideoToolV3IpcError): value is VideoToolV3IpcError =>
    'error' in value && typeof value.error === 'string';

const getApi = (): VideoToolV3Api | null => window.stones?.videoToolV3 ?? window.stonesDesktop?.videoToolV3 ?? null;

export function VideoToolV3Controller() {
    const { batchId = '' } = useParams();
    const [uiState, setUiState] = useState<VideoToolV3UiState>(initialUiState);
    const [snapshot, setSnapshot] = useState<VideoToolV3Snapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sourceProgress, setSourceProgress] = useState<Record<string, number>>({});

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

    const handleSaveSegments = useCallback(async (segments: VideoToolV3Snapshot['segments']) => {
        if (!api || !batchId) return false;
        setActionLoading(true);
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

    const handleStartExport = useCallback(async () => {
        if (!api || !snapshot?.project) return;
        const hasExistingVideos = snapshot.items.some((item) => Boolean(item.existing_video_url));
        const replaceExisting = hasExistingVideos
            ? window.confirm('У некоторых товаров уже есть видео. Заменить их при загрузке?')
            : false;
        if (hasExistingVideos && !replaceExisting) return;
        setActionLoading(true);
        try {
            const result = await api.startExport(snapshot.project.id, replaceExisting);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось начать export.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult, snapshot?.project]);

    const handleRetryItemRender = useCallback(async (exportItemId: string) => {
        if (!api) return;
        setActionLoading(true);
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
        setActionLoading(true);
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
        setActionLoading(true);
        try {
            const result = await api.cancelRun(runId);
            applySnapshotResult(result);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось отменить export run.');
        } finally {
            setActionLoading(false);
        }
    }, [api, applySnapshotResult]);

    const activeTab = uiState.activeTab;

    return (
        <div className="min-h-screen bg-[#0f1115] text-white">
            <header className="border-b border-white/10 bg-[#111318] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-sm text-gray-400">Video Tool v3</p>
                        <h1 className="mt-1 text-2xl font-semibold">Партия {batchId}</h1>
                    </div>
                    {snapshot?.network ? (
                        <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-2 text-sm text-gray-300">
                            {snapshot.network.online ? 'Сеть доступна' : 'Нет сети'} · {snapshot.network.authenticated ? 'auth ok' : 'нужен вход'}
                        </div>
                    ) : null}
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-5">
                <nav className="flex gap-2 rounded-lg border border-white/10 bg-[#15171b] p-1">
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

                {loading ? (
                    <div className="rounded-lg border border-white/10 bg-[#15171b] p-6 text-sm text-gray-300">
                        Загружаем snapshot...
                    </div>
                ) : error ? (
                    <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-6 text-sm text-red-100">
                        {error}
                    </div>
                ) : snapshot ? (
                    <>
                        <section className="grid gap-3 rounded-lg border border-white/10 bg-[#15171b] p-5 text-sm text-gray-300 sm:grid-cols-4">
                            <div>Items: {snapshot.items.length}</div>
                            <div>Sources: {snapshot.sources.length}</div>
                            <div>Jobs: {snapshot.counts.queuedJobs + snapshot.counts.runningJobs}</div>
                            <div>Run: {snapshot.activeRun?.status ?? 'нет'}</div>
                        </section>

                        {activeTab === 'prepare' ? (
                            <PrepareView
                                snapshot={snapshot}
                                sourceProgress={sourceProgress}
                                actionLoading={actionLoading}
                                onSelectSources={handleSelectSources}
                                onRetryPrepareSource={handleRetryPrepareSource}
                            />
                        ) : null}
                        {activeTab === 'editor' ? (
                            <EditorView
                                snapshot={snapshot}
                                uiState={uiState}
                                actionLoading={actionLoading}
                                onSaveSegments={handleSaveSegments}
                            />
                        ) : null}
                        {activeTab === 'export' ? (
                            <ExportView
                                snapshot={snapshot}
                                actionLoading={actionLoading}
                                onStartExport={handleStartExport}
                                onRetryItemRender={handleRetryItemRender}
                                onRetryItemUpload={handleRetryItemUpload}
                                onCancelItem={handleCancelItem}
                                onCancelRun={handleCancelRun}
                            />
                        ) : null}
                    </>
                ) : null}
            </main>
        </div>
    );
}
