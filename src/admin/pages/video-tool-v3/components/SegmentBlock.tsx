import { MoreVertical } from 'lucide-react';
import type { SegmentDisplayMeta } from '../timelineModel';
import { formatTimelineMs } from '../timelineModel';

type SegmentBlockProps = {
    segment: SegmentDisplayMeta;
    onSelect(segmentId: string): void;
};

export function SegmentBlock({ segment, onSelect }: SegmentBlockProps) {
    return (
        <button
            type="button"
            onClick={() => onSelect(segment.segmentId)}
            className={[
                'h-[86px] min-w-[220px] rounded-lg border px-4 py-3 text-left transition',
                'bg-[#151a20] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
                segment.selected ? 'border-sky-400 ring-1 ring-sky-400/70' : 'border-white/10 hover:border-white/25',
                segment.deleted ? 'opacity-45 grayscale' : '',
                segment.exportBlocker ? 'border-amber-400/50' : ''
            ].join(' ')}
        >
            <div className="flex items-start justify-between gap-3">
                {segment.deleted ? (
                    <span className="h-6" />
                ) : (
                    <span className="min-w-0 truncate text-lg font-semibold text-white">{segment.label}</span>
                )}
                {!segment.deleted ? <MoreVertical size={18} className="shrink-0 text-white/45" /> : null}
            </div>
            {!segment.deleted ? (
                <div className="mt-3 flex items-end justify-between gap-3">
                    <span className="rounded-md bg-white/8 px-2.5 py-1 text-xs font-medium text-white/75">
                        {segment.sourceLabel.toLowerCase()}
                    </span>
                    <span className="text-base tabular-nums text-white">{formatTimelineMs(segment.durationMs)}</span>
                </div>
            ) : null}
        </button>
    );
}
