import { AlertCircle, Archive, CalendarDays, CheckCircle2, ChevronRight, Clock3, PackageOpen, Truck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ZoneSurfaceProps } from './types';
import { ActiveStageSummary, StageButton, UtilityLinks, ZoneHeading } from './ZoneShared';
import { getAccentStyles } from './zoneStyles';
import { ProductScenarioWorkspace } from './products/ProductScenarioWorkspace';
import { ProductsMegaMenu } from './products/ProductsMegaMenu';
import { productScenarioStages } from './products/productScenarios';

const exceptionRows = [
    { id: 'B-250624-07', route: 'Гуанчжоу → Владивосток', wait: '2 дн.', state: 'Просрочена', amount: '580 000 ₽' },
    { id: 'B-250618-03', route: 'Шэньчжэнь → Владивосток', wait: '1 дн.', state: 'Просрочена', amount: '320 100 ₽' },
    { id: 'B-250620-02', route: 'Иу → Владивосток', wait: '0 дн.', state: 'Сегодня', amount: '220 200 ₽' }
];

const readinessRows = [
    { label: 'Документы поставщика', value: '3 / 3', ready: true },
    { label: 'Инвойс и упаковочный лист', value: '3 / 3', ready: true },
    { label: 'Трек-номер и транспорт', value: '3 / 3', ready: true },
    { label: 'Фото упаковки', value: '2 / 3', ready: false },
    { label: 'Разгрузочный план', value: '3 / 3', ready: true }
];

const arrivalRows = [
    { date: '24 июня', id: 'B-250624-08', route: 'Гуанчжоу → Владивосток', amount: '420 300 ₽' },
    { date: '25 июня', id: 'B-250625-01', route: 'Шэньчжэнь → Владивосток', amount: '610 000 ₽' },
    { date: '27 июня', id: 'B-250627-02', route: 'Иу → Владивосток', amount: '310 200 ₽' }
];

export function PhysicalMenu(props: ZoneSurfaceProps) {
    const { zone, activeStage, onSelectStage } = props;
    const mobileActiveStage = zone.stages.find((stage) => stage.id === activeStage.id) || zone.stages[0];
    const [searchParams, setSearchParams] = useSearchParams();
    const selectDesktopScenario = (scenarioId: string) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('productsView', scenarioId);
        nextParams.delete('batchId');
        setSearchParams(nextParams);
        onSelectStage(scenarioId);
    };

    return (
        <>
            <div className="hidden lg:block">
                <ProductsMegaMenu
                    stages={productScenarioStages}
                    activeStage={activeStage}
                    onSelectStage={selectDesktopScenario}
                />
            </div>
            <div className="lg:hidden">
                <ZoneHeading zone={zone} activeStage={mobileActiveStage} eyebrow="Логистический конвейер" />
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {zone.stages.map((stage) => (
                        <StageButton
                            key={stage.id}
                            zone={zone}
                            stage={stage}
                            active={stage.id === mobileActiveStage.id}
                            onSelect={() => onSelectStage(stage.id)}
                        />
                    ))}
                </div>
                <div className="mt-4 border-t border-white/8 pt-4">
                    <UtilityLinks zone={zone} utilities={zone.utilities} />
                </div>
            </div>
        </>
    );
}

