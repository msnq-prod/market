import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, Search, X } from 'lucide-react';

export const adminFieldClassName = 'h-11 rounded-lg border border-[#2a3039] bg-[#151a21] text-[13px] text-[#eef2f6] outline-none transition placeholder:text-[#727b88] focus:border-[#4c91f3]';

export function AdminWorkspace({
    children,
    className = '',
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={`mx-auto min-w-0 max-w-[1600px] space-y-3 ${className}`} {...props}>
            {children}
        </div>
    );
}

export function AdminWorkspaceHeader({
    title,
    count,
    children,
    className = ''
}: {
    title: string;
    count?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <header className={`flex min-h-11 min-w-0 items-center gap-3 px-1 ${className}`}>
            <h1 className="shrink-0 text-[28px] font-semibold leading-none tracking-[-0.025em] text-[#f5f7fa]">
                {title}
            </h1>
            {children ? <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div> : <div className="flex-1" />}
            {count !== undefined ? (
                <div className="shrink-0 text-right text-[13px] text-[#89919d]">{count}</div>
            ) : null}
        </header>
    );
}

export function AdminSearchField({
    value,
    onChange,
    placeholder,
    ariaLabel = 'Поиск',
    className = ''
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    ariaLabel?: string;
    className?: string;
}) {
    return (
        <label className={`relative block min-w-0 ${className}`}>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#77808d]" size={17} />
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                aria-label={ariaLabel}
                className={`${adminFieldClassName} w-full pl-10 pr-3`}
            />
        </label>
    );
}

export function AdminSelect({
    label,
    value,
    onChange,
    options,
    className = 'w-[150px]'
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    className?: string;
}) {
    return (
        <label className={`relative block min-w-0 shrink-0 ${className}`}>
            <span className="sr-only">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-label={label}
                className={`${adminFieldClassName} w-full appearance-none truncate pl-3 pr-8`}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#727b87]" size={14} />
        </label>
    );
}

export function AdminTableSurface({
    children,
    minWidth,
    className = ''
}: {
    children: ReactNode;
    minWidth?: number;
    className?: string;
}) {
    return (
        <section className={`overflow-x-auto rounded-lg border border-[#2a3039] bg-[#11161d] shadow-[0_22px_50px_rgba(0,0,0,0.22)] ${className}`}>
            <div style={minWidth ? { minWidth } : undefined}>{children}</div>
        </section>
    );
}

export function AdminWorkspaceState({
    state,
    children
}: {
    state: 'loading' | 'empty' | 'error';
    children: ReactNode;
}) {
    return (
        <div className={`flex min-h-[360px] items-center justify-center px-5 text-sm ${state === 'error' ? 'text-red-200' : 'text-[#7f8894]'}`}>
            <span className="inline-flex items-center gap-2">
                {state === 'error' ? <AlertTriangle size={16} /> : null}
                {children}
            </span>
        </div>
    );
}

export function AdminInlineError({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
            <AlertTriangle size={16} />
            {children}
        </div>
    );
}

export function AdminStatus({
    label,
    tone = 'neutral'
}: {
    label: string;
    tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}) {
    const tones = {
        success: 'border-[#1fa65a]/70 bg-[#10251b] text-[#53dc8c]',
        warning: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
        danger: 'border-red-400/35 bg-red-500/10 text-red-200',
        info: 'border-[#4b89d9] bg-[#152130] text-[#79b9ff]',
        neutral: 'border-[#333b46] bg-[#191f27] text-[#a8b0ba]'
    };

    return (
        <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium ${tones[tone]}`}>
            {tone === 'success' ? <Check size={13} /> : null}
            {label}
        </span>
    );
}

export function AdminAction({
    children,
    tone = 'primary',
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: 'primary' | 'secondary' | 'danger';
}) {
    const tones = {
        primary: 'border-[#4b89d9] bg-[#152130] text-[#79b9ff] hover:border-[#67a5f4] hover:bg-[#192a3d]',
        secondary: 'border-[#333b46] bg-[#191f27] text-[#d5dae0] hover:border-[#4a5562] hover:bg-[#202832]',
        danger: 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-400/60 hover:bg-red-500/15'
    };

    return (
        <button
            type="button"
            className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}

export function AdminDrawer({
    title,
    onClose,
    children,
    footer
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="presentation" onMouseDown={onClose}>
            <aside
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="flex h-full w-full max-w-[520px] flex-col border-l border-[#2a3039] bg-[#11161d] shadow-[-28px_0_70px_rgba(0,0,0,0.45)]"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="flex min-h-16 items-center justify-between gap-4 border-b border-[#2a3039] px-5">
                    <h2 className="min-w-0 truncate text-lg font-semibold text-[#f3f6f8]">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Закрыть"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#303842] bg-[#181e26] text-[#a8b0ba] transition hover:text-white"
                    >
                        <X size={17} />
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
                {footer ? <footer className="border-t border-[#2a3039] px-5 py-4">{footer}</footer> : null}
            </aside>
        </div>
    );
}
