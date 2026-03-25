import { motion } from 'framer-motion';
import type { Product } from '../data/db';
import { useStore } from '../store';
import { getLocalizedValue } from '../utils/language';
import { formatRub } from '../utils/currency';
import { MarketplaceButtons } from './MarketplaceButtons';

export function ProductListSection() {
    const { selectedLocation, addToCart, language } = useStore();

    if (!selectedLocation || !selectedLocation.products) return null;

    return (
        <section id="products" className="relative z-10 w-full min-h-screen bg-black/30 backdrop-blur-md border-t border-white/10 text-white mt-[80vh] pt-20 px-6 pb-20 pointer-events-auto">
            <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {selectedLocation.products.map((product) => (
                        <ProductCard key={product.id} product={product} addToCart={addToCart} language={language} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function ProductCard({ product, addToCart, language }: { product: Product, addToCart: (p: Product) => void, language: number }) {
    const categoryLabel = product.category
        ? getLocalizedValue(product.category, 'name', language)
        : '';
    const name = getLocalizedValue(product, 'name', language);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/50 transition-all duration-300 hover:border-blue-500/50"
        >
            <div className="aspect-[4/3] overflow-hidden relative">
                <img src={product.image} alt={name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
            </div>
            <div className="flex flex-1 flex-col p-6">
                <h3 className="font-bold text-lg mb-1">{name}</h3>
                <p className="text-sm text-white/60 mb-3">{getLocalizedValue(product, 'description', language)}</p>
                <div className="flex justify-between items-center">
                    <span className="text-blue-400 font-medium">{formatRub(product.price)}</span>
                    <span className="text-xs px-2 py-1 bg-white/10 rounded">{categoryLabel}</span>
                </div>
                <div className="mt-auto pt-6">
                    <button
                        onClick={() => addToCart(product)}
                        className="w-full rounded-lg bg-white/5 py-3 text-xs font-medium uppercase tracking-wide text-white transition-all hover:bg-blue-600"
                    >
                        В корзину
                    </button>
                    <MarketplaceButtons
                        wildberriesUrl={product.wildberries_url}
                        ozonUrl={product.ozon_url}
                        className="mt-3"
                    />
                </div>
            </div>
        </motion.div>
    )
}
