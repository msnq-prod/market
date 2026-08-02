import { ExternalLink, LogOut } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getAdminNavGroups, type AdminNavGroup, type AdminNavItem } from './adminNavigation';
import { logoutSession } from '../../../utils/session';
import { isAdminRole, isSalesStaffRole } from '../../../../shared/domain/policy';

const toneClasses: Record<AdminNavGroup['tone'], {
    active: string;
    itemActive: string;
    icon: string;
}> = {
    neutral: {
        active: 'border-[#2d3540] bg-[#1a2028] text-white',
        itemActive: 'border-white text-white',
        icon: 'text-gray-200'
    },
    sky: {
        active: 'border-[#2d3540] bg-[#1a2028] text-sky-300',
        itemActive: 'border-sky-400 text-sky-200',
        icon: 'text-sky-200'
    },
    emerald: {
        active: 'border-[#2d3540] bg-[#1a2028] text-[#43dd8b]',
        itemActive: 'border-[#43dd8b] text-white',
        icon: 'text-[#43dd8b]'
    },
    amber: {
        active: 'border-[#2d3540] bg-[#1a2028] text-amber-200',
        itemActive: 'border-amber-300 text-amber-100',
        icon: 'text-amber-200'
    },
    slate: {
        active: 'border-[#2d3540] bg-[#1a2028] text-slate-200',
        itemActive: 'border-slate-300 text-slate-100',
        icon: 'text-slate-200'
    }
};

const normalizePath = (value: string) => {
    const [pathname, search = ''] = value.split('?');
    return `${pathname}${search ? `?${search}` : ''}`;
};

const isExactLocation = (locationKey: string, target: string) => normalizePath(target) === locationKey;

const getPathname = (value: string) => value.split('?')[0];

const hasNavigationSearch = (search: string) => {
    const params = new URLSearchParams(search);
    return params.has('queue') || params.has('view');
};

const isItemActive = (item: AdminNavItem, locationKey: string, pathname: string, search: string) => {
    if (item.match?.some((entry) => isExactLocation(locationKey, entry))) return true;
    if (!hasNavigationSearch(search) && item.match?.some((entry) => !entry.includes('?') && entry === pathname)) return true;
    return !item.match?.length && isExactLocation(locationKey, item.to);
};

const isItemInCurrentRoute = (item: AdminNavItem, pathname: string) => {
    if (getPathname(item.to) === pathname) return true;
    return item.match?.some((entry) => getPathname(entry) === pathname) || false;
};

export function HqMegaNav() {
    const location = useLocation();
    const navigate = useNavigate();
    const role = localStorage.getItem('userRole');
    const groups = getAdminNavGroups(role);
    const locationKey = `${location.pathname}${location.search}`;
    const activeGroup = groups.find((group) => (
        group.items.some((item) => isItemActive(item, locationKey, location.pathname, location.search))
    )) || groups.find((group) => (
        group.items.some((item) => isItemInCurrentRoute(item, location.pathname))
    )) || groups[0];
    const isSalesManager = isSalesStaffRole(role) && !isAdminRole(role);

    const handleLogout = () => {
        logoutSession();
        navigate('/admin/login', { replace: true });
    };

    return (
        <div className="sticky top-0 z-40 border-b border-[#252b33] bg-[#0d1116]/96 backdrop-blur-xl">
            <div className="mx-auto flex h-[62px] w-full max-w-[1600px] items-center gap-5 border-b border-[#222830] px-5">
                <Link to={isSalesManager ? '/admin/orders' : '/admin'} className="w-[230px] shrink-0">
                    <div className="text-[17px] font-bold tracking-[0.17em] text-white">ZAGARAMI</div>
                </Link>

                <nav className="flex min-w-0 max-w-[900px] flex-1 items-center justify-between gap-3" aria-label="Основные блоки админки">
                    {groups.map((group) => (
                        <TopNavGroup
                            key={group.id}
                            group={group}
                            active={group.id === activeGroup.id}
                        />
                    ))}
                </nav>

                <button
                    type="button"
                    onClick={handleLogout}
                    className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-[#68727f] transition hover:border-[#2d3540] hover:bg-[#171d24] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                    aria-label="Выйти"
                >
                    <LogOut size={16} />
                </button>
            </div>

            {activeGroup && activeGroup.items.length > 1 ? (
                <div className="h-[58px] bg-[#10151b]">
                    <div className="mx-auto flex h-full w-full max-w-[1600px] items-stretch gap-3 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={`Подпункты: ${activeGroup.label}`}>
                        {activeGroup.items.map((item) => (
                            <SubNavItem
                                key={item.id}
                                group={activeGroup}
                                item={item}
                                active={isItemActive(item, locationKey, location.pathname, location.search)}
                            />
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function TopNavGroup({ group, active }: { group: AdminNavGroup; active: boolean }) {
    const Icon = group.icon;
    const firstItem = group.items[0];
    const tone = toneClasses[group.tone];

    return (
        <Link
            to={firstItem.to}
            className={`group flex h-11 min-w-[128px] shrink-0 items-center justify-center gap-2 rounded-lg border px-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                active
                    ? tone.active
                    : 'border-transparent text-[#8d96a2] hover:border-[#28303a] hover:bg-[#151a21] hover:text-white'
            }`}
            aria-current={active ? 'page' : undefined}
        >
            <Icon size={19} className={active ? tone.icon : 'text-[#77818e] group-hover:text-[#c9d0d8]'} />
            <span className="truncate text-sm font-medium">{group.label}</span>
        </Link>
    );
}

function SubNavItem({
    group,
    item,
    active
}: {
    group: AdminNavGroup;
    item: AdminNavItem;
    active: boolean;
}) {
    const Icon = item.icon;
    const tone = toneClasses[group.tone];
    const className = `group inline-flex min-w-[108px] shrink-0 items-center justify-center gap-2 border-b-2 px-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
        active
            ? tone.itemActive
            : 'border-transparent text-[#929ba7] hover:text-white'
    }`;
    const content = (
        <>
            <Icon size={17} className={active ? tone.icon : 'text-[#747e8b] group-hover:text-[#cbd2da]'} />
            <span className="block whitespace-nowrap text-[13px] font-medium">{item.label}</span>
            {item.external ? <ExternalLink size={12} className="text-current opacity-50" /> : null}
        </>
    );

    if (item.external) {
        return (
            <a href={item.to} target="_blank" rel="noreferrer noopener" className={className}>
                {content}
            </a>
        );
    }

    return (
        <Link to={item.to} className={className} aria-current={active ? 'page' : undefined}>
            {content}
        </Link>
    );
}
