import { AlertTriangle, ArrowRight, Clock3, History, PackageCheck, ReceiptText, Truck, UserRoundSearch } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ZoneSurfaceProps } from './types';
import { ActiveStageSummary, StageButton, UtilityLinks, ZoneHeading } from './ZoneShared';
import { getAccentStyles } from './zoneStyles';

const orderRows = [
    { id: '#1048', customer: 'Анна Соколова', amount: '148 000 ₽', age: '2 ч 14 мин', status: 'NEW' },
    { id: '#1047', customer: 'Михаил Орлов', amount: '96 000 ₽', age: '1 ч 42 мин', status: 'NEW' },
    { id: '#1045', customer: 'Елена Волкова', amount: '214 000 ₽', age: '38 мин', status: 'IN_PROGRESS' },
    { id: '#1042', customer: 'Илья Романов', amount: '72 000 ₽', age: '3 ч 08 мин', status: 'PACKED' }
];

export function SalesMenu(props: ZoneSurfaceProps) {
    const { zone, activeStage, onSelectStage } = props;
    const orderStages = zone.stages.filter((stage) => stage.id !== 'returns');
    const returnsStage = zone.stages.find((stage) => stage.id === 'returns');

    return (
        <div>
            <ZoneHeading zone={zone} activeStage={activeStage} eyebrow="Очередь обработки" />
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_300px]">
                <div className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
                    <div className="grid gap-px bg-white/8 sm:grid-cols-2 xl:grid-cols-4">
                        {orderStages.map((stage) => {
                            const Icon = stage.icon;
                            const active = stage.id === activeStage.id;

                            return (
                                <button
                                    key={stage.id}
                                    type="button"
                                    data-testid={`mega-stage-${zone.id}-${stage.id}`}
                                    onClick={() => onSelectStage(stage.id)}
                                    aria-pressed={active}
                                    className={`min-h-36 bg-[#0d1014] p-4 text-left transition hover:bg-white/[0.035] ${active ? 'bg-sky-300/10' : ''}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={active ? 'text-sky-300' : 'text-gray-500'}><Icon size={17} /></span>
                                        <span className="text-3xl font-semibold text-white">{stage.count}</span>
                                    </div>
                                    <div className="mt-4 text-sm font-medium text-gray-200">{stage.label}</div>
                                    <div className="mt-1 text-xs leading-5 text-gray-600">{stage.detail}</div>
                                    <div className="mt-3 h-1 rounded-full bg-white/8">
                                        <div className="h-full rounded-full bg-sky-300" style={{ width: `${stage.progress || 0}%` }} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {returnsStage ? (
                    <StageButton
                        zone={zone}
                        stage={returnsStage}
                        active={returnsStage.id === activeStage.id}
                        onSelect={() => onSelectStage(returnsStage.id)}
                        layout="row"
                    />
                ) : null}
            </div>
            <div className="mt-4 border-t border-white/8 pt-4">
                <UtilityLinks zone={zone} utilities={zone.utilities} />
            </div>
        </div>
    );
}

export function SalesWorkspace(props: ZoneSurfaceProps) {
    const { zone, activeStage } = props;
    const accent = getAccentStyles(zone);

    return (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <section className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-white">Приоритетная очередь</h2>
                        <p className="mt-1 text-xs text-gray-600">Сначала новые и заказы с нарушением времени обработки.</p>
                    </div>
                    <Link to="/admin/orders" className={`inline-flex items-center gap-2 text-xs font-medium ${accent.text}`}>
                        Все заказы
                        <ArrowRight size={14} />
                    </Link>
                </div>
                <div className="hidden grid-cols-[80px_1fr_120px_100px_120px] gap-3 border-b border-white/8 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-gray-700 sm:grid">
                    <span>Заказ</span>
                    <span>Клиент</span>
                    <span>Сумма</span>
                    <span>Возраст</span>
                    <span>Статус</span>
                </div>
                {orderRows.map((order) => (
                    <Link
                        key={order.id}
                        to="/admin/orders"
                        className="grid gap-2 border-b border-white/8 px-4 py-4 text-sm transition last:border-b-0 hover:bg-white/[0.035] sm:grid-cols-[80px_1fr_120px_100px_120px] sm:items-center sm:gap-3"
                    >
                        <span className="font-medium text-white">{order.id}</span>
                        <span className="flex items-center gap-2 text-gray-300">
                            <UserRoundSearch size={15} className="text-gray-600" />
                            {order.customer}
                        </span>
                        <span className="text-gray-400">{order.amount}</span>
                        <span className={order.age.startsWith('3') || order.age.startsWith('2') ? 'text-amber-300' : 'text-gray-500'}>{order.age}</span>
                        <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-medium ${
                            order.status === 'NEW'
                                ? 'bg-sky-300/10 text-sky-300'
                                : order.status === 'PACKED'
                                    ? 'bg-emerald-300/10 text-emerald-300'
                                    : 'bg-white/[0.05] text-gray-400'
                        }`}>
                            {order.status}
                        </span>
                    </Link>
                ))}
            </section>

            <aside className="space-y-4">
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.055] p-4">
                    <div className="flex items-center gap-2 text-amber-300">
                        <AlertTriangle size={17} />
                        <h2 className="text-sm font-semibold">Требует реакции</h2>
                    </div>
                    <div className="mt-4 space-y-3">
                        {[
                            { icon: Clock3, label: 'Новые старше 2 часов', value: '3' },
                            { icon: Truck, label: 'Трекинг без обновления', value: '1' },
                            { icon: History, label: 'Активные возвраты', value: '2' }
                        ].map((item) => {
                            const Icon = item.icon;

                            return (
                                <Link key={item.label} to="/admin/orders" className="flex items-center gap-3 border-b border-white/8 pb-3 text-xs last:border-b-0 last:pb-0">
                                    <Icon size={15} className="text-amber-300/80" />
                                    <span className="min-w-0 flex-1 text-gray-400">{item.label}</span>
                                    <span className="text-lg font-semibold text-white">{item.value}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2">
                        <ReceiptText size={17} className={accent.text} />
                        <h2 className="text-sm font-semibold text-white">Выбранная очередь</h2>
                    </div>
                    <div className="mt-4">
                        <ActiveStageSummary zone={zone} activeStage={activeStage} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8">
                    <div className="bg-[#0d1014] p-4">
                        <PackageCheck size={17} className="text-emerald-300" />
                        <div className="mt-3 text-2xl font-semibold text-white">4</div>
                        <div className="text-xs text-gray-600">упаковано</div>
                    </div>
                    <div className="bg-[#0d1014] p-4">
                        <Truck size={17} className="text-sky-300" />
                        <div className="mt-3 text-2xl font-semibold text-white">4</div>
                        <div className="text-xs text-gray-600">в доставке</div>
                    </div>
                </div>
            </aside>
        </div>
    );
}
