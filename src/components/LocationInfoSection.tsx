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
        <section className="pointer-events-none relative z-10 min-h-[100svh] w-full text-white">
            <div className="absolute inset-x-0 top-0 h-[100svh] px-4 pt-28 sm:px-6 md:px-6 md:pt-36">
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
                </div>
                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    data-testid="location-description"
                    style={{ top: 'var(--selected-location-description-top, 68svh)', transform: 'translateY(-50%)' }}
                    className="absolute left-4 right-4 mx-auto max-w-2xl text-center leading-relaxed text-gray-300 sm:left-6 sm:right-6"
                >
                    {description}
                </motion.p>
            </div>
        </section>
    );
}
