import { Suspense, useMemo, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { ClonePageContent } from '../../shared/clonePageContent';
import { applyCloneTemplate } from '../../shared/clonePageContent';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Earth } from '../../components/Earth';
import { easing } from 'maath';

export type CloneItemView = {
    id: string;
    temp_id: string;
    public_token: string;
    photo_url: string;
    status: string;
    activation_date: string | null;
    batch: {
        gps_lat: number | null;
        gps_lng: number | null;
        video_url: string | null;
        created_at: string;
        owner?: {
            name: string;
        };
    };
};

const resolveMediaUrl = (value: string | null | undefined): string | null => {
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
    }
    return value;
};

type DigitalCloneViewProps = {
    item: CloneItemView;
    content: ClonePageContent;
    cloneUrl: string;
    previewMode?: boolean;
};

function CloneScene({ lat, lng }: { lat: number | null, lng: number | null }) {
    const [offsetX, setOffsetX] = useState(0);

    // Calculate offset based on window width after mount
    useEffect(() => {
        const handleResize = () => setOffsetX(window.innerWidth >= 1024 ? 1.0 : 0);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <>
            <ambientLight intensity={0.5} />
            <directionalLight position={[8, 3, 2]} intensity={2} />

            <group position={[offsetX, 0, 0]}>
                <Earth />
                {lat != null && lng != null && (
                    <CloneMarker lat={lat} lng={lng} offsetX={offsetX} />
                )}
            </group>

            <CloneCameraController lat={lat} lng={lng} offsetX={offsetX} />

            <OrbitControls
                enablePan={false}
                enableZoom={false}
                enableRotate={true}
                rotateSpeed={0.5}
                autoRotate={lat == null || lng == null}
                autoRotateSpeed={0.5}
                target={[offsetX, 0, 0]}
            />
        </>
    );
}

function CloneMarker({ lat, lng, offsetX }: { lat: number, lng: number, offsetX: number }) {
    const ref = useRef<HTMLDivElement>(null)

    const position = useMemo(() => {
        const phi = (90 - lat) * (Math.PI / 180)
        const theta = (lng + 180) * (Math.PI / 180)
        const radius = 1.001

        const x = -(radius * Math.sin(phi) * Math.cos(theta))
        const z = (radius * Math.sin(phi) * Math.sin(theta))
        const y = (radius * Math.cos(phi))

        return new THREE.Vector3(x, y, z)
    }, [lat, lng])

    useFrame(({ camera }) => {
        if (!ref.current) return
        const camFromCenter = camera.position.clone().sub(new THREE.Vector3(offsetX, 0, 0)).normalize();
        const posDir = position.clone().normalize();

        const dot = camFromCenter.dot(posDir)

        let opacity = 0
        if (dot > 0.2) {
            opacity = 1
        } else if (dot < -0.1) {
            opacity = 0
        } else {
            opacity = (dot + 0.1) / 0.3
        }

        ref.current.style.opacity = opacity.toString()
        ref.current.style.pointerEvents = opacity > 0.1 ? 'auto' : 'none'
    })

    return (
        <group position={position}>
            <Html center style={{ pointerEvents: 'none' }}>
                <div
                    ref={ref}
                    className="relative select-none transition-opacity duration-300"
                    style={{ width: '0px', height: '0px', opacity: 1 }}
                >
                    <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-400 border-2 border-white shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
                    <svg width="120" height="40" className="absolute top-0 left-0 overflow-visible pointer-events-none" style={{ transform: 'translate(0px, -20px)' }}>
                        <path d="M 1 20 L 15 5 L 100 5" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400" />
                    </svg>
                    <div className="absolute left-[15px] bottom-[15px] text-xs font-bold whitespace-nowrap px-1 text-white uppercase tracking-[0.1em] drop-shadow-md">
                        Место добычи
                    </div>
                </div>
            </Html>
        </group>
    )
}

function CloneCameraController({ lat, lng, offsetX }: { lat: number | null, lng: number | null, offsetX: number }) {
    const [startAnim, setStartAnim] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setStartAnim(true), 500);
        return () => clearTimeout(timer);
    }, []);

    useFrame((state, delta) => {
        if (startAnim && lat != null && lng != null) {
            const phi = (90 - lat) * (Math.PI / 180)
            const theta = (lng + 180) * (Math.PI / 180)
            const distance = 2.0

            const x = -(distance * Math.sin(phi) * Math.cos(theta)) + offsetX
            const z = (distance * Math.sin(phi) * Math.sin(theta))
            const y = (distance * Math.cos(phi))

            const targetPos = new THREE.Vector3(x, y, z)

            const dist = state.camera.position.distanceTo(targetPos)
            if (dist > 0.01) {
                easing.damp3(state.camera.position, targetPos, 0.5, delta)
            }
            state.camera.lookAt(offsetX, 0, 0)
        } else {
            const currentDist = state.camera.position.distanceTo(new THREE.Vector3(offsetX, 0, 0))
            if (currentDist < 3.4) {
                const dir = state.camera.position.clone().sub(new THREE.Vector3(offsetX, 0, 0)).normalize()
                const targetPos = dir.multiplyScalar(3.5).add(new THREE.Vector3(offsetX, 0, 0))
                easing.damp3(state.camera.position, targetPos, 0.5, delta)
                state.camera.lookAt(offsetX, 0, 0)
            }
        }
    })
    return null;
}

