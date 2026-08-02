import { EyeOff, Plus, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { locations } from './productData';
import { Field, PrimaryButton, SearchField, SecondaryButton, TextArea, WorkspaceHeader } from './ProductWorkspaceShared';

export function LocationsWorkspace() {
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(locations[0].id);
    const [saved, setSaved] = useState('');
    const selected = locations.find((location) => location.id === selectedId) || locations[0];
    const [form, setForm] = useState(selected);

    const selectLocation = (id: string) => {
        const next = locations.find((location) => location.id === id) || locations[0];
        setSelectedId(id);
        setForm(next);
        setSaved('');
    };

    const createLocation = () => {
        setSelectedId('new');
        setForm({ id: 'new', name: '', country: '', lat: '', lng: '', description: '', hidden: false, templates: 0, batches: 0 });
        setSaved('');
    };

    return (
        <div>
            <WorkspaceHeader
                title="Локации"
                description="Создание и поддержка точек происхождения товара."
                action={<PrimaryButton onClick={createLocation}><Plus size={15} />Создать локацию</PrimaryButton>}
            />
            <div className="mt-5 grid min-h-[650px] overflow-hidden rounded-xl border border-white/8 lg:grid-cols-[330px_1fr]">
                <aside className="border-b border-white/8 bg-white/[0.018] p-3 lg:border-b-0 lg:border-r">
                    <SearchField value={search} onChange={setSearch} placeholder="Поиск локации" />
                    <div className="mt-3">
                        {locations.filter((location) => location.name.toLowerCase().includes(search.toLowerCase())).map((location) => (
                            <button
                                key={location.id}
                                type="button"
                                onClick={() => selectLocation(location.id)}
                                className={`flex min-h-16 w-full items-center gap-3 border-b border-white/8 px-3 text-left transition ${
                                    selectedId === location.id ? 'bg-emerald-300/8' : 'hover:bg-white/[0.03]'
                                }`}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-gray-200">{location.name}</span>
                                    <span className="mt-1 block text-xs text-gray-600">{location.country}</span>
                                </span>
                                <span className={location.hidden ? 'text-xs text-gray-600' : 'text-xs text-emerald-300'}>
                                    {location.hidden ? 'Скрыта' : 'Активна'}
                                </span>
                            </button>
                        ))}
                    </div>
                </aside>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        setSaved('Сохранено');
                    }}
                    className="p-5 sm:p-6"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-white">{form.name || 'Новая локация'}</h2>
                            <p className="mt-1 text-xs text-gray-600">{form.templates} шаблонов · {form.batches} партий</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {form.hidden ? <SecondaryButton><RotateCcw size={13} />Восстановить</SecondaryButton> : <SecondaryButton danger><EyeOff size={13} />Скрыть</SecondaryButton>}
                            <PrimaryButton type="submit"><Save size={14} />Сохранить</PrimaryButton>
                        </div>
                    </div>
                    {saved ? <div className="mt-3 text-xs text-emerald-300">{saved}</div> : null}
                    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
                        <div className="space-y-5">
                            <section className="grid gap-4 sm:grid-cols-2">
                                <Field label="Название" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
                                <Field label="Страна" value={form.country} onChange={(country) => setForm((current) => ({ ...current, country }))} />
                                <Field label="Широта" type="number" value={form.lat} onChange={(lat) => setForm((current) => ({ ...current, lat }))} />
                                <Field label="Долгота" type="number" value={form.lng} onChange={(lng) => setForm((current) => ({ ...current, lng }))} />
                            </section>
                            <TextArea label="Описание" value={form.description} onChange={(description) => setForm((current) => ({ ...current, description }))} />
                            <section className="border-t border-white/8 pt-4">
                                <h3 className="text-sm font-semibold text-white">Переводы</h3>
                                <p className="mt-1 text-xs text-gray-600">Основной язык и доступные локализации.</p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                    {['Русский · заполнен', 'English · заполнен', '中文 · не заполнен'].map((label) => (
                                        <button key={label} type="button" className="rounded-lg border border-white/8 px-3 py-3 text-left text-xs text-gray-400 hover:bg-white/[0.03]">{label}</button>
                                    ))}
                                </div>
                            </section>
                        </div>
                        <aside className="space-y-4">
                            <div className="aspect-[4/3] rounded-xl border border-dashed border-white/10 bg-[#0b0e12] p-4">
                                <div className="flex h-full items-center justify-center text-xs text-gray-700">Изображение локации</div>
                            </div>
                            <div className="rounded-xl border border-white/8 p-4">
                                <h3 className="text-sm font-semibold text-white">Подпись на планете</h3>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <Field label="Desktop X" value="100" onChange={() => {}} />
                                    <Field label="Desktop Y" value="16" onChange={() => {}} />
                                    <Field label="Mobile X" value="80" onChange={() => {}} />
                                    <Field label="Mobile Y" value="16" onChange={() => {}} />
                                </div>
                            </div>
                        </aside>
                    </div>
                </form>
            </div>
        </div>
    );
}
