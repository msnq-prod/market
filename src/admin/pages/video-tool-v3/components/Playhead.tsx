type PlayheadProps = {
    leftPercent: number;
};

export function Playhead({ leftPercent }: PlayheadProps) {
    const safeLeftPercent = Math.min(100, Math.max(0, leftPercent));

    return (
        <div
            className="pointer-events-none absolute bottom-3 top-0 z-30"
            style={{ left: `${safeLeftPercent}%` }}
        >
            <div className="-ml-[7px] h-0 w-0 border-x-[7px] border-t-[10px] border-x-transparent border-t-red-500" />
            <div className="-ml-px h-full w-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
            <div className="absolute bottom-0 -ml-[5px] h-3 w-3 rounded-sm border border-red-400 bg-[#10141a]" />
        </div>
    );
}
