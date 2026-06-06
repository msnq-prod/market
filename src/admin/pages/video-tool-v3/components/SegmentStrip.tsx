import { useState } from 'react';
import type { SegmentDisplayMeta } from '../timelineModel';
import { formatTimelineMs } from '../timelineModel';
import { SegmentBlock } from './SegmentBlock';

type SegmentStripProps = {
    segments: SegmentDisplayMeta[];
    totalDurationMs: number;
    onSelect(segmentId: string): void;
};

export function SegmentStrip({ segments, totalDurationMs, onSelect }: SegmentStripProps) {
    const [hotkeysOpen, setHotkeysOpen] = useState(false);
    const activeCount = segments.filter((segment) => !segment.deleted).length;
    const deletedCount = segments.filter((segment) => segment.deleted).length;

    return (
        <section className="flex min-h-0 flex-1 flex-col border-b border-white/10 bg-[#12171d] px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 text-white">
                    <span className="font-medium">Отрезки (итоговая разметка)</span>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setHotkeysOpen((current) => !current)}
                            className="flex h-5 w-5 items-center justify-center rounded-full border border-white/25 text-[11px] text-white/70 transition hover:border-white/45 hover:text-white"
                            aria-label="Горячие клавиши"
                        >
                            ?
                        </button>
                        {hotkeysOpen ? (
                            <div className="absolute left-0 top-7 z-30 w-64 rounded-lg border border-white/10 bg-[#0b1016] p-3 text-xs text-white/72 shadow-2xl">
                                <div className="mb-2 font-medium text-white">Горячие клавиши</div>
                                <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                                    <span className="font-mono text-sky-300">C</span><span>Разрезать по playhead</span>
                                    <span className="font-mono text-sky-300">Z</span><span>Откатить правку</span>
                                    <span className="font-mono text-sky-300">Del</span><span>Удалить / восстановить</span>
                                    <span className="font-mono text-sky-300">Space</span><span>Play / pause</span>
                                    <span className="font-mono text-sky-300">← →</span><span>К соседнему разрезу</span>
                                    <span className="font-mono text-sky-300">+ -</span><span>Масштаб</span>
                                    <span className="font-mono text-sky-300">F</span><span>По размеру</span>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-5 text-white/70">
                    <span>Активные: {activeCount}</span>
                    <span>Удаленные: {deletedCount}</span>
                    <span>Длительность: {formatTimelineMs(totalDurationMs)}</span>
                </div>
            </div>

            <div
                data-testid="video-v3-segment-scroll"
                className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pr-1">
                    {segments.map((segment) => (
                        <SegmentBlock
                            key={segment.segmentId}
                            segment={segment}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
