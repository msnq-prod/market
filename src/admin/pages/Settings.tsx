import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronRight, ExternalLink, File, Folder, FolderPlus, HardDrive, RefreshCw, SlidersHorizontal, Trash2, UploadCloud } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

type BatchFolderMetadata = {
    id: string;
    location_id: string | null;
    location_name: string;
    template_name: string;
    collected_date: string | null;
    created_at: string;
    display_name: string;
};

type ServerStorageEntry = {
    name: string;
    type: 'file' | 'directory';
    relative_path: string;
    size_bytes: number;
    modified_at: string;
    batch?: BatchFolderMetadata | null;
};

type ServerStorageSnapshot = {
    root_name: string;
    current_path: string;
    parent_path: string | null;
    used_bytes: number;
    total_bytes: number | null;
    free_bytes: number | null;
    entries: ServerStorageEntry[];
};

type SortKey = 'name' | 'size' | 'modified' | 'batch_date';
type SortState = {
    key: SortKey;
    direction: 'asc' | 'desc';
};

const formatBytes = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'Нет данных';
    if (value === 0) return '0 Б';

    const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const scaled = value / (1024 ** index);
    const precision = scaled >= 10 || index === 0 ? 0 : 1;
    return `${scaled.toFixed(precision)} ${units[index]}`;
};

const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
};

const DEFAULT_SERVER_ORIGIN = 'https://zagarami.com';

const normalizeOrigin = (value: string | null | undefined): string => {
    if (!value) return DEFAULT_SERVER_ORIGIN;

    try {
        return new URL(value).origin;
    } catch {
        return DEFAULT_SERVER_ORIGIN;
    }
};

const getConfiguredServerOrigin = async (): Promise<string> => {
    if (window.stonesDesktop?.getAppInfo) {
        try {
            const appInfo = await window.stonesDesktop.getAppInfo();
            return normalizeOrigin(appInfo.apiOrigin);
        } catch {
            return DEFAULT_SERVER_ORIGIN;
        }
    }

    return DEFAULT_SERVER_ORIGIN;
};

const getFileUrl = (serverOrigin: string, relativePath: string) => {
    const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
    return new URL(`/uploads/${encodedPath}`, serverOrigin).toString();
};

const sortEntries = (entries: ServerStorageEntry[], sort: SortState) => [...entries].sort((left, right) => {
    if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;

    let result = 0;
    if (sort.key === 'size') {
        result = left.size_bytes - right.size_bytes;
    } else if (sort.key === 'batch_date') {
        const leftDate = new Date(left.batch?.collected_date || left.batch?.created_at || left.modified_at).getTime();
        const rightDate = new Date(right.batch?.collected_date || right.batch?.created_at || right.modified_at).getTime();
        result = leftDate - rightDate;
    } else if (sort.key === 'modified') {
        result = new Date(left.modified_at).getTime() - new Date(right.modified_at).getTime();
    } else {
        const leftName = left.batch?.display_name || left.name;
        const rightName = right.batch?.display_name || right.name;
        result = leftName.localeCompare(rightName, 'ru');
    }

    return sort.direction === 'asc' ? result : -result;
});

const getEntryDisplayName = (entry: ServerStorageEntry, batchFolderMode: boolean) =>
    batchFolderMode && entry.batch ? entry.batch.display_name : entry.name;

const getEntryDateLabel = (entry: ServerStorageEntry, batchFolderMode: boolean) => {
    if (!batchFolderMode || !entry.batch) return formatDateTime(entry.modified_at);
    return formatDate(entry.batch.collected_date || entry.batch.created_at);
};

const buttonClassName = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-gray-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50';

