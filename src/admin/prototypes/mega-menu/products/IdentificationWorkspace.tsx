import { Check, Copy, Pencil, Printer, QrCode, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { batches } from './productData';
import { Notice, PrimaryButton, SecondaryButton, WorkspaceHeader } from './ProductWorkspaceShared';

const initialSerials = [
    'RUSURLAMT180626001',
    'RUSURLAMT180626002',
    'RUSURLAMT180626002',
    'RUSURLAMT180626004',
    'RUSURLAMT180626005',
    'RUSURLAMT180626006'
];

export function IdentificationWorkspace({
    batchId,
    onNavigate
}: {
    batchId?: string;
    onNavigate: (scenarioId: string, contextId?: string) => void;
}) {
    const selected = batches.find((batch) => batch.id === batchId) || {
        id: 'B-250618-03',
        template: 'Аметист «Полярная ночь»',
        location: 'Урал',
        qty: 18
    };
    const [serials, setSerials] = useState(initialSerials);
    const [editing, setEditing] = useState<number | null>(null);
    const [printed, setPrinted] = useState(false);
    const duplicateCount = serials.filter((serial, index) => serials.indexOf(serial) !== index).length;

    const replaceSerial = (index: number) => {
        setSerials((current) => current.map((serial, itemIndex) => (
            itemIndex === index ? `RUSURLAMT180626${String(index + 1).padStart(3, '0')}` : serial
        )));
        setEditing(null);
    };

    return (
        <div>
            <WorkspaceHeader
                title="QR и паспорта"
                description="Паспорта создаются при приемке. Здесь проверяются и печатаются идентификаторы Item."
                action={<PrimaryButton onClick={() => setPrinted(true)}><Printer size={14} />Печать QR партии</PrimaryButton>}
            />
            {printed ? <div className="mt-4"><Notice>Макет QR для {selected.id} подготовлен к печати.</Notice></div> : null}
            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_330px]">
                <section className="overflow-hidden rounded-xl border border-white/8">
                    <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.018] px-4 py-3">
                        <div>
                            <h2 className="text-sm font-semibold text-white">{selected.template}</h2>
                            <p className="mt-1 text-xs text-gray-600">{selected.id} · {selected.location}</p>
                        </div>
                        <span className="text-xs text-gray-500">{selected.qty} Item</span>
                    </div>
                    {serials.map((serial, index) => {
                        const duplicate = serials.indexOf(serial) !== serials.lastIndexOf(serial);
                        return (
                            <div key={`${serial}-${index}`} className="grid grid-cols-[48px_1fr_120px] items-center gap-3 border-b border-white/8 px-4 py-3 text-sm last:border-b-0">
                                <span className="font-mono text-xs text-gray-600">{String(index + 1).padStart(3, '0')}</span>
                                <div className="min-w-0">
                                    {editing === index ? (
                                        <input
                                            autoFocus
                                            value={serial}
                                            onChange={(event) => setSerials((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))}
                                            className="w-full rounded-md border border-emerald-300/30 bg-[#090b0e] px-2 py-1.5 font-mono text-xs text-gray-200 outline-none"
                                        />
                                    ) : (
                                        <>
                                            <div className={`font-mono text-xs ${duplicate ? 'text-rose-300' : 'text-gray-300'}`}>{serial}</div>
                                            <div className="mt-1 text-[11px] text-gray-700">/clone/{serial}</div>
                                        </>
                                    )}
                                </div>
                                <div className="flex justify-end gap-1">
                                    {editing === index ? (
                                        <button type="button" onClick={() => replaceSerial(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-300/20 text-emerald-300">
                                            <Check size={13} />
                                        </button>
                                    ) : (
                                        <button type="button" onClick={() => setEditing(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/8 text-gray-500 hover:text-white">
                                            <Pencil size={13} />
                                        </button>
                                    )}
                                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/8 text-gray-500 hover:text-white"><Copy size={13} /></button>
                                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/8 text-gray-500 hover:text-white"><QrCode size={13} /></button>
                                </div>
                            </div>
                        );
                    })}
                </section>
                <aside className="space-y-4">
                    <div className="rounded-xl border border-white/8 p-4">
                        <h2 className="text-sm font-semibold text-white">Проверка идентификаторов</h2>
                        <div className="mt-4 space-y-3 text-xs">
                            <div className="flex justify-between"><span className="text-gray-500">Паспорта созданы</span><span className="text-emerald-300">{selected.qty} / {selected.qty}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Уникальные номера</span><span className={duplicateCount ? 'text-rose-300' : 'text-emerald-300'}>{duplicateCount ? `${duplicateCount} ошибка` : 'Без ошибок'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">QR доступны</span><span className="text-emerald-300">{selected.qty} / {selected.qty}</span></div>
                        </div>
                    </div>
                    {duplicateCount ? <Notice tone="danger">Исправьте дубли серийных номеров до передачи партии на склад.</Notice> : <Notice>Все идентификаторы уникальны.</Notice>}
                    <div className="flex flex-col gap-2">
                        <PrimaryButton disabled={duplicateCount > 0} onClick={() => onNavigate('stock-readiness', selected.id)}>Проверить готовность к складу</PrimaryButton>
                        <SecondaryButton onClick={() => setSerials(initialSerials)}><RotateCcw size={13} />Отменить изменения</SecondaryButton>
                    </div>
                </aside>
            </div>
        </div>
    );
}
