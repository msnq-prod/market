import type { TimelineViewport } from '../timelineModel';
import { formatTimecode, timeToPercent } from '../timelineModel';

type TimelineRulerProps = {
    viewport: TimelineViewport;
};

const chooseTickStep = (durationMs: number) => {
    if (durationMs <= 10_000) return 1_000;
    if (durationMs <= 30_000) return 5_000;
    if (durationMs <= 120_000) return 10_000;
    return 30_000;
};

export function TimelineRuler({ viewport }: TimelineRulerProps) {
    const tickStep = chooseTickStep(viewport.durationMs);
    const firstTick = Math.ceil(viewport.startMs / tickStep) * tickStep;
    const ticks = [];

    for (let tick = firstTick; tick <= viewport.startMs + viewport.durationMs; tick += tickStep) {
        ticks.push(tick);
    }

    return (
        <div className="relative h-10 border-b border-white/10 bg-[#111820]">
            <div className="absolute inset-x-0 top-0 h-4 bg-[repeating-linear-gradient(to_right,rgba(255,255,255,0.18)_0,rgba(255,255,255,0.18)_1px,transparent_1px,transparent_12px)] opacity-70" />
            {ticks.map((tick) => (
                <div
                    key={tick}
                    className="absolute top-4 -translate-x-1/2 text-xs tabular-nums text-white/65"
                    style={{ left: `${timeToPercent(tick, viewport)}%` }}
                >
                    {formatTimecode(tick)}
                </div>
            ))}
        </div>
    );
}
