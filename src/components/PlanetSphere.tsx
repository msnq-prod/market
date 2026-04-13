import React from 'react'
import { useTexture } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

type PlanetSphereProps = {
  onClick?: (event: ThreeEvent<MouseEvent>) => void
}

export function PlanetSphere({ onClick }: PlanetSphereProps) {
  const [colorMap, normalMap] = useTexture([
    '/textures/earth_daymap.jpg',
    '/textures/earth_normal_map.jpg'
  ])

  return (
    <group>
      <mesh rotation={[0, 0, 0]} onClick={onClick}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial
          map={colorMap}
          normalMap={normalMap}
          metalness={0.1}
          roughness={0.7}
        />
      </mesh>

      <AtmosphereSprite />
    </group>
  )
}

function AtmosphereSprite() {
  const texture = React.useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext('2d')!

    const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256)
    gradient.addColorStop(0, 'rgba(77, 178, 255, 1)')
    gradient.addColorStop(0.75, 'rgba(77, 178, 255, 1)')
    gradient.addColorStop(0.8, 'rgba(100, 200, 255, 0.5)')
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
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  )
}
