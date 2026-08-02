import { ArchiveRestore, History, PackageMinus } from 'lucide-react';
import { useState } from 'react';
import { warehouseItems } from './productData';
import { Notice, SearchField, SecondaryButton, WorkspaceHeader } from './ProductWorkspaceShared';

export function WarehouseWorkspace() {
    const [search, setSearch] = useState('');
    const [states, setStates] = useState<Record<string, string>>(Object.fromEntries(warehouseItems.map((item) => [item.id, item.state])));
    const [message, setMessage] = useState('');
    const visibleItems = warehouseItems.filter((item) =>
        `${item.serial} ${item.template} ${item.location} ${item.batch}`.toLowerCase().includes(search.toLowerCase())
    );

    const changeState = (id: string, state: string) => {
        setStates((current) => ({ ...current, [id]: state }));
        setMessage(state === 'Списан' ? 'Item списан со склада.' : 'Item возвращен на склад и снова доступен к продаже.');
    };

    return (
        <div>
            <WorkspaceHeader title="Склад HQ" description="Item на складе считаются находящимися в продаже, пока не списаны." />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/8 p-4"><div className="text-xs text-gray-600">На складе</div><div className="mt-2 text-2xl font-semibold text-white">42</div></div>
                <div className="rounded-lg border border-white/8 p-4"><div className="text-xs text-gray-600">Списаны</div><div className="mt-2 text-2xl font-semibold text-white">6</div></div>
                <div className="rounded-lg border border-white/8 p-4"><div className="text-xs text-gray-600">Готовы к продаже</div><div className="mt-2 text-2xl font-semibold text-emerald-300">42</div></div>
            </div>
            <div className="mt-4 max-w-xl"><SearchField value={search} onChange={setSearch} placeholder="Серийный номер, партия или шаблон" /></div>
            {message ? <div className="mt-4"><Notice>{message}</Notice></div> : null}
            <section className="mt-4 overflow-hidden rounded-xl border border-white/8">
                {visibleItems.map((item) => {
                    const state = states[item.id];
                    return (
                        <div key={item.id} className="grid gap-3 border-b border-white/8 px-4 py-4 text-sm last:border-b-0 lg:grid-cols-[1.25fr_1.25fr_110px_120px_120px_180px] lg:items-center">
                            <div><div className="font-mono text-xs text-gray-300">{item.serial}</div><div className="mt-1 text-[11px] text-gray-700">{item.date}</div></div>
                            <span className="text-gray-300">{item.template}</span>
                            <span className="text-gray-500">{item.location}</span>
                            <span className="font-mono text-xs text-gray-500">{item.batch}</span>
                            <span className={state === 'На складе' ? 'text-emerald-300' : 'text-gray-600'}>{state}</span>
                            <div className="flex justify-end">
                                {state === 'На складе' ? (
                                    <SecondaryButton danger onClick={() => changeState(item.id, 'Списан')}><PackageMinus size={13} />Списать</SecondaryButton>
                                ) : (
                                    <SecondaryButton onClick={() => changeState(item.id, 'На складе')}><ArchiveRestore size={13} />Вернуть</SecondaryButton>
                                )}
                            </div>
                        </div>
                    );
                })}
            </section>
            <button type="button" className="mt-4 inline-flex items-center gap-2 text-xs text-gray-600 hover:text-gray-300"><History size={13} />История складских действий</button>
        </div>
    );
}
