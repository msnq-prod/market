const crypto = require('crypto');

const MIN_SEGMENT_DURATION_MS = 500;

const toInt = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
};

const isDeleted = (segment) => Boolean(segment?.deleted);

const cloneSegment = (segment) => ({
    ...segment,
    position: toInt(segment.position),
    start_ms: toInt(segment.start_ms),
    end_ms: toInt(segment.end_ms),
    deleted: isDeleted(segment)
});

const durationMs = (segment) => toInt(segment.end_ms) - toInt(segment.start_ms);

const byPosition = (left, right) => {
    const positionDiff = toInt(left.position) - toInt(right.position);
    if (positionDiff !== 0) return positionDiff;
    return String(left.id).localeCompare(String(right.id));
};

const ensureRecordArray = (segments) => {
    if (!Array.isArray(segments)) {
        throw new Error('segments must be an array.');
    }
};

const getSourceDuration = (sourcesById, sourceId) => {
    const source = sourcesById?.get?.(sourceId);
    return source ? toInt(source.duration_ms ?? source.durationMs) : null;
};

const normalizeSourceMap = (sources = []) => {
    const map = new Map();
    for (const source of Array.isArray(sources) ? sources : []) {
        map.set(source.id, source);
    }
    return map;
};

class TimelineService {
    normalizeSegments(segments) {
        ensureRecordArray(segments);
        return segments
            .map(cloneSegment)
            .sort(byPosition)
            .map((segment, index) => {
                if (!segment.id) {
                    throw new Error('segment.id is required.');
                }
                if (!segment.project_id) {
                    throw new Error('segment.project_id is required.');
                }
                if (!segment.source_id) {
                    throw new Error('segment.source_id is required.');
                }
                if (segment.end_ms <= segment.start_ms) {
                    throw new Error('segment end_ms must be greater than start_ms.');
                }
                if (durationMs(segment) < MIN_SEGMENT_DURATION_MS) {
                    throw new Error(`segment duration must be at least ${MIN_SEGMENT_DURATION_MS} ms.`);
                }
                return {
                    ...segment,
                    position: index
                };
            });
    }

    splitSegment(input) {
        const {
            segments,
            segmentId,
            splitMs,
            createId = () => crypto.randomUUID()
        } = input || {};
        const normalized = this.normalizeSegments(segments || []);
        const index = normalized.findIndex((segment) => segment.id === segmentId);
        if (index < 0) {
            throw new Error('segment not found.');
        }

        const segment = normalized[index];
        if (segment.deleted) {
            throw new Error('deleted segment cannot be split.');
        }

        const splitPoint = toInt(splitMs);
        if (splitPoint - segment.start_ms < MIN_SEGMENT_DURATION_MS || segment.end_ms - splitPoint < MIN_SEGMENT_DURATION_MS) {
            throw new Error(`split requires both parts to be at least ${MIN_SEGMENT_DURATION_MS} ms.`);
        }

        const left = {
            ...segment,
            end_ms: splitPoint
        };
        const right = {
            ...segment,
            id: createId(),
            start_ms: splitPoint
        };

        return this.normalizeSegments([
            ...normalized.slice(0, index),
            left,
            right,
            ...normalized.slice(index + 1)
        ]);
    }

    moveBoundary(input) {
        const {
            segments,
            segmentId,
            edge,
            nextMs,
            sources = []
        } = input || {};
        const normalized = this.normalizeSegments(segments || []);
        const index = normalized.findIndex((segment) => segment.id === segmentId);
        if (index < 0) {
            throw new Error('segment not found.');
        }
        if (!['start', 'end'].includes(edge)) {
            throw new Error('edge must be start or end.');
        }

        const sourcesById = normalizeSourceMap(sources);
        const next = normalized.map((segment) => ({ ...segment }));
        const segment = next[index];
        const value = Math.max(0, toInt(nextMs));
        const sourceDuration = getSourceDuration(sourcesById, segment.source_id);

        if (edge === 'start') {
            segment.start_ms = Math.min(value, segment.end_ms - MIN_SEGMENT_DURATION_MS);
        } else {
            const maxEnd = sourceDuration !== null && sourceDuration > 0 ? sourceDuration : Number.MAX_SAFE_INTEGER;
            segment.end_ms = Math.min(Math.max(value, segment.start_ms + MIN_SEGMENT_DURATION_MS), maxEnd);
        }

        return this.normalizeSegments(next);
    }

    setDeleted(input, deletedArg) {
        const segments = Array.isArray(input) ? input : input?.segments;
        const segmentId = Array.isArray(input) ? arguments[1] : input?.segmentId;
        const deleted = Array.isArray(input) ? deletedArg : input?.deleted;
        const normalized = this.normalizeSegments(segments || []);
        const next = normalized.map((segment) => (
            segment.id === segmentId ? { ...segment, deleted: Boolean(deleted) } : segment
        ));

        if (this.getActiveSegments(next).length === 0) {
            throw new Error('cannot delete the last active segment.');
        }

        return this.normalizeSegments(next);
    }

