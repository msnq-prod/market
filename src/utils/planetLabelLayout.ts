import type { Location } from '../data/db';

export type PlanetLabelProfile = 'desktop' | 'mobile';
export type PlanetLabelDirection = 'UP' | 'DOWN';

export const PLANET_LABEL_OFFSET_MIN = 24;
export const PLANET_LABEL_OFFSET_MAX = 280;
export const PLANET_LABEL_VERTICAL_OFFSET_MIN = 0;
export const PLANET_LABEL_VERTICAL_OFFSET_MAX = 180;
export const DEFAULT_DESKTOP_LABEL_OFFSET = 100;
export const DEFAULT_MOBILE_LABEL_OFFSET = 80;
export const DEFAULT_LABEL_VERTICAL_OFFSET = 16;

export type PlanetLabelLayout = {
    offset: number;
    verticalOffset: number;
    direction: PlanetLabelDirection;
};

export const clampPlanetLabelOffset = (value: number): number => (
    Math.min(PLANET_LABEL_OFFSET_MAX, Math.max(PLANET_LABEL_OFFSET_MIN, Math.round(value)))
);

export const clampPlanetLabelVerticalOffset = (value: number): number => (
    Math.min(PLANET_LABEL_VERTICAL_OFFSET_MAX, Math.max(PLANET_LABEL_VERTICAL_OFFSET_MIN, Math.round(value)))
);

export const normalizePlanetLabelDirection = (value: unknown): PlanetLabelDirection => (
    value === 'DOWN' ? 'DOWN' : 'UP'
);

export const getPlanetLabelLayout = (
    location: Pick<Location,
        | 'label_desktop_offset'
        | 'label_desktop_vertical_offset'
        | 'label_desktop_direction'
        | 'label_mobile_offset'
        | 'label_mobile_vertical_offset'
        | 'label_mobile_direction'
    >,
    profile: PlanetLabelProfile
): PlanetLabelLayout => {
    if (profile === 'mobile') {
        return {
            offset: clampPlanetLabelOffset(location.label_mobile_offset ?? DEFAULT_MOBILE_LABEL_OFFSET),
            verticalOffset: clampPlanetLabelVerticalOffset(location.label_mobile_vertical_offset ?? DEFAULT_LABEL_VERTICAL_OFFSET),
            direction: normalizePlanetLabelDirection(location.label_mobile_direction)
        };
    }

    return {
        offset: clampPlanetLabelOffset(location.label_desktop_offset ?? DEFAULT_DESKTOP_LABEL_OFFSET),
        verticalOffset: clampPlanetLabelVerticalOffset(location.label_desktop_vertical_offset ?? DEFAULT_LABEL_VERTICAL_OFFSET),
        direction: normalizePlanetLabelDirection(location.label_desktop_direction)
    };
};

export const getPlanetLabelPath = ({ offset, verticalOffset, direction }: PlanetLabelLayout): string => {
    const sign = direction === 'UP' ? -1 : 1;
    const elbowX = 18;
    const elbowY = sign * verticalOffset;
    return `M 0 0 L ${elbowX} ${elbowY} L ${elbowX + offset} ${elbowY}`;
};

export const getPlanetLabelTextPosition = ({ offset, verticalOffset, direction }: PlanetLabelLayout) => ({
    left: 18 + offset,
    top: direction === 'UP' ? -(verticalOffset + 28) : verticalOffset + 4
});
