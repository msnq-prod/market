import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls as DreiOrbitControls } from '@react-three/drei'
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { Earth } from './components/Earth'
import { Markers } from './components/Markers'
import { CameraController } from './components/CameraController'
import { UIOverlay } from './components/UIOverlay'
import { AboutSection } from './components/AboutSection'
import { ProductListSection } from './components/ProductListSection'
import { LocationInfoSection } from './components/LocationInfoSection'
import { LoadingScreen } from './components/LoadingScreen'
import { ScrollToProductsHint } from './components/ScrollToProductsHint'
import { AdminLayout } from './admin/components/AdminLayout'
import { AdminFullscreenRoute } from './admin/components/AdminFullscreenRoute'
import { Dashboard } from './admin/pages/Dashboard'
import { Products } from './admin/pages/Products'
import { useStore } from './store'
import { hasWebGLSupport } from './utils/webgl'

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

type ScrollLockSnapshot = {
  bodyOverflow: string
  htmlOverflow: string
  bodyOverscrollBehavior: string
  htmlOverscrollBehavior: string
}

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'auto' })
}

const LIGHT_START_LONGITUDE = -40.35
const LIGHT_ORBIT_RADIUS = 12
const LIGHT_ORBIT_HEIGHT = 3.5
const LIGHT_ORBIT_SPEED = 0.08
const MAIN_SCENE_DPR: [number, number] = [1, 1.25]
const MAIN_SCENE_FPS = 30
const MOBILE_ORBIT_START_THRESHOLD = 5
const MOBILE_ORBIT_ROTATE_SPEED = 0.7
const MOBILE_ORBIT_MIN_POLAR_ANGLE = 0.25
const MOBILE_ORBIT_MAX_POLAR_ANGLE = Math.PI - 0.25

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

function useHasWebGLSupport() {
  const [hasSupport] = useState(() => hasWebGLSupport())
  return hasSupport
}

function OrbitingSunLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null)

  useFrame(({ clock }) => {
    if (!lightRef.current) return

    const angle = ((LIGHT_START_LONGITUDE + 180) * Math.PI) / 180 + clock.getElapsedTime() * LIGHT_ORBIT_SPEED
    const x = -LIGHT_ORBIT_RADIUS * Math.cos(angle)
    const z = LIGHT_ORBIT_RADIUS * Math.sin(angle)

    lightRef.current.position.set(x, LIGHT_ORBIT_HEIGHT, z)
  })

  return <directionalLight ref={lightRef} intensity={2.4} />
}

function SceneRenderTicker({ fps }: { fps: number }) {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const frameDuration = 1000 / fps
    let animationFrameId = 0
    let timeoutId: number | undefined

    const scheduleNextFrame = () => {
      timeoutId = window.setTimeout(() => {
        animationFrameId = window.requestAnimationFrame(() => {
          if (!document.hidden) {
            invalidate()
          }

          scheduleNextFrame()
        })
      }, frameDuration)
    }

    invalidate()
    scheduleNextFrame()

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [fps, invalidate])

  return null
}

