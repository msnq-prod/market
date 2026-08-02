import { Check, Plus, Save, X } from 'lucide-react';
import { useState } from 'react';
import { collectionOrders, templates } from './productData';
import { Field, Notice, PrimaryButton, SearchField, SecondaryButton, TextArea, WorkspaceHeader } from './ProductWorkspaceShared';

export function CollectionOrdersWorkspace({ preselectedProductId }: { preselectedProductId?: string }) {
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(collectionOrders[0].id);
    const [creating, setCreating] = useState(Boolean(preselectedProductId));
    const selectedProduct = templates.find((template) => template.id === preselectedProductId) || templates[0];
    const [productId, setProductId] = useState(selectedProduct.id);
    const [qty, setQty] = useState('24');
    const [assignee, setAssignee] = useState('Общий пул партнеров');
    const [note, setNote] = useState('');
    const [immediate, setImmediate] = useState(false);
    const [saved, setSaved] = useState(false);

    return (
        <div>
            <WorkspaceHeader
                title="Заказы на партии"
                description="Создание задания и контроль исполнения."
                action={<PrimaryButton onClick={() => setCreating(true)}><Plus size={15} />Создать заказ</PrimaryButton>}
            />
            <div className="mt-5 grid min-h-[640px] overflow-hidden rounded-xl border border-white/8 lg:grid-cols-[370px_1fr]">
                <aside className="border-r border-white/8 bg-white/[0.018] p-3">
                    <SearchField value={search} onChange={setSearch} placeholder="Шаблон или номер заказа" />
                    <div className="mt-3">
                        {collectionOrders.filter((order) => `${order.id} ${order.template}`.toLowerCase().includes(search.toLowerCase())).map((order) => (
                            <button
                                key={order.id}
                                type="button"
                                onClick={() => { setSelectedId(order.id); setCreating(false); setSaved(false); }}
                                className={`grid min-h-20 w-full grid-cols-[1fr_auto] gap-3 border-b border-white/8 px-3 py-3 text-left ${
                                    !creating && selectedId === order.id ? 'bg-emerald-300/8' : 'hover:bg-white/[0.03]'
                                }`}
                            >
                                <span>
                                    <span className="block text-sm font-medium text-gray-200">{order.template}</span>
                                    <span className="mt-1 block text-xs text-gray-600">{order.id} · {order.location} · {order.qty} Item</span>
                                </span>
                                <span className="text-xs text-gray-500">{order.status}</span>
                            </button>
                        ))}
                    </div>
                </aside>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        setSaved(true);
                    }}
                    className="p-5 sm:p-6"
                >
                    <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-white">{creating ? 'Новый заказ на партию' : selectedId}</h2>
                            <p className="mt-1 text-xs text-gray-600">{creating ? 'Один шаблон, одна локация и один исполнитель.' : 'Состояние и параметры исполнения заказа.'}</p>
                        </div>
                        {creating ? <SecondaryButton onClick={() => setCreating(false)}><X size={13} />Отмена</SecondaryButton> : null}
                    </div>
                    {saved ? <div className="mt-3"><Notice>Заказ сохранен. Экран остается в текущем контексте.</Notice></div> : null}
                    {creating ? (
                        <div className="mt-5 max-w-3xl space-y-5">
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-medium text-gray-500">Товарный шаблон</span>
                                <select value={productId} onChange={(event) => setProductId(event.target.value)} className="min-h-10 w-full rounded-lg border border-white/8 bg-[#0b0e12] px-3 text-sm text-gray-200">
                                    {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                                </select>
                            </label>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Локация" value={templates.find((template) => template.id === productId)?.location || ''} onChange={() => {}} />
                                <Field label="Количество Item" type="number" value={qty} onChange={setQty} />
                            </div>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-medium text-gray-500">Исполнитель</span>
                                <select value={assignee} onChange={(event) => { setAssignee(event.target.value); setImmediate(event.target.value === 'Принять сразу'); }} className="min-h-10 w-full rounded-lg border border-white/8 bg-[#0b0e12] px-3 text-sm text-gray-200">
                                    <option>Общий пул партнеров</option>
                                    <option>Якутия Partner</option>
                                    <option>Принять сразу</option>
                                </select>
                            </label>
                            {immediate ? (
                                <div className="grid gap-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4 sm:grid-cols-2">
                                    <Field label="GPS широта" value="62.03" onChange={() => {}} />
                                    <Field label="GPS долгота" value="129.73" onChange={() => {}} />
                                    <Field label="Дата сбора" type="date" value="2026-06-22" onChange={() => {}} />
                                    <Field label="Время сбора" type="time" value="12:30" onChange={() => {}} />
                                </div>
                            ) : null}
                            <TextArea label="Заметка" value={note} onChange={setNote} />
                            <PrimaryButton type="submit"><Save size={14} />{immediate ? 'Создать и принять партию' : 'Создать заказ'}</PrimaryButton>
                        </div>
                    ) : (
                        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
                            <section className="space-y-4">
                                {Object.entries(collectionOrders.find((order) => order.id === selectedId) || collectionOrders[0]).map(([key, value]) => (
                                    <div key={key} className="grid grid-cols-[150px_1fr] border-b border-white/8 pb-3 text-sm">
                                        <span className="text-gray-600">{key}</span>
                                        <span className="text-gray-300">{String(value)}</span>
                                    </div>
                                ))}
                                <div className="flex gap-2 pt-2">
                                    <PrimaryButton><Save size={14} />Сохранить изменения</PrimaryButton>
                                    <SecondaryButton danger>Отменить заказ</SecondaryButton>
                                </div>
                            </section>
                            <aside className="rounded-xl border border-white/8 p-4">
                                <h3 className="text-sm font-semibold text-white">Исполнение</h3>
                                <div className="mt-4 space-y-3 text-xs">
                                    {['Заказ создан', 'Партнер назначен', 'Партия создана', 'Приемка HQ'].map((label, index) => (
                                        <div key={label} className="flex items-center gap-3">
                                            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${index < 2 ? 'bg-emerald-300/10 text-emerald-300' : 'bg-white/[0.04] text-gray-600'}`}>
                                                {index < 2 ? <Check size={13} /> : index + 1}
                                            </span>
                                            <span className={index < 2 ? 'text-gray-300' : 'text-gray-600'}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </aside>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
