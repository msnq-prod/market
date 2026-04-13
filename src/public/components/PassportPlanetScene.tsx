import { Html } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { PlanetSphere } from '../../components/PlanetSphere';
import { hasWebGLSupport } from '../../utils/webgl';

type PassportPlanetSceneProps = {
    className?: string;
    lat?: number | null;
    lng?: number | null;
    locationName?: string | null;
};

const DEFAULT_CAMERA_POSITION: [number, number, number] = [-1.7, 2.39, -1.9];
const FOCUSED_CAMERA_RADIUS = 3.5;
const DEFAULT_FOV = 45;
const FOCUSED_FOV = 42;

export function PassportPlanetScene({
    className = '',
    lat = null,
    lng = null,
    locationName = null
}: PassportPlanetSceneProps) {
    const [hasWebGL] = useState(() => hasWebGLSupport());
    const hasLocation = lat != null && lng != null;
    const cameraPosition = useMemo(() => getCameraPosition(lat, lng), [lat, lng]);
    const sceneKey = `${lat ?? 'na'}:${lng ?? 'na'}:${locationName ?? 'no-location'}`;

    if (!hasWebGL) {
        return (
            <div className={`h-full w-full ${className}`}>
                <StaticPlanetFallback
                    hasLocation={hasLocation}
                    locationName={locationName}
                    coordinatesLabel={formatCoordinates(lat, lng)}
                />
            </div>
        );
    }

    return (
        <div className={`h-full w-full ${className}`}>
            <Canvas
                key={sceneKey}
                camera={{ position: cameraPosition, fov: hasLocation ? FOCUSED_FOV : DEFAULT_FOV }}
                dpr={[1, 1.5]}
                gl={{ alpha: true, antialias: true }}
                onCreated={({ camera }) => {
                    camera.lookAt(0, 0, 0);
                }}
                fallback={(
                    <StaticPlanetFallback
                        hasLocation={hasLocation}
                        locationName={locationName}
                        coordinatesLabel={formatCoordinates(lat, lng)}
                    />
                )}
            >
                <ambientLight intensity={0.48} />
                <directionalLight position={[8, 3, 2]} intensity={2} />
                <pointLight position={[-4, -1, 2]} intensity={7} color="#5ed7ff" />

                <group scale={1.28}>
                    <PlanetSphere />
                    {hasLocation ? (
                        <LocationMarker
                            lat={lat}
                            lng={lng}
                            locationName={locationName}
                        />
                    ) : null}
                </group>
            </Canvas>
        </div>
    );
}

function LocationMarker({
    lat,
    lng,
    locationName
}: {
    lat: number;
    lng: number;
    locationName: string | null;
}) {
    const position = useMemo(() => {
        const [x, y, z] = toSpherePosition(lat, lng, 1.001);
        return new THREE.Vector3(x, y, z);
    }, [lat, lng]);
    const displayName = locationName || 'Локация сбора';
    const coordinatesLabel = formatCoordinates(lat, lng);

    return (
        <group position={position}>
            <Html center style={{ pointerEvents: 'none' }}>
                <div className="relative select-none" style={{ width: '0px', height: '0px' }}>
                    <div className="absolute top-0 left-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/35 bg-white shadow-[0_0_18px_rgba(255,255,255,0.85)]" />
                    <div className="absolute left-[1px] top-[-2px] h-px w-[22px] origin-left rotate-[-46deg] bg-white/90" />
                    <div className="absolute left-[16px] top-[-18px] h-px w-[126px] bg-white/90" />

                    <div className="absolute left-[16px] top-[-40px] max-w-[176px] text-[13px] font-semibold leading-[1.05] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
                        {displayName}
                    </div>

                    <div className="absolute left-[58px] top-[-8px] font-mono text-[10px] tracking-[0.16em] text-white/74 drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
                        {coordinatesLabel}
                    </div>
                </div>
            </Html>
        </group>
    );
}

function StaticPlanetFallback({
    hasLocation,
    locationName,
    coordinatesLabel
}: {
    hasLocation: boolean;
    locationName: string | null;
    coordinatesLabel: string | null;
}) {
    return (
        <div className="relative h-full w-full">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(14,165,233,0.18),transparent_24%),radial-gradient(circle_at_50%_50%,rgba(2,132,199,0.08),transparent_45%)]" />
            <div className="absolute left-1/2 top-1/2 h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.24),rgba(13,110,180,0.38)_20%,rgba(5,35,65,0.95)_60%,rgba(1,3,10,0)_74%)] blur-[1px]" />
            {hasLocation ? (
                <div className="absolute left-[54%] top-[48%]">
                    <div className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.85)]" />
                    <div className="mt-2 ml-4 max-w-[180px] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
                        <div className="text-[13px] font-semibold leading-[1.05]">
                            {locationName || 'Локация сбора'}
                        </div>
                        {coordinatesLabel ? (
                            <div className="mt-1 font-mono text-[10px] tracking-[0.16em] text-white/74">
                                {coordinatesLabel}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function getCameraPosition(lat: number | null, lng: number | null): [number, number, number] {
    if (lat == null || lng == null) {
        return DEFAULT_CAMERA_POSITION;
    }

    return toSpherePosition(lat, lng, FOCUSED_CAMERA_RADIUS);
}

function toSpherePosition(lat: number, lng: number, radius: number): [number, number, number] {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return [x, y, z];
}

function formatCoordinates(lat: number | null, lng: number | null): string | null {
    if (lat == null || lng == null) {
        return null;
    }

    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
