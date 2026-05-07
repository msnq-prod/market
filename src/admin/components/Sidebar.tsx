import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Box, Truck, Users, FileText, Archive, ShoppingCart, QrCode, Database, History, Bot, LogOut, Video, Settings2, Menu, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { logoutSession } from '../../utils/session';

type NavConfig = {
    id: string;
    to: string;
    label: string;
    icon: ReactNode;
    newTab?: boolean;
};

type NavSection = {
    title: string;
    items: NavConfig[];
};

type SidebarVisibility = Record<string, boolean>;

const SIDEBAR_VISIBILITY_STORAGE_PREFIX = 'stones.admin.sidebar.visibility';

const readSidebarVisibility = (storageKey: string): SidebarVisibility => {
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return {};

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

        return Object.entries(parsed).reduce<SidebarVisibility>((accumulator, [key, value]) => {
            if (typeof value === 'boolean') {
                accumulator[key] = value;
            }
            return accumulator;
        }, {});
    } catch {
        return {};
    }
};

export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const role = localStorage.getItem('userRole');
    const isSalesManager = role === 'SALES_MANAGER';
    const canAccessSalesCabinet = role === 'ADMIN' || role === 'SALES_MANAGER';
    const storageKey = `${SIDEBAR_VISIBILITY_STORAGE_PREFIX}.${role || 'unknown'}`;
    const [visibility, setVisibility] = useState<SidebarVisibility>(() => readSidebarVisibility(storageKey));
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const salesItems: NavConfig[] = [
        { id: 'orders', to: '/admin/orders', icon: <ShoppingCart size={18} />, label: 'Заказы' },
        { id: 'clients', to: '/admin/clients', icon: <Users size={18} />, label: 'Клиенты' },
        { id: 'inventory', to: '/admin/inventory', icon: <Database size={18} />, label: 'Наличие' },
        { id: 'sales-history', to: '/admin/sales-history', icon: <History size={18} />, label: 'История продаж' }
    ];

    const hqSections: NavSection[] = [
        {
            title: 'Обзор',
            items: [
                { id: 'dashboard', to: '/admin', icon: <LayoutDashboard size={18} />, label: 'Дашборд' }
            ]
        },
        ...(canAccessSalesCabinet ? [{
            title: 'Продажи',
            items: salesItems
        }] : []),
        {
            title: 'Логистика',
            items: [
                { id: 'acceptance', to: '/admin/acceptance', icon: <Truck size={18} />, label: 'Приемка' },
                { id: 'allocation', to: '/admin/allocation', icon: <Box size={18} />, label: 'Распределение' },
                { id: 'warehouse', to: '/admin/warehouse', icon: <Archive size={18} />, label: 'Склад' }
            ]
        },
        {
            title: 'Контент',
            items: [
                { id: 'products', to: '/admin/products', icon: <Box size={18} />, label: 'Товары' },
                { id: 'qr-print', to: '/admin/qr/print', icon: <QrCode size={18} />, label: 'QR-печать', newTab: true },
                { id: 'video-tool', to: '/admin/video-tool', icon: <Video size={18} />, label: 'Video Tool' },
                { id: 'clone-content', to: '/admin/clone-content', icon: <FileText size={18} />, label: 'Страница клона' }
            ]
        },
        {
            title: 'Система',
            items: [
                { id: 'users', to: '/admin/users', icon: <Users size={18} />, label: 'Пользователи' },
                ...(role === 'ADMIN'
                    ? [{ id: 'telegram-bots', to: '/admin/telegram-bots', icon: <Bot size={18} />, label: 'Telegram' }]
                    : [])
            ]
        }
    ];

    const availableSections = isSalesManager
        ? [{ title: 'Продажи', items: salesItems }]
        : hqSections;
    const sections = availableSections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => visibility[item.id] !== false)
        }))
        .filter((section) => section.items.length > 0);

    useEffect(() => {
        setVisibility(readSidebarVisibility(storageKey));
    }, [storageKey]);

    useEffect(() => {
        window.localStorage.setItem(storageKey, JSON.stringify(visibility));
    }, [storageKey, visibility]);

    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);

    const toggleItemVisibility = (itemId: string) => {
        setVisibility((current) => ({
            ...current,
            [itemId]: current[itemId] === false
        }));
    };

    const handleLogout = () => {
        logoutSession();
        navigate('/admin/login', { replace: true });
    };

    const activeItem = availableSections
        .flatMap((section) => section.items)
        .find((item) => location.pathname === item.to);

    const renderSections = (mode: 'desktop' | 'mobile') => (
        <>
            <nav className={mode === 'desktop'
                ? 'flex-1 overflow-y-auto overflow-x-visible px-3 py-4'
                : 'min-h-0 flex-1 overflow-y-auto px-4 py-4'}
            >
                <div className={mode === 'desktop' ? 'space-y-4' : 'space-y-5'}>
                    {sections.map((section) => (
                        <div key={section.title}>
                            <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-gray-600">
                                {section.title}
                            </div>
                            <div className="space-y-1">
                                {section.items.map((item) => (
                                    <NavItem
                                        key={item.to}
                                        to={item.to}
                                        icon={item.icon}
                                        label={item.label}
                                        active={location.pathname === item.to}
                                        newTab={item.newTab}
                                        onNavigate={mode === 'mobile' ? () => setMobileOpen(false) : undefined}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-5">
                    <button
                        type="button"
                        onClick={() => setSettingsOpen((current) => !current)}
                        aria-expanded={settingsOpen}
                        className={`group flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 ${
                            settingsOpen
                                ? 'border border-blue-400/10 bg-[#1d2434] text-blue-100'
                                : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'
                        }`}
                    >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] transition duration-200 ${settingsOpen ? 'text-blue-200' : 'text-gray-500 group-hover:text-gray-200'}`}>
                            <Settings2 size={18} />
                        </div>
                        <span className="min-w-0 flex-1 truncate font-medium">Настройки</span>
                    </button>

                    {settingsOpen ? (
                        <div className="mt-3 rounded-xl border border-white/8 bg-black/15 p-3">
                            <div className="mb-3 px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-gray-600">
                                Видимость строк
                            </div>
                            <div className="space-y-3">
                                {availableSections.map((section) => (
                                    <div key={section.title}>
                                        <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-gray-600">
                                            {section.title}
                                        </div>
                                        <div className="space-y-1">
                                            {section.items.map((item) => (
                                                <SidebarVisibilitySwitch
                                                    key={item.id}
                                                    label={item.label}
                                                    checked={visibility[item.id] !== false}
                                                    onToggle={() => toggleItemVisibility(item.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </nav>

            <div className="border-t border-white/6 p-3">
                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-gray-400 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
                >
                    <LogOut size={16} />
                    <span>Выйти</span>
                </button>
            </div>
        </>
    );

    return (
        <>
            <div className="sticky top-0 z-40 border-b border-white/6 bg-[#14161b]/95 backdrop-blur lg:hidden">
                <div className="flex min-h-16 items-center justify-between gap-3 px-4">
                    <div className="min-w-0">
                        <div className="truncate text-base font-semibold tracking-tight text-white">
                            {isSalesManager ? 'Продажи' : 'Админ HQ'}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                            {activeItem?.label || (isSalesManager ? 'Очередь заказов Stones' : 'Центр управления Stones')}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-gray-200 transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
                        aria-label="Открыть меню админки"
                    >
                        <Menu size={18} />
                    </button>
                </div>
            </div>

            {mobileOpen ? (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/70"
                        aria-label="Закрыть меню админки"
                        onClick={() => setMobileOpen(false)}
                    />
                    <aside className="relative flex h-full w-full max-w-[360px] flex-col border-r border-white/6 bg-[#14161b] shadow-2xl">
                        <div className="flex items-start justify-between gap-3 border-b border-white/6 px-5 py-5">
                            <div className="min-w-0">
                                <h2 className="text-[1.65rem] font-semibold tracking-tight text-white">
                                    {isSalesManager ? 'Продажи' : 'Админ HQ'}
                                </h2>
                                <p className="mt-1 text-xs text-gray-500">
                                    {isSalesManager ? 'Очередь заказов Stones' : 'Центр управления Stones'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMobileOpen(false)}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-gray-300 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
                                aria-label="Закрыть меню админки"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {renderSections('mobile')}
                    </aside>
                </div>
            ) : null}

            <aside className="admin-sidebar hidden border-white/6 bg-[#14161b] lg:flex lg:w-[214px] lg:flex-col lg:border-r">
                <div className="border-b border-white/6 px-5 py-6">
                    <h2 className="text-[1.85rem] font-semibold tracking-tight text-white">
                        {isSalesManager ? 'Продажи' : 'Админ HQ'}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                        {isSalesManager ? 'Очередь заказов Stones' : 'Центр управления Stones'}
                    </p>
                </div>
                {renderSections('desktop')}
            </aside>
        </>
    );
}

function SidebarVisibilitySwitch({
    label,
    checked,
    onToggle
}: {
    label: string;
    checked: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onToggle}
            className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 ${
                checked
                    ? 'bg-white/[0.04] text-gray-200'
                    : 'text-gray-500 hover:bg-white/[0.03] hover:text-gray-300'
            }`}
        >
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>
            <span
                aria-hidden="true"
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                    checked ? 'bg-blue-500' : 'bg-gray-700'
                }`}
            >
                <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                />
            </span>
        </button>
    );
}

function NavItem({
    to,
    icon,
    label,
    active,
    newTab = false,
    onNavigate
}: {
    to: string;
    icon: ReactNode;
    label: string;
    active: boolean;
    newTab?: boolean;
    onNavigate?: () => void;
}) {
    const className = `group flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 ${active
        ? 'border border-blue-400/10 bg-[#1d2434] text-blue-100'
        : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'
        }`;

    const content = (
        <>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] transition duration-200 ${active ? 'text-blue-200' : 'text-gray-500 group-hover:text-gray-200'}`}>
                {icon}
            </div>
            <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        </>
    );

    if (newTab) {
        return (
            <a href={to} target="_blank" rel="noreferrer noopener" className={className} onClick={onNavigate}>
                {content}
            </a>
        );
    }

    return (
        <Link
            to={to}
            className={className}
            onClick={onNavigate}
        >
            {content}
        </Link>
    );
}
