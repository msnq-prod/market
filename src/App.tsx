import { Canvas } from '@react-three/fiber'
import { OrbitControls as DreiOrbitControls } from '@react-three/drei'
import React, { Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Earth } from './components/Earth'
import { Markers } from './components/Markers'
import { CameraController } from './components/CameraController'
import { UIOverlay } from './components/UIOverlay'
import { AboutSection } from './components/AboutSection'
import { ProductListSection } from './components/ProductListSection'
import { LocationInfoSection } from './components/LocationInfoSection'
import { LoadingScreen } from './components/LoadingScreen'
import { AdminLayout } from './admin/components/AdminLayout'
import { AdminFullscreenRoute } from './admin/components/AdminFullscreenRoute'
import { Dashboard } from './admin/pages/Dashboard'
import { Locations } from './admin/pages/Locations'
import { Products } from './admin/pages/Products'
import { useStore } from './store'

type StonesDebugWindow = Window & {
  __STONES_DEBUG__?: {
    orbit?: {
      getAngles: () => {
        azimuthalAngle: number | null
        polarAngle: number | null
        touchAction: string | null
      }
    }
  }
}

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'auto' })
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const sync = (event?: MediaQueryListEvent) => {
      setIsMobile(event ? event.matches : mediaQuery.matches)
    }

    sync()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', sync)
      return () => mediaQuery.removeEventListener('change', sync)
    }

    mediaQuery.addListener(sync)
    return () => mediaQuery.removeListener(sync)
  }, [])

  return isMobile
}

function GlobeOrbitControls({ touchAction }: { touchAction: 'pan-y' | 'none' }) {
  const selectedLocation = useStore((state) => state.selectedLocation)
  const clearSelection = useStore((state) => state.clearSelection)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  useEffect(() => {
    const domElement = controlsRef.current?.domElement
    if (!domElement) return

    domElement.style.touchAction = touchAction
  }, [touchAction])

  useEffect(() => {
    if (!import.meta.env.DEV) return

    const debugWindow = window as StonesDebugWindow
    debugWindow.__STONES_DEBUG__ ??= {}
    debugWindow.__STONES_DEBUG__.orbit = {
      getAngles: () => ({
        azimuthalAngle: controlsRef.current?.getAzimuthalAngle() ?? null,
        polarAngle: controlsRef.current?.getPolarAngle() ?? null,
        touchAction
      })
    }

    return () => {
      if (debugWindow.__STONES_DEBUG__) {
        delete debugWindow.__STONES_DEBUG__.orbit
      }
    }
  }, [touchAction])

  return (
    <DreiOrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={false}
      enableRotate={true}
      rotateSpeed={0.5}
      autoRotate={!selectedLocation}
      autoRotateSpeed={0.5}
      onStart={() => {
        if (useStore.getState().selectedLocation) {
          clearSelection()
        }
      }}
    />
  )
}

function Scene() {
  const isMobile = useIsMobileViewport()

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 3, 2]} intensity={2} />

      <group>
        <Earth />
        <Markers />
      </group>

      <CameraController />

      <GlobeOrbitControls touchAction={isMobile ? 'pan-y' : 'none'} />
    </>
  )
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className="text-white p-10 text-center"><h1>Произошла ошибка.</h1><button onClick={() => window.location.reload()} className="bg-blue-500 px-4 py-2 mt-4 rounded">Перезагрузить</button></div>;
    }

    return this.props.children;
  }
}

const INITIAL_CAMERA_POSITION: [number, number, number] = [
  -1.7057780567874519,
  2.3921494680329234,
  -1.902088889503387
]

function MainApp() {
  const fetchLocations = useStore((state) => state.fetchLocations)
  const selectedLocation = useStore((state) => state.selectedLocation)
  const [showOverviewDelayed, setShowOverviewDelayed] = React.useState(true)

  useEffect(() => {
    void fetchLocations()
  }, [fetchLocations])

  useEffect(() => {
    if (selectedLocation) {
      scrollToTop()
      // keep update async to avoid synchronous setState in effect
      const timer = setTimeout(() => setShowOverviewDelayed(false), 0)
      return () => clearTimeout(timer)
    } else {
      scrollToTop()
      // Delay showing About text so it fades/appears nicely after zoom out starts
      const timer = setTimeout(() => setShowOverviewDelayed(true), 600)
      return () => clearTimeout(timer)
    }
  }, [selectedLocation])

  return (
    <div className="relative w-full min-h-[100svh] overflow-x-clip bg-black">
      <LoadingScreen />

      <div className="fixed inset-0 z-0">
        <ErrorBoundary>
          <Canvas
            camera={{ position: INITIAL_CAMERA_POSITION, fov: 45 }}
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white/70">
                3D-сцена недоступна в этом браузере
              </div>
            }
          >
            <Suspense fallback={null}>
              <Scene />
            </Suspense>
          </Canvas>
        </ErrorBoundary>
      </div>

      <div className="relative z-10 pointer-events-none">
        <UIOverlay />

        {!selectedLocation && <div className="h-[100svh] pointer-events-none" />}

        <LocationInfoSection />
        <ProductListSection />
        {!selectedLocation && showOverviewDelayed && <AboutSection />}
      </div>
    </div>
  )
}

import { PartnerLayout } from './partner/components/PartnerLayout'
import { Login as PartnerLogin } from './partner/pages/Login'
import { Dashboard as PartnerDashboard } from './partner/pages/Dashboard'
import { Batches as PartnerBatches } from './partner/pages/Batches'
import { CreateBatch } from './partner/pages/CreateBatch'
import { QrCenter } from './partner/pages/QrCenter'
import { QrPrint } from './partner/pages/QrPrint'
import { Finance } from './partner/pages/Finance'
import { Acceptance } from './admin/pages/Acceptance'
import { Allocation } from './admin/pages/Allocation'
import { Users } from './admin/pages/Users'
import { DigitalClone } from './public/pages/DigitalClone'
import { CloneContent } from './admin/pages/CloneContent'
import { Warehouse } from './admin/pages/Warehouse'
import { Orders } from './admin/pages/Orders'
import { VideoTool } from './admin/pages/VideoTool'

function App() {
  return (
    <BrowserRouter>
        <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/clone/:publicToken" element={<DigitalClone />} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={<PartnerLogin portal="admin" />} />
        <Route
          path="/admin/video-tool/:batchId"
          element={(
            <AdminFullscreenRoute>
              <VideoTool />
            </AdminFullscreenRoute>
          )}
        />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="locations" element={<Locations />} />
          <Route path="products" element={<Products />} />
          <Route path="acceptance" element={<Acceptance />} />
          <Route path="allocation" element={<Allocation />} />
          <Route path="warehouse" element={<Warehouse />} />
          <Route path="users" element={<Users />} />
          <Route path="clone-content" element={<CloneContent />} />
        </Route>

        {/* Partner Routes */}
        <Route path="/partner" element={<PartnerLayout />}>
          <Route path="login" element={<PartnerLogin portal="partner" />} />
          <Route path="dashboard" element={<PartnerDashboard />} />
          <Route path="batches" element={<PartnerBatches />} />
          <Route path="batches/new" element={<CreateBatch />} />
          <Route path="qr" element={<QrCenter />} />
          <Route path="qr/print" element={<QrPrint />} />
          <Route path="finance" element={<Finance />} />
          <Route index element={<PartnerDashboard />} />
        </Route>

      </Routes>
    </BrowserRouter>
  )
}

export default App
