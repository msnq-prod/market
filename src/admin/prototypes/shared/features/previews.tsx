export function PhysicalPreview() {
    const stages = [
        { label: 'Партии', value: '7', state: 'в пути' },
        { label: 'Приемка', value: '3', state: 'к проверке' },
        { label: 'Медиа', value: '18', state: 'items' },
        { label: 'Склад', value: '42', state: 'готово' }
    ];

    return (
        <div className="grid gap-3 sm:grid-cols-4">
            {stages.map((stage, index) => (
                <div key={stage.label} className="relative rounded-lg border border-white/8 bg-white/[0.035] p-3">
                    {index < stages.length - 1 ? (
                        <div className="absolute right-[-10px] top-1/2 hidden h-px w-5 bg-emerald-300/35 sm:block" />
                    ) : null}
                    <div className="text-[11px] text-gray-500">{stage.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{stage.value}</div>
                    <div className="mt-1 text-xs text-emerald-100/70">{stage.state}</div>
                </div>
            ))}
        </div>
    );
}

export function SalesPreview() {
    const lanes = [
        { label: 'Новые', width: '78%', value: '9' },
        { label: 'В сборке', width: '52%', value: '6' },
        { label: 'Доставка', width: '34%', value: '4' },
        { label: 'Возврат', width: '18%', value: '2' }
    ];

    return (
        <div className="space-y-3">
            {lanes.map((lane) => (
                <div key={lane.label} className="grid grid-cols-[88px_1fr_32px] items-center gap-3">
                    <div className="text-xs text-gray-400">{lane.label}</div>
                    <div className="h-2 rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-sky-300/80" style={{ width: lane.width }} />
                    </div>
                    <div className="text-right text-sm font-medium text-white">{lane.value}</div>
                </div>
            ))}
        </div>
    );
}

export function PlanetPreview() {
    const cells = [
        { label: 'Локации', value: '7', live: true },
        { label: 'Карточки', value: '14', live: true },
        { label: 'Паспорта', value: '110', live: true },
        { label: 'Черновики', value: '4', live: false }
    ];

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {cells.map((cell) => (
                <div key={cell.label} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.035] px-3 py-3">
                    <div>
                        <div className="text-xs text-gray-500">{cell.label}</div>
                        <div className="mt-1 text-xl font-semibold text-white">{cell.value}</div>
                    </div>
                    <span className={`h-2.5 w-2.5 rounded-full ${cell.live ? 'bg-amber-200' : 'bg-white/20'}`} />
                </div>
            ))}
        </div>
    );
}

export function SystemPreview() {
    const services = [
        { label: 'API', state: 'ok' },
        { label: 'Фото', state: '85%' },
        { label: 'Видео', state: 'ok' },
        { label: 'Боты', state: '2' }
    ];

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {services.map((service) => (
                <div key={service.label} className="rounded-lg border border-white/8 bg-white/[0.035] p-3">
                    <div className="text-xs text-gray-500">{service.label}</div>
                    <div className="mt-3 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-violet-200" />
                        <span className="text-sm font-medium text-white">{service.state}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
