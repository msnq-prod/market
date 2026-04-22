import type { ReactNode } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    FileText,
    Loader2,
    Package,
    Palette,
    PencilLine,
    QrCode,
    Search,
    Settings2,
    X
} from 'lucide-react';
import { Button, Input, Textarea } from '../components/ui';

type StatusTone = 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'muted';

const filterSelectClassName = 'h-10 rounded-xl border border-white/8 bg-[#11141a] px-3 text-sm text-gray-200 outline-none transition focus:border-blue-300/50';

const colorSwatches = [
    { name: 'Shell', value: '#121317', usage: 'Фон админки' },
    { name: 'Sidebar', value: '#14161b', usage: 'Навигация' },
    { name: 'Panel', value: '#181b21', usage: 'Основные панели' },
    { name: 'Field', value: '#11141a', usage: 'Поля и фильтры' },
    { name: 'Accent', value: '#93c5fd', usage: 'Фокус и действия' },
    { name: 'Success', value: '#34d399', usage: 'Готово и доступно' },
    { name: 'Warning', value: '#fbbf24', usage: 'Требует внимания' },
    { name: 'Danger', value: '#f87171', usage: 'Ошибка и удаление' }
];

const typeSamples = [
    { label: 'Page title', className: 'text-[2rem] font-semibold text-white', text: 'Товары' },
    { label: 'Section title', className: 'text-xl font-semibold text-white', text: 'Шаблоны Якутия' },
    { label: 'Body', className: 'text-sm leading-6 text-gray-400', text: 'Операционные тексты остаются короткими, фактическими и читаемыми.' },
    { label: 'Caption', className: 'text-xs text-gray-500', text: 'RUS / YAK / QTZ' }
];

const radiuses = [
    { label: 'Control', className: 'rounded-xl', size: 'h-16' },
    { label: 'Panel', className: 'rounded-[24px]', size: 'h-16' },
    { label: 'Modal', className: 'rounded-[28px]', size: 'h-16' }
];

const items = [
    { serial: 'ZG-2026-001', packet: 'A-01', status: 'STOCK_HQ', label: 'На складе HQ', tone: 'emerald' as StatusTone },
    { serial: 'ZG-2026-002', packet: 'A-02', status: 'STOCK_ONLINE', label: 'Онлайн', tone: 'blue' as StatusTone },
    { serial: 'ZG-2026-003', packet: 'A-03', status: 'ON_CONSIGNMENT', label: 'Консигнация', tone: 'amber' as StatusTone },
    { serial: 'ZG-2026-004', packet: 'A-04', status: 'ACTIVATED', label: 'Активирован', tone: 'violet' as StatusTone }
];

