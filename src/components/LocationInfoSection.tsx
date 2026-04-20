import { motion } from 'framer-motion';
import { useStore } from '../store';
import { getLocalizedValue } from '../utils/language';

import { useState, useEffect } from 'react';

export function LocationInfoSection() {
    const { selectedLocation, language } = useStore();
    const [displayLocation, setDisplayLocation] = useState(selectedLocation);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (selectedLocation) {
            timer = setTimeout(() => setDisplayLocation(selectedLocation), 300);
        } else {
            timer = setTimeout(() => setDisplayLocation(null), 150);
        }
        return () => clearTimeout(timer);
    }, [selectedLocation]);

    if (!displayLocation) return null;
    const description = getLocalizedValue(displayLocation, 'description', language);

    return (
        <section className="pointer-events-none relative z-10 flex min-h-[100svh] w-full items-end px-4 pb-6 pt-28 text-white sm:px-6 md:items-start md:px-6 md:pb-0 md:pt-28">
            <div className="mx-auto flex w-full max-w-4xl flex-col px-5 py-6 text-left md:items-center md:justify-start md:px-0 md:py-0 md:text-center">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    className="mb-3 text-3xl font-light leading-tight sm:text-4xl md:mb-4 md:text-7xl"
                >
                    {getLocalizedValue(displayLocation, 'name', language)}
                </motion.h2>
                <div className="flex flex-col gap-3 md:items-center md:gap-4">
                    <p className="text-sm font-mono tracking-[0.28em] text-blue-400 uppercase sm:text-base md:text-xl">{getLocalizedValue(displayLocation, 'country', language)}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-mono text-gray-400 md:text-xs md:text-gray-500">
                        <span>ШИР: {displayLocation.lat.toFixed(4)}</span>
                        <span>ДОЛГ: {displayLocation.lng.toFixed(4)}</span>
                    </div>
                </div>
                <p className="mt-24 max-w-2xl leading-relaxed text-gray-300 md:mx-auto md:mt-32 lg:mt-40">
                    {description}
                </p>
            </div>
        </section>
    );
}
