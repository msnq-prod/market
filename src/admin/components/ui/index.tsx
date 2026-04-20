import React from 'react';

// Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
    const base = "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60";

    const variants = {
        primary: "bg-white text-[#18181b] hover:bg-zinc-100 shadow-[0_20px_40px_rgba(0,0,0,0.2)]",
        secondary: "border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.08]",
        danger: "border border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/15",
        ghost: "text-gray-400 hover:bg-white/[0.05] hover:text-white",
    };

    const sizes = {
        sm: "min-h-10 px-3.5 py-2 text-sm",
        md: "min-h-11 px-4 py-2.5 text-sm",
        lg: "min-h-12 px-6 py-3 text-base",
    };

    return (
        <button
            className={`${base} ${variants[variant]} ${sizes[size]} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
            {...props}
        />
    );
}

// Input Component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
    return (
        <div className="w-full">
            {label && <label className="mb-1.5 block text-sm font-medium text-gray-400">{label}</label>}
            <input
                className={`w-full rounded-2xl border bg-[#1a1a1c] px-4 py-3 text-white placeholder-gray-600 outline-none transition-colors ${error ? 'border-red-500/50 focus:border-red-400' : 'border-white/8 focus:border-blue-300/60'} ${className}`}
                {...props}
            />
            {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
        </div>
    );
}

// Modal Component
interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
}

export function Modal({ isOpen, onClose, title, children, className = '' }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className={`admin-panel relative max-h-[90vh] w-full overflow-y-auto rounded-[28px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${className || 'max-w-lg'}`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                    <button onClick={onClose} className="rounded-full bg-white/[0.04] p-2 text-gray-500 transition hover:bg-white/[0.08] hover:text-white">
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// Textarea Component
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
    return (
        <div className="w-full">
            {label && <label className="mb-1.5 block text-sm font-medium text-gray-400">{label}</label>}
            <textarea
                className={`w-full rounded-2xl border bg-[#1a1a1c] px-4 py-3 text-white placeholder-gray-600 outline-none transition-colors ${error ? 'border-red-500/50 focus:border-red-400' : 'border-white/8 focus:border-blue-300/60'} ${className}`}
                {...props}
            />
            {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
        </div>
    );
}