export function PhysicalWorkspace(props: ZoneSurfaceProps) {
    const { zone, activeStage, onSelectStage } = props;
    const mobileActiveStage = zone.stages.find((stage) => stage.id === activeStage.id) || zone.stages[0];
    const [searchParams, setSearchParams] = useSearchParams();
    const accent = getAccentStyles(zone);
    const navigateProductScenario = (scenarioId: string, contextId?: string) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('productsView', scenarioId);
        if (contextId) nextParams.set('batchId', contextId);
        else nextParams.delete('batchId');
        setSearchParams(nextParams);
        onSelectStage(scenarioId);
    };

    return (
        <>
            <div className="hidden lg:block">
                <ProductScenarioWorkspace
                    scenarioId={activeStage.id}
                    contextId={searchParams.get('batchId') || undefined}
                    onNavigate={navigateProductScenario}
                />
            </div>
            <div className="space-y-4 lg:hidden">
            <section className="grid gap-4 lg:grid-cols-[1.15fr_0.8fr_0.95fr]">
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={17} className="text-rose-300" />
                        <h2 className="text-base font-semibold text-white">Исключения и внимание</h2>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-lg border border-white/8">
                        <div className="border-b border-white/8 bg-white/[0.025] px-3 py-3 text-sm font-medium text-rose-300">
                            3 партии ждут приемки
                        </div>
                        {exceptionRows.map((row) => (
                            <Link
                                key={row.id}
                                to="/admin/acceptance"
                                className="group grid gap-1 border-b border-white/8 px-3 py-3 text-xs transition last:border-b-0 hover:bg-white/[0.035] sm:grid-cols-[100px_1fr_auto_auto_auto] sm:items-center sm:gap-3"
                            >
                                <span className="font-medium text-gray-200">{row.id}</span>
                                <span className="truncate text-gray-500">{row.route}</span>
                                <span className="text-amber-300">{row.wait}</span>
                                <span className={row.state === 'Просрочена' ? 'text-rose-300' : 'text-amber-300'}>{row.state}</span>
                                <span className="flex items-center justify-between gap-2 text-gray-400">
                                    {row.amount}
                                    <ChevronRight size={13} className="text-gray-700 group-hover:text-gray-300" />
                                </span>
                            </Link>
                        ))}
                    </div>
                    <div className="mt-4">
                        <ActiveStageSummary zone={zone} activeStage={mobileActiveStage} />
                    </div>
                </div>

                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={17} className="text-emerald-300" />
                        <h2 className="text-base font-semibold text-white">Готовность к приемке</h2>
                    </div>
                    <div className="mt-4 space-y-3">
                        {readinessRows.map((row) => (
                            <div key={row.label} className="flex items-center gap-3 text-xs">
                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                                    row.ready ? 'bg-emerald-300/12 text-emerald-300' : 'bg-amber-300/12 text-amber-300'
                                }`}>
                                    {row.ready ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                                </span>
                                <span className="min-w-0 flex-1 text-gray-400">{row.label}</span>
                                <span className={row.ready ? 'text-gray-300' : 'text-amber-300'}>{row.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 h-1.5 rounded-full bg-white/8">
                        <div className="h-full w-4/5 rounded-full bg-emerald-300" />
                    </div>
                    <div className="mt-2 text-xs font-medium text-emerald-300">80% готово</div>
                </div>

                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2">
                        <CalendarDays size={17} className={accent.text} />
                        <h2 className="text-base font-semibold text-white">Ближайшие прибытия</h2>
                    </div>
                    <div className="mt-4 divide-y divide-white/8">
                        {arrivalRows.map((row) => (
                            <Link key={row.id} to="/admin/acceptance" className="grid gap-1 py-3 text-xs transition hover:bg-white/[0.02] sm:grid-cols-[70px_1fr_auto] sm:items-start sm:gap-3">
                                <span className={accent.text}>{row.date}</span>
                                <span>
                                    <span className="block font-medium text-gray-300">{row.id}</span>
                                    <span className="mt-1 block text-gray-600">{row.route}</span>
                                </span>
                                <span className="text-gray-400">{row.amount}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            <section className="grid gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8 sm:grid-cols-3 lg:grid-cols-6">
                {[
                    { icon: Truck, label: 'В пути', value: '7', note: '2 840 560 ₽' },
                    { icon: PackageOpen, label: 'В приемке', value: '3', note: '1 120 300 ₽' },
                    { icon: Clock3, label: 'Медиа', value: '18', note: '1 050 000 ₽' },
                    { icon: CheckCircle2, label: 'На складе HQ', value: '42', note: '5 760 900 ₽' },
                    { icon: Archive, label: 'Резерв', value: '14', note: '1 120 000 ₽' },
                    { icon: PackageOpen, label: 'Всего запасов', value: '56', note: '6 880 900 ₽' }
                ].map((item) => {
                    const Icon = item.icon;

                    return (
                        <div key={item.label} className="flex items-center gap-3 bg-[#0d1014] px-4 py-4">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${accent.background} ${accent.text}`}>
                                <Icon size={17} />
                            </span>
                            <span>
                                <span className="block text-xs text-gray-400">{item.label}</span>
                                <span className="mt-0.5 block text-xl font-semibold text-white">{item.value}</span>
                                <span className="block text-[10px] text-gray-600">{item.note}</span>
                            </span>
                        </div>
                    );
                })}
            </section>
            </div>
        </>
    );
}
