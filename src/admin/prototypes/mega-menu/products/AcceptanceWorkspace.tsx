import { Check, PackageOpen, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { batches } from './productData';
import { Notice, PrimaryButton, SecondaryButton, WorkspaceHeader } from './ProductWorkspaceShared';

export function AcceptanceWorkspace({ batchId, onNavigate }: { batchId?: string; onNavigate: (scenarioId: string, contextId?: string) => void }) {
    const transitBatches = batches.filter((batch) => batch.status === 'TRANSIT');
    const [selectedId, setSelectedId] = useState(batchId || transitBatches[0].id);
    const selected = batches.find((batch) => batch.id === selectedId) || transitBatches[0];
    const [actualQty, setActualQty] = useState(String(selected.qty));
    const [received, setReceived] = useState(false);

    return (
        <div>
            <WorkspaceHeader title="Приемка" description="Зафиксируйте фактическое количество прибывшей партии." />
            <div className="mt-5 grid min-h-[620px] overflow-hidden rounded-xl border border-white/8 lg:grid-cols-[350px_1fr]">
                <aside className="border-r border-white/8 bg-white/[0.018] p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-700">Ожидают приемки</div>
                    {transitBatches.map((batch) => (
                        <button
                            key={batch.id}
                            type="button"
                            onClick={() => { setSelectedId(batch.id); setActualQty(String(batch.qty)); setReceived(false); }}
                            className={`w-full border-b border-white/8 px-3 py-4 text-left ${selectedId === batch.id ? 'bg-emerald-300/8' : 'hover:bg-white/[0.03]'}`}
                        >
                            <span className="block text-sm font-medium text-gray-200">{batch.template}</span>
                            <span className="mt-1 block text-xs text-gray-600">{batch.id} · {batch.location}</span>
                            <span className="mt-2 block text-xs text-gray-400">{batch.qty} Item</span>
                        </button>
                    ))}
                </aside>
                <section className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-white">{selected.template}</h2>
                            <p className="mt-1 font-mono text-xs text-gray-600">{selected.id}</p>
                        </div>
                        {received ? <SecondaryButton><RotateCcw size={13} />Отменить приемку</SecondaryButton> : null}
                    </div>
                    {received ? (
                        <div className="mt-5 space-y-5">
                            <Notice>Партия принята. Паспорта и QR доступны сразу.</Notice>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <button onClick={() => onNavigate('photos', selected.id)} className="rounded-xl border border-white/8 p-4 text-left hover:bg-white/[0.03]">
                                    <span className="text-sm font-medium text-white">Назначить фото</span>
                                    <span className="mt-1 block text-xs text-gray-600">0 / {actualQty}</span>
                                </button>
                                <button onClick={() => onNavigate('videos', selected.id)} className="rounded-xl border border-white/8 p-4 text-left hover:bg-white/[0.03]">
                                    <span className="text-sm font-medium text-white">Подготовить видео</span>
                                    <span className="mt-1 block text-xs text-gray-600">0 / {actualQty}</span>
                                </button>
                                <button onClick={() => onNavigate('identification', selected.id)} className="rounded-xl border border-white/8 p-4 text-left hover:bg-white/[0.03]">
                                    <span className="text-sm font-medium text-white">Печать QR</span>
                                    <span className="mt-1 block text-xs text-gray-600">Паспорта созданы</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-5 max-w-3xl">
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="rounded-lg border border-white/8 p-4"><span className="text-xs text-gray-600">Локация</span><strong className="mt-2 block text-sm text-white">{selected.location}</strong></div>
                                <div className="rounded-lg border border-white/8 p-4"><span className="text-xs text-gray-600">Ожидается</span><strong className="mt-2 block text-sm text-white">{selected.qty} Item</strong></div>
                                <div className="rounded-lg border border-white/8 p-4"><span className="text-xs text-gray-600">Состояние</span><strong className="mt-2 block text-sm text-amber-300">В пути</strong></div>
                            </div>
                            <label className="mt-6 block max-w-xs">
                                <span className="mb-2 block text-sm font-medium text-white">Фактическое количество</span>
                                <input type="number" value={actualQty} onChange={(event) => setActualQty(event.target.value)} className="min-h-12 w-full rounded-lg border border-white/10 bg-[#0b0e12] px-4 text-xl font-semibold text-white outline-none focus:border-emerald-300/35" />
                            </label>
                            {Number(actualQty) !== selected.qty ? (
                                <div className="mt-4"><Notice tone="attention">Состав партии изменится на {Number(actualQty) - selected.qty > 0 ? '+' : ''}{Number(actualQty) - selected.qty} Item. Последовательность и серийные номера будут пересчитаны.</Notice></div>
                            ) : null}
                            <div className="mt-5">
                                <PrimaryButton onClick={() => setReceived(true)}><PackageOpen size={15} />Принять партию</PrimaryButton>
                            </div>
                            <div className="mt-6 border-t border-white/8 pt-4">
                                <h3 className="text-sm font-semibold text-white">Предварительный состав</h3>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {Array.from({ length: Math.min(Number(actualQty) || 0, 9) }, (_, index) => (
                                        <div key={index} className="flex items-center gap-2 rounded-lg border border-white/8 px-3 py-2 text-xs text-gray-400">
                                            <Check size={13} className="text-emerald-300" />
                                            Item {String(index + 1).padStart(3, '0')}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
