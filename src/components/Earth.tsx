import React, { useRef } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'

export function Earth() {
    const globeRef = useRef<THREE.Mesh>(null)
    const selectedLocation = useStore((state) => state.selectedLocation)
    const clearSelection = useStore((state) => state.clearSelection)

    const [colorMap, normalMap] = useTexture([
        '/textures/earth_daymap.jpg',
        '/textures/earth_normal_map.jpg'
    ])

    // Rotation is now handled by OrbitControls autoRotate in App.tsx to ensure sync with markers
    // useFrame((_, delta) => {
    //     if (globeRef.current && viewMode === 'WORLD') {
    //         globeRef.current.rotation.y += delta * 0.05
    //     }
    // })

    return (
        <group>
            {/* Earth Sphere */}
            <mesh
                ref={globeRef}
                rotation={[0, 0, 0]}
                onClick={(event) => {
                    if (!selectedLocation) return

                    event.stopPropagation()
                    clearSelection()
                }}
            >
                <sphereGeometry args={[1, 24, 24]} />
                <meshStandardMaterial
                    map={colorMap}
                    normalMap={normalMap}
                    metalness={0.1}
                    roughness={0.7}
                />
            </mesh>

            {/* Atmosphere Glow (Sprite behind the planet) */}
            <AtmosphereSprite />
        </group>
    )
}

function AtmosphereSprite() {
    // Generate glow texture only once
    const texture = React.useMemo(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 512
        canvas.height = 512
        const context = canvas.getContext('2d')!

        const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256)

        // Scale 2.5 -> Radius 1.25. Surface (R=1) is at 1/1.25 = 0.8

        // Core (hidden)
        gradient.addColorStop(0, 'rgba(77, 178, 255, 1)')
        gradient.addColorStop(0.75, 'rgba(77, 178, 255, 1)')

        // Surface start - softer, natural blue
        gradient.addColorStop(0.8, 'rgba(100, 200, 255, 0.5)')

        // Fast fade out for thin atmosphere
        gradient.addColorStop(0.9, 'rgba(100, 200, 255, 0.1)')
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

        context.fillStyle = gradient
        context.fillRect(0, 0, 512, 512)

        return new THREE.CanvasTexture(canvas)
    }, [])

    return (
        <sprite scale={[2.5, 2.5, 1]}>
            <spriteMaterial
                map={texture}
                transparent
                opacity={0.6} // Reduced global opacity for subtlety
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </sprite>
    )
}