export function DigitalCloneView({ item, content, cloneUrl, previewMode = false }: DigitalCloneViewProps) {
    const [copied, setCopied] = useState(false);
    const videoUrl = useMemo(() => resolveMediaUrl(item.batch.video_url), [item.batch.video_url]);

    const heroTitle = applyCloneTemplate(content.hero_title_template, {
        temp_id: item.temp_id,
        token: item.public_token,
        status: item.status,
        partner: item.batch.owner?.name ?? ''
    });

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(cloneUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (_error) {
            setCopied(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-gray-100 flex flex-col relative overflow-hidden">
            <div className="absolute inset-0 z-0">
                <Canvas camera={{ position: [0, 0, 3.5], fov: 45 }}>
                    <Suspense fallback={null}>
                        <CloneScene lat={item.batch.gps_lat} lng={item.batch.gps_lng} />
                    </Suspense>
                </Canvas>
            </div>

            <header className="relative z-10 border-b border-white/10 backdrop-blur-md bg-black/40">
                <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
                    <Link to="/" className="text-xl font-bold tracking-[0.18em] text-white">
                        STONES
                    </Link>
                    <span className="text-xs uppercase tracking-[0.22em] text-blue-400">{content.hero_badge}</span>
                </div>
            </header>

            <main className="relative z-10 mx-auto w-full max-w-7xl px-4 md:px-6 py-6 lg:py-10 flex-1 flex flex-col lg:flex-row gap-6 lg:gap-8 xl:gap-12 pointer-events-none">
                <div className="w-full lg:w-[50%] xl:w-[45%] shrink-0 flex flex-col pointer-events-auto">
                    <div className="mb-6 lg:mb-8 p-5 lg:p-6 rounded-3xl bg-black/20 backdrop-blur-md border border-white/5">
                        <h1 className="text-4xl md:text-5xl font-semibold text-white leading-tight drop-shadow-md">{heroTitle}</h1>
                        <p className="mt-4 text-gray-300 text-base md:text-lg drop-shadow">{content.hero_description}</p>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-md p-4 lg:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
                        <h2 className="text-lg font-semibold text-white mb-4 ml-1">{content.video_heading}</h2>
                        <div className="rounded-2xl overflow-hidden bg-gray-950 border border-white/10 flex items-center justify-center relative aspect-[9/16] max-h-[70vh] lg:max-h-none lg:h-[500px] xl:h-[650px]">
                            {videoUrl ? (
                                <video
                                    src={videoUrl}
                                    controls
                                    playsInline
                                    className="absolute inset-0 w-full h-full object-cover bg-black"
                                />
                            ) : (
                                <div className="p-8 flex items-center justify-center text-gray-500 text-center">
                                    {content.video_empty_text}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="w-full lg:w-[35%] xl:w-[32%] lg:ml-auto space-y-6 mt-4 lg:mt-64 pointer-events-auto">
                    <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-md p-5 lg:p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-white mb-4">{content.details_heading}</h2>
                        <div className="flex flex-col text-sm space-y-3">
                            <InfoRow label={content.field_token_label} value={item.public_token} mono />
                            <InfoRow label={content.field_status_label} value={item.status} />
                            <InfoRow label={content.field_activation_label} value={item.activation_date ? new Date(item.activation_date).toLocaleString('ru-RU') : 'Не активирован'} />
                            <InfoRow
                                label={content.field_coords_label}
                                value={(item.batch.gps_lat != null && item.batch.gps_lng != null)
                                    ? `${item.batch.gps_lat.toFixed(5)}, ${item.batch.gps_lng.toFixed(5)}`
                                    : 'Не указаны'}
                            />
                            <InfoRow label={content.field_batch_date_label} value={new Date(item.batch.created_at).toLocaleDateString('ru-RU')} />
                        </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-md p-5 lg:p-6 space-y-4 shadow-xl">
                        <h2 className="text-lg font-semibold text-blue-400">{content.authenticity_heading}</h2>
                        <p className="text-sm text-gray-300 leading-relaxed">{content.authenticity_text}</p>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">{content.link_label}</p>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 bg-black/40 rounded-lg px-3 py-2 text-xs text-gray-300 truncate font-mono border border-white/5">
                                    {cloneUrl}
                                </div>
                                <button
                                    onClick={() => void handleCopyLink()}
                                    disabled={previewMode}
                                    className="px-4 py-2 text-xs rounded-lg bg-blue-600/20 hover:bg-blue-500/40 border border-blue-500/30 text-blue-50 disabled:opacity-50 transition-colors whitespace-nowrap font-medium"
                                >
                                    {copied ? content.copied_button_text : content.copy_button_text}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex flex-col border-b border-white/5 pb-3 last:border-0 last:pb-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</p>
            <p className={`text-sm text-white break-words ${mono ? 'font-mono tracking-wider' : ''}`}>{value}</p>
        </div>
    );
}
