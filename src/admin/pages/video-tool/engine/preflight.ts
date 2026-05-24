import type { Segment, WorkingSource, VideoToolItem, HelperHealthPayload } from '../types';

export type PreflightIssue = {
    type: 'blocker' | 'warning';
    message: string;
};

export type PreflightResult = {
    passed: boolean;
    issues: PreflightIssue[];
};

export const runPreflight = (options: {
    helperStatus: string;
    helperHealth: HelperHealthPayload | null;
    sources: WorkingSource[];
    segments: Segment[];
    items: VideoToolItem[];
    expectedOutputCount: number;
}): PreflightResult => {
    const issues: PreflightIssue[] = [];

    // 1. ffmpeg/ffprobe check
    if (options.helperStatus !== 'ready' || !options.helperHealth?.ok) {
        issues.push({
            type: 'blocker',
            message: 'Stones Video Helper недоступен или ffmpeg/ffprobe не установлены на компьютере.'
        });
    }

    // 2. disk space check (sufficient space)
    if (options.helperHealth && typeof options.helperHealth.free_bytes === 'number') {
        const requiredBytes = options.expectedOutputCount * 100 * 1024 * 1024 + 1024 * 1024 * 1024; // 100MB per clip + 1GB buffer
        if (options.helperHealth.free_bytes < requiredBytes) {
            issues.push({
                type: 'blocker',
                message: `Недостаточно свободного места на диске. Нужно как минимум ${(requiredBytes / (1024 * 1024 * 1024)).toFixed(1)} GB. Доступно: ${(options.helperHealth.free_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB.`
            });
        }
    }

    // 3. source reading & duration checks
    if (options.sources.length === 0) {
        issues.push({
            type: 'blocker',
            message: 'Не загружено ни одного исходного видео.'
        });
    } else {
        for (const source of options.sources) {
            if (!source.durationMs || source.durationMs <= 0) {
                issues.push({
                    type: 'blocker',
                    message: `Длительность исходника "${source.name}" не определена или некорректна.`
                });
            }
            if (source.previewUnavailable) {
                issues.push({
                    type: 'warning',
                    message: `Для исходника "${source.name}" недоступен превью-режим. Рендеринг может быть медленным или нестабильным.`
                });
            }
        }
    }

    // 4. expected clips vs items count
    const activeSegments = options.segments.filter((s) => !s.deleted);
    const activeProductCount = Math.max(0, activeSegments.length - 1);
    if (activeProductCount !== options.expectedOutputCount) {
        issues.push({
            type: 'warning',
            message: `Количество клипов на таймлайне (${activeProductCount}) не совпадает с количеством товаров в партии (${options.expectedOutputCount}).`
        });
    }

    // 5. short segments validation
    // Any clip should not be too short (e.g. less than 1.5s is extremely short for a jewelry item video)
    const clipSegments = activeSegments.slice(1); // skip intro segment
    for (let i = 0; i < clipSegments.length; i++) {
        const seg = clipSegments[i];
        const duration = seg.endMs - seg.startMs;
        if (duration < 1500) {
            issues.push({
                type: 'warning',
                message: `Клип #${i + 1} имеет очень маленькую длительность (${(duration / 1000).toFixed(2)} сек). Рекомендуемая длительность — от 2-3 секунд.`
            });
        }
    }

    // 6. serial_number validation for all items
    for (const item of options.items) {
        if (!item.serial_number || !item.serial_number.trim()) {
            issues.push({
                type: 'blocker',
                message: `У товара с ID ${item.id} отсутствует серийный номер (serial_number). Экспорт невозможен.`
            });
        }
    }

    return {
        passed: !issues.some((issue) => issue.type === 'blocker'),
        issues
    };
};
