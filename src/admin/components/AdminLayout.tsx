import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { DesktopStatusCenter } from './DesktopStatusCenter';
import { HqMegaNav } from './navigation/HqMegaNav';
import { isAdminRole, isAdminWorkspaceRole, isHqStaffRole, isPartnerRole, isSalesStaffRole } from '../../../shared/domain/policy';

const pageMeta: Record<string, { title: string; description: string }> = {
    '/admin': {
        title: 'Сегодня',
        description: ''
    },
    '/admin/system/status': {
        title: 'Состояние системы',
        description: 'Проверка summary API, сессии и desktop runtime.'
    },
    '/admin/orders': {
        title: 'Заказы',
        description: 'Активные заказы и сопровождение доставки.'
    },
    '/admin/clients': {
        title: 'Клиенты',
        description: 'Клиентская база и история взаимодействия.'
    },
    '/admin/inventory': {
        title: 'Наличие в продаже',
        description: 'Онлайн-остаток, резервы и доступность товаров для продаж.'
    },
    '/admin/sales-history': {
        title: 'История продаж',
        description: 'Архив завершенных продаж.'
    },
    '/admin/products': {
        title: 'Товары и локации',
        description: 'Локации, карточки товаров, остатки и публикация.'
    },
    '/admin/acceptance': {
        title: 'Приемка',
        description: 'Поступающие партии и подготовка материалов.'
    },
    '/admin/allocation': {
        title: 'Распределение',
        description: 'Распределение партий и движение товаров.'
    },
    '/admin/warehouse': {
        title: 'Склад HQ',
        description: 'Складские остатки HQ и статусы items.'
    },
    '/admin/qr': {
        title: 'QR-печать',
        description: 'Рабочая станция для партий, макетов, пресетов и PDF-экспорта.'
    },
    '/admin/planet-labels/workspace': {
        title: 'Подписи планеты',
        description: 'Очередь локаций перед настройкой desktop/mobile offsets.'
    },
    '/admin/video-tool': {
        title: 'HQ Admin',
        description: 'Desktop-инструменты и media-операции.'
    },
    '/admin/users': {
        title: 'Пользователи',
        description: ''
    },
    '/admin/settings': {
        title: 'Файлы',
        description: ''
    },
    '/admin/telegram-bots': {
        title: 'Telegram',
        description: 'Боты, уведомления и системные события.'
    },
    '/admin/clone-content': {
        title: 'Страница клона',
        description: 'Контент публичной страницы цифрового двойника.'
    }
};

const productsViewMeta: Record<string, { title: string; description: string }> = {
    locations: {
        title: 'Локации Планеты',
        description: 'Координаты, изображения, переводы и состав локаций.'
    },
    publication: {
        title: 'Публикация карточек',
        description: 'Очередь видимости товарных карточек на публичной витрине.'
    }
};

const settingsViewMeta: Record<string, { title: string; description: string }> = {
    files: {
        title: 'Файлы сервера',
        description: 'Файлы загрузок, папки партий, загрузка и удаление.'
    }
};

const warehouseViewMeta: Record<string, { title: string; description: string }> = {
    items: {
        title: 'Позиции склада',
        description: 'Серийные номера, QR, паспорта, медиа и складские статусы.'
    },
    maintenance: {
        title: 'Обслуживание партий',
        description: 'Скрытие партий и очистка видео отдельно от обычной навигации.'
    },
    requests: {
        title: 'Заказы на сбор',
        description: 'Заявки на сбор, планирование и прогресс производства.'
    }
};

const telegramViewMeta: Record<string, { title: string; description: string }> = {
    recipients: {
        title: 'Telegram получатели',
        description: 'Роли, ID чата и порог остатка.'
    },
    events: {
        title: 'Telegram события',
        description: 'Группы событий и матрица включения уведомлений.'
    },
    chats: {
        title: 'Telegram чаты',
        description: 'Последние чаты и копирование ID чата.'
    },
    test: {
        title: 'Telegram тест',
        description: 'Проверка token и username активного бота.'
    }
};

const videoToolViewMeta: Record<string, { title: string; description: string }> = {
    photo: {
        title: 'Готовность фото',
        description: 'Партии с недостающими фото позиций и вход в desktop-инструмент.'
    },
    video: {
        title: 'Готовность видео',
        description: 'Партии с недостающими видео позиций и вход в desktop-инструмент.'
    },
    status: {
        title: 'Desktop-среда',
        description: 'Сводка доступности desktop-среды и медиа-инструментов.'
    },
    diagnostics: {
        title: 'Диагностика партий',
        description: 'Блокеры медиа-подготовки по партиям.'
    }
};

