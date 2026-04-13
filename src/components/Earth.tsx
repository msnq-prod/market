import { useStore } from '../store'
import { PlanetSphere } from './PlanetSphere'

export function Earth() {
    const selectedLocation = useStore((state) => state.selectedLocation)
    const clearSelection = useStore((state) => state.clearSelection)

    return (
        <PlanetSphere
            onClick={(event) => {
                if (!selectedLocation) return

                event.stopPropagation()
                clearSelection()
            }}
        />
    )
}
