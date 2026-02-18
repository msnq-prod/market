import { motion } from 'framer-motion';
import { useStore } from '../store';
import { getLocalizedValue } from '../utils/language';

export function LocationInfoSection() {
    const { selectedLocation, language } = useStore();

    if (!selectedLocation) return null;

    const descriptions: Record<number, string> = {
        1: "Откройте редкие артефакты и ресурсы, уникальные для этого региона. Наши местные партнеры гарантируют этичное происхождение и проверку подлинности.",
        2: "Откройте для себя редкие артефакты и ресурсы, уникальные для этого региона. Наши местные партнеры гарантируют, что каждый предмет получен этичным путем и проверен на подлинность."
    };

    return (
        <section className="relative z-10 w-full text-white pt-32 pb-0 px-6 pointer-events-auto">
            <div className="max-w-4xl mx-auto text-center">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    className="text-5xl md:text-7xl font-light mb-4"
                >
                    {getLocalizedValue(selectedLocation, 'name', language)}
                </motion.h2>
                <div className="flex flex-col items-center gap-4">
                    <p className="text-xl text-blue-400 font-mono tracking-widest uppercase">{getLocalizedValue(selectedLocation, 'country', language)}</p>
                    <div className="flex gap-4 text-xs text-gray-500 font-mono">
                        <span>ШИР: {selectedLocation.lat.toFixed(4)}</span>
                        <span>ДОЛГ: {selectedLocation.lng.toFixed(4)}</span>
                    </div>
                </div>
                {/* Add a description mock if not in DB yet, or use what we have */}
                <p className="mt-8 text-gray-300 max-w-2xl mx-auto leading-relaxed">
                    {descriptions[language] || descriptions[2]}
                </p>
            </div>
        </section>
    );
}
