import { useEffect } from 'react';
import { TIMELINE_ZOOM_STEP } from './constants';
import type { Segment } from './types';
import { isEditableHotkeyTarget } from './videoHelperClient';
import { splitSegmentAt, toggleSegmentDeletedAt } from './engine/index.ts';

type UseVideoToolHotkeysOptions = {
    applySegmentEdit: (updater: (current: Segment[]) => Segment[]) => void;
    durationMs: number;
    hardDeleteSelectedSegment: () => void;
    playheadMs: number;
    restorePreviousSegments: () => void;
    selectedSegmentIndex: number;
    segmentsLength: number;
    syncVideoTime: (nextMs: number) => void;
    togglePlayback: () => void | Promise<void>;
    zoomTimelineByFactor: (factor: number, anchorMs?: number) => void;
};

export const useVideoToolHotkeys = ({
    applySegmentEdit,
    durationMs,
    hardDeleteSelectedSegment,
    playheadMs,
    restorePreviousSegments,
    selectedSegmentIndex,
    segmentsLength,
    syncVideoTime,
    togglePlayback,
    zoomTimelineByFactor
}: UseVideoToolHotkeysOptions) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableHotkeyTarget(event.target)) {
                return;
            }

            if (event.code === 'Space') {
                event.preventDefault();
                void togglePlayback();
                return;
            }

            const normalizedKey = event.key.toLowerCase();
            if (event.code === 'KeyC' || normalizedKey === 'c' || normalizedKey === 'с') {
                event.preventDefault();
                applySegmentEdit((current) => splitSegmentAt(current, playheadMs));
                return;
            }

            if (event.key === 'Delete' && event.shiftKey && segmentsLength > 0) {
                event.preventDefault();
                hardDeleteSelectedSegment();
                return;
            }

            if ((event.key === 'Delete' || event.key === 'Backspace') && segmentsLength > 0) {
                event.preventDefault();
                applySegmentEdit((current) => toggleSegmentDeletedAt(current, selectedSegmentIndex));
                return;
            }

            if (event.code === 'KeyZ' || normalizedKey === 'z' || normalizedKey === 'я') {
                event.preventDefault();
                restorePreviousSegments();
                return;
            }

            if (event.code === 'Equal' || normalizedKey === '=' || normalizedKey === '+') {
                event.preventDefault();
                zoomTimelineByFactor(1 / TIMELINE_ZOOM_STEP);
                return;
            }

            if (event.code === 'Minus' || normalizedKey === '-' || normalizedKey === '_') {
                event.preventDefault();
                zoomTimelineByFactor(TIMELINE_ZOOM_STEP);
                return;
            }

            if (normalizedKey === ',' || normalizedKey === 'б' || normalizedKey === '<') {
                event.preventDefault();
                syncVideoTime(Math.max(0, playheadMs - 33));
                return;
            }

            if (normalizedKey === '.' || normalizedKey === 'ю' || normalizedKey === '>') {
                event.preventDefault();
                syncVideoTime(Math.min(durationMs, playheadMs + 33));
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                syncVideoTime(Math.max(0, playheadMs - (event.shiftKey ? 1000 : 33)));
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                syncVideoTime(Math.min(durationMs, playheadMs + (event.shiftKey ? 1000 : 33)));
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [applySegmentEdit, durationMs, hardDeleteSelectedSegment, playheadMs, restorePreviousSegments, selectedSegmentIndex, segmentsLength, syncVideoTime, togglePlayback, zoomTimelineByFactor]);
};
