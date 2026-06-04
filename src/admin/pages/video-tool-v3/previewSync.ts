export const PREVIEW_SEEK_TOLERANCE_MS = 80;

type PreviewTimeUpdateInput = {
    isPlaying: boolean;
    mediaSeeking: boolean;
    pendingSeekMs: number | null;
    currentLocalMs: number;
};

export const resolvePreviewTimeUpdate = ({
    isPlaying,
    mediaSeeking,
    pendingSeekMs,
    currentLocalMs
}: PreviewTimeUpdateInput) => {
    const pendingSeekSettled = pendingSeekMs !== null
        && Math.abs(currentLocalMs - pendingSeekMs) <= PREVIEW_SEEK_TOLERANCE_MS;

    return {
        clearPendingSeek: pendingSeekSettled,
        publish: isPlaying
            && !mediaSeeking
            && (pendingSeekMs === null || pendingSeekSettled)
    };
};
