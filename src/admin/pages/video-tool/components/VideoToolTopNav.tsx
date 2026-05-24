import React from 'react';
import { ArrowLeft, Settings, Film, Download } from 'lucide-react';
import { DesktopStatusCenter } from '../../../components/DesktopStatusCenter';

interface VideoToolTopNavProps {
    activeMode: 'prepare' | 'edit' | 'export';
    setActiveMode: (mode: 'prepare' | 'edit' | 'export') => void;
    onBack: () => void;
    batchLabel?: string;
    hasHelperIssues?: boolean;
}

export const VideoToolTopNav: React.FC<VideoToolTopNavProps> = ({
    activeMode,
    setActiveMode,
    onBack,
    batchLabel,
    hasHelperIssues
}) => {
    return (
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-800 bg-[#15161a] px-4 py-2.5">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                aria-label="Вернуться на склад"
            >
                <ArrowLeft size={14} />
            </button>

            <div className="min-w-0 mr-4">
                <h1 data-testid="video-tool-heading" className="text-xs font-semibold text-zinc-100 sm:text-sm">
                    Видео партии {batchLabel ? `· ${batchLabel.slice(0, 8)}` : ''}
                </h1>
            </div>

            {/* Mode Tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-zinc-950 p-1">
                <button
                    type="button"
                    onClick={() => setActiveMode('prepare')}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                        activeMode === 'prepare'
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                    <Settings size={14} className={hasHelperIssues ? 'text-amber-400' : ''} />
                    <span>Подготовка</span>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveMode('edit')}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                        activeMode === 'edit'
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                    <Film size={14} />
                    <span>Монтаж</span>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveMode('export')}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                        activeMode === 'export'
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                    <Download size={14} />
                    <span>Экспорт</span>
                </button>
            </div>

            <div className="ml-auto flex items-center gap-3">
                <DesktopStatusCenter />
            </div>
        </header>
    );
};
