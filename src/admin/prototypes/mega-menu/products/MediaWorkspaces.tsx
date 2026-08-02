import { CheckCircle2, Film, ImagePlus, RotateCcw, Upload } from 'lucide-react';
import { useState } from 'react';
import { batches } from './productData';
import { Notice, PrimaryButton, SecondaryButton, WorkspaceHeader } from './ProductWorkspaceShared';

function MediaQueue({
    kind,
    batchId,
    onNavigate
}: {
    kind: 'photos' | 'videos';
    batchId?: string;
    onNavigate: (scenarioId: string, contextId?: string) => void;
}) {
    const eligible = batches.filter((batch) => batch.status === 'RECEIVED' && (kind === 'photos' ? batch.photos < batch.qty : batch.videos < batch.qty));
    const [selectedId, setSelectedId] = useState(batchId || eligible[0]?.id || batches[1].id);
    const selected = batches.find((batch) => batch.id === selectedId) || eligible[0];
    const [completed, setCompleted] = useState(false);
    const current = kind === 'photos' ? selected.photos : selected.videos;
    const Icon = kind === 'photos' ? ImagePlus : Film;

    return (
        <div>
            <WorkspaceHeader
                title={kind === 'photos' ? 'Фото' : 'Видео'}
                description={kind === 'photos' ? 'Назначьте одно фото каждому Item партии.' : 'Подготовьте одно финальное видео для каждого Item партии.'}
            />
            <div className="mt-5 grid min-h-[650px] overflow-hidden rounded-xl border border-white/8 lg:grid-cols-[350px_1fr]">
                <aside className="border-r border-white/8 bg-white/[0.018] p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-700">Неполные партии</div>
                    {eligible.map((batch) => {
                        const ready = kind === 'photos' ? batch.photos : batch.videos;
                        return (
                            <button key={batch.id} type="button" onClick={() => { setSelectedId(batch.id); setCompleted(false); }} className={`w-full border-b border-white/8 px-3 py-4 text-left ${selectedId === batch.id ? 'bg-emerald-300/8' : 'hover:bg-white/[0.03]'}`}>
                                <span className="block text-sm font-medium text-gray-200">{batch.template}</span>
                                <span className="mt-1 block text-xs text-gray-600">{batch.id} · {batch.location}</span>
                                <span className="mt-3 block h-1 rounded-full bg-white/8"><span className="block h-full rounded-full bg-emerald-300" style={{ width: `${(ready / batch.qty) * 100}%` }} /></span>
                                <span className="mt-2 block text-xs text-gray-500">{ready} / {batch.qty}</span>
                            </button>
                        );
                    })}
                </aside>
                <section className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-white">{selected.template}</h2>
                            <p className="mt-1 text-xs text-gray-600">{selected.id} · {selected.qty} Item</p>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-semibold text-white">{completed ? selected.qty : current} / {selected.qty}</div>
                            <div className="text-xs text-gray-600">{kind === 'photos' ? 'фото назначено' : 'видео готово'}</div>
                        </div>
                    </div>
                    {completed ? (
                        <div className="mt-5 space-y-5">
                            <Notice>Работа сохранена. Партия больше не требует {kind === 'photos' ? 'фото' : 'видео'}.</Notice>
                            <div className="flex gap-2">
                                <SecondaryButton><RotateCcw size={13} />Отменить последнее сохранение</SecondaryButton>
                                <PrimaryButton onClick={() => onNavigate(kind === 'photos' ? 'videos' : 'stock-readiness', selected.id)}>
                                    {kind === 'photos' ? 'Перейти к видео' : 'Проверить готовность к складу'}
                                </PrimaryButton>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_300px]">
                                <div className="min-h-[390px] rounded-xl border border-dashed border-white/10 bg-[#0b0e12] p-5">
                                    <div className="flex h-full flex-col items-center justify-center text-center">
                                        <Icon size={32} className="text-gray-700" />
                                        <div className="mt-4 text-sm font-medium text-gray-300">{kind === 'photos' ? 'Загрузите фотографии' : 'Выберите исходное видео'}</div>
                                        <p className="mt-2 max-w-sm text-xs leading-5 text-gray-600">{kind === 'photos' ? 'Файлы будут сопоставлены с Item по последовательности.' : 'После подготовки разметьте фрагменты 001…NNN и запустите экспорт.'}</p>
                                        <SecondaryButton><Upload size={13} />{kind === 'photos' ? 'Выбрать файлы' : 'Выбрать исходник'}</SecondaryButton>
                                    </div>
                                </div>
                                <aside className="rounded-xl border border-white/8 p-4">
                                    <h3 className="text-sm font-semibold text-white">{kind === 'photos' ? 'Сопоставление' : 'Экспорт Item'}</h3>
                                    <div className="mt-4 space-y-2">
                                        {Array.from({ length: 8 }, (_, index) => {
                                            const ready = index < Math.min(current, 8);
                                            return (
                                                <div key={index} className="flex items-center gap-3 border-b border-white/8 py-2 text-xs last:border-b-0">
                                                    <span className="font-mono text-gray-600">{String(index + 1).padStart(3, '0')}</span>
                                                    <span className="min-w-0 flex-1 text-gray-400">Item {String(index + 1).padStart(3, '0')}</span>
                                                    {ready ? <CheckCircle2 size={14} className="text-emerald-300" /> : <span className="text-amber-300">Не готов</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </aside>
                            </div>
                            <div className="mt-4 flex justify-end">
                                <PrimaryButton onClick={() => setCompleted(true)}>{kind === 'photos' ? 'Сохранить фото' : 'Запустить экспорт'}</PrimaryButton>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

export function PhotosWorkspace(props: { batchId?: string; onNavigate: (scenarioId: string, contextId?: string) => void }) {
    return <MediaQueue kind="photos" {...props} />;
}

export function VideosWorkspace(props: { batchId?: string; onNavigate: (scenarioId: string, contextId?: string) => void }) {
    return <MediaQueue kind="videos" {...props} />;
}
