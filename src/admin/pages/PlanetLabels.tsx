import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { AlertTriangle, ArrowDown, ArrowUp, Globe2, RotateCcw, Save, Search } from 'lucide-react';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { PlanetSphere } from '../../components/PlanetSphere';
import type { Location } from '../../data/db';
import { authFetch } from '../../utils/authFetch';
import { getLocalizedValue } from '../../utils/language';
import {
    DEFAULT_DESKTOP_LABEL_OFFSET,
    DEFAULT_LABEL_VERTICAL_OFFSET,
    DEFAULT_MOBILE_LABEL_OFFSET,
    PLANET_LABEL_OFFSET_MAX,
    PLANET_LABEL_OFFSET_MIN,
    PLANET_LABEL_VERTICAL_OFFSET_MAX,
    PLANET_LABEL_VERTICAL_OFFSET_MIN,
    clampPlanetLabelOffset,
    clampPlanetLabelVerticalOffset,
    getPlanetLabelLayout,
    getPlanetLabelPath,
    getPlanetLabelTextPosition,
    type PlanetLabelDirection,
    type PlanetLabelProfile
} from '../../utils/planetLabelLayout';

const BASE_LANGUAGE_ID = 2;
const CAMERA_POSITION: [number, number, number] = [-1.7057780567874519, 2.3921494680329234, -1.902088889503387];

type LocationLabelDraft = {
    label_desktop_offset: number;
    label_desktop_vertical_offset: number;
    label_desktop_direction: PlanetLabelDirection;
    label_mobile_offset: number;
    label_mobile_vertical_offset: number;
    label_mobile_direction: PlanetLabelDirection;
};

type MarkerRect = {
    id: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
    visible: boolean;
};

type CollisionPair = {
    firstId: string;
    secondId: string;
};

const getLocationName = (location: Location) => (
    getLocalizedValue(location, 'name', BASE_LANGUAGE_ID) || 'Без названия'
);

const getLocationDraft = (location: Location): LocationLabelDraft => ({
    label_desktop_offset: clampPlanetLabelOffset(location.label_desktop_offset ?? DEFAULT_DESKTOP_LABEL_OFFSET),
    label_desktop_vertical_offset: clampPlanetLabelVerticalOffset(location.label_desktop_vertical_offset ?? DEFAULT_LABEL_VERTICAL_OFFSET),
    label_desktop_direction: location.label_desktop_direction === 'DOWN' ? 'DOWN' : 'UP',
    label_mobile_offset: clampPlanetLabelOffset(location.label_mobile_offset ?? DEFAULT_MOBILE_LABEL_OFFSET),
    label_mobile_vertical_offset: clampPlanetLabelVerticalOffset(location.label_mobile_vertical_offset ?? DEFAULT_LABEL_VERTICAL_OFFSET),
    label_mobile_direction: location.label_mobile_direction === 'DOWN' ? 'DOWN' : 'UP'
});

const applyDraft = (location: Location, draft?: LocationLabelDraft): Location => ({
    ...location,
    ...(draft || {})
});

const toSpherePosition = (lat: number, lng: number, radius: number) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
};

const hasRectOverlap = (first: MarkerRect, second: MarkerRect) => (
    first.visible
    && second.visible
    && first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top
);

const getCollisionPairs = (rects: Record<string, MarkerRect>): CollisionPair[] => {
    const visibleRects = Object.values(rects).filter((rect) => rect.visible);
    const pairs: CollisionPair[] = [];

    for (let index = 0; index < visibleRects.length; index += 1) {
        for (let nextIndex = index + 1; nextIndex < visibleRects.length; nextIndex += 1) {
            const first = visibleRects[index];
            const second = visibleRects[nextIndex];
            if (first && second && hasRectOverlap(first, second)) {
                pairs.push({ firstId: first.id, secondId: second.id });
            }
        }
    }

    return pairs;
};