function GlobeOrbitControls({ isMobile }: { isMobile: boolean }) {
  const selectedLocation = useStore((state) => state.selectedLocation)
  const clearSelection = useStore((state) => state.clearSelection)
  const invalidate = useThree((state) => state.invalidate)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const scrollLockRef = useRef<ScrollLockSnapshot | null>(null)
  const canvasTapRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const mobileGestureRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastY: number
    mode: 'pending' | 'orbit'
  } | null>(null)
  const touchAction = 'none'

  const unlockScroll = useCallback(() => {
    const snapshot = scrollLockRef.current
    if (!snapshot) return

    document.body.style.overflow = snapshot.bodyOverflow
    document.documentElement.style.overflow = snapshot.htmlOverflow
    document.body.style.overscrollBehavior = snapshot.bodyOverscrollBehavior
    document.documentElement.style.overscrollBehavior = snapshot.htmlOverscrollBehavior
    scrollLockRef.current = null
  }, [])

  const lockScroll = useCallback(() => {
    if (!isMobile || scrollLockRef.current) return

    scrollLockRef.current = {
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverscrollBehavior: document.body.style.overscrollBehavior,
      htmlOverscrollBehavior: document.documentElement.style.overscrollBehavior
    }

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.overscrollBehavior = 'none'
  }, [isMobile])

  useEffect(() => {
    const domElement = controlsRef.current?.domElement
    if (!domElement) return

    domElement.style.touchAction = touchAction
    domElement.style.overscrollBehavior = 'none'
  }, [touchAction])

  useEffect(() => {
    const domElement = controlsRef.current?.domElement
    if (!domElement) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary) return

      canvasTapRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const tap = canvasTapRef.current
      if (!tap || event.pointerId !== tap.pointerId) return

      if (Math.hypot(event.clientX - tap.startX, event.clientY - tap.startY) >= MOBILE_ORBIT_START_THRESHOLD) {
        tap.moved = true
      }
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (canvasTapRef.current?.pointerId === event.pointerId) {
        canvasTapRef.current = null
      }
    }

    const handleClick = () => {
      const tap = canvasTapRef.current
      canvasTapRef.current = null

      if (tap?.moved) return

      if (useStore.getState().selectedLocation) {
        clearSelection()
      }
    }

    domElement.addEventListener('pointerdown', handlePointerDown)
    domElement.addEventListener('pointermove', handlePointerMove)
    domElement.addEventListener('pointercancel', handlePointerCancel)
    domElement.addEventListener('click', handleClick)

    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown)
      domElement.removeEventListener('pointermove', handlePointerMove)
      domElement.removeEventListener('pointercancel', handlePointerCancel)
      domElement.removeEventListener('click', handleClick)
      canvasTapRef.current = null
    }
  }, [clearSelection])

  useEffect(() => {
    const domElement = controlsRef.current?.domElement
    if (!domElement || !isMobile) return

    const finishGesture = (pointerId?: number) => {
      if (pointerId !== undefined && mobileGestureRef.current && mobileGestureRef.current.pointerId !== pointerId) {
        return
      }

      mobileGestureRef.current = null
      unlockScroll()
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return

      mobileGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        mode: 'pending'
      }

      if (typeof domElement.setPointerCapture === 'function') {
        domElement.setPointerCapture(event.pointerId)
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const gesture = mobileGestureRef.current
      const controls = controlsRef.current
      if (!gesture || !controls || event.pointerType !== 'touch' || event.pointerId !== gesture.pointerId) return

      const totalDeltaX = event.clientX - gesture.startX
      const totalDeltaY = event.clientY - gesture.startY
      const absX = Math.abs(totalDeltaX)
      const absY = Math.abs(totalDeltaY)

      if (gesture.mode === 'pending') {
        if (Math.max(absX, absY) < MOBILE_ORBIT_START_THRESHOLD) return

        gesture.mode = 'orbit'
        if (useStore.getState().selectedLocation) {
          clearSelection()
        }
        lockScroll()
      }

      const deltaX = event.clientX - gesture.lastX
      const deltaY = event.clientY - gesture.lastY
      if (deltaX !== 0 || deltaY !== 0) {
        const rotationBase = Math.max(420, Math.min(domElement.clientWidth, domElement.clientHeight))
        const nextAzimuthalAngle =
          controls.getAzimuthalAngle() - ((2 * Math.PI * deltaX) / rotationBase) * MOBILE_ORBIT_ROTATE_SPEED
        const nextPolarAngle = THREE.MathUtils.clamp(
          controls.getPolarAngle() - ((Math.PI * deltaY) / rotationBase) * MOBILE_ORBIT_ROTATE_SPEED,
          MOBILE_ORBIT_MIN_POLAR_ANGLE,
          MOBILE_ORBIT_MAX_POLAR_ANGLE
        )

        controls.setAzimuthalAngle(nextAzimuthalAngle)
        controls.setPolarAngle(nextPolarAngle)
        controls.update()
        gesture.lastX = event.clientX
        gesture.lastY = event.clientY
        invalidate()
      }

      event.preventDefault()
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (typeof domElement.releasePointerCapture === 'function' && domElement.hasPointerCapture(event.pointerId)) {
        domElement.releasePointerCapture(event.pointerId)
      }
      finishGesture(event.pointerId)
    }

    domElement.addEventListener('pointerdown', handlePointerDown)
    domElement.addEventListener('pointermove', handlePointerMove, { passive: false })
    domElement.addEventListener('pointerup', handlePointerUp)
    domElement.addEventListener('pointercancel', handlePointerUp)

    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown)
      domElement.removeEventListener('pointermove', handlePointerMove)
      domElement.removeEventListener('pointerup', handlePointerUp)
      domElement.removeEventListener('pointercancel', handlePointerUp)
      finishGesture()
    }
  }, [clearSelection, invalidate, isMobile, lockScroll, unlockScroll])

  useEffect(() => {
    return () => {
      const snapshot = scrollLockRef.current
      if (!snapshot) return

      document.body.style.overflow = snapshot.bodyOverflow
      document.documentElement.style.overflow = snapshot.htmlOverflow
      document.body.style.overscrollBehavior = snapshot.bodyOverscrollBehavior
      document.documentElement.style.overscrollBehavior = snapshot.htmlOverscrollBehavior
      scrollLockRef.current = null
    }
  }, [])

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
      minPolarAngle={MOBILE_ORBIT_MIN_POLAR_ANGLE}
      maxPolarAngle={MOBILE_ORBIT_MAX_POLAR_ANGLE}
      touches={isMobile ? { TWO: THREE.TOUCH.DOLLY_PAN } : undefined}
      autoRotate={!selectedLocation}
      autoRotateSpeed={0.15}
      onStart={() => {
        if (useStore.getState().selectedLocation) {
          clearSelection()
        }
      }}
      onEnd={() => {
        unlockScroll()
      }}
    />
  )
}

