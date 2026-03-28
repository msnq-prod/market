import { motion } from 'framer-motion';

export function AboutSection() {
    return (
        <section className="relative z-10 w-full min-h-[50vh] border-t border-white/10 bg-black/90 px-4 py-14 text-white backdrop-blur-md pointer-events-auto sm:px-6 md:py-20">
            <div className="max-w-4xl mx-auto text-center space-y-10">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="text-3xl font-light tracking-wide uppercase sm:text-4xl md:text-6xl"
                >
                    О проекте Orbital Market
                </motion.h2>
                <div className="w-20 h-1 bg-blue-500 mx-auto rounded-full" />
                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="text-base font-light leading-relaxed text-gray-400 sm:text-lg md:text-xl"
                >
                    Мы строим мост между редкими земными сокровищами и цифровым рынком.
                    Наша миссия: отбирать эксклюзивные артефакты, драгоценные камни и уникальные предметы
                    из самых удаленных уголков мира и делать их доступными коллекционерам.
                </motion.p>
                <div className="mt-12 grid grid-cols-1 gap-5 text-left md:mt-16 md:grid-cols-3 md:gap-8">
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-5 md:p-6">
                        <h3 className="mb-3 text-lg font-medium text-blue-400 md:mb-4 md:text-xl">Проверенное происхождение</h3>
                        <p className="text-sm text-gray-500">Каждый предмет проходит проверку и поступает напрямую от локальных мастеров и добытчиков.</p>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-5 md:p-6">
                        <h3 className="mb-3 text-lg font-medium text-purple-400 md:mb-4 md:text-xl">Глобальная логистика</h3>
                        <p className="text-sm text-gray-500">Надёжная доставка из удалённых локаций прямо до вашей двери.</p>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-5 md:p-6">
                        <h3 className="mb-3 text-lg font-medium text-green-400 md:mb-4 md:text-xl">Устойчивая торговля</h3>
                        <p className="text-sm text-gray-500">Мы придерживаемся этичных практик и справедливой оплаты для всех партнёров.</p>
                    </div>
                </div>
                <footer className="pt-12 text-sm text-gray-600 md:pt-20">
                    © 2024 Orbital Market. Все права защищены.
                </footer>
            </div>
        </section>
    );
}