export function Brandbook() {
    return (
        <div className="space-y-6">
            <section className="admin-panel overflow-hidden rounded-[24px]">
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1.08fr)_360px]">
                    <div className="flex min-h-[280px] flex-col justify-between px-5 py-6 sm:px-7">
                        <div>
                            <span className="inline-flex min-h-8 items-center rounded-full border border-white/8 bg-white/[0.04] px-3 text-xs font-medium text-gray-300">
                                Admin UI reference
                            </span>
                            <h2 className="mt-5 max-w-2xl text-3xl font-semibold text-white sm:text-4xl">
                                Брендбук темной админской панели
                            </h2>
                            <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-400">
                                Единая витрина поверхностей, действий, состояний и контентных паттернов HQ-интерфейса на базе страницы товаров.
                            </p>
                        </div>
                        <div className="mt-8 grid gap-3 sm:grid-cols-3">
                            <Metric label="Поверхности" value="3" />
                            <Metric label="Состояния" value="8" />
                            <Metric label="Контекст" value="HQ" />
                        </div>
                    </div>
                    <div className="relative min-h-[280px] overflow-hidden border-t border-white/6 lg:border-l lg:border-t-0">
                        <img
                            src="/locations/crystal-caves.jpg"
                            alt="Камень на темной поверхности"
                            className="h-full min-h-[280px] w-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#14161b] via-[#14161b]/45 to-transparent" />
                        <div className="absolute inset-x-5 bottom-5">
                            <div className="rounded-[24px] border border-white/10 bg-black/35 p-4 backdrop-blur-md">
                                <p className="text-sm font-semibold text-white">Товарный шаблон</p>
                                <p className="mt-2 text-xs leading-5 text-gray-300">
                                    Карточки, статусы и действия строятся вокруг быстрого сканирования.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <BrandbookSection
                icon={<Palette size={18} />}
                title="Основы"
                description="Базовые цвета, текстовые масштабы и радиусы для темной HQ-среды."
            >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {colorSwatches.map((swatch) => (
                            <ColorSwatch key={swatch.name} {...swatch} />
                        ))}
                    </div>
                    <div className="grid gap-4">
                        <div className="rounded-[24px] border border-white/6 bg-[#11141a] p-4">
                            <p className="text-sm font-semibold text-white">Типографика</p>
                            <div className="mt-4 space-y-4">
                                {typeSamples.map((sample) => (
                                    <div key={sample.label}>
                                        <div className="mb-1 text-xs text-gray-500">{sample.label}</div>
                                        <div className={sample.className}>{sample.text}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {radiuses.map((radius) => (
                                <div key={radius.label} className="text-center">
                                    <div className={`${radius.size} ${radius.className} border border-white/8 bg-white/[0.04]`} />
                                    <div className="mt-2 text-xs text-gray-500">{radius.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </BrandbookSection>

            <BrandbookSection
                icon={<Settings2 size={18} />}
                title="Панели и фильтры"
                description="Рабочие панели используют мягкий контраст, стабильные отступы и компактные фильтры."
            >
                <div className="space-y-4">
                    <div className="admin-panel rounded-[24px] px-4 py-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap gap-2">
                                <select defaultValue="ALL" className={filterSelectClassName} aria-label="Фильтр по стране">
                                    <option value="ALL">Все страны</option>
                                    <option value="RUS">Россия</option>
                                    <option value="KGZ">Кыргызстан</option>
                                </select>
                                <select defaultValue="IN_STOCK" className={filterSelectClassName} aria-label="Фильтр по остатку">
                                    <option value="ALL">Любой остаток</option>
                                    <option value="IN_STOCK">В наличии</option>
                                    <option value="OUT_OF_STOCK">Нет остатка</option>
                                </select>
                                <select defaultValue="PUBLISHED" className={filterSelectClassName} aria-label="Фильтр публикации">
                                    <option value="ALL">Все статусы сайта</option>
                                    <option value="PUBLISHED">На сайте</option>
                                    <option value="HIDDEN">Скрыт</option>
                                </select>
                                <button
                                    type="button"
                                    className="h-10 rounded-xl px-3 text-sm text-gray-500 transition hover:bg-white/[0.04] hover:text-gray-200"
                                >
                                    Сбросить
                                </button>
                            </div>
                            <Button type="button">+ Добавить шаблон</Button>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <SurfaceSample
                            title="Основная панель"
                            description="Глубокая поверхность для рабочих блоков, списков и заголовков разделов."
                            tone="strong"
                        />
                        <SurfaceSample
                            title="Мягкая панель"
                            description="Вторичный слой для вложенного контекста, подсказок и компактных групп."
                            tone="soft"
                        />
                    </div>
                </div>
            </BrandbookSection>

            <BrandbookSection
                icon={<CheckCircle2 size={18} />}
                title="Действия и поля"
                description="Кнопки, поля и icon-actions сохраняют один ритм высоты, фокуса и плотности."
            >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-3">
                            <Button type="button">Создать</Button>
                            <Button type="button" variant="secondary">Вторичное</Button>
                            <Button type="button" variant="ghost">Отмена</Button>
                            <Button type="button" variant="danger">Удалить</Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button type="button" disabled>
                                <Loader2 size={16} className="animate-spin" />
                                Сохранение
                            </Button>
                            <IconButton label="Поиск">
                                <Search size={16} />
                            </IconButton>
                            <IconButton label="Редактировать">
                                <PencilLine size={16} />
                            </IconButton>
                            <IconButton label="Закрыть" tone="danger">
                                <X size={16} />
                            </IconButton>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Input label="Название" value="Кварц с природным включением" readOnly />
                        <Input label="Цена" value="12 400" readOnly inputMode="decimal" />
                        <div className="md:col-span-2">
                            <Textarea
                                label="Описание товара"
                                value="Короткий фактический текст для карточки, который не спорит с операционными данными."
                                readOnly
                                rows={3}
                            />
                        </div>
                    </div>
                </div>
            </BrandbookSection>

            <BrandbookSection
                icon={<Package size={18} />}
                title="Паттерны товаров"
                description="Карточка локации, строка шаблона и раскрытая партия фиксируют основной сценарий /admin/products."
            >
                <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                    <LocationPreview />
                    <ProductPreview />
                </div>
            </BrandbookSection>

            <BrandbookSection
                icon={<FileText size={18} />}
                title="Состояния"
                description="Загрузка, пустой результат и ошибка сохраняют те же поверхности, что и рабочие списки."
            >
                <div className="grid gap-4 md:grid-cols-3">
                    <StateSample
                        icon={<Loader2 size={18} className="animate-spin" />}
                        title="Загрузка"
                        description="Загрузка товарных шаблонов..."
                    />
                    <StateSample
                        icon={<Package size={18} />}
                        title="Пусто"
                        description="Локации по выбранным фильтрам не найдены."
                    />
                    <StateSample
                        icon={<AlertTriangle size={18} />}
                        title="Ошибка"
                        description="Не удалось загрузить данные. Повторите попытку."
                        tone="danger"
                    />
                </div>
            </BrandbookSection>
        </div>
    );
}

function BrandbookSection({
    icon,
    title,
    description,
    children
}: {
    icon: ReactNode;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="admin-panel rounded-[24px] px-5 py-5 sm:px-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-blue-100">
                            {icon}
                        </span>
                        {title}
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">{description}</p>
                </div>
            </div>
            {children}
        </section>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
            <div className="text-2xl font-semibold text-white">{value}</div>
            <div className="mt-1 text-xs text-gray-500">{label}</div>
        </div>
    );
}

function ColorSwatch({ name, value, usage }: { name: string; value: string; usage: string }) {
    return (
        <div className="rounded-2xl border border-white/6 bg-[#11141a] p-3">
            <div className="h-16 rounded-xl border border-white/8" style={{ backgroundColor: value }} />
            <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{name}</p>
                    <p className="mt-1 text-xs text-gray-500">{usage}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-gray-500">{value}</span>
            </div>
        </div>
    );
}

function SurfaceSample({
    title,
    description,
    tone
}: {
    title: string;
    description: string;
    tone: 'strong' | 'soft';
}) {
    const className = tone === 'strong'
        ? 'admin-panel rounded-[24px] p-5'
        : 'admin-panel-soft rounded-[24px] p-5';

    return (
        <div className={className}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
                </div>
                <StatusPill label={tone === 'strong' ? 'Primary' : 'Soft'} tone={tone === 'strong' ? 'blue' : 'muted'} />
            </div>
        </div>
    );
}

function IconButton({
    label,
    tone = 'default',
    children
}: {
    label: string;
    tone?: 'default' | 'danger';
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 ${tone === 'danger'
                ? 'border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/15'
                : 'border-white/8 bg-white/[0.04] text-gray-300 hover:bg-white/[0.07] hover:text-white'
                }`}
        >
            {children}
        </button>
    );
}

function LocationPreview() {
    return (
        <article className="admin-panel group relative overflow-hidden rounded-[24px] p-0 text-left transition hover:border-white/10 hover:bg-[#1b1e24]">
            <button
                type="button"
                className="absolute inset-0 z-10 rounded-[24px]"
                aria-label="Открыть шаблоны локации Якутия"
            />
            <div className="relative h-[126px] overflow-hidden">
                <img
                    src="/locations/crystal-caves.jpg"
                    alt="Локация Якутия"
                    className="h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-105 group-hover:opacity-95"
                />
                <div className="absolute inset-x-0 bottom-0 h-[86px] bg-gradient-to-b from-[#14161b]/0 via-[#14161b]/70 to-[#14161b]" />
                <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/35 p-2 text-gray-300 backdrop-blur">
                    <ChevronRight size={16} className="transition group-hover:translate-x-0.5 group-hover:text-white" />
                </div>
                <div className="absolute inset-x-5 bottom-4 min-w-0">
                    <h3 className="truncate text-lg font-semibold text-white">Якутия</h3>
                    <p className="mt-1 text-sm text-gray-400">Россия</p>
                </div>
            </div>
            <div className="grid grid-cols-4 gap-2 px-5 pb-5 pt-4 text-sm">
                <LocationMetric label="Шаблоны" value="24" />
                <LocationMetric label="На сайте" value="18" />
                <LocationMetric label="Скрыт" value="6" />
                <LocationMetric label="Остаток" value="42" />
            </div>
        </article>
    );
}

function LocationMetric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-lg font-semibold leading-none text-white">{value}</div>
            <div className="mt-1 text-xs text-gray-500">{label}</div>
        </div>
    );
}

function ProductPreview() {
    return (
        <article className="admin-panel rounded-[24px] px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                        <h3 className="min-w-0 text-lg font-semibold text-white">Кварц с природным включением</h3>
                        <span className="text-lg font-semibold text-gray-100">12 400 ₽</span>
                        <PublishSwitch checked />
                        <IconButton label="Изменить">
                            <PencilLine size={16} />
                        </IconButton>
                    </div>

                    <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-400">
                        <span className="mr-2 text-xs font-medium text-gray-600">Описание товара</span>
                        Минеральный образец для онлайн-витрины с готовым цифровым паспортом.
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                        <span className="font-medium text-gray-600">Коды:</span>
                        <span>RUS</span>
                        <span className="h-3 border-l border-white/10" />
                        <span>YAK</span>
                        <span className="h-3 border-l border-white/10" />
                        <span>QTZ</span>
                    </div>

                    <p className="mt-3 rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-sm leading-6 text-gray-300">
                        <span className="mr-2 text-xs font-medium text-gray-600">Описание места</span>
                        Образец из северной коллекции, подготовлен для партии HQ.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:max-w-[320px] xl:justify-end">
                    <span className="inline-flex h-9 items-center rounded-full border border-blue-400/15 bg-blue-500/10 px-3 text-sm text-blue-100">
                        В наличии: 12
                    </span>
                    <button
                        type="button"
                        className="inline-flex h-9 items-center rounded-full border border-white/8 bg-white/[0.04] px-3 text-sm text-gray-200 transition hover:bg-white/[0.07]"
                    >
                        Создать заказ
                    </button>
                </div>
            </div>

            <div className="mt-4 flex justify-end border-t border-white/6 pt-3">
                <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 text-sm text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
                >
                    <ChevronDown size={15} />
                    Партии: 2
                </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/6 bg-[#0f1217] p-3">
                <div className="space-y-2">
                    <BatchPreview />
                </div>
            </div>
        </article>
    );
}

function PublishSwitch({ checked }: { checked: boolean }) {
    return (
        <button
            type="button"
            className={`relative inline-flex h-8 w-[94px] shrink-0 items-center rounded-full border p-1 text-[11px] font-semibold transition ${checked
                ? 'border-emerald-400/25 bg-emerald-500/20 text-emerald-100'
                : 'border-red-400/25 bg-red-500/15 text-red-100'
                }`}
        >
            <span className={`h-5 w-5 rounded-full bg-current opacity-70 transition-transform ${checked ? 'translate-x-[60px]' : 'translate-x-0'}`} />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {checked ? 'На сайте' : 'Скрыт'}
            </span>
        </button>
    );
}

function BatchPreview() {
    return (
        <div className="rounded-xl border border-white/6 bg-[#141821]">
            <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <div className="mt-0.5 text-gray-500">
                        <ChevronDown size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">batch_2026_04_22_01</p>
                        <p className="text-xs text-gray-500">22.04.2026, 10:30 · камней: 4</p>
                    </div>
                </button>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <StatusPill label="Получен" tone="violet" />
                    <StatusPill label="Медиа готово" tone="emerald" />
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-100 transition hover:bg-blue-500/20"
                    >
                        <QrCode size={14} />
                        QR
                    </button>
                </div>
            </div>
            <div className="border-t border-white/6 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((item) => (
                        <ItemPreview key={item.serial} {...item} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function ItemPreview({
    serial,
    packet,
    label,
    tone
}: {
    serial: string;
    packet: string;
    status: string;
    label: string;
    tone: StatusTone;
}) {
    return (
        <button
            type="button"
            className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 text-left transition hover:border-blue-500/50 hover:bg-gray-900"
        >
            <div className="aspect-square bg-gray-900">
                <img src="/locations/crystal-caves.jpg" alt={serial} className="h-full w-full object-cover" />
            </div>
            <div className="space-y-2 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-white">{serial}</p>
                    <StatusPill label={label} tone={tone} compact />
                </div>
                <p className="truncate text-xs text-gray-500">Пакет: {packet}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Не продан</span>
                    <span>HQ</span>
                </div>
            </div>
        </button>
    );
}

function StatusPill({
    label,
    tone,
    compact = false
}: {
    label: string;
    tone: StatusTone;
    compact?: boolean;
}) {
    const className = {
        blue: 'border-blue-500/30 bg-blue-500/20 text-blue-200',
        emerald: 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200',
        amber: 'border-amber-500/30 bg-amber-500/20 text-amber-200',
        red: 'border-red-500/30 bg-red-500/20 text-red-200',
        violet: 'border-violet-500/30 bg-violet-500/20 text-violet-200',
        muted: 'border-white/8 bg-white/[0.04] text-gray-400'
    }[tone];

    return (
        <span className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${className}`}>
            <span className="truncate">{label}</span>
        </span>
    );
}

function StateSample({
    icon,
    title,
    description,
    tone = 'default'
}: {
    icon: ReactNode;
    title: string;
    description: string;
    tone?: 'default' | 'danger';
}) {
    return (
        <div className={`rounded-2xl border px-4 py-4 ${tone === 'danger'
            ? 'border-red-500/30 bg-red-500/10 text-red-200'
            : 'border-white/6 bg-[#14161b] text-gray-400'
            }`}
        >
            <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04]">
                    {icon}
                </span>
                <div>
                    <p className={`text-sm font-semibold ${tone === 'danger' ? 'text-red-100' : 'text-white'}`}>{title}</p>
                    <p className="mt-1 text-sm leading-6">{description}</p>
                </div>
            </div>
        </div>
    );
}
