import type {
    ButtonHTMLAttributes,
    HTMLAttributes,
    InputHTMLAttributes,
    ReactNode,
    SelectHTMLAttributes
} from 'react';

export type PartnerTone = 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'muted' | 'slate';

const toneClasses: Record<PartnerTone, string> = {
    blue: 'border-blue-500/30 bg-blue-500/20 text-blue-200',
    emerald: 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200',
    amber: 'border-amber-500/30 bg-amber-500/20 text-amber-200',
    red: 'border-red-500/30 bg-red-500/20 text-red-200',
    violet: 'border-violet-500/30 bg-violet-500/20 text-violet-200',
    muted: 'border-white/8 bg-white/[0.04] text-gray-400',
    slate: 'border-slate-500/20 bg-slate-500/10 text-slate-300'
};

export const partnerControlClassName = 'w-full rounded-2xl border border-white/8 bg-[#11141a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-300/60 focus:ring-2 focus:ring-blue-300/10 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/[0.03] disabled:text-gray-600';

export function Panel({
    soft = false,
    className = '',
    ...props
}: HTMLAttributes<HTMLDivElement> & { soft?: boolean }) {
    return (
        <div
            className={`${soft ? 'admin-panel-soft' : 'admin-panel'} rounded-[24px] ${className}`}
            {...props}
        />
    );
}

export function Button({
    variant = 'primary',
    size = 'md',
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
}) {
    const variants = {
        primary: 'bg-white text-[#18181b] shadow-[0_18px_38px_rgba(0,0,0,0.22)] hover:bg-zinc-100',
        secondary: 'border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.08]',
        ghost: 'text-gray-400 hover:bg-white/[0.05] hover:text-white',
        danger: 'border border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/15'
    };
    const sizes = {
        sm: 'min-h-10 px-3.5 py-2 text-xs',
        md: 'min-h-11 px-4 py-2.5 text-sm'
    };

    return (
        <button
            className={`inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        />
    );
}

export function Input({
    label,
    className = '',
    ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
    return (
        <label className="block w-full">
            {label ? <span className="mb-1.5 block text-sm font-medium text-gray-400">{label}</span> : null}
            <input className={`${partnerControlClassName} ${className}`} {...props} />
        </label>
    );
}

export function Select({
    label,
    className = '',
    children,
    ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
    return (
        <label className="block w-full">
            {label ? <span className="mb-1.5 block text-sm font-medium text-gray-400">{label}</span> : null}
            <select className={`${partnerControlClassName} ${className}`} {...props}>
                {children}
            </select>
        </label>
    );
}

export function StatusPill({
    label,
    tone = 'muted',
    compact = false,
    className = ''
}: {
    label: string;
    tone?: PartnerTone;
    compact?: boolean;
    className?: string;
}) {
    return (
        <span className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${toneClasses[tone]} ${className}`}>
            <span className="truncate">{label}</span>
        </span>
    );
}

export function MetricTile({
    title,
    value,
    note,
    icon,
    tone = 'muted'
}: {
    title: string;
    value: ReactNode;
    note?: string;
    icon?: ReactNode;
    tone?: PartnerTone;
}) {
    return (
        <Panel className="p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    <div className="mt-3 truncate text-2xl font-semibold tracking-tight text-white">{value}</div>
                </div>
                {icon ? (
                    <div className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${toneClasses[tone]}`}>
                        {icon}
                    </div>
                ) : null}
            </div>
            {note ? <p className="mt-3 text-xs leading-5 text-gray-500">{note}</p> : null}
        </Panel>
    );
}

export function EmptyState({
    icon,
    title,
    description,
    action,
    tone = 'muted'
}: {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    tone?: PartnerTone;
}) {
    return (
        <div className="flex min-h-[160px] flex-col items-center justify-center px-5 py-10 text-center">
            {icon ? (
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${toneClasses[tone]}`}>
                    {icon}
                </span>
            ) : null}
            <p className="mt-4 text-sm font-semibold text-white">{title}</p>
            {description ? <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">{description}</p> : null}
            {action ? <div className="mt-5">{action}</div> : null}
        </div>
    );
}