const ordersRouteMeta: Record<string, { title: string; description: string }> = {
    '/admin/orders/new': {
        title: 'Новые заказы',
        description: 'Прием заявок, проверка контактов и перевод в работу.'
    },
    '/admin/orders/in-progress': {
        title: 'Заказы в работе',
        description: 'Подтверждение, сбор и подготовка к упаковке.'
    },
    '/admin/orders/packed': {
        title: 'Упакованные заказы',
        description: 'Трек-номер, передача в доставку и контроль отправки.'
    },
    '/admin/orders/delivery': {
        title: 'Доставка',
        description: 'СДЭК, получение покупателем и возвратные сценарии.'
    },
    '/admin/orders/returns': {
        title: 'Возвраты',
        description: 'Причины возврата и обратная логистика.'
    },
    '/admin/orders/closed': {
        title: 'Закрытые заказы',
        description: 'Архив полученных, возвращенных и отмененных заказов.'
    }
};

const workspaceRouteMeta: Record<string, { title: string; description: string }> = {
    '/admin/acceptance/batches': {
        title: 'Партии в пути',
        description: 'Очередь поступлений до физической приемки.'
    },
    '/admin/acceptance/media': {
        title: 'Готовность медиа',
        description: 'Партии с незакрытыми фото и видео.'
    },
    '/admin/acceptance/ready': {
        title: 'Готово на склад',
        description: 'Принятые партии без медиа-блокеров.'
    },
    '/admin/warehouse/items': {
        title: 'Позиции склада',
        description: 'Серийные номера, QR, паспорта, медиа и складские статусы.'
    },
    '/admin/warehouse/maintenance': {
        title: 'Обслуживание партий',
        description: 'Скрытие партий и очистка видео отдельно от обычной навигации.'
    },
    '/admin/warehouse/requests': {
        title: 'Заявки на сбор',
        description: ''
    },
    '/admin/products/locations': {
        title: 'Локации Планеты',
        description: 'Координаты, изображения, переводы и состав локаций.'
    },
    '/admin/products/publication': {
        title: 'Публикация карточек',
        description: 'Очередь видимости товарных карточек на публичной витрине.'
    },
    '/admin/media': {
        title: 'Очередь медиа HQ',
        description: 'Партии, готовность медиа и быстрый вход в Photo Tool / Video Tool.'
    },
    '/admin/media/photo': {
        title: 'Готовность фото',
        description: 'Партии с недостающими фото позиций и вход в desktop-инструмент.'
    },
    '/admin/media/video': {
        title: 'Готовность видео',
        description: 'Партии с недостающими видео позиций и вход в desktop-инструмент.'
    },
    '/admin/media/runtime': {
        title: 'Desktop-среда',
        description: 'Сводка доступности desktop-среды и медиа-инструментов.'
    },
    '/admin/media/diagnostics': {
        title: 'Диагностика партий',
        description: 'Блокеры медиа-подготовки по партиям.'
    },
    '/admin/telegram': {
        title: 'Telegram',
        description: 'Боты, уведомления и системные события.'
    },
    '/admin/telegram/recipients': {
        title: 'Telegram получатели',
        description: 'Роли, ID чата и порог остатка.'
    },
    '/admin/telegram/events': {
        title: 'Telegram события',
        description: 'Группы событий и матрица включения уведомлений.'
    },
    '/admin/telegram/chats': {
        title: 'Telegram чаты',
        description: 'Последние чаты и копирование ID чата.'
    },
    '/admin/telegram/test': {
        title: 'Telegram тест',
        description: 'Проверка token и username активного бота.'
    },
    '/admin/settings/files': {
        title: 'Файлы',
        description: ''
    }
};

const isSalesRoute = (pathname: string) => (
    pathname === '/admin/orders'
    || pathname.startsWith('/admin/orders/')
    || pathname === '/admin/clients'
    || pathname === '/admin/inventory'
    || pathname === '/admin/sales-history'
);

const isAdminOnlyRoute = (pathname: string) => (
    pathname === '/admin/settings'
    || pathname.startsWith('/admin/settings/')
    || pathname === '/admin/telegram-bots'
    || pathname === '/admin/telegram'
    || pathname.startsWith('/admin/telegram/')
);