    getActiveSegments(segments) {
        ensureRecordArray(segments);
        return segments
            .map(cloneSegment)
            .filter((segment) => !segment.deleted)
            .sort(byPosition);
    }

    getIntroSegment(segments) {
        return this.getActiveSegments(segments)[0] || null;
    }

    buildManifest(input) {
        const {
            batchId,
            project,
            runId,
            sources = [],
            segments = [],
            items = [],
            exportItems = [],
            qualityPreset
        } = input || {};
        const projectId = project?.id || input?.projectId;
        const normalizedSegments = this.normalizeSegments(segments);
        const activeSegments = this.getActiveSegments(normalizedSegments);
        const intro = activeSegments[0];
        const tails = activeSegments.slice(1);
        const sourcesById = normalizeSourceMap(sources);

        if (!intro) {
            throw new Error('intro segment is required.');
        }

        return {
            manifestVersion: 3,
            batchId: batchId || project?.batch_id,
            projectId,
            runId,
            settings: {
                width: 720,
                height: 1280,
                fps: 24,
                qualityPreset: qualityPreset || project?.quality_preset || 'standard',
                audio: 'disabled'
            },
            sources: sources
                .filter((source) => source.status !== 'DELETED')
                .sort((left, right) => toInt(left.position) - toInt(right.position))
                .map((source) => ({
                    sourceId: source.id,
                    position: toInt(source.position),
                    preparedPath: source.prepared_path,
                    checksumSha256: source.prepared_checksum_sha256,
                    durationMs: toInt(source.duration_ms)
                })),
            introSegment: {
                segmentId: intro.id,
                sourceId: intro.source_id,
                startMs: intro.start_ms,
                endMs: intro.end_ms
            },
            outputs: tails.map((segment, index) => {
                const item = items[index];
                const exportItem = exportItems[index];
                const source = sourcesById.get(segment.source_id);
                if (!source) {
                    throw new Error('segment source not found.');
                }
                return {
                    exportItemId: exportItem?.id || crypto.randomUUID(),
                    itemId: item?.item_id || item?.id,
                    serialNumber: item?.serial_number || '',
                    segmentId: segment.id,
                    sourceId: segment.source_id,
                    startMs: segment.start_ms,
                    endMs: segment.end_ms
                };
            })
        };
    }

    validateForExport(input) {
        const {
            project,
            sources = [],
            segments = [],
            items = [],
            freeBytes = Number.POSITIVE_INFINITY
        } = input || {};
        const blockers = [];
        let normalizedSegments = [];

        try {
            normalizedSegments = this.normalizeSegments(segments);
        } catch (error) {
            blockers.push({
                code: 'INVALID_SEGMENTS',
                message: error instanceof Error ? error.message : 'Некорректные segment bounds.'
            });
            normalizedSegments = Array.isArray(segments) ? segments.map(cloneSegment).sort(byPosition) : [];
        }

        const activeSegments = this.getActiveSegments(normalizedSegments);
        const intro = activeSegments[0] || null;
        const tailCount = Math.max(0, activeSegments.length - 1);
        const expectedCount = toInt(project?.expected_output_count, items.length);

        if (!project) {
            blockers.push({ code: 'NO_PROJECT', message: 'Проект не создан.' });
        } else if (project.batch_status !== 'RECEIVED') {
            blockers.push({ code: 'BATCH_NOT_RECEIVED', message: 'Партия должна быть в статусе RECEIVED.' });
        }
        if (sources.some((source) => source.status !== 'DELETED' && source.status !== 'READY')) {
            blockers.push({ code: 'SOURCE_NOT_READY', message: 'Все sources должны быть READY.' });
        }
        if (!intro) {
            blockers.push({ code: 'NO_INTRO', message: 'Нет intro segment.' });
        }
        if (tailCount !== expectedCount) {
            blockers.push({
                code: 'TAIL_COUNT_MISMATCH',
                message: `Товарных segment: ${tailCount}, ожидается: ${expectedCount}.`
            });
        }
        for (const segment of normalizedSegments) {
            if (durationMs(segment) < MIN_SEGMENT_DURATION_MS) {
                blockers.push({ code: 'SEGMENT_TOO_SHORT', message: 'Segment duration меньше 500 ms.' });
                break;
            }
        }
        if (items.some((item) => !String(item.serial_number || '').trim())) {
            blockers.push({ code: 'ITEM_WITHOUT_SERIAL', message: 'У каждого item должен быть serial_number.' });
        }
        if (Number.isFinite(freeBytes) && freeBytes <= 0) {
            blockers.push({ code: 'NO_FREE_SPACE', message: 'Недостаточно свободного места для outputs.' });
        }

        return {
            ok: blockers.length === 0,
            blockers,
            introSegment: intro,
            tailSegments: activeSegments.slice(1)
        };
    }
}

module.exports = {
    TimelineService,
    MIN_SEGMENT_DURATION_MS
};