function Scene() {
  const isMobile = useIsMobileViewport()

  return (
    <>
      <ambientLight intensity={0.35} />
      <OrbitingSunLight />

      <group>
        <Earth />
        <Markers />
      </group>

      <CameraController />

      <GlobeOrbitControls isMobile={isMobile} />
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
  const clearSelection = useStore((state) => state.clearSelection)
  const [showOverviewDelayed, setShowOverviewDelayed] = React.useState(true)
  const hasWebGL = useHasWebGLSupport()
  const sceneContainerRef = useRef<HTMLDivElement | null>(null)

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

  const handleScenePointerMissed = useCallback(() => {
    if (useStore.getState().selectedLocation) {
      clearSelection()
    }
  }, [clearSelection])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node) || !sceneContainerRef.current?.contains(target)) return
      if (!useStore.getState().selectedLocation) return

      clearSelection()
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [clearSelection])

  return (
    <div className="relative w-full min-h-[100svh] overflow-x-clip bg-black">
      {hasWebGL && <LoadingScreen />}

      <div ref={sceneContainerRef} className="fixed inset-0 z-0">
        {hasWebGL ? (
          <ErrorBoundary>
            <Canvas
              camera={{ position: INITIAL_CAMERA_POSITION, fov: 45, near: 0.1, far: 20 }}
              dpr={MAIN_SCENE_DPR}
              frameloop="demand"
              gl={{ antialias: true, powerPreference: 'low-power', stencil: false }}
              performance={{ min: 0.75 }}
              onPointerMissed={handleScenePointerMissed}
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white/70">
                  3D-сцена недоступна в этом браузере
                </div>
              }
            >
              <SceneRenderTicker fps={MAIN_SCENE_FPS} />
              <Suspense fallback={null}>
                <Scene />
              </Suspense>
            </Canvas>
          </ErrorBoundary>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.24),_transparent_38%),linear-gradient(180deg,_#050816_0%,_#02040a_100%)] px-6 text-center text-white">
            <div className="max-w-xl rounded-3xl border border-white/10 bg-black/35 p-6 backdrop-blur-md">
              <h1 className="text-2xl font-semibold">3D-сцена недоступна</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                В этом браузере не удалось запустить WebGL. Попробуйте обновить страницу, включить аппаратное ускорение
                или открыть кабинет по прямой ссылке: <span className="font-mono text-white">/admin/login</span> или <span className="font-mono text-white">/partner/login</span>.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 pointer-events-none">
        <UIOverlay />
        <ScrollToProductsHint />

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
import { Finance } from './partner/pages/Finance'
import { Acceptance } from './admin/pages/Acceptance'
import { Allocation } from './admin/pages/Allocation'
import { Users } from './admin/pages/Users'
import { DigitalClone } from './public/pages/DigitalClone'
import { NotFound } from './public/pages/NotFound'
import { CloneContent } from './admin/pages/CloneContent'
import { Warehouse } from './admin/pages/Warehouse'
import { Orders } from './admin/pages/Orders'
import { Clients } from './admin/pages/Clients'
import { SalesInventory } from './admin/pages/SalesInventory'
import { SalesHistory } from './admin/pages/SalesHistory'
import { VideoTool } from './admin/pages/VideoTool'
import { PhotoTool } from './admin/pages/PhotoTool'
import { QrPrint as AdminQrPrint } from './admin/pages/QrPrint'
import { TelegramBots } from './admin/pages/TelegramBots'

function App() {
  return (
    <BrowserRouter>
        <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/clone/:serialNumber" element={<DigitalClone />} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={<PartnerLogin portal="admin" />} />
        <Route
          path="/admin/photo-tool/:batchId"
          element={(
            <AdminFullscreenRoute>
              <PhotoTool />
            </AdminFullscreenRoute>
          )}
        />
        <Route
          path="/admin/video-tool/:batchId"
          element={(
            <AdminFullscreenRoute>
              <VideoTool />
            </AdminFullscreenRoute>
          )}
        />
        <Route
          path="/admin/qr/print"
          element={(
            <AdminFullscreenRoute>
              <AdminQrPrint />
            </AdminFullscreenRoute>
          )}
        />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="clients" element={<Clients />} />
          <Route path="inventory" element={<SalesInventory />} />
          <Route path="sales-history" element={<SalesHistory />} />
          <Route path="locations" element={<Navigate to="/admin/products" replace />} />
          <Route path="products" element={<Products />} />
          <Route path="acceptance" element={<Acceptance />} />
          <Route path="allocation" element={<Allocation />} />
          <Route path="warehouse" element={<Warehouse />} />
          <Route path="users" element={<Users />} />
          <Route path="telegram-bots" element={<TelegramBots />} />
          <Route path="clone-content" element={<CloneContent />} />
        </Route>

        {/* Partner Routes */}
        <Route path="/partner" element={<PartnerLayout />}>
          <Route path="login" element={<PartnerLogin portal="partner" />} />
          <Route path="dashboard" element={<PartnerDashboard />} />
          <Route path="batches" element={<PartnerBatches />} />
          <Route path="batches/new" element={<CreateBatch />} />
          <Route path="finance" element={<Finance />} />
          <Route index element={<PartnerDashboard />} />
        </Route>
        <Route path="*" element={<NotFound />} />

      </Routes>
    </BrowserRouter>
  )
}

export default App