export function AdminLayout() {
    const location = useLocation();
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');
    const isSalesManager = isSalesStaffRole(role) && !isAdminRole(role);
    const isStaff = isAdminWorkspaceRole(role);
    const isDev = import.meta.env.DEV;
    const hasAdminAccess = isStaff || isDev;
    if (!token) {
        return <Navigate to="/admin/login" replace state={{ from: location }} />;
    }

    if (!hasAdminAccess) {
        if (isPartnerRole(role)) {
            return <Navigate to="/partner/dashboard" replace />;
        }
        return <Navigate to="/" replace />;
    }

    if (isAdminOnlyRoute(location.pathname) && !isAdminRole(role)) {
        return <Navigate to="/admin" replace />;
    }

    if (isSalesManager && !isSalesRoute(location.pathname)) {
        return <Navigate to="/admin/orders" replace />;
    }

    if (isHqStaffRole(role) && !isAdminRole(role) && isSalesRoute(location.pathname)) {
        return <Navigate to="/admin" replace />;
    }

    const meta = getPageMeta(location.pathname, location.search);
    const isWideWorkspace = location.pathname === '/admin'
        || location.pathname === '/admin/system/status'
        || location.pathname === '/admin/inventory'
        || location.pathname === '/admin/clients'
        || location.pathname === '/admin/sales-history'
        || location.pathname === '/admin/orders'
        || location.pathname.startsWith('/admin/orders/')
        || location.pathname === '/admin/acceptance'
        || location.pathname.startsWith('/admin/acceptance/')
        || location.pathname === '/admin/warehouse'
        || location.pathname.startsWith('/admin/warehouse/')
        || location.pathname === '/admin/media'
        || location.pathname.startsWith('/admin/media/')
        || location.pathname === '/admin/products'
        || location.pathname.startsWith('/admin/products/')
        || location.pathname === '/admin/allocation'
        || location.pathname === '/admin/qr'
        || location.pathname === '/admin/users'
        || location.pathname === '/admin/settings'
        || location.pathname.startsWith('/admin/settings/')
        || location.pathname === '/admin/telegram'
        || location.pathname.startsWith('/admin/telegram/')
        || location.pathname === '/admin/telegram-bots'
        || location.pathname === '/admin/clone-content'
        || location.pathname === '/admin/planet-labels/workspace';

    return (
        <div className="admin-shell min-h-screen text-gray-100 font-sans lg:h-screen lg:overflow-hidden">
            <div className="flex min-h-screen w-full flex-col lg:h-full lg:min-h-0">
                <HqMegaNav />
                <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
                    <main className="admin-main min-h-0 flex-1 overflow-visible lg:overflow-y-auto lg:overflow-x-hidden">
                        <div className={`admin-main-inner mx-auto ${isWideWorkspace ? 'max-w-none px-3 py-3 sm:px-4 lg:px-5 lg:py-4' : 'max-w-[1240px] p-4 sm:p-6 lg:p-8'}`}>
                            {!isWideWorkspace && (
                                <div className="mb-3 flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2">
                                    <div className="min-w-0">
                                        <h1 className="truncate text-base font-semibold tracking-tight text-white">{meta.title}</h1>
                                        {meta.description ? (
                                            <p className="mt-0.5 truncate text-xs text-gray-500">{meta.description}</p>
                                        ) : null}
                                    </div>
                                    <DesktopStatusCenter />
                                </div>
                            )}
                            {isDev && !isStaff && (
                                <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                                    Режим DEV: админ-интерфейс разблокирован для нештатных ролей в локальном тесте.
                                </div>
                            )}
                            <Outlet />
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}

function getPageMeta(pathname: string, search: string) {
    if (ordersRouteMeta[pathname]) {
        return ordersRouteMeta[pathname];
    }

    if (workspaceRouteMeta[pathname]) {
        return workspaceRouteMeta[pathname];
    }

    if (pathname === '/admin/products') {
        const view = new URLSearchParams(search).get('view');
        if (view && productsViewMeta[view]) {
            return productsViewMeta[view];
        }
    }

    if (pathname === '/admin/settings') {
        const view = new URLSearchParams(search).get('view');
        if (view && settingsViewMeta[view]) {
            return settingsViewMeta[view];
        }
    }

    if (pathname === '/admin/warehouse') {
        const view = new URLSearchParams(search).get('view');
        if (view && warehouseViewMeta[view]) {
            return warehouseViewMeta[view];
        }
    }

    if (pathname === '/admin/telegram-bots') {
        const view = new URLSearchParams(search).get('view');
        if (view && telegramViewMeta[view]) {
            return telegramViewMeta[view];
        }
    }

    if (pathname === '/admin/video-tool') {
        const view = new URLSearchParams(search).get('view');
        if (view && videoToolViewMeta[view]) {
            return videoToolViewMeta[view];
        }
    }

    return pageMeta[pathname] || {
        title: 'Рабочая область',
        description: ''
    };
}
