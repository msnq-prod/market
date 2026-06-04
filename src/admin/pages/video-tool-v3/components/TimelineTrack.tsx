import type { VideoToolV3Segment, VideoToolV3Source } from '../types';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TimelineViewport } from '../timelineModel';
import { getOrderedSegments, getSegmentDuration, getSourceOffsets, segmentLocalToGlobal, timeToPercent } from '../timelineModel';

type TimelineTrackProps = {
    segments: VideoToolV3Segment[];
    sources: VideoToolV3Source[];
    viewport: TimelineViewport;
    selectedSegmentId: string | null;
    onSeek(globalMs: number): void;
    onSelectSegment(segmentId: string): void;
    onStartBoundaryDrag(segmentId: string, edge: 'start' | 'end', event: ReactPointerEvent<HTMLButtonElement>): void;
};

export function TimelineTrack({
    segments,
    sources,
    viewport,
    selectedSegmentId,
    onSeek,
    onSelectSegment,
    onStartBoundaryDrag
}: TimelineTrackProps) {
    const offsets = getSourceOffsets(sources);
    const orderedSegments = getOrderedSegments(segments);
    const activeSegments = orderedSegments.filter((segment) => !segment.deleted);

    return (
        <div className="border-b border-white/10">
            <div className="relative h-[148px] overflow-hidden bg-[#101820]">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:96px_100%]" />
                <div className="absolute bottom-0 left-0 right-0 h-[92px] border-y border-white/25 bg-[#1d2834]">
                    {sources.map((source) => {
                        const sourceStart = offsets.get(source.id) ?? 0;
                        const left = timeToPercent(sourceStart, viewport);
                        const width = (Math.max(0, source.duration_ms) / viewport.durationMs) * 100;
                        return (
                            <div
                                key={source.id}
                                className="absolute top-0 h-full border-r border-white/20 bg-[linear-gradient(135deg,rgba(180,139,72,0.45),rgba(45,60,72,0.75),rgba(130,92,47,0.35))]"
                                style={{ left: `${left}%`, width: `${width}%` }}
                            />
                        );
                    })}

                    {orderedSegments.map((segment) => {
                        const bounds = segmentLocalToGlobal(segment, offsets);
                        const left = timeToPercent(bounds.startMs, viewport);
                        const width = Math.max(0.7, (getSegmentDuration(segment) / viewport.durationMs) * 100);
                        const selected = selectedSegmentId === segment.id && !segment.deleted;
                        const activeIndex = activeSegments.findIndex((activeSegment) => activeSegment.id === segment.id);
                        const label = segment.deleted
                            ? ''
                            : activeIndex === 0
                                ? 'Интро'
                                : String(activeIndex).padStart(3, '0');

                        return (
                            <div
                                key={segment.id}
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    const ratio = Math.min(Math.max((event.clientX - rect.left) / Math.max(1, rect.width), 0), 1);
                                    const bounds = segmentLocalToGlobal(segment, offsets);
                                    onSeek(bounds.startMs + (bounds.endMs - bounds.startMs) * ratio);
                                    onSelectSegment(segment.id);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        onSelectSegment(segment.id);
                                    }
                                }}
                                className={[
                                    'absolute top-0 h-full overflow-hidden border-x px-3 py-2 text-left transition',
                                    segment.deleted
                                        ? 'border-white/10 bg-[#05080c]/80 opacity-40 grayscale hover:opacity-55'
                                        : selected
                                            ? 'border-sky-300 bg-sky-400/18'
                                            : 'border-white/45 bg-white/5 hover:bg-white/8'
                                ].join(' ')}
                                style={{ left: `${left}%`, width: `${width}%` }}
                                title={segment.id}
                            >
                                <span className="sr-only">segment {segment.id}</span>
                                {label ? (
                                    <span className="relative z-10 inline-flex max-w-full truncate rounded bg-black/35 px-2 py-1 text-sm font-semibold text-white">
                                        {label}
                                    </span>
                                ) : null}
                                {selected ? (
                                    <>
                                        <button
                                            type="button"
                                            className="absolute -left-1 top-0 h-full w-2 cursor-ew-resize bg-white"
                                            onPointerDown={(event) => onStartBoundaryDrag(segment.id, 'start', event)}
                                            aria-label="trim start"
                                        />
                                        <button
                                            type="button"
                                            className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize bg-white"
                                            onPointerDown={(event) => onStartBoundaryDrag(segment.id, 'end', event)}
                                            aria-label="trim end"
                                        />
                                    </>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
