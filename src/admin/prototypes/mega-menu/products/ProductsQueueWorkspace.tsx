import { ArrowRight, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { productTasks } from './productData';
import { SearchField, StatusDot, WorkspaceHeader } from './ProductWorkspaceShared';

const groupOrder = ['Ошибки проверки', 'Требуют фото', 'Требуют видео', 'Готовы на склад', 'Ожидают приемки'];

export function ProductsQueueWorkspace({ onNavigate }: { onNavigate: (scenarioId: string, contextId?: string) => void }) {
    const [search, setSearch] = useState('');
    const visibleTasks = productTasks.filter((task) =>
        `${task.template} ${task.location} ${task.batch}`.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div>
            <WorkspaceHeader title="Очередь товаров" description="Следующая необходимая работа по партиям." />
            <div className="mt-4 flex flex-wrap gap-3 border-b border-white/8 pb-4">
                <div className="min-w-[260px] flex-1">
                    <SearchField value={search} onChange={setSearch} placeholder="Шаблон, локация или партия" />
                </div>
                <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/8 px-3 text-xs text-gray-500">
                    <SlidersHorizontal size={14} />
                    Только требующие действия
                </button>
            </div>

            <div className="mt-2">
                {groupOrder.map((group) => {
                    const tasks = visibleTasks.filter((task) => task.group === group);
                    if (tasks.length === 0) return null;

                    return (
                        <section key={group} className="border-b border-white/8 py-4 last:border-b-0">
                            <div className="mb-2 flex items-center gap-2 px-2">
                                <StatusDot tone={tasks[0].tone} />
                                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{group}</h2>
                                <span className="text-xs text-gray-700">{tasks.length}</span>
                            </div>
                            <div className="overflow-hidden rounded-lg border border-white/8">
                                <div className="hidden grid-cols-[minmax(230px,1.3fr)_130px_120px_70px_100px_100px_minmax(160px,1fr)_150px] gap-3 border-b border-white/8 bg-white/[0.018] px-4 py-2 text-[10px] uppercase tracking-[0.13em] text-gray-700 xl:grid">
                                    <span>Шаблон</span>
                                    <span>Локация</span>
                                    <span>Партия</span>
                                    <span>Item</span>
                                    <span>Фото</span>
                                    <span>Видео</span>
                                    <span>Состояние</span>
                                    <span />
                                </div>
                                {tasks.map((task) => (
                                    <div
                                        key={task.id}
                                        className="grid gap-3 border-b border-white/8 bg-white/[0.015] px-4 py-3 text-sm last:border-b-0 hover:bg-white/[0.03] xl:grid-cols-[minmax(230px,1.3fr)_130px_120px_70px_100px_100px_minmax(160px,1fr)_150px] xl:items-center"
                                    >
                                        <span className="font-medium text-gray-200">{task.template}</span>
                                        <span className="text-gray-500">{task.location}</span>
                                        <span className="font-mono text-xs text-gray-400">{task.batch}</span>
                                        <span className="text-gray-300">{task.items}</span>
                                        <span className={task.photos.split(' / ')[0] === task.photos.split(' / ')[1] ? 'text-emerald-300' : 'text-amber-300'}>{task.photos}</span>
                                        <span className={task.videos.split(' / ')[0] === task.videos.split(' / ')[1] ? 'text-emerald-300' : 'text-sky-300'}>{task.videos}</span>
                                        <span className="flex items-center gap-2 text-xs text-gray-400">
                                            <StatusDot tone={task.tone} />
                                            {task.status}
                                        </span>
                                        <button
                                            type="button"
                                            data-testid={`product-task-${task.id}`}
                                            onClick={() => onNavigate(task.scenario, task.batch)}
                                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-medium text-gray-300 transition hover:border-emerald-300/25 hover:bg-emerald-300/8 hover:text-emerald-200"
                                        >
                                            {task.action}
                                            <ArrowRight size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
