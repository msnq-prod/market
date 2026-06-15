import type { VideoToolV3Snapshot } from './types';
import { getSegmentDuration, MIN_SEGMENT_DURATION_MS } from './timelineModel';

export const getActiveSegments = (snapshot: VideoToolV3Snapshot) =>
    snapshot.segments.filter((segment) => !segment.deleted).sort((left, right) => left.position - right.position);

export const getActiveSources = (snapshot: VideoToolV3Snapshot) =>
    snapshot.sources.filter((source) => source.status !== 'DELETED');

export const getExportBlockers = (snapshot: VideoToolV3Snapshot) => {
    const project = snapshot.project;
    const activeSegments = getActiveSegments(snapshot);
    const activeSources = getActiveSources(snapshot);
    const tailCount = Math.max(0, activeSegments.length - 1);
    const expectedItems = project?.expected_output_count ?? snapshot.items.length;
    const blockers: string[] = [];

    if (!project) {
        blockers.push('Проект не создан.');
    }
    if (project && project.batch_status !== 'RECEIVED') {
        blockers.push('Партия должна быть RECEIVED.');
    }
    if (activeSources.length === 0) {
        blockers.push('Добавьте source.');
    }
    if (activeSources.some((source) => source.status !== 'READY')) {
        blockers.push('Все исходники должны быть готовы.');
    }
    if (activeSegments.length === 0) {
        blockers.push('Нет intro segment.');
    }
    if (tailCount !== expectedItems) {
        blockers.push(`Товарных segment: ${tailCount}, ожидается: ${expectedItems}.`);
    }
    if (activeSegments.some((segment) => getSegmentDuration(segment) < MIN_SEGMENT_DURATION_MS)) {
        blockers.push('Есть segment короче 500 ms.');
    }
    if (snapshot.items.some((item) => !item.serial_number)) {
        blockers.push('Есть item без serial_number.');
    }

    return blockers;
};
