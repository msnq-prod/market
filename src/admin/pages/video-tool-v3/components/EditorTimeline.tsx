import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { VideoToolV3Snapshot } from '../types';
import type { TimelineViewport } from '../timelineModel';
import { clampViewport, formatTimecode, getTotalTimelineDuration, timeToPercent, xToTime } from '../timelineModel';
import { Playhead } from './Playhead';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrack } from './TimelineTrack';

type EditorTimelineProps = {
    snapshot: VideoToolV3Snapshot;
    viewport: TimelineViewport;
    playheadMs: number;
    selectedSegmentId: string | null;
    onSeek(globalMs: number): void;
    onScrub(globalMs: number): void;
    onSelectSegment(segmentId: string): void;
    onMoveBoundary(segmentId: string, edge: 'start' | 'end', globalMs: number, commit: boolean): void;
    onViewportChange(viewport: TimelineViewport): void;
};

export function EditorTimeline({
    snapshot,
    viewport,
    playheadMs,
    selectedSegmentId,
    onSeek,
    onScrub,
    onSelectSegment,
    onMoveBoundary,
    onViewportChange
}: EditorTimelineProps) {
    const surfaceRef = useRef<HTMLDivElement | null>(null);
    const [dragging, setDragging] = useState(false);
    const totalDurationMs = Math.max(1, getTotalTimelineDuration(snapshot.sources));
    const playheadPercent = timeToPercent(playheadMs, viewport);
    const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
        const rawRect = surfaceRef.current?.getBoundingClientRect();
        if (!rawRect) return;
        const rect = {
            left: rawRect.left,
            width: Math.max(1, rawRect.width)
        } as DOMRect;
        const nextMs = Math.max(0, Math.min(totalDurationMs, xToTime(event.clientX, rect, viewport)));
        if (commit) {
            onSeek(nextMs);
        } else {
            onScrub(nextMs);
        }
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromPointer(event, false);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        seekFromPointer(event, false);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        setDragging(false);
        seekFromPointer(event, true);
    };

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            const factor = event.deltaY > 0 ? 1.18 : 0.82;
            const nextDuration = viewport.durationMs * factor;
            onViewportChange(clampViewport({
                startMs: playheadMs - ((playheadMs - viewport.startMs) * factor),
                durationMs: nextDuration
            }, totalDurationMs));
            return;
        }

        if (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) > 0) {
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            onViewportChange(clampViewport({
                ...viewport,
                startMs: viewport.startMs + delta * (viewport.durationMs / 900)
            }, totalDurationMs));
        }
    };

    const handleBoundaryDrag = (
        segmentId: string,
        edge: 'start' | 'end',
        event: ReactPointerEvent<HTMLButtonElement>
    ) => {
        event.stopPropagation();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);

        const getBoundaryTime = (moveEvent: PointerEvent) => {
            const rawRect = surfaceRef.current?.getBoundingClientRect();
            if (!rawRect) return null;
            const rect = {
                left: rawRect.left,
                width: Math.max(1, rawRect.width)
            } as DOMRect;
            return xToTime(moveEvent.clientX, rect, viewport);
        };
        const move = (moveEvent: PointerEvent) => {
            const nextTime = getBoundaryTime(moveEvent);
            if (nextTime === null) return;
            onMoveBoundary(segmentId, edge, nextTime, false);
        };
        const stop = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancel);
        };
        const up = (upEvent: PointerEvent) => {
            const nextTime = getBoundaryTime(upEvent);
            if (nextTime !== null) {
                onMoveBoundary(segmentId, edge, nextTime, true);
            }
            stop();
        };
        const cancel = () => stop();

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
    };

    return (
        <section className="mt-auto flex h-[248px] shrink-0 flex-col border-t border-white/10 bg-[#10161d]">
            <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4">
                <div className="font-mono text-xl text-sky-400">{formatTimecode(playheadMs)}</div>
                <div className="flex items-center gap-3 text-sm text-white/65">
                    <label className="flex items-center gap-2">
                        Масштаб
                        <input
                            type="range"
                            min={1_000}
                            max={totalDurationMs}
                            value={viewport.durationMs}
                            onChange={(event) => onViewportChange(clampViewport({
                                startMs: playheadMs - Number(event.currentTarget.value) / 2,
                                durationMs: Number(event.currentTarget.value)
                            }, totalDurationMs))}
                            className="w-44 accent-sky-400"
                        />
                    </label>
                </div>
            </div>

            <div
                ref={surfaceRef}
                data-testid="video-v3-editor-timeline"
                className="relative min-h-0 flex-1 cursor-crosshair select-none overflow-hidden"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
            >
                <TimelineRuler viewport={viewport} />
                <TimelineTrack
                    segments={snapshot.segments}
                    sources={snapshot.sources}
                    viewport={viewport}
                    selectedSegmentId={selectedSegmentId}
                    onSeek={onSeek}
                    onSelectSegment={onSelectSegment}
                    onStartBoundaryDrag={handleBoundaryDrag}
                />
                <div className="pointer-events-none absolute inset-0">
                    <Playhead leftPercent={playheadPercent} />
                </div>
            </div>
        </section>
    );
}
