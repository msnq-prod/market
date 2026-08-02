import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import type { Location } from '../../data/db';
import { authFetch } from '../../utils/authFetch';
import { getLocalizedValue } from '../../utils/language';
import {
    AdminAction,
    AdminInlineError,
    AdminSearchField,
    AdminSelect,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState
} from '../components/AdminWorkspaceUI';

const BASE_LANGUAGE_ID = 2;

type LocationFilter = 'all' | 'desktop' | 'mobile' | 'review';

const getLocationName = (location: Location) => (
    getLocalizedValue(location, 'name', BASE_LANGUAGE_ID) || 'Без названия'
);

const hasDesktopProfile = (location: Location) => (
    Number.isFinite(location.label_desktop_offset)
    && Number.isFinite(location.label_desktop_vertical_offset)
    && (location.label_desktop_direction === 'UP' || location.label_desktop_direction === 'DOWN')
);

const hasMobileProfile = (location: Location) => (
    Number.isFinite(location.label_mobile_offset)
    && Number.isFinite(location.label_mobile_vertical_offset)
    && (location.label_mobile_direction === 'UP' || location.label_mobile_direction === 'DOWN')
);

const needsReview = (location: Location) => (
    !location.image
    || getLocationName(location).length > 22
    || !Number.isFinite(location.lat)
    || !Number.isFinite(location.lng)
    || !hasDesktopProfile(location)
    || !hasMobileProfile(location)
);

const getProfileDetails = (
    offset: number | undefined,
    verticalOffset: number | undefined,
    direction: 'UP' | 'DOWN' | undefined
) => {
    if (!Number.isFinite(offset) || !Number.isFinite(verticalOffset) || !direction) return 'Нет полного профиля';
    return `${offset}px · ${verticalOffset}px · ${direction === 'UP' ? 'вверх' : 'вниз'}`;
};

