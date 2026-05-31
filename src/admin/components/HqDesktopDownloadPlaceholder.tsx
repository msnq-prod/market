import { ArrowLeft, HardDriveDownload, MonitorDown } from 'lucide-react';
import { Link } from 'react-router-dom';

type HqDesktopDownloadPlaceholderProps = {
    toolName?: string;
    fullscreen?: boolean;
};

const HQ_DMG_INTEL_URL = '/uploads/downloads/ZAGARAMI-HQ.dmg';
const HQ_DMG_ARM64_URL = '/uploads/downloads/ZAGARAMI-HQ-arm64.dmg';

export function HqDesktopDownloadPlaceholder({
    toolName = 'Media Tools',
    fullscreen = false
}: HqDesktopDownloadPlaceholderProps) {
    return (
        <div className={fullscreen ? 'flex min-h-screen items-center justify-center bg-[#0f1013] px-5 py-8 text-zinc-100' : 'py-8 text-zinc-100'}>
            <section
                data-testid="hq-desktop-placeholder"
                className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#14161b] p-6 shadow-[0_24px_100px_rgba(0,0,0,0.35)] sm:p-8"
            >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-cyan-100">
                    <MonitorDown size={22} />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">ZAGARAMI HQ</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">Откройте {toolName} в desktop-приложении HQ</h1>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                    Веб-версия этих инструментов отключена. Для подготовки фото и видео скачайте и откройте ZAGARAMI HQ.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <a
                        data-testid="hq-download-arm64"
                        href={HQ_DMG_ARM64_URL}
                        download
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-200 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-100"
                    >
                        <HardDriveDownload size={16} />
                        Скачать Apple Silicon
                    </a>
                    <a
                        data-testid="hq-download-intel"
                        href={HQ_DMG_INTEL_URL}
                        download
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.06]"
                    >
                        <HardDriveDownload size={16} />
                        Скачать Intel
                    </a>
                </div>

                <Link
                    to="/admin/acceptance"
                    className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                    <ArrowLeft size={16} />
                    Вернуться в приемку
                </Link>
            </section>
        </div>
    );
}
