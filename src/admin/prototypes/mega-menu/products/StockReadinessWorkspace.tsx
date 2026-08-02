import { AlertTriangle, CheckCircle2, LoaderCircle, PackageCheck, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { batches } from './productData';
import { Notice, PrimaryButton, SecondaryButton, WorkspaceHeader } from './ProductWorkspaceShared';

type CheckState = 'idle' | 'checking' | 'failed' | 'ready' | 'stored';

export function StockReadinessWorkspace({
    batchId,
    onNavigate
}: {
    batchId?: string;
    onNavigate: (scenarioId: string, contextId?: string) => void;
}) {
    const selected = batches.find((batch) => batch.id === batchId) || batches[3];
    const hasMissingMedia = selected.photos < selected.qty || selected.videos < selected.qty;
    const [state, setState] = useState<CheckState>('idle');
    const checks = [
        { label: 'Партия принята', value: 'RECEIVED', ready: selected.status === 'RECEIVED' },
        { label: 'Фото назначены каждому Item', value: `${selected.photos} / ${selected.qty}`, ready: selected.photos === selected.qty },
        { label: 'Видео назначено каждому Item', value: `${selected.videos} / ${selected.qty}`, ready: selected.videos === selected.qty },
        { label: 'Серийные номера уникальны', value: 'Проверяется скриптом', ready: true },
        { label: 'Паспорта Item доступны', value: `${selected.qty} / ${selected.qty}`, ready: true }
    ];

    const runCheck = () => {
        setState('checking');
        window.setTimeout(() => setState(hasMissingMedia ? 'failed' : 'ready'), 450);
    };

    return (
        <div>
            <WorkspaceHeader title="Передача на склад" description="Проверка запускается администратором и не переводит партию автоматически." />
            <div className="mx-auto mt-6 max-w-4xl">
                <section className="rounded-xl border border-white/8 bg-white/[0.015] p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-5">
                        <div>
                            <h2 className="text-xl font-semibold text-white">{selected.template}</h2>
                            <p className="mt-1 text-xs text-gray-600">{selected.id} · {selected.location} · {selected.qty} Item</p>
                        </div>
                        <span className="rounded-full border border-white/8 px-3 py-1 text-xs text-gray-400">{selected.status}</span>
                    </div>
                    <div className="mt-5 space-y-2">
                        {checks.map((check) => (
                            <div key={check.label} className="flex items-center gap-3 rounded-lg border border-white/8 px-4 py-3">
                                {check.ready ? <CheckCircle2 size={17} className="text-emerald-300" /> : <AlertTriangle size={17} className="text-amber-300" />}
                                <span className="min-w-0 flex-1 text-sm text-gray-300">{check.label}</span>
                                <span className={`text-xs ${check.ready ? 'text-gray-500' : 'text-amber-300'}`}>{check.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5">
                        {state === 'idle' ? <Notice tone="attention">Нажмите «Запустить проверку». До этого партия не считается готовой.</Notice> : null}
                        {state === 'checking' ? <Notice tone="attention">Проверяются медиа, серийные номера и паспорта Item.</Notice> : null}
                        {state === 'failed' ? <Notice tone="danger">Партия не передана: у части Item отсутствуют обязательные медиа.</Notice> : null}
                        {state === 'ready' ? <Notice>Все {selected.qty} Item готовы к передаче на склад.</Notice> : null}
                        {state === 'stored' ? <Notice>Партия принята на склад HQ. Item готовы к продаже.</Notice> : null}
                    </div>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                        {state === 'failed' ? (
                            <>
                                <SecondaryButton onClick={runCheck}><RotateCcw size={13} />Проверить повторно</SecondaryButton>
                                <PrimaryButton onClick={() => onNavigate(selected.photos < selected.qty ? 'photos' : 'videos', selected.id)}>Исправить медиа</PrimaryButton>
                            </>
                        ) : null}
                        {state === 'idle' || state === 'checking' ? (
                            <PrimaryButton disabled={state === 'checking'} onClick={runCheck}>
                                {state === 'checking' ? <LoaderCircle size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                                Запустить проверку
                            </PrimaryButton>
                        ) : null}
                        {state === 'ready' ? <PrimaryButton onClick={() => setState('stored')}>Подтвердить приемку на склад</PrimaryButton> : null}
                        {state === 'stored' ? <PrimaryButton onClick={() => onNavigate('warehouse', selected.id)}>Перейти к складским Item</PrimaryButton> : null}
                    </div>
                </section>
            </div>
        </div>
    );
}
