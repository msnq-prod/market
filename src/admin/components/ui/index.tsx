import React from 'react';

// Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
    const base = "font-medium rounded-lg transition duration-200 flex items-center justify-center gap-2";

    const variants = {
        primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40",
        secondary: "bg-gray-700 hover:bg-gray-600 text-white",
        danger: "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20",
        ghost: "hover:bg-gray-800 text-gray-400 hover:text-white",
    };

    const sizes = {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2",
        lg: "px-6 py-3 text-lg",
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
            {label && <label className="block text-sm font-medium text-gray-400 mb-1.5">{label}</label>}
            <input
                className={`w-full bg-gray-900 border ${error ? 'border-red-500/50' : 'border-gray-700'} focus:border-blue-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 outline-none transition-colors ${className}`}
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
            <div className={`relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${className || 'max-w-lg'}`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition">
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
            {label && <label className="block text-sm font-medium text-gray-400 mb-1.5">{label}</label>}
            <textarea
                className={`w-full bg-gray-900 border ${error ? 'border-red-500/50' : 'border-gray-700'} focus:border-blue-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 outline-none transition-colors ${className}`}
                {...props}
            />
            {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
        </div>
    );
}
