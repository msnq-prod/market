import { useStore } from '../store'
import * as THREE from 'three'
import React, { useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { getLocalizedValue } from '../utils/language'
import type { Location } from '../data/db'

export function Markers() {
    const selectLocation = useStore((state) => state.selectLocation)
    const selectedLocation = useStore((state) => state.selectedLocation)
    const locations = useStore((state) => state.locations)
    const language = useStore((state) => state.language)

    return (
        <group>
            {locations.map((loc) => (
                <Marker
                    key={loc.id}
                    location={loc}
                    onClick={() => selectLocation(loc)}
                    isSelected={selectedLocation?.id === loc.id}
                    language={language}
                />
            ))}
        </group>
    )
}

const Marker = React.memo(function Marker({
    location,
    onClick,
    isSelected,
    language
}: {
    location: Location,
    onClick: () => void,
    isSelected: boolean,
    language: number
}) {
    const ref = useRef<HTMLDivElement>(null)

    // Calculate position on sphere
    const position = useMemo(() => {
        const phi = (90 - location.lat) * (Math.PI / 180)
        const theta = (location.lng + 180) * (Math.PI / 180)
        const radius = 1.001 // On surface

        const x = -(radius * Math.sin(phi) * Math.cos(theta))
        const z = (radius * Math.sin(phi) * Math.sin(theta))
        const y = (radius * Math.cos(phi))

        return new THREE.Vector3(x, y, z)
    }, [location.lat, location.lng])

    // Manual occlusion/fade logic
    useFrame(({ camera }) => {
        if (!ref.current) return

        // Get vector from camera to object (or just camera position if object is roughly at origin)
        // Since globe is at 0,0,0, checking dot product of (CameraPos) and (MarkerPos) works well.
        // Assuming camera orbits around 0,0,0.

        // Normalize positions to get direction vectors
        const camDir = camera.position.clone().normalize()
        const posDir = position.clone().normalize()

        // Dot product: 1 = interaction, 0 = 90 degrees/horizon, -1 = opposite side
        const dot = camDir.dot(posDir)

        // Define fade range
        // Visible > 0.15
        // Smoothly fade to 0 between 0.15 and -0.05
        // Fully hidden < -0.05

        // Let's tweak these:
        // Start fading earlier to avoid "pop" text
        // Range: [0.2, -0.1]

        let opacity = 0
        if (dot > 0.2) {
            opacity = 1
        } else if (dot < -0.1) {
            opacity = 0
        } else {
            // Map range [0.2, -0.1] to [1, 0]
            // Range width = 0.3
            // Dist from lower bound = dot - (-0.1) = dot + 0.1
            // Fraction = (dot + 0.1) / 0.3
            opacity = (dot + 0.1) / 0.3
        }

        // Apply styling directly for performance
        ref.current.style.opacity = opacity.toString()
        ref.current.style.pointerEvents = opacity > 0.1 ? 'auto' : 'none'

        // Scale effect based on selection is already in CSS classes, but we could add more here if needed.
    })

    // Fixed styling for now

    return (
        <group position={position}>
            <Html
                position={[0, 0, 0]}
                center
                // Removed built-in occlude to handle manually
                style={{
                    transition: 'transform 0.2s', // Removed opacity from CSS transition to avoid conflict with JS ref update
                    transform: 'scale(1)',
                    pointerEvents: 'none' // Wrapper has no events
                }}
            >
                <div
                    ref={ref}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`relative cursor-pointer group select-none transition-none`} // Removed transition-all/opacity from class to avoid conflict
                    style={{
                        width: '0px',
                        height: '0px',
                        opacity: 1 // Start visible
                    }}
                >
                    {/* The Dot */}
                    <div
                        className={`absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-black/50 transition-colors duration-200
                            ${isSelected ? 'bg-red-500 scale-125' : 'bg-white group-hover:bg-amber-400 group-hover:scale-125'}
                        `}
                    />

                    {/* The Connector Line (SVG) */}
                    <svg
                        width="120"
                        height="40"
                        className="absolute top-0 left-0 overflow-visible pointer-events-none"
                        style={{ transform: 'translate(0px, -20px)' }}
                    >
                        <path
                            d="M 1 20 L 15 5 L 100 5"
                            fill="none"
                            stroke="white"
                            strokeWidth="1"
                            className={`transition-colors duration-200 ${isSelected ? 'stroke-red-500' : 'group-hover:stroke-amber-400'}`}
                        />
                    </svg>

                    {/* The Label */}
                    <div
                        className={`absolute left-[15px] bottom-[15px] text-sm font-medium whitespace-nowrap transition-colors duration-200 px-1
                            ${isSelected ? 'text-red-500' : 'text-white group-hover:text-amber-400'}
                        `}
                    >
                        {getLocalizedValue(location, 'name', language)}
                    </div>
                </div>
            </Html>
        </group>
    )
})
