import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

export function WorkspaceHeader({
    title,
    description,
    action
}: {
    title: string;
    description: string;
    action?: ReactNode;
}) {
    return (
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/8 pb-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
                <p className="mt-2 text-sm text-gray-500">{description}</p>
            </div>
            {action}
        </header>
    );
}

export function PrimaryButton({
    children,
    onClick,
    disabled = false,
    type = 'button'
}: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit';
}) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-semibold text-[#08100c] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
            {children}
        </button>
    );
}

export function SecondaryButton({
    children,
    onClick,
    danger = false
}: {
    children: ReactNode;
    onClick?: () => void;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${
                danger
                    ? 'border-rose-300/20 text-rose-300 hover:bg-rose-300/8'
                    : 'border-white/10 text-gray-400 hover:bg-white/[0.04] hover:text-white'
            }`}
        >
            {children}
        </button>
    );
}

export function SearchField({
    value,
    onChange,
    placeholder = 'Поиск'
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    return (
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 text-sm text-gray-500 focus-within:border-emerald-300/30">
            <Search size={15} />
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-200 outline-none placeholder:text-gray-700"
            />
        </label>
    );
}

export function Field({
    label,
    value,
    onChange,
    type = 'text',
    placeholder
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    placeholder?: string;
}) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-500">{label}</span>
            <input
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="min-h-10 w-full rounded-lg border border-white/8 bg-[#0b0e12] px-3 text-sm text-gray-200 outline-none transition placeholder:text-gray-700 focus:border-emerald-300/35"
            />
        </label>
    );
}

export function TextArea({
    label,
    value,
    onChange
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-500">{label}</span>
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-white/8 bg-[#0b0e12] px-3 py-2 text-sm leading-6 text-gray-200 outline-none transition focus:border-emerald-300/35"
            />
        </label>
    );
}

export function SectionTitle({ children }: { children: ReactNode }) {
    return <h2 className="text-sm font-semibold text-white">{children}</h2>;
}

export function StatusDot({ tone }: { tone: 'success' | 'attention' | 'danger' | 'technical' | 'neutral' }) {
    const className = {
        success: 'bg-emerald-300',
        attention: 'bg-amber-300',
        danger: 'bg-rose-300',
        technical: 'bg-sky-300',
        neutral: 'bg-gray-500'
    }[tone];

    return <span className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

export function Notice({
    children,
    tone = 'success'
}: {
    children: ReactNode;
    tone?: 'success' | 'danger' | 'attention';
}) {
    const classes = {
        success: 'border-emerald-300/20 bg-emerald-300/8 text-emerald-200',
        danger: 'border-rose-300/20 bg-rose-300/8 text-rose-200',
        attention: 'border-amber-300/20 bg-amber-300/8 text-amber-200'
    }[tone];

    return <div className={`rounded-lg border px-3 py-2 text-xs ${classes}`}>{children}</div>;
}