export function Settings() {
    const [snapshot, setSnapshot] = useState<ServerStorageSnapshot | null>(null);
    const [currentPath, setCurrentPath] = useState('');
    const [sort, setSort] = useState<SortState>({ key: 'name', direction: 'asc' });
    const [newFolderName, setNewFolderName] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [serverOrigin, setServerOrigin] = useState(DEFAULT_SERVER_ORIGIN);
    const [batchFolderMode, setBatchFolderMode] = useState(false);
    const [locationFilter, setLocationFilter] = useState('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const loadStorage = useCallback(async (pathValue: string) => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (pathValue) params.set('path', pathValue);
            const response = await authFetch(`/api/server-storage${params.toString() ? `?${params.toString()}` : ''}`);
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'Не удалось загрузить папку.');
            }

            setSnapshot(payload);
            setCurrentPath(payload.current_path || '');
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить папку.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadStorage(currentPath);
    }, [currentPath, loadStorage]);

    useEffect(() => {
        void getConfiguredServerOrigin().then(setServerOrigin);
    }, []);

    const batchLocationOptions = useMemo(() => {
        const options = new Map<string, string>();
        for (const entry of snapshot?.entries || []) {
            if (!entry.batch) continue;
            const key = entry.batch.location_id || '__none__';
            if (!options.has(key)) {
                options.set(key, entry.batch.location_name);
            }
        }

        return [...options.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
    }, [snapshot?.entries]);

    const sortedEntries = useMemo(() => {
        let nextEntries = snapshot?.entries || [];
        if (batchFolderMode) {
            nextEntries = nextEntries.filter((entry) => {
                if (!entry.batch) return false;
                if (!locationFilter) return true;
                return (entry.batch.location_id || '__none__') === locationFilter;
            });
        }
        return sortEntries(nextEntries, sort);
    }, [batchFolderMode, locationFilter, snapshot?.entries, sort]);
    const usedPercent = snapshot?.total_bytes
        ? Math.max(0, Math.min(100, Math.round((snapshot.used_bytes / snapshot.total_bytes) * 100)))
        : null;
    const breadcrumbs = useMemo(() => {
        const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
        return [
            { label: snapshot?.root_name || 'uploads', path: '' },
            ...parts.map((part, index) => ({
                label: part,
                path: parts.slice(0, index + 1).join('/')
            }))
        ];
    }, [currentPath, snapshot?.root_name]);

    const updateSort = (key: SortKey) => {
        setSort((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const toggleBatchFolderMode = () => {
        const next = !batchFolderMode;
        setBatchFolderMode(next);
        setLocationFilter('');
        setSort(next ? { key: 'batch_date', direction: 'desc' } : { key: 'name', direction: 'asc' });
    };

    const uploadFiles = async (files: FileList | File[]) => {
        const selectedFiles = Array.from(files);
        if (selectedFiles.length === 0) return;

        setBusy(true);
        setError('');
        setMessage('');
        try {
            const formData = new FormData();
            formData.set('path', currentPath);
            selectedFiles.forEach((file) => formData.append('files', file));

            const response = await authFetch('/api/server-storage/upload', {
                method: 'POST',
                body: formData
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'Не удалось загрузить файлы.');
            }

            setSnapshot(payload);
            setMessage(`Загружено файлов: ${selectedFiles.length}.`);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить файлы.');
        } finally {
            setBusy(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const createFolder = async () => {
        const name = newFolderName.trim();
        if (!name) return;

        setBusy(true);
        setError('');
        setMessage('');
        try {
            const response = await authFetch('/api/server-storage/folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentPath, name })
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'Не удалось создать папку.');
            }

            setSnapshot(payload);
            setNewFolderName('');
            setMessage(`Папка создана: ${name}.`);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось создать папку.');
        } finally {
            setBusy(false);
        }
    };

    const deleteEntry = async (entry: ServerStorageEntry) => {
        const confirmed = window.confirm(`Удалить ${entry.type === 'directory' ? 'папку' : 'файл'} "${entry.name}"?`);
        if (!confirmed) return;

        setBusy(true);
        setError('');
        setMessage('');
        try {
            const response = await authFetch('/api/server-storage', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: entry.relative_path })
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'Не удалось удалить объект.');
            }

            setSnapshot(payload);
            setCurrentPath(payload.current_path || '');
            setMessage(`Удалено: ${entry.name}.`);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Не удалось удалить объект.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <section className="rounded-lg border border-white/8 bg-[#141922]">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-200">
                            <HardDrive size={20} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold text-white">Дисковое пространство</h2>
                            <p className="mt-1 truncate text-sm text-gray-500">Редактируемая папка: public/uploads</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => loadStorage(currentPath)}
                        disabled={loading || busy}
                        className={buttonClassName}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Обновить
                    </button>
                </div>

                <div className="grid gap-4 px-4 py-4 sm:grid-cols-3 sm:px-5">
                    <Metric label="Использовано" value={formatBytes(snapshot?.used_bytes)} />
                    <Metric label="Свободно" value={formatBytes(snapshot?.free_bytes)} />
                    <Metric label="Всего" value={formatBytes(snapshot?.total_bytes)} />
                    {usedPercent !== null ? (
                        <div className="sm:col-span-3">
                            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                                <div className="h-full rounded-full bg-emerald-300" style={{ width: `${usedPercent}%` }} />
                            </div>
                        </div>
                    ) : null}
                </div>
            </section>

            <section className="rounded-lg border border-white/8 bg-[#10151d]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-gray-400">
                        {breadcrumbs.map((crumb, index) => (
                            <span key={crumb.path || 'root'} className="flex min-w-0 items-center gap-1">
                                {index > 0 ? <ChevronRight size={14} className="text-gray-600" /> : null}
                                <button
                                    type="button"
                                    onClick={() => setCurrentPath(crumb.path)}
                                    className="max-w-[180px] truncate rounded-md px-2 py-1 text-gray-300 transition hover:bg-white/[0.06] hover:text-white"
                                >
                                    {crumb.label}
                                </button>
                            </span>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleBatchFolderMode}
                            className={`${buttonClassName} ${batchFolderMode ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100' : ''}`}
                        >
                            <SlidersHorizontal size={16} />
                            Папки партий
                        </button>
                        {batchFolderMode ? (
                            <select
                                value={locationFilter}
                                onChange={(event) => setLocationFilter(event.target.value)}
                                className="h-10 min-w-44 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-emerald-300/50"
                            >
                                <option value="">Все локации</option>
                                {batchLocationOptions.map((location) => (
                                    <option key={location.id} value={location.id}>{location.name}</option>
                                ))}
                            </select>
                        ) : null}
                        <input
                            value={newFolderName}
                            onChange={(event) => setNewFolderName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') void createFolder();
                            }}
                            placeholder="Новая папка"
                            disabled={busy}
                            className="h-10 w-40 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-emerald-300/50"
                        />
                        <button type="button" onClick={createFolder} disabled={busy || !newFolderName.trim()} className={buttonClassName}>
                            <FolderPlus size={16} />
                            Создать
                        </button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className={buttonClassName}>
                            <UploadCloud size={16} />
                            Загрузить
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                                if (event.target.files) void uploadFiles(event.target.files);
                            }}
                        />
                    </div>
                </div>

                <div
                    onDragOver={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(event) => {
                        event.preventDefault();
                        setDragActive(false);
                        void uploadFiles(Array.from(event.dataTransfer.files));
                    }}
                    className={dragActive ? 'bg-emerald-300/5' : ''}
                >
                    {error ? <StatusMessage tone="error" message={error} /> : null}
                    {message ? <StatusMessage tone="success" message={message} /> : null}

                    <div className="overflow-x-auto">
                        <table className="min-w-[760px] w-full table-fixed text-left text-sm">
                            <thead className="border-b border-white/8 text-xs uppercase text-gray-600">
                                <tr>
                                    <TableHeader label={batchFolderMode ? 'Партия' : 'Имя'} active={sort.key === 'name'} onClick={() => updateSort('name')} className="w-[48%]" />
                                    <TableHeader label="Размер" active={sort.key === 'size'} onClick={() => updateSort('size')} className="w-[18%]" />
                                    <TableHeader
                                        label={batchFolderMode ? 'Дата партии' : 'Изменен'}
                                        active={sort.key === (batchFolderMode ? 'batch_date' : 'modified')}
                                        onClick={() => updateSort(batchFolderMode ? 'batch_date' : 'modified')}
                                        className="w-[22%]"
                                    />
                                    <th className="w-[12%] px-4 py-3 text-right font-medium">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-10 text-center text-gray-500">Загрузка...</td>
                                    </tr>
                                ) : sortedEntries.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-10 text-center text-gray-500">Папка пустая. Перетащите файлы сюда или нажмите Загрузить.</td>
                                    </tr>
                                ) : sortedEntries.map((entry) => (
                                    <tr key={entry.relative_path} className="border-b border-white/[0.04] transition hover:bg-white/[0.03]">
                                        <td className="px-4 py-3">
                                            {entry.type === 'directory' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setCurrentPath(entry.relative_path)}
                                                    className="flex min-w-0 items-center gap-3 text-left text-gray-100 hover:text-emerald-200"
                                                >
                                                    <Folder size={18} className="shrink-0 text-emerald-200" />
                                                    <span className="min-w-0">
                                                        <span className="block truncate">{getEntryDisplayName(entry, batchFolderMode)}</span>
                                                        {batchFolderMode && entry.batch ? (
                                                            <span className="block truncate text-xs text-gray-600">{entry.name}</span>
                                                        ) : null}
                                                    </span>
                                                </button>
                                            ) : (
                                                <a
                                                    href={getFileUrl(serverOrigin, entry.relative_path)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex min-w-0 items-center gap-3 text-gray-100 hover:text-emerald-200"
                                                >
                                                    <File size={18} className="shrink-0 text-gray-500" />
                                                    <span className="truncate">{entry.name}</span>
                                                    <ExternalLink size={13} className="shrink-0 text-gray-600" />
                                                </a>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400">{formatBytes(entry.size_bytes)}</td>
                                        <td className="px-4 py-3 text-gray-400">{getEntryDateLabel(entry, batchFolderMode)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => deleteEntry(entry)}
                                                disabled={busy}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-red-500/10 hover:text-red-200 disabled:opacity-50"
                                                title="Удалить"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-white/8 bg-black/15 px-4 py-3">
            <div className="text-xs uppercase text-gray-600">{label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{value}</div>
        </div>
    );
}

function StatusMessage({ tone, message }: { tone: 'success' | 'error'; message: string }) {
    return (
        <div className={`border-b px-4 py-3 text-sm ${
            tone === 'success'
                ? 'border-emerald-300/15 bg-emerald-300/8 text-emerald-100'
                : 'border-red-300/15 bg-red-300/8 text-red-100'
        }`}
        >
            {message}
        </div>
    );
}

function TableHeader({ label, active, onClick, className }: { label: string; active: boolean; onClick: () => void; className: string }) {
    return (
        <th className={`${className} px-4 py-3 font-medium`}>
            <button
                type="button"
                onClick={onClick}
                className={`inline-flex items-center gap-2 transition hover:text-gray-200 ${active ? 'text-gray-200' : ''}`}
            >
                {label}
                <ArrowUpDown size={13} />
            </button>
        </th>
    );
}
