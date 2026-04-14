import { useProgress } from '@react-three/drei';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';

export function LoadingScreen() {
    const { progress } = useProgress();
    const isDataLoading = useStore((state) => state.isLoading);

    // Loaded when 3D is 100% AND data is ready
    const isReady = progress === 100 && !isDataLoading;

    // Circumference for SVG circle
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <AnimatePresence>
            {!isReady && (
                <motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.8, ease: "easeInOut" } }}
                    // z-5: Above Canvas (z-0), Below UI (z-10).
                    // bg-black/20: Subtle dimming of globe.
                    // backdrop-blur-sm: Subtle blur to focus on loader.
                    className="pointer-events-none fixed inset-0 z-5 flex items-center justify-center bg-black/20 backdrop-blur-sm"
                >
                    <div className="relative flex flex-col items-center justify-center">
                        {/* Progress Circle SVG */}
                        <div className="relative w-24 h-24 flex items-center justify-center">
                            <svg className="transform -rotate-90 w-full h-full">
                                <circle
                                    cx="48"
                                    cy="48"
                                    r={radius}
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="transparent"
                                    className="text-white/10"
                                />
                                <motion.circle
                                    cx="48"
                                    cy="48"
                                    r={radius}
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="transparent"
                                    className="text-blue-500"
                                    strokeDasharray={circumference}
                                    initial={{ strokeDashoffset: circumference }}
                                    animate={{ strokeDashoffset }}
                                    transition={{ duration: 0.5 }}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <span className="absolute text-sm font-mono font-bold">{Math.round(progress)}%</span>
                        </div>

                        <div className="mt-4 text-xs font-mono tracking-widest text-blue-300">
                            {isDataLoading ? 'ИНИЦИАЛИЗАЦИЯ...' : 'ЗАГРУЗКА РЕСУРСОВ'}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
