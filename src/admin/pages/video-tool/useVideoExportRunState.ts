import { useCallback, useState } from 'react';
import { getStonesDesktop } from '../../../utils/desktop';
import { fetchVideoExportRunDetails } from './videoExportClient';
import type {
    LocalVideoExportRunSnapshot,
    VideoExportRunDetails,
    VideoExportSettings
} from './types';

export const useVideoExportRunState = (
    batchId: string,
    isDesktopApp: boolean,
    applyLoadedExportSettings: (settings?: VideoExportSettings | null) => void
) => {
    const [activeV2Run, setActiveV2Run] = useState<VideoExportRunDetails | null>(null);
    const [localRunSnapshot, setLocalRunSnapshot] = useState<LocalVideoExportRunSnapshot | null>(null);
    const [isRefreshingRun, setIsRefreshingRun] = useState(false);

    const refreshLocalRunSnapshot = useCallback(async (nextBatchId = batchId) => {
        if (!isDesktopApp) {
            setLocalRunSnapshot(null);
            return null;
        }

        const desktop = getStonesDesktop();
        if (!desktop) {
            setLocalRunSnapshot(null);
            return null;
        }

        const snapshot = await desktop.getVideoExportRunSnapshot(nextBatchId).catch(() => null) as LocalVideoExportRunSnapshot | null;
        setLocalRunSnapshot(snapshot);
        return snapshot;
    }, [batchId, isDesktopApp]);

    const refreshActiveV2Run = useCallback(async (
        runId?: string | null,
        options?: { silent?: boolean }
    ) => {
        const targetRunId = runId || activeV2Run?.run_id || null;
        if (!targetRunId) {
            setActiveV2Run(null);
            return null;
        }

        if (!options?.silent) {
            setIsRefreshingRun(true);
        }

        try {
            const nextRun = await fetchVideoExportRunDetails(batchId, targetRunId) as VideoExportRunDetails;
            setActiveV2Run(nextRun);
            applyLoadedExportSettings(nextRun.export_settings ?? nextRun.render_manifest?.export_settings ?? null);
            return nextRun;
        } finally {
            if (!options?.silent) {
                setIsRefreshingRun(false);
            }
        }
    }, [activeV2Run?.run_id, applyLoadedExportSettings, batchId]);

    return {
        activeV2Run,
        setActiveV2Run,
        localRunSnapshot,
        setLocalRunSnapshot,
        refreshLocalRunSnapshot,
        refreshActiveV2Run,
        isRefreshingRun
    };
};