export function PlanetLabelsWorkspace() {
    const [locations, setLocations] = useState<Location[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<LocationFilter>('all');

    const fetchLocations = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const response = await authFetch('/api/locations');
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'Не удалось загрузить локации.');
            setLocations(Array.isArray(payload) ? payload as Location[] : []);
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить локации.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchLocations();
    }, [fetchLocations]);

    const filteredLocations = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return locations
            .filter((location) => {
                const matchesQuery = !normalizedQuery || getLocationName(location).toLowerCase().includes(normalizedQuery);
                const matchesFilter = filter === 'all'
                    || (filter === 'desktop' && hasDesktopProfile(location))
                    || (filter === 'mobile' && hasMobileProfile(location))
                    || (filter === 'review' && needsReview(location));
                return matchesQuery && matchesFilter;
            })
            .sort((left, right) => {
                const reviewDifference = Number(needsReview(right)) - Number(needsReview(left));
                return reviewDifference || getLocationName(left).localeCompare(getLocationName(right), 'ru');
            });
    }, [filter, locations, query]);

    const reviewCount = useMemo(() => locations.filter(needsReview).length, [locations]);

    return (
        <AdminWorkspace data-testid="planet-labels-workspace">
            <AdminWorkspaceHeader title="Подписи Планеты" count={`Проверить: ${reviewCount} · Всего: ${locations.length}`}>
                <div className="ml-auto w-full max-w-[520px]" data-testid="planet-labels-search">
                    <AdminSearchField
                        value={query}
                        onChange={setQuery}
                        placeholder="Название локации"
                        ariaLabel="Поиск локации"
                    />
                </div>
                <AdminSelect
                    label="Состояние профиля"
                    value={filter}
                    onChange={(value) => setFilter(value as LocationFilter)}
                    options={[
                        { value: 'all', label: 'Все локации' },
                        { value: 'review', label: 'Требуют проверки' },
                        { value: 'desktop', label: 'Desktop настроен' },
                        { value: 'mobile', label: 'Mobile настроен' }
                    ]}
                    className="w-[190px]"
                />
                <AdminAction
                    tone="secondary"
                    aria-label="Обновить локации"
                    className="h-11 min-h-11 w-11 px-0"
                    onClick={() => void fetchLocations()}
                >
                    <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                </AdminAction>
                <Link
                    to="/admin/planet-labels"
                    target="_blank"
                    rel="noreferrer"
                    data-testid="planet-labels-open-editor"
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#4b89d9] bg-[#152130] px-3 text-[13px] font-medium text-[#79b9ff] transition hover:border-[#67a5f4] hover:bg-[#192a3d]"
                >
                    Редактор <ArrowUpRight size={15} />
                </Link>
            </AdminWorkspaceHeader>

            {error ? <AdminInlineError>{error}</AdminInlineError> : null}

            <AdminTableSurface minWidth={1120}>
                {isLoading ? (
                    <AdminWorkspaceState state="loading">Загрузка локаций…</AdminWorkspaceState>
                ) : filteredLocations.length === 0 ? (
                    <AdminWorkspaceState state="empty">Локации не найдены</AdminWorkspaceState>
                ) : (
                    <table className="w-full border-collapse text-left text-[13px]" data-testid="planet-labels-table">
                        <thead className="bg-[#10151b] text-[#8f98a4]">
                            <tr className="h-12 border-b border-[#2a3039]">
                                <TableHeader>Локация</TableHeader>
                                <TableHeader>Координаты</TableHeader>
                                <TableHeader>Изображение</TableHeader>
                                <TableHeader>Desktop-профиль</TableHeader>
                                <TableHeader>Mobile-профиль</TableHeader>
                                <TableHeader>Состояние</TableHeader>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLocations.map((location) => {
                                const desktopReady = hasDesktopProfile(location);
                                const mobileReady = hasMobileProfile(location);
                                const review = needsReview(location);
                                return (
                                    <tr
                                        key={location.id}
                                        className="border-b border-[#252b33] bg-[#11161d] text-[#d8dde3] transition hover:bg-[#151b22] last:border-b-0"
                                        data-testid={`planet-label-row-${location.id}`}
                                    >
                                        <td className="max-w-[280px] px-4 py-3">
                                            <div className="truncate font-medium text-[#f1f4f7]">{getLocationName(location)}</div>
                                            <div className="mt-1 truncate text-[12px] text-[#7f8894]">{location.id}</div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-[#aeb6c0]">
                                            {Number.isFinite(location.lat) && Number.isFinite(location.lng)
                                                ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                                                : 'Не заданы'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <AdminStatus label={location.image ? 'Есть' : 'Нет'} tone={location.image ? 'success' : 'warning'} />
                                        </td>
                                        <td className="max-w-[230px] px-4 py-3">
                                            <AdminStatus label={desktopReady ? 'Настроен' : 'Не настроен'} tone={desktopReady ? 'success' : 'warning'} />
                                            <div className="mt-1.5 truncate text-[12px] text-[#7f8894]">
                                                {getProfileDetails(location.label_desktop_offset, location.label_desktop_vertical_offset, location.label_desktop_direction)}
                                            </div>
                                        </td>
                                        <td className="max-w-[230px] px-4 py-3">
                                            <AdminStatus label={mobileReady ? 'Настроен' : 'Не настроен'} tone={mobileReady ? 'success' : 'warning'} />
                                            <div className="mt-1.5 truncate text-[12px] text-[#7f8894]">
                                                {getProfileDetails(location.label_mobile_offset, location.label_mobile_vertical_offset, location.label_mobile_direction)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <AdminStatus label={review ? 'Проверить' : 'Готово'} tone={review ? 'warning' : 'success'} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </AdminTableSurface>
        </AdminWorkspace>
    );
}

function TableHeader({ children }: { children: ReactNode }) {
    return <th className="px-4 py-3 text-left text-[12px] font-medium">{children}</th>;
}
