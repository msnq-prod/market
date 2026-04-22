import { Canvas, useFrame, useThree } from '@react-three/fiber';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { PlanetSphere } from '../../components/PlanetSphere';
import { persistAuthSession } from '../../utils/session';
import { hasWebGLSupport } from '../../utils/webgl';
import { partnerControlClassName } from '../components/ui';

type LoginPortal = 'partner' | 'admin';

type LoginProps = {
    portal?: LoginPortal;
};

type LoginLocationState = {
    from?: {
        pathname?: string;
    };
};

const ADMIN_LOGIN_CAMERA_POSITION: [number, number, number] = [
    -1.7057780567874519,
    2.3921494680329234,
    -1.902088889503387
];

function AdminLoginCameraRig() {
    const camera = useThree((state) => state.camera);

    useEffect(() => {
        camera.position.set(...ADMIN_LOGIN_CAMERA_POSITION);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
    }, [camera]);

    return null;
}

function AdminLoginPlanet() {
    const planetRef = useRef<THREE.Group>(null);

    useFrame((_, delta) => {
        if (!planetRef.current) return;

        planetRef.current.rotation.y += delta * 0.015;
    });

    return (
        <>
            <ambientLight intensity={0.46} />
            <directionalLight position={ADMIN_LOGIN_CAMERA_POSITION} intensity={4.2} />
            <directionalLight position={[3, -2, 4]} intensity={0.34} color="#d7dde8" />
            <group ref={planetRef} scale={1.45}>
                <PlanetSphere />
            </group>
        </>
    );
}

function AdminLoginBackdrop() {
    const [hasWebGL] = useState(() => hasWebGLSupport());

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#030406]" aria-hidden="true">
            {hasWebGL ? (
                <Canvas
                    camera={{ position: ADMIN_LOGIN_CAMERA_POSITION, fov: 45, near: 0.1, far: 20 }}
                    dpr={[1, 1.25]}
                    gl={{ antialias: true, alpha: true, powerPreference: 'low-power', stencil: false }}
                    className="translate-x-[8vw] opacity-100 brightness-[1.45] contrast-[1.12] saturate-[0.55]"
                >
                    <AdminLoginCameraRig />
                    <Suspense fallback={null}>
                        <AdminLoginPlanet />
                    </Suspense>
                </Canvas>
            ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,_rgba(255,255,255,0.05),_transparent_26%),linear-gradient(180deg,_#07080b_0%,_#020304_100%)]" />
            )}

            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,_transparent_0,_transparent_44%,_rgba(3,4,6,0.46)_86%,_#030406_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(115deg,_rgba(3,4,6,0.9)_0%,_rgba(3,4,6,0.42)_38%,_rgba(3,4,6,0.12)_62%,_rgba(3,4,6,0.78)_100%)] backdrop-blur-[4px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_32%_22%,_rgba(255,255,255,0.045),_transparent_28%),radial-gradient(circle_at_72%_78%,_rgba(255,255,255,0.035),_transparent_30%)]" />
        </div>
    );
}

