import { CheckCircle2, CircleDashed, Eye, FileText, Globe2, MapPinned, RadioTower, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ZoneSurfaceProps } from './types';
import { ActiveStageSummary, StageButton, UtilityLinks, ZoneHeading } from './ZoneShared';
import { getAccentStyles } from './zoneStyles';

const contentRows = [
    { label: 'Кварц «Горный свет»', location: 'Якутия', readiness: 100, state: 'Опубликован' },
    { label: 'Аметист «Полярная ночь»', location: 'Урал', readiness: 84, state: 'Черновик' },
    { label: 'Топаз «Глубина»', location: 'Бразилия', readiness: 72, state: 'Нет перевода' },
    { label: 'Цитрин «Солнце»', location: 'Мадагаскар', readiness: 58, state: 'Нет media' }
];

export function PlanetMenu(props: ZoneSurfaceProps) {
    const { zone, activeStage, onSelectStage } = props;
    const publicationStage = zone.stages.find((stage) => stage.id === 'publication');
    const otherStages = zone.stages.filter((stage) => stage.id !== 'publication');

    return (
        <div>
            <ZoneHeading zone={zone} activeStage={activeStage} eyebrow="Клиентская поверхность" />
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="grid gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8 sm:grid-cols-2">
                    {otherStages.map((stage) => (
                        <StageButton
                            key={stage.id}
                            zone={zone}
                            stage={stage}
                            active={stage.id === activeStage.id}
                            onSelect={() => onSelectStage(stage.id)}
                            layout="row"
                        />
                    ))}
                </div>
                {publicationStage ? (
                    <StageButton
                        zone={zone}
                        stage={publicationStage}
                        active={publicationStage.id === activeStage.id}
                        onSelect={() => onSelectStage(publicationStage.id)}
                    />
                ) : null}
            </div>
            <div className="mt-4 border-t border-white/8 pt-4">
                <UtilityLinks zone={zone} utilities={zone.utilities} />
            </div>
        </div>
    );
}

export function PlanetWorkspace(props: ZoneSurfaceProps) {
    const { zone, activeStage } = props;
    const accent = getAccentStyles(zone);

    return (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-white">Готовность витрины</h2>
                        <p className="mt-1 text-xs text-gray-600">Контент, который определяет внешний вид карточек и паспортов.</p>
                    </div>
                    <Link to="/admin/products" className={`text-xs font-medium ${accent.text}`}>Открыть каталог</Link>
                </div>
                <div className="hidden grid-cols-[1fr_120px_140px_130px] gap-3 border-b border-white/8 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-gray-700 sm:grid">
                    <span>Карточка</span>
                    <span>Локация</span>
                    <span>Готовность</span>
                    <span>Статус</span>
                </div>
                {contentRows.map((row) => (
                    <Link
                        key={row.label}
                        to="/admin/products"
                        className="grid gap-2 border-b border-white/8 px-4 py-4 text-sm transition last:border-b-0 hover:bg-white/[0.035] sm:grid-cols-[1fr_120px_140px_130px] sm:items-center sm:gap-3"
                    >
                        <span className="font-medium text-gray-200">{row.label}</span>
                        <span className="flex items-center gap-2 text-gray-500">
                            <MapPinned size={14} />
                            {row.location}
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="h-1.5 min-w-16 flex-1 rounded-full bg-white/8">
                                <span className="block h-full rounded-full bg-amber-200" style={{ width: `${row.readiness}%` }} />
                            </span>
                            <span className="text-xs text-gray-400">{row.readiness}%</span>
                        </span>
                        <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] ${
                            row.state === 'Опубликован'
                                ? 'bg-emerald-300/10 text-emerald-300'
                                : 'bg-amber-200/10 text-amber-200'
                        }`}>
                            {row.state}
                        </span>
                    </Link>
                ))}
            </section>

            <aside className="space-y-4">
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2">
                        <Eye size={17} className={accent.text} />
                        <h2 className="text-sm font-semibold text-white">Видит покупатель</h2>
                    </div>
                    <div className="mt-4 space-y-3">
                        {[
                            { icon: Globe2, label: 'Локации на планете', value: '7', ok: true },
                            { icon: Store, label: 'Опубликованные карточки', value: '8', ok: true },
                            { icon: FileText, label: 'Доступные паспорта', value: '110', ok: true },
                            { icon: RadioTower, label: 'Неполные каналы', value: '4', ok: false }
                        ].map((item) => {
                            const Icon = item.icon;

                            return (
                                <div key={item.label} className="flex items-center gap-3 border-b border-white/8 pb-3 text-xs last:border-b-0 last:pb-0">
                                    <Icon size={15} className={item.ok ? 'text-amber-200' : 'text-gray-600'} />
                                    <span className="min-w-0 flex-1 text-gray-400">{item.label}</span>
                                    <span className="text-lg font-semibold text-white">{item.value}</span>
                                    {item.ok ? <CheckCircle2 size={14} className="text-emerald-300" /> : <CircleDashed size={14} className="text-amber-300" />}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                    <h2 className="text-sm font-semibold text-white">Выбранная поверхность</h2>
                    <div className="mt-4">
                        <ActiveStageSummary zone={zone} activeStage={activeStage} />
                    </div>
                </div>
            </aside>
        </div>
    );
}
