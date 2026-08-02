import { Activity, AlertTriangle, Bot, CheckCircle2, CircleUserRound, HardDrive, HardDriveDownload, Server, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ZoneSurfaceProps } from './types';
import { ActiveStageSummary, StageButton, UtilityLinks, ZoneHeading } from './ZoneShared';
import { getAccentStyles } from './zoneStyles';

const serviceRows = [
    { label: 'API', detail: 'Основной backend', value: 'Работает', state: 'ok' },
    { label: 'Photo queue', detail: 'Очередь загрузки media', value: '85%', state: 'attention' },
    { label: 'Video Tool', detail: 'Локальный runtime v3', value: 'Работает', state: 'ok' },
    { label: 'Telegram', detail: 'Отправка событий', value: '2 бота', state: 'ok' },
    { label: 'Хранилище', detail: 'Свободное пространство', value: '124 GB', state: 'ok' }
];

export function SystemMenu(props: ZoneSurfaceProps) {
    const { zone, activeStage, onSelectStage } = props;

    return (
        <div>
            <ZoneHeading zone={zone} activeStage={activeStage} eyebrow="Служебный контур" />
            <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.055] px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <AlertTriangle size={17} className="text-amber-300" />
                    <span className="font-medium text-amber-200">Photo queue заполнена на 85%</span>
                    <span className="text-xs text-gray-500">Критических ошибок нет, но очередь требует наблюдения.</span>
                </div>
            </div>
            <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8 sm:grid-cols-2 lg:grid-cols-3">
                {zone.stages.map((stage) => (
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
            <div className="mt-4 border-t border-white/8 pt-4">
                <UtilityLinks zone={zone} utilities={zone.utilities} />
            </div>
        </div>
    );
}

export function SystemWorkspace(props: ZoneSurfaceProps) {
    const { zone, activeStage } = props;
    const accent = getAccentStyles(zone);

    return (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]">
                <div className="flex items-center gap-2 border-b border-white/8 px-4 py-4">
                    <Activity size={17} className={accent.text} />
                    <div>
                        <h2 className="text-base font-semibold text-white">Состояние сервисов</h2>
                        <p className="mt-1 text-xs text-gray-600">Проблемы выводятся раньше общей статистики.</p>
                    </div>
                </div>
                {serviceRows.map((service) => (
                    <div key={service.label} className="grid gap-2 border-b border-white/8 px-4 py-4 text-sm last:border-b-0 sm:grid-cols-[160px_1fr_120px] sm:items-center">
                        <span className="flex items-center gap-2 font-medium text-gray-200">
                            <Server size={15} className={service.state === 'ok' ? 'text-emerald-300' : 'text-amber-300'} />
                            {service.label}
                        </span>
                        <span className="text-xs text-gray-600">{service.detail}</span>
                        <span className={`flex items-center gap-2 text-xs ${service.state === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {service.state === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                            {service.value}
                        </span>
                    </div>
                ))}
            </section>

            <aside className="space-y-4">
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={17} className={accent.text} />
                        <h2 className="text-sm font-semibold text-white">Доступ и управление</h2>
                    </div>
                    <div className="mt-4 space-y-2">
                        {zone.utilities.map((utility) => {
                            const Icon = utility.icon;

                            return (
                                <Link key={utility.label} to={utility.to} className="flex items-center gap-3 rounded-lg border border-white/8 px-3 py-3 transition hover:bg-white/[0.035]">
                                    <Icon size={16} className="text-gray-500" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm text-gray-300">{utility.label}</span>
                                        <span className="block text-[11px] text-gray-600">{utility.detail}</span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                    <h2 className="text-sm font-semibold text-white">Выбранный контур</h2>
                    <div className="mt-4">
                        <ActiveStageSummary zone={zone} activeStage={activeStage} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8">
                    {[
                        { icon: CircleUserRound, label: 'Пользователи', value: '12' },
                        { icon: HardDriveDownload, label: 'Desktop', value: '1.6.17-2' },
                        { icon: Bot, label: 'Боты', value: '2' },
                        { icon: HardDrive, label: 'Диск', value: '124 GB' }
                    ].map((item) => {
                        const Icon = item.icon;

                        return (
                            <div key={item.label} className="bg-[#0d1014] p-4">
                                <Icon size={16} className="text-slate-400" />
                                <div className="mt-3 text-lg font-semibold text-white">{item.value}</div>
                                <div className="text-[11px] text-gray-600">{item.label}</div>
                            </div>
                        );
                    })}
                </div>
            </aside>
        </div>
    );
}
