import { Eye, EyeOff, Plus, Save } from 'lucide-react';
import { useState } from 'react';
import { templates } from './productData';
import { Field, PrimaryButton, SearchField, SecondaryButton, TextArea, WorkspaceHeader } from './ProductWorkspaceShared';

export function TemplatesWorkspace({ onCreateOrder }: { onCreateOrder: (productId: string) => void }) {
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(templates[0].id);
    const selected = templates.find((template) => template.id === selectedId) || templates[0];
    const [name, setName] = useState(selected.name);
    const [description, setDescription] = useState('Описание товара для публичной карточки.');
    const [saved, setSaved] = useState(false);

    const selectTemplate = (id: string) => {
        const next = templates.find((template) => template.id === id) || templates[0];
        setSelectedId(id);
        setName(next.name);
        setSaved(false);
    };

    return (
        <div>
            <WorkspaceHeader
                title="Товарные шаблоны"
                description="Каталог, публичный контент и коды будущих Item."
                action={<PrimaryButton onClick={() => { setName(''); setSelectedId('new'); }}><Plus size={15} />Создать шаблон</PrimaryButton>}
            />
            <div className="mt-5 grid min-h-[680px] overflow-hidden rounded-xl border border-white/8 lg:grid-cols-[360px_1fr]">
                <aside className="border-r border-white/8 bg-white/[0.018] p-3">
                    <SearchField value={search} onChange={setSearch} placeholder="Название или код" />
                    <div className="mt-3">
                        {templates.filter((template) => `${template.name} ${template.code}`.toLowerCase().includes(search.toLowerCase())).map((template) => (
                            <button
                                key={template.id}
                                type="button"
                                onClick={() => selectTemplate(template.id)}
                                className={`grid min-h-20 w-full grid-cols-[1fr_auto] gap-3 border-b border-white/8 px-3 py-3 text-left transition ${
                                    selectedId === template.id ? 'bg-emerald-300/8' : 'hover:bg-white/[0.03]'
                                }`}
                            >
                                <span>
                                    <span className="block text-sm font-medium text-gray-200">{template.name}</span>
                                    <span className="mt-1 block text-xs text-gray-600">{template.location} · {template.code}</span>
                                </span>
                                <span className={template.published ? 'text-emerald-300' : 'text-gray-600'}>{template.published ? <Eye size={15} /> : <EyeOff size={15} />}</span>
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
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-white">{name || 'Новый товарный шаблон'}</h2>
                            <p className="mt-1 text-xs text-gray-600">{selected.location} · {selected.category}</p>
                        </div>
                        <div className="flex gap-2">
                            <SecondaryButton onClick={() => onCreateOrder(selectedId)}>Создать заказ на партию</SecondaryButton>
                            <PrimaryButton type="submit"><Save size={14} />Сохранить</PrimaryButton>
                        </div>
                    </div>
                    {saved ? <div className="mt-3 text-xs text-emerald-300">Изменения сохранены.</div> : null}
                    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
                        <div className="space-y-5">
                            <section className="grid gap-4 sm:grid-cols-2">
                                <Field label="Название" value={name} onChange={setName} />
                                <Field label="Цена" type="number" value={selected.price} onChange={() => {}} />
                                <Field label="Категория" value={selected.category} onChange={() => {}} />
                                <Field label="Локация" value={selected.location} onChange={() => {}} />
                            </section>
                            <TextArea label="Описание товара" value={description} onChange={setDescription} />
                            <TextArea label="Описание места" value="Описание происхождения товара." onChange={() => {}} />
                            <section className="border-t border-white/8 pt-4">
                                <h3 className="text-sm font-semibold text-white">Идентификация</h3>
                                <div className="mt-3 grid grid-cols-3 gap-3">
                                    <Field label="Страна" value={selected.code.slice(0, 3)} onChange={() => {}} />
                                    <Field label="Локация" value={selected.code.slice(3, 6)} onChange={() => {}} />
                                    <Field label="Товар" value={selected.code.slice(6)} onChange={() => {}} />
                                </div>
                                <div className="mt-3 rounded-lg border border-white/8 bg-black/20 px-3 py-3 font-mono text-xs text-gray-400">
                                    Пример: {selected.code}220626001
                                </div>
                            </section>
                        </div>
                        <aside className="space-y-4">
                            <div className="aspect-[4/3] rounded-xl border border-dashed border-white/10 bg-[#0b0e12]">
                                <div className="flex h-full items-center justify-center text-xs text-gray-700">Изображение шаблона</div>
                            </div>
                            <div className="rounded-xl border border-white/8 p-4">
                                <h3 className="text-sm font-semibold text-white">Публичная карточка</h3>
                                <div className="mt-4 space-y-3 text-xs">
                                    <div className="flex justify-between gap-3"><span className="text-gray-600">Публикация</span><span className={selected.published ? 'text-emerald-300' : 'text-amber-300'}>{selected.published ? 'Опубликован' : 'Черновик'}</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-gray-600">Wildberries</span><span className="text-gray-400">Настроено</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-gray-600">Ozon</span><span className="text-gray-400">Не настроено</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-gray-600">Переводы</span><span className="text-gray-400">2 / 3</span></div>
                                </div>
                            </div>
                        </aside>
                    </div>
                </form>
            </div>
        </div>
    );
}
