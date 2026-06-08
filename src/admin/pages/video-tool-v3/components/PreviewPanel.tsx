import { Camera, Maximize, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { PREVIEW_SEEK_TOLERANCE_MS, resolvePreviewTimeUpdate } from '../previewSync';
import { formatTimecode } from '../timelineModel';

type PreviewPanelProps = {
    sourcePreviewUrl: string | null;
    sourceLocalMs: number;
    sourceGlobalStartMs: number;
    playheadMs: number;
    totalDurationMs: number;
    isPlaying: boolean;
    error: string | null;
    onPlayPause(): void;
    onSeek(globalMs: number): void;
    onFrameStep(direction: -1 | 1): void;
    onPreviousCut(): void;
    onNextCut(): void;
};

export function PreviewPanel({
    sourcePreviewUrl,
    sourceLocalMs,
    sourceGlobalStartMs,
    playheadMs,
    totalDurationMs,
    isPlaying,
    error,
    onPlayPause,
    onSeek,
    onFrameStep,
    onPreviousCut,
    onNextCut
}: PreviewPanelProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const pendingSeekMsRef = useRef<number | null>(null);

    const applyPendingSeek = useCallback((video: HTMLVideoElement) => {
        const pendingSeekMs = pendingSeekMsRef.current;
        if (pendingSeekMs === null || video.readyState < 1) return;

        const targetSeconds = pendingSeekMs / 1_000;
        if (Math.abs(video.currentTime - targetSeconds) <= PREVIEW_SEEK_TOLERANCE_MS / 1_000) {
            pendingSeekMsRef.current = null;
            return;
        }

        video.currentTime = targetSeconds;
    }, []);

    const handlePlayPause = useCallback(() => {
        const video = videoRef.current;
        if (!video || isPlaying || !sourcePreviewUrl) {
            onPlayPause();
            return;
        }

        video.muted = false;
        void video.play().catch(() => undefined);
        onPlayPause();
    }, [isPlaying, onPlayPause, sourcePreviewUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !sourcePreviewUrl) return;
        if (video.src !== sourcePreviewUrl) {
            pendingSeekMsRef.current = sourceLocalMs;
            video.muted = false;
            video.src = sourcePreviewUrl;
            video.load();
        }
    }, [sourceLocalMs, sourcePreviewUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !sourcePreviewUrl) return;
        const nextSeconds = sourceLocalMs / 1_000;
        if (Math.abs(video.currentTime - nextSeconds) > 0.06) {
            pendingSeekMsRef.current = sourceLocalMs;
            applyPendingSeek(video);
        }
    }, [applyPendingSeek, sourceLocalMs, sourcePreviewUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (isPlaying && sourcePreviewUrl) {
            void video.play().catch(() => undefined);
        } else {
            video.pause();
        }
    }, [isPlaying, sourcePreviewUrl]);

    const handleTimeUpdate = () => {
        const video = videoRef.current;
        if (!video) return;

        const currentLocalMs = Math.round(video.currentTime * 1_000);
        const decision = resolvePreviewTimeUpdate({
            isPlaying,
            mediaSeeking: video.seeking,
            pendingSeekMs: pendingSeekMsRef.current,
            currentLocalMs
        });

        if (decision.clearPendingSeek) {
            pendingSeekMsRef.current = null;
        }
        if (decision.publish) {
            onSeek(sourceGlobalStartMs + currentLocalMs);
        }
    };

    return (
        <aside data-testid="video-v3-preview" className="flex min-h-0 w-[390px] shrink-0 flex-col border-l border-white/10 bg-[#0e1319]">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
                <h3 className="font-semibold text-white">Предпросмотр</h3>
                <span className="font-mono text-sm text-white/80">{formatTimecode(playheadMs)}</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
                <div className="relative mx-auto aspect-[9/16] max-h-[calc(100vh-250px)] w-full max-w-[350px] overflow-hidden bg-black">
                    {sourcePreviewUrl ? (
                        <video
                            ref={videoRef}
                            className="h-full w-full object-contain"
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={(event) => applyPendingSeek(event.currentTarget)}
                            onSeeked={(event) => {
                                const currentLocalMs = Math.round(event.currentTarget.currentTime * 1_000);
                                if (
                                    pendingSeekMsRef.current !== null
                                    && Math.abs(currentLocalMs - pendingSeekMsRef.current) <= PREVIEW_SEEK_TOLERANCE_MS
                                ) {
                                    pendingSeekMsRef.current = null;
                                }
                            }}
                            onTimeUpdate={handleTimeUpdate}
                        />
                    ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#151a20] px-8 text-center text-sm text-white/55">
                            <Camera size={34} className="text-white/35" />
                            <p>{error ?? 'Prepared preview недоступен.'}</p>
                        </div>
                    )}
                </div>

                <div className="mt-3 border-t border-white/10 pt-3 text-center font-mono text-sm text-white/70">
                    {formatTimecode(playheadMs)} / {formatTimecode(totalDurationMs)}
                </div>

                <div className="mt-3 flex items-center justify-center gap-5 border-b border-white/10 pb-4 text-white/80">
                    <button type="button" onClick={onPreviousCut} className="rounded p-2 hover:bg-white/8" aria-label="previous cut">
                        <SkipBack size={21} />
                    </button>
                    <button type="button" onClick={() => onFrameStep(-1)} className="rounded p-2 hover:bg-white/8" aria-label="frame back">
                        <StepBack size={21} />
                    </button>
                    <button type="button" onClick={handlePlayPause} className="rounded p-3 hover:bg-white/8" aria-label="play pause">
                        {isPlaying ? <Pause size={28} /> : <Play size={28} />}
                    </button>
                    <button type="button" onClick={() => onFrameStep(1)} className="rounded p-2 hover:bg-white/8" aria-label="frame forward">
                        <StepForward size={21} />
                    </button>
                    <button type="button" onClick={onNextCut} className="rounded p-2 hover:bg-white/8" aria-label="next cut">
                        <SkipForward size={21} />
                    </button>
                </div>

                <div className="mt-auto flex items-center justify-between pt-3 text-sm text-white/65">
                    <button type="button" className="rounded-lg border border-white/10 px-3 py-2 hover:bg-white/8">
                        По размеру
                    </button>
                    <div className="flex gap-3">
                        <Maximize size={21} />
                        <Camera size={21} />
                    </div>
                </div>
            </div>
        </aside>
    );
}