export function PlanetLabels() {
    const [locations, setLocations] = useState<Location[]>([]);
    const [drafts, setDrafts] = useState<Record<string, LocationLabelDraft>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [profile, setProfile] = useState<PlanetLabelProfile>('desktop');
    const [query, setQuery] = useState('');
    const [markerRects, setMarkerRects] = useState<Record<string, MarkerRect>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [screenError, setScreenError] = useState('');

    const effectiveLocations = useMemo(
        () => locations.map((location) => applyDraft(location, drafts[location.id])),
        [drafts, locations]
    );
    const selectedLocation = useMemo(
        () => effectiveLocations.find((location) => location.id === selectedId) || effectiveLocations[0] || null,
        [effectiveLocations, selectedId]
    );
    const filteredLocations = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return effectiveLocations;
        }

        return effectiveLocations.filter((location) => (
            getLocationName(location).toLowerCase().includes(normalizedQuery)
        ));
    }, [effectiveLocations, query]);
    const selectedDraft = selectedLocation ? getLocationDraft(selectedLocation) : null;
    const collisions = useMemo(() => getCollisionPairs(markerRects), [markerRects]);
    const collisionIds = useMemo(() => {
        const ids = new Set<string>();
        collisions.forEach((pair) => {
            ids.add(pair.firstId);
            ids.add(pair.secondId);
        });
        return ids;
    }, [collisions]);
    const dirtyIds = useMemo(() => new Set(Object.keys(drafts)), [drafts]);
    const selectedIsDirty = Boolean(selectedLocation && drafts[selectedLocation.id]);

    const fetchLocations = useCallback(async () => {
        setIsLoading(true);
        setScreenError('');

        try {
            const response = await authFetch('/api/locations');
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || 'Не удалось загрузить локации.');
            }

            const nextLocations = payload as Location[];
            setLocations(nextLocations);
            setSelectedId((current) => current || nextLocations[0]?.id || null);
            setDrafts({});
        } catch (error) {
            setScreenError(error instanceof Error ? error.message : 'Не удалось загрузить локации.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchLocations();
    }, [fetchLocations]);

    const updateSelectedDraft = useCallback((patch: Partial<LocationLabelDraft>) => {
        if (!selectedLocation) return;

        setDrafts((current) => ({
            ...current,
            [selectedLocation.id]: {
                ...getLocationDraft(selectedLocation),
                ...current[selectedLocation.id],
                ...patch
            }
        }));
    }, [selectedLocation]);

    const handleMarkerRect = useCallback((rect: MarkerRect) => {
        setMarkerRects((current) => {
            const previous = current[rect.id];
            if (
                previous
                && Math.abs(previous.left - rect.left) < 1
                && Math.abs(previous.top - rect.top) < 1
                && Math.abs(previous.right - rect.right) < 1
                && Math.abs(previous.bottom - rect.bottom) < 1
                && previous.visible === rect.visible
            ) {
                return current;
            }

            return { ...current, [rect.id]: rect };
        });
    }, []);

    const handleSaveSelected = async () => {
        if (!selectedLocation || !selectedDraft) return;

        setIsSaving(true);
        setScreenError('');

        try {
            const response = await authFetch(`/api/locations/${selectedLocation.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: selectedLocation.lat,
                    lng: selectedLocation.lng,
                    image: selectedLocation.image || '',
                    translations: selectedLocation.translations,
                    ...selectedDraft
                })
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || 'Не удалось сохранить настройки.');
            }

            setLocations((current) => current.map((location) => (
                location.id === selectedLocation.id ? payload as Location : location
            )));
            setDrafts((current) => {
                const next = { ...current };
                delete next[selectedLocation.id];
                return next;
            });
        } catch (error) {
            setScreenError(error instanceof Error ? error.message : 'Не удалось сохранить настройки.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetSelected = () => {
        if (!selectedLocation) return;

        setDrafts((current) => {
            const next = { ...current };
            delete next[selectedLocation.id];
            return next;
        });
    };

    return (
        <div className="min-h-screen bg-[#080a0f] text-white">
            <header className="flex min-h-16 items-center justify-between gap-4 border-b border-white/8 bg-[#11141a] px-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-blue-200">
                        <Globe2 size={20} />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight">Планета</h1>
                        <p className="text-xs text-gray-500">Редактор подписей локаций</p>
                    </div>
                </div>

                <div className="flex items-center rounded-lg border border-white/10 bg-black/25 p-1">
                    <ProfileButton active={profile === 'desktop'} onClick={() => setProfile('desktop')}>
                        Desktop
                    </ProfileButton>
                    <ProfileButton active={profile === 'mobile'} onClick={() => setProfile('mobile')}>
                        Mobile
                    </ProfileButton>
                </div>
            </header>

            <main className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:h-[calc(100vh-4rem)] lg:min-h-[640px] lg:grid-cols-[300px_minmax(0,1fr)_340px]">
                <aside className="min-h-0 border-b border-white/8 bg-[#11141a] lg:border-b-0 lg:border-r">
                    <div className="border-b border-white/8 p-4">
                        <label className="relative block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Поиск локации"
                                className="h-11 w-full rounded-lg border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none transition focus:border-blue-300/60"
                            />
                        </label>
                    </div>

                    <div className="max-h-64 overflow-y-auto p-3 lg:h-[calc(100%-4.75rem)] lg:max-h-none">
                        {isLoading ? (
                            <div className="px-3 py-6 text-sm text-gray-500">Загрузка...</div>
                        ) : filteredLocations.length === 0 ? (
                            <div className="px-3 py-6 text-sm text-gray-500">Локации не найдены.</div>
                        ) : (
                            <div className="space-y-1">
                                {filteredLocations.map((location) => (
                                    <button
                                        key={location.id}
                                        type="button"
                                        onClick={() => setSelectedId(location.id)}
                                        className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                                            selectedLocation?.id === location.id
                                                ? 'border border-blue-400/20 bg-blue-500/10 text-blue-100'
                                                : 'text-gray-300 hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                            collisionIds.has(location.id) ? 'bg-amber-300' : 'bg-white/70'
                                        }`} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{getLocationName(location)}</span>
                                            <span className="mt-0.5 block truncate font-mono text-[11px] text-gray-500">
                                                {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                                            </span>
                                        </span>
                                        {dirtyIds.has(location.id) ? (
                                            <span className="h-2 w-2 rounded-full bg-blue-300" />
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                <section className="relative min-h-[360px] min-w-0 bg-black lg:min-h-0">
                    <div className="absolute left-4 top-4 z-10 rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-xs text-gray-300 backdrop-blur">
                        {profile === 'desktop' ? 'Desktop-превью' : 'Mobile-превью'} · {effectiveLocations.length} локаций
                    </div>

                    {screenError ? (
                        <div className="absolute left-4 right-4 top-16 z-10 rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {screenError}
                        </div>
                    ) : null}

                    <Canvas
                        camera={{ position: CAMERA_POSITION, fov: 45, near: 0.1, far: 20 }}
                        dpr={[1, 1.5]}
                        gl={{ antialias: true, powerPreference: 'low-power', stencil: false }}
                    >
                        <ambientLight intensity={0.35} />
                        <directionalLight position={[8, 3, 2]} intensity={2.4} />
                        <Suspense fallback={null}>
                            <PlanetSphere />
                            <EditorMarkers
                                locations={effectiveLocations}
                                profile={profile}
                                selectedId={selectedLocation?.id || null}
                                collisionIds={collisionIds}
                                onSelect={setSelectedId}
                                onMarkerRect={handleMarkerRect}
                            />
                        </Suspense>
                        <OrbitControls enablePan={false} enableZoom enableRotate rotateSpeed={0.5} />
                    </Canvas>
                </section>

                <aside className="min-h-0 border-t border-white/8 bg-[#11141a] p-5 lg:border-l lg:border-t-0">
                    {selectedLocation && selectedDraft ? (
                        <div className="flex h-full flex-col">
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Выбрано</div>
                                <h2 className="mt-2 text-xl font-semibold leading-tight text-white">{getLocationName(selectedLocation)}</h2>
                                <p className="mt-2 font-mono text-xs text-gray-500">
                                    {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
                                </p>
                            </div>

                            <div className="mt-6 space-y-6">
                                <OffsetControl
                                    label="Горизонтальный вынос"
                                    value={profile === 'desktop' ? selectedDraft.label_desktop_offset : selectedDraft.label_mobile_offset}
                                    onChange={(value) => updateSelectedDraft(profile === 'desktop'
                                        ? { label_desktop_offset: value }
                                        : { label_mobile_offset: value })}
                                    min={PLANET_LABEL_OFFSET_MIN}
                                    max={PLANET_LABEL_OFFSET_MAX}
                                    clamp={clampPlanetLabelOffset}
                                />

                                <OffsetControl
                                    label="Вертикальный вынос"
                                    value={profile === 'desktop' ? selectedDraft.label_desktop_vertical_offset : selectedDraft.label_mobile_vertical_offset}
                                    onChange={(value) => updateSelectedDraft(profile === 'desktop'
                                        ? { label_desktop_vertical_offset: value }
                                        : { label_mobile_vertical_offset: value })}
                                    min={PLANET_LABEL_VERTICAL_OFFSET_MIN}
                                    max={PLANET_LABEL_VERTICAL_OFFSET_MAX}
                                    clamp={clampPlanetLabelVerticalOffset}
                                />

                                <DirectionControl
                                    value={profile === 'desktop' ? selectedDraft.label_desktop_direction : selectedDraft.label_mobile_direction}
                                    onChange={(value) => updateSelectedDraft(profile === 'desktop'
                                        ? { label_desktop_direction: value }
                                        : { label_mobile_direction: value })}
                                />

                                <div className="rounded-lg border border-white/8 bg-black/20 p-4">
                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Текущий профиль</div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                        <Metric label="Desktop" value={`${selectedDraft.label_desktop_offset}px / ${selectedDraft.label_desktop_vertical_offset}px · ${selectedDraft.label_desktop_direction === 'UP' ? 'вверх' : 'вниз'}`} />
                                        <Metric label="Mobile" value={`${selectedDraft.label_mobile_offset}px / ${selectedDraft.label_mobile_vertical_offset}px · ${selectedDraft.label_mobile_direction === 'UP' ? 'вверх' : 'вниз'}`} />
                                    </div>
                                </div>

                                {collisions.length > 0 ? (
                                    <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-amber-100">
                                        <div className="flex items-center gap-2 text-sm font-semibold">
                                            <AlertTriangle size={16} />
                                            Есть пересечения
                                        </div>
                                        <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
                                            {collisions.length} конфликтов в текущем превью. Сохранение доступно.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                                        Пересечений в текущем превью нет.
                                    </div>
                                )}
                            </div>

                            <div className="mt-auto flex gap-3 border-t border-white/8 pt-5">
                                <button
                                    type="button"
                                    onClick={handleResetSelected}
                                    disabled={!selectedIsDirty || isSaving}
                                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-gray-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <RotateCcw size={16} />
                                    Сбросить
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveSelected}
                                    disabled={!selectedIsDirty || isSaving}
                                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Save size={16} />
                                    {isSaving ? 'Сохранение...' : 'Сохранить'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
                            Выберите локацию.
                        </div>
                    )}
                </aside>
            </main>
        </div>
    );
}

function EditorMarkers({
    locations,
    profile,
    selectedId,
    collisionIds,
    onSelect,
    onMarkerRect
}: {
    locations: Location[];
    profile: PlanetLabelProfile;
    selectedId: string | null;
    collisionIds: Set<string>;
    onSelect: (id: string) => void;
    onMarkerRect: (rect: MarkerRect) => void;
}) {
    return (
        <group>
            {locations.map((location) => (
                <EditorMarker
                    key={location.id}
                    location={location}
                    profile={profile}
                    isSelected={selectedId === location.id}
                    hasCollision={collisionIds.has(location.id)}
                    onSelect={() => onSelect(location.id)}
                    onMarkerRect={onMarkerRect}
                />
            ))}
        </group>
    );
}

const EditorMarker = React.memo(function EditorMarker({
    location,
    profile,
    isSelected,
    hasCollision,
    onSelect,
    onMarkerRect
}: {
    location: Location;
    profile: PlanetLabelProfile;
    isSelected: boolean;
    hasCollision: boolean;
    onSelect: () => void;
    onMarkerRect: (rect: MarkerRect) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const opacityRef = useRef(1);
    const frameRef = useRef(0);
    const position = useMemo(() => toSpherePosition(location.lat, location.lng, 1.001), [location.lat, location.lng]);
    const labelLayout = getPlanetLabelLayout(location, profile);
    const labelPath = getPlanetLabelPath(labelLayout);
    const labelTextPosition = getPlanetLabelTextPosition(labelLayout);

    useFrame(({ camera }, delta) => {
        if (!ref.current) return;

        const dot = camera.position.clone().normalize().dot(position.clone().normalize());
        let opacity = 0;
        if (dot > 0.2) {
            opacity = 1;
        } else if (dot >= -0.1) {
            opacity = (dot + 0.1) / 0.3;
        }

        opacityRef.current = THREE.MathUtils.damp(opacityRef.current, opacity, 7, delta);
        ref.current.style.opacity = opacityRef.current.toString();
        ref.current.style.pointerEvents = opacityRef.current > 0.2 ? 'auto' : 'none';

        frameRef.current = (frameRef.current + 1) % 8;
        if (frameRef.current !== 0) return;

        const rect = ref.current.getBoundingClientRect();
        onMarkerRect({
            id: location.id,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            visible: opacityRef.current > 0.2
        });
    });

    return (
        <group position={position}>
            <Html center style={{ pointerEvents: 'none' }}>
                <div
                    ref={ref}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSelect();
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="relative h-0 w-0 cursor-pointer select-none"
                    style={{ opacity: 1 }}
                >
                    <div
                        className={`absolute left-0 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/50 transition ${
                            isSelected ? 'bg-red-500 scale-125' : hasCollision ? 'bg-amber-300' : 'bg-white'
                        }`}
                    />
                    <svg
                        className="pointer-events-none absolute left-0 top-0 overflow-visible"
                        style={{ width: `${labelLayout.offset + 34}px`, height: `${labelLayout.verticalOffset + 42}px` }}
                    >
                        <path
                            d={labelPath}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1"
                            className={isSelected ? 'text-red-500' : hasCollision ? 'text-amber-300' : 'text-white'}
                        />
                    </svg>
                    <div
                        className={`absolute whitespace-nowrap px-1 text-sm font-medium ${
                            isSelected ? 'text-red-500' : hasCollision ? 'text-amber-200' : 'text-white'
                        }`}
                        style={{
                            left: `${labelTextPosition.left}px`,
                            top: `${labelTextPosition.top}px`
                        }}
                    >
                        {getLocationName(location)}
                    </div>
                </div>
            </Html>
        </group>
    );
});

function ProfileButton({
    active,
    onClick,
    children
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`min-h-9 rounded-md px-4 text-sm font-medium transition ${
                active ? 'bg-white text-black' : 'text-gray-400 hover:bg-white/[0.06] hover:text-white'
            }`}
        >
            {children}
        </button>
    );
}

function OffsetControl({
    label,
    value,
    onChange,
    min,
    max,
    clamp
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    clamp: (value: number) => number;
}) {
    const handleChange = (nextValue: string) => {
        onChange(clamp(Number(nextValue)));
    };

    return (
        <div>
            <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-gray-300">{label}</label>
                <input
                    type="number"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(event) => handleChange(event.target.value)}
                    className="h-9 w-24 rounded-lg border border-white/10 bg-black/25 px-3 text-right text-sm text-white outline-none focus:border-blue-300/60"
                />
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(event) => handleChange(event.target.value)}
                className="mt-4 w-full accent-blue-300"
            />
            <div className="mt-2 flex justify-between text-[11px] text-gray-600">
                <span>{min}px</span>
                <span>{max}px</span>
            </div>
        </div>
    );
}

function DirectionControl({
    value,
    onChange
}: {
    value: PlanetLabelDirection;
    onChange: (value: PlanetLabelDirection) => void;
}) {
    return (
        <div>
            <div className="mb-3 text-sm font-medium text-gray-300">Направление выноса</div>
            <div className="grid grid-cols-2 gap-2">
                <DirectionButton active={value === 'UP'} onClick={() => onChange('UP')}>
                    <ArrowUp size={16} />
                    Вверх
                </DirectionButton>
                <DirectionButton active={value === 'DOWN'} onClick={() => onChange('DOWN')}>
                    <ArrowDown size={16} />
                    Вниз
                </DirectionButton>
            </div>
        </div>
    );
}

function DirectionButton({
    active,
    onClick,
    children
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                active
                    ? 'border-blue-300/40 bg-blue-400/15 text-blue-100'
                    : 'border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]'
            }`}
        >
            {children}
        </button>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="text-[11px] text-gray-500">{label}</div>
            <div className="mt-1 truncate text-xs font-medium text-gray-200">{value}</div>
        </div>
    );
}
