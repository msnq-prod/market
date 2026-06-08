import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getStonesDesktop, isStonesDesktop } from '../../utils/desktop';
import { persistDesktopAuthSession } from '../../utils/session';
import { useStore } from '../../store';

type DesktopAuthState = {
    status: 'checking' | 'ready' | 'blocked';
    message: string;
};

const CHECKING_MESSAGE = 'Проверка сервера и desktop-сессии...';
const SERVER_OFFLINE_MESSAGE = 'Сервер не отвечает.';

const resolveErrorMessage = (error: unknown) => {
    if (error instanceof Error && /сервер не отвечает|server_offline|fetch|network|econnrefused|timeout/i.test(error.message)) {
        return SERVER_OFFLINE_MESSAGE;
    }

    return error instanceof Error ? error.message : SERVER_OFFLINE_MESSAGE;
};

export function DesktopAuthGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<DesktopAuthState>(() => (
        isStonesDesktop()
            ? { status: 'checking', message: CHECKING_MESSAGE }
            : { status: 'ready', message: '' }
    ));
    const setUser = useStore((store) => store.setUser);

    const authenticate = useCallback(async () => {
        if (!isStonesDesktop()) {
            setState({ status: 'ready', message: '' });
            return;
        }

        const desktop = getStonesDesktop();
        if (!desktop?.ensureAdminSession) {
            setState({ status: 'blocked', message: 'Desktop runtime недоступен.' });
            return;
        }

        setState({ status: 'checking', message: CHECKING_MESSAGE });
        try {
            const session = await desktop.ensureAdminSession();
            persistDesktopAuthSession(session);
            setUser(session.user);
            setState({ status: 'ready', message: '' });
        } catch (error) {
            setState({ status: 'blocked', message: resolveErrorMessage(error) });
        }
    }, [setUser]);

    useEffect(() => {
        const authTimer = window.setTimeout(() => {
            void authenticate();
        }, 0);
        return () => window.clearTimeout(authTimer);
    }, [authenticate]);

    useEffect(() => {
        if (!isStonesDesktop() || state.status !== 'blocked') {
            return undefined;
        }

        const retryTimer = window.setInterval(() => {
            void authenticate();
        }, 5000);
        return () => window.clearInterval(retryTimer);
    }, [authenticate, state.status]);

    if (state.status === 'ready') {
        return <>{children}</>;
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 px-6 text-slate-100">
            <div className="w-full max-w-md border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
                <div className="text-lg font-semibold text-white">{state.message}</div>
                <div className="mt-3 text-sm leading-6 text-slate-300">
                    Вход в HQ desktop будет продолжен автоматически после восстановления API.
                </div>
                <button
                    type="button"
                    onClick={() => void authenticate()}
                    className="mt-6 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={state.status === 'checking'}
                >
                    Повторить
                </button>
            </div>
        </div>
    );
}