export function Login({ portal = 'partner' }: LoginProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const isAdminPortal = portal === 'admin';
    const title = isAdminPortal ? 'Админ-панель HQ' : 'Партнерский кабинет';
    const subtitle = isAdminPortal
        ? 'Войдите для управления HQ или очередью продаж'
        : 'Войдите для управления своими партиями';
    const deniedMessage = isAdminPortal
        ? 'Доступ запрещён. Нужна учетная запись администратора, менеджера HQ или менеджера продаж.'
        : 'Доступ запрещён. Нужен партнерский или staff-аккаунт.';

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка входа');
            }

            const isStaff = data.role === 'ADMIN' || data.role === 'MANAGER' || data.role === 'SALES_MANAGER';
            const isFranchisee = data.role === 'FRANCHISEE';

            if (isAdminPortal && !isStaff) {
                throw new Error(deniedMessage);
            }

            if (!isStaff && !isFranchisee) {
                throw new Error(deniedMessage);
            }

            persistAuthSession({
                accessToken: data.accessToken,
                role: data.role,
                name: data.name
            });

            if (isStaff) {
                const fromPath = (location.state as LoginLocationState | null)?.from?.pathname;
                const staffTarget = fromPath?.startsWith('/admin') ? fromPath : '/admin';
                navigate(staffTarget, { replace: true });
                return;
            }

            navigate('/partner/dashboard', { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка входа');
        } finally {
            setLoading(false);
        }
    };

    const form = (
        <form onSubmit={handleLogin} className="space-y-6">
            <div>
                <label className={isAdminPortal ? 'mb-2 block text-sm font-medium text-slate-200' : 'mb-2 block text-sm font-medium text-gray-400'}>Email</label>
                <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={isAdminPortal
                        ? 'w-full rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-all placeholder:text-slate-400 focus:border-sky-300/70 focus:bg-white/[0.11] focus:shadow-[0_0_0_4px_rgba(125,211,252,0.14),inset_0_1px_0_rgba(255,255,255,0.1)]'
                        : partnerControlClassName}
                    style={isAdminPortal
                        ? { colorScheme: 'dark', WebkitTextFillColor: '#ffffff', caretColor: '#ffffff' }
                        : { colorScheme: 'dark', WebkitTextFillColor: '#ffffff', caretColor: '#ffffff' }}
                    placeholder={isAdminPortal ? '' : 'yakutia.partner@stones.com'}
                    autoComplete="email"
                />
            </div>

            <div>
                <label className={isAdminPortal ? 'mb-2 block text-sm font-medium text-slate-200' : 'mb-2 block text-sm font-medium text-gray-400'}>Пароль</label>
                <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={isAdminPortal
                        ? 'w-full rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-all placeholder:text-slate-400 focus:border-sky-300/70 focus:bg-white/[0.11] focus:shadow-[0_0_0_4px_rgba(125,211,252,0.14),inset_0_1px_0_rgba(255,255,255,0.1)]'
                        : partnerControlClassName}
                    style={isAdminPortal
                        ? { colorScheme: 'dark', WebkitTextFillColor: '#ffffff', caretColor: '#ffffff' }
                        : { colorScheme: 'dark', WebkitTextFillColor: '#ffffff', caretColor: '#ffffff' }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className={isAdminPortal
                    ? 'inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-[0_18px_45px_rgba(0,0,0,0.32)] transition-all duration-200 hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none'
                    : 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-medium text-[#18181b] shadow-[0_18px_38px_rgba(0,0,0,0.22)] transition duration-200 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 disabled:cursor-not-allowed disabled:opacity-50'}
            >
                {loading ? 'Вход...' : 'Войти'}
            </button>
        </form>
    );

    if (isAdminPortal) {
        return (
            <div className="relative min-h-screen overflow-hidden bg-[#030406] px-4 py-10 text-white">
                <AdminLoginBackdrop />

                <div className="relative z-10 flex min-h-[calc(100svh-5rem)] items-center justify-center">
                    <div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-black/[0.36] p-8 shadow-[0_28px_90px_rgba(0,0,0,0.62)] backdrop-blur-2xl">
                        <div className="mb-8 text-center">
                            <h1 className="text-3xl font-bold text-white">{title}</h1>
                            <p className="mt-2 text-slate-300">{subtitle}</p>
                        </div>

                        {error && (
                            <div className="mb-6 rounded-lg border border-red-300/20 bg-red-500/12 p-3 text-sm text-red-100">
                                {error}
                            </div>
                        )}

                        {form}

                        <div className="mt-6 text-center text-sm text-slate-400">
                            Если нужен аккаунт, обратитесь к администратору.
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="partner-shell flex min-h-screen items-center justify-center px-4 py-10 text-white">
            <div className="admin-panel w-full max-w-md rounded-[28px] p-8">
                <div className="mb-8 text-center">
                    <span className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-xl font-semibold text-blue-100">
                        P
                    </span>
                    <h1 className="text-3xl font-semibold text-white">{title}</h1>
                    <p className="mt-2 text-gray-500">{subtitle}</p>
                </div>

                {error && (
                    <div className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
                        {error}
                    </div>
                )}

                {form}

                <div className="mt-6 text-center text-sm text-gray-500">
                    Если нужен аккаунт, обратитесь к администратору.
                </div>
            </div>
        </div>
    );
}
