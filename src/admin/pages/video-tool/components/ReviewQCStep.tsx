import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '../../../components/ui';
import { CheckCircle2, AlertCircle, Video, Upload } from 'lucide-react';
import type { VideoExportSessionDetails, VideoToolItem } from '../types';
import { authFetch } from '../../../../utils/authFetch';

type ReviewQCStepProps = {
    batchId: string;
    session: VideoExportSessionDetails;
    items: VideoToolItem[];
    onCommit: () => Promise<void>;
    onCancel: () => Promise<void>;
    isCommitting: boolean;
    onRefresh?: () => Promise<void> | void;
};

type VideoQCState = {
    serialNumber: string;
    status: 'checking' | 'passed' | 'failed';
    duration?: number;
    error?: string;
};

export function ReviewQCStep({ batchId, session, items, onCommit, onCancel, isCommitting, onRefresh }: ReviewQCStepProps) {
    const [qcStates, setQcStates] = useState<Record<string, VideoQCState>>({});
    const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const uploadedManifest = useMemo(() => session.uploaded_manifest || [], [session.uploaded_manifest]);
    const expectedOutputs = useMemo(() => session.render_manifest?.outputs || [], [session.render_manifest]);

    useEffect(() => {
        // Run automated checks on load for uploaded files
        uploadedManifest.forEach((entry) => {
            if (entry.skipped) {
                return;
            }

            const video = document.createElement('video');
            video.src = entry.public_url;
            video.preload = 'metadata';

            setQcStates((prev) => ({
                ...prev,
                [entry.serial_number]: { serialNumber: entry.serial_number, status: 'checking' }
            }));

            video.onloadedmetadata = () => {
                const duration = video.duration;
                if (duration < 3 || duration > 60) {
                    setQcStates((prev) => ({
                        ...prev,
                        [entry.serial_number]: {
                            serialNumber: entry.serial_number,
                            status: 'failed',
                            duration,
                            error: `Длительность (${duration.toFixed(1)}с) выходит за рамки (3-60с)`
                        }
                    }));
                } else {
                    setQcStates((prev) => ({
                        ...prev,
                        [entry.serial_number]: {
                            serialNumber: entry.serial_number,
                            status: 'passed',
                            duration
                        }
                    }));
                }
            };

            video.onerror = () => {
                setQcStates((prev) => ({
                    ...prev,
                    [entry.serial_number]: {
                        serialNumber: entry.serial_number,
                        status: 'failed',
                        error: 'Не удалось загрузить или воспроизвести видеофайл'
                    }
                }));
            };
        });
    }, [uploadedManifest]);

    const handleSkip = async (serialNumber: string) => {
        setActionLoading((prev) => ({ ...prev, [serialNumber]: true }));
        try {
            const response = await authFetch(`/api/batches/${batchId}/video-export-plans/${session.session_id}/skip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serial_number: serialNumber })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Не удалось пропустить позицию' }));
                alert(errData.error || 'Не удалось пропустить позицию');
                return;
            }

            if (onRefresh) {
                await onRefresh();
            }
        } catch (error) {
            console.error(error);
            alert('Произошла сетевая ошибка при пропуске позиции');
        } finally {
            setActionLoading((prev) => ({ ...prev, [serialNumber]: false }));
        }
    };

    const handleManualUpload = async (serialNumber: string, file: File) => {
        setActionLoading((prev) => ({ ...prev, [serialNumber]: true }));
        try {
            const formData = new FormData();
            formData.append('serial_number', serialNumber);
            formData.append('file', file);

            const response = await authFetch(`/api/batches/${batchId}/video-export-plans/${session.session_id}/artifacts`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Не удалось загрузить файл' }));
                alert(errData.error || 'Не удалось загрузить файл');
                return;
            }

            if (onRefresh) {
                await onRefresh();
            }
        } catch (error) {
            console.error(error);
            alert('Произошла сетевая ошибка при загрузке файла');
        } finally {
            setActionLoading((prev) => ({ ...prev, [serialNumber]: false }));
        }
    };

    const passedCount = useMemo(() => {
        let count = 0;
        expectedOutputs.forEach((output) => {
            const entry = uploadedManifest.find((e) => e.serial_number.toUpperCase() === output.serial_number.toUpperCase());
            if (entry?.skipped) {
                count += 1;
            } else if (entry && qcStates[entry.serial_number]?.status === 'passed') {
                count += 1;
            }
        });
        return count;
    }, [expectedOutputs, uploadedManifest, qcStates]);

    const failedCount = useMemo(() => {
        let count = 0;
        expectedOutputs.forEach((output) => {
            const entry = uploadedManifest.find((e) => e.serial_number.toUpperCase() === output.serial_number.toUpperCase());
            if (entry && qcStates[entry.serial_number]?.status === 'failed') {
                count += 1;
            }
        });
        return count;
    }, [expectedOutputs, uploadedManifest, qcStates]);

    const skippedCount = useMemo(() => {
        return uploadedManifest.filter((e) => e.skipped).length;
    }, [uploadedManifest]);

    const canCommit = passedCount === expectedOutputs.length && expectedOutputs.length > 0;

    return (
        <div className="flex h-full flex-col bg-[#111216] text-zinc-100">
            {/* Header */}
            <div className="border-b border-zinc-800 bg-[#16171c] p-4 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-zinc-100 font-sans">Контроль качества (Review & QC)</h2>
                    <p className="mt-1 text-xs text-zinc-400 font-sans">
                        Проверьте сгенерированные видеоролики перед их публикацией на цифровые двойники (Items).
                    </p>
                </div>
                <div className="flex gap-2.5">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onCancel}
                        disabled={isCommitting}
                        className="!h-8 text-[11px] rounded-lg"
                    >
                        Сбросить сессию
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onCommit}
                        disabled={!canCommit || isCommitting}
                        className="!h-8 text-[11px] rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40"
                    >
                        {isCommitting ? 'Применение...' : 'Применить видео к Item'}
                    </Button>
                </div>
            </div>

            {/* Dashboard / Summary */}
            <div className="p-4 grid grid-cols-4 gap-3 bg-zinc-950/40 border-b border-zinc-800/80">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Всего позиций</p>
                    <p className="mt-1 text-xl font-bold text-zinc-100">{expectedOutputs.length}</p>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Успешные проверки</p>
                    <p className="mt-1 text-xl font-bold text-emerald-400">{passedCount - skippedCount}</p>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Пропущенные (Skip)</p>
                    <p className="mt-1 text-xl font-bold text-zinc-400">{skippedCount}</p>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Проблемные файлы</p>
                    <p className="mt-1 text-xl font-bold text-rose-400">{failedCount}</p>
                </div>
            </div>

            {/* Content area: list and previewer */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {expectedOutputs.map((output) => {
                        const item = items.find((it) => it.id === output.item_id);
                        const entry = uploadedManifest.find((e) => e.serial_number.toUpperCase() === output.serial_number.toUpperCase());
                        const qc = entry ? qcStates[output.serial_number] : null;
                        const isSkipped = Boolean(entry?.skipped);
                        const isActive = entry && activeVideoUrl === entry.public_url;
                        const isLoading = Boolean(actionLoading[output.serial_number]);

                        return (
                            <div
                                key={output.serial_number}
                                onClick={() => {
                                    if (entry && !isSkipped) {
                                        setActiveVideoUrl(entry.public_url);
                                    }
                                }}
                                className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition ${
                                    isSkipped
                                        ? 'border-zinc-800 bg-zinc-900/10 opacity-70'
                                        : entry
                                            ? isActive
                                                ? 'border-emerald-500/50 bg-emerald-500/5 cursor-pointer'
                                                : 'border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700 cursor-pointer'
                                            : 'border-zinc-800/60 bg-zinc-950/20'
                                }`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`p-2 rounded-lg bg-zinc-950 ${isActive ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                        <Video size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-xs text-zinc-100">{output.serial_number}</span>
                                            {item?.temp_id && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                                    Пакет: {item.temp_id}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-[10px] text-zinc-500 truncate">
                                            {entry ? (isSkipped ? 'Пропущено оператором' : entry.file_name) : 'Файл не загружен или рендер не удался'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <input
                                        type="file"
                                        accept="video/mp4"
                                        ref={(el) => { fileInputRefs.current[output.serial_number] = el; }}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                void handleManualUpload(output.serial_number, file);
                                            }
                                            e.currentTarget.value = '';
                                        }}
                                        className="hidden"
                                    />
                                    {isLoading ? (
                                        <span className="text-[10px] text-zinc-400">Обработка...</span>
                                    ) : isSkipped ? (
                                        <div className="flex items-center gap-2 font-sans">
                                            <span className="inline-flex items-center gap-1 text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                                                Скип
                                            </span>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    fileInputRefs.current[output.serial_number]?.click();
                                                }}
                                                className="!h-6 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 font-sans"
                                            >
                                                <Upload size={10} />
                                                Восстановить
                                            </Button>
                                        </div>
                                    ) : entry ? (
                                        <>
                                            {qc?.status === 'checking' && (
                                                <span className="text-[10px] text-zinc-400 font-sans">Проверка...</span>
                                            )}
                                            {qc?.status === 'passed' && (
                                                <div className="flex items-center gap-1.5 text-emerald-400 font-sans">
                                                    <span className="text-[10px]">{qc.duration?.toFixed(1)}с</span>
                                                    <CheckCircle2 size={14} />
                                                </div>
                                            )}
                                            {qc?.status === 'failed' && (
                                                <div className="flex items-center gap-2 text-rose-400 font-sans">
                                                    <div className="flex items-center gap-1" title={qc.error}>
                                                        <span className="text-[10px]">Ошибка</span>
                                                        <AlertCircle size={14} />
                                                    </div>
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            fileInputRefs.current[output.serial_number]?.click();
                                                        }}
                                                        className="!h-6 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 font-sans"
                                                    >
                                                        <Upload size={10} />
                                                        Заменить
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void handleSkip(output.serial_number);
                                                        }}
                                                        className="text-[9px] px-1.5 py-0.5 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded font-sans"
                                                    >
                                                        Пропустить
                                                    </Button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-1.5 font-sans">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    fileInputRefs.current[output.serial_number]?.click();
                                                }}
                                                className="!h-6 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 font-sans"
                                            >
                                                <Upload size={10} />
                                                Залить
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handleSkip(output.serial_number);
                                                }}
                                                className="!h-6 text-[9px] px-1.5 py-0.5 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded font-sans"
                                            >
                                                Скип
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Video player preview panel */}
                <div className="w-[360px] border-l border-zinc-800 bg-[#16171c] p-4 flex flex-col items-center justify-center font-sans">
                    {activeVideoUrl ? (
                        <div className="w-full h-full flex flex-col">
                            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Предпросмотр ролика</p>
                            <div className="flex-1 bg-zinc-950 rounded-xl overflow-hidden relative flex items-center justify-center">
                                <video
                                    key={activeVideoUrl}
                                    src={activeVideoUrl}
                                    controls
                                    autoPlay
                                    loop
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <p className="mt-2 text-[10px] text-zinc-400 text-center truncate">
                                {activeVideoUrl}
                            </p>
                        </div>
                    ) : (
                        <div className="text-center text-zinc-500 space-y-2">
                            <Video size={36} className="mx-auto text-zinc-600" />
                            <p className="text-xs">Выберите ролик из списка слева для предпросмотра и контроля качества</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
