import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { persistAuthSession } from '../../utils/session';

type LoginPortal = 'partner' | 'admin';

type LoginProps = {
    portal?: LoginPortal;
};

type LoginLocationState = {
    from?: {
        pathname?: string;
    };
};

export function Login({ portal = 'partner' }: LoginProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const isAdminPortal = portal === 'admin';
    const title = isAdminPortal ? 'Админ-панель HQ' : 'Партнерский кабинет';
    const subtitle = isAdminPortal
        ? 'Войдите для управления HQ или очередью продаж'
        : 'Войдите для управления своими партиями';
    const deniedMessage = isAdminPortal
        ? 'Доступ запрещён. Нужна учетная запись администратора, менеджера HQ или менеджера продаж.'
        : 'Доступ запрещён. Нужен партнерский или staff-аккаунт.';

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка входа');
            }

            const isStaff = data.role === 'ADMIN' || data.role === 'MANAGER' || data.role === 'SALES_MANAGER';
            const isFranchisee = data.role === 'FRANCHISEE';

            if (isAdminPortal && !isStaff) {
                throw new Error(deniedMessage);
            }

            if (!isStaff && !isFranchisee) {
                throw new Error(deniedMessage);
            }

            persistAuthSession({
                accessToken: data.accessToken,
                role: data.role,
                name: data.name
            });

            if (isStaff) {
                const fromPath = (location.state as LoginLocationState | null)?.from?.pathname;
                const staffTarget = fromPath?.startsWith('/admin') ? fromPath : '/admin';
                navigate(staffTarget, { replace: true });
                return;
            }

            navigate('/partner/dashboard', { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка входа');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="app-shell-light min-h-screen flex items-center justify-center bg-slate-100 px-4 py-10">
            <div className="ui-card w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
                    <p className="text-gray-500 mt-2">{subtitle}</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="ui-input text-slate-900 bg-white"
                            style={{ color: '#0f172a', backgroundColor: '#ffffff', WebkitTextFillColor: '#0f172a', opacity: 1 }}
                            placeholder={isAdminPortal ? 'admin@stones.com' : 'yakutia.partner@stones.com'}
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="ui-input text-slate-900 bg-white"
                            style={{ color: '#0f172a', backgroundColor: '#ffffff', WebkitTextFillColor: '#0f172a', opacity: 1 }}
                            placeholder="••••••••"
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="ui-btn ui-btn-primary w-full"
                    >
                        {loading ? 'Вход...' : 'Войти'}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-gray-500">
                    Если нужен аккаунт, обратитесь к администратору.
                </div>
            </div>
        </div>
    );
}
