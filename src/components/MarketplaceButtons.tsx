type MarketplaceButtonsProps = {
    wildberriesUrl?: string | null;
    ozonUrl?: string | null;
    className?: string;
};

type MarketplaceButtonProps = {
    label: string;
    href?: string | null;
    className: string;
    accentClassName?: string;
};

function MarketplaceButton({ label, href, className, accentClassName }: MarketplaceButtonProps) {
    return (
        <button
            type="button"
            disabled={!href}
            onClick={() => {
                if (!href) {
                    return;
                }
                window.open(href, '_blank', 'noopener,noreferrer');
            }}
            className={[
                'relative flex-1 overflow-hidden rounded-lg px-3 py-2 text-sm font-semibold text-white transition-all',
                'disabled:cursor-not-allowed disabled:opacity-40',
                href ? 'hover:-translate-y-0.5 hover:shadow-lg' : '',
                className
            ].join(' ')}
        >
            {accentClassName ? (
                <span className={`pointer-events-none absolute inset-y-0 right-0 w-8 ${accentClassName}`} aria-hidden="true" />
            ) : null}
            <span className="relative z-10">{label}</span>
        </button>
    );
}

export function MarketplaceButtons({ wildberriesUrl, ozonUrl, className = '' }: MarketplaceButtonsProps) {
    return (
        <div className={`flex items-center gap-2 ${className}`.trim()}>
            <MarketplaceButton
                label="wb"
                href={wildberriesUrl}
                className="bg-[linear-gradient(135deg,#7a00ff_0%,#d91cff_100%)] text-base font-black tracking-tight shadow-[0_10px_30px_rgba(168,31,255,0.28)]"
            />
            <MarketplaceButton
                label="ozon"
                href={ozonUrl}
                className="bg-[linear-gradient(135deg,#005bff_0%,#1877ff_100%)] text-base tracking-tight shadow-[0_10px_30px_rgba(0,91,255,0.28)]"
                accentClassName="bg-[#ff225f] [clip-path:polygon(40%_0,100%_0,100%_100%,0_100%)]"
            />
        </div>
    );
}
