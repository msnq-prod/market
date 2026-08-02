import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronRight, ExternalLink, File, Folder, FolderPlus, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import {
    AdminAction,
    AdminInlineError,
    AdminSelect,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState,
    adminFieldClassName
} from '../components/AdminWorkspaceUI';

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
type SortState = { key: SortKey; direction: 'asc' | 'desc' };

const DEFAULT_SERVER_ORIGIN = 'https://zagarami.com';

const formatBytes = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    if (value === 0) return '0 Б';
    const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const scaled = value / (1024 ** index);
    return `${scaled.toFixed(scaled >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
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
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const normalizeOrigin = (value: string | null | undefined): string => {
    if (!value) return DEFAULT_SERVER_ORIGIN;
    try {
        return new URL(value).origin;
    } catch {
        return DEFAULT_SERVER_ORIGIN;
    }
};

const getConfiguredServerOrigin = async (): Promise<string> => {
    if (!window.stonesDesktop?.getAppInfo) return DEFAULT_SERVER_ORIGIN;
    try {
        const appInfo = await window.stonesDesktop.getAppInfo();
        return normalizeOrigin(appInfo.apiOrigin);
    } catch {
        return DEFAULT_SERVER_ORIGIN;
    }
};

const getFileUrl = (serverOrigin: string, relativePath: string) => {
    const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
    return new URL(`/uploads/${encodedPath}`, serverOrigin).toString();
};

const sortEntries = (entries: ServerStorageEntry[], sort: SortState) => [...entries].sort((left, right) => {
    if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
    let result = 0;
    if (sort.key === 'size') result = left.size_bytes - right.size_bytes;
    else if (sort.key === 'batch_date') {
        const leftDate = new Date(left.batch?.collected_date || left.batch?.created_at || left.modified_at).getTime();
        const rightDate = new Date(right.batch?.collected_date || right.batch?.created_at || right.modified_at).getTime();
        result = leftDate - rightDate;
    } else if (sort.key === 'modified') {
        result = new Date(left.modified_at).getTime() - new Date(right.modified_at).getTime();
    } else {
        result = (left.batch?.display_name || left.name).localeCompare(right.batch?.display_name || right.name, 'ru');
    }
    return sort.direction === 'asc' ? result : -result;
});

export function Settings() {
    return <SettingsWorkspace />;
}

export function SettingsFilesWorkspace() {
    return <SettingsWorkspace />;
}

function SettingsWorkspace() {
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
            if (!response.ok) throw new Error(payload?.error || 'Не удалось загрузить папку.');
            setSnapshot(payload);
            setCurrentPath(payload.current_path || '');
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить папку.');
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

    const atRoot = currentPath.length === 0;
    const batchLocationOptions = useMemo(() => {
        const options = new Map<string, string>();
        for (const entry of snapshot?.entries || []) {
            if (!entry.batch) continue;
            const key = entry.batch.location_id || '__none__';
            if (!options.has(key)) options.set(key, entry.batch.location_name);
        }
        return [...options.entries()].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label, 'ru'));
    }, [snapshot?.entries]);

    const visibleEntries = useMemo(() => {
        let entries = snapshot?.entries || [];
        if (batchFolderMode && atRoot) {
            entries = entries.filter((entry) => {
                if (!entry.batch) return false;
                if (!locationFilter) return true;
                return (entry.batch.location_id || '__none__') === locationFilter;
            });
        }
        return sortEntries(entries, sort);
    }, [atRoot, batchFolderMode, locationFilter, snapshot?.entries, sort]);

    const breadcrumbs = useMemo(() => {
        const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
        return [
            { label: snapshot?.root_name || 'uploads', path: '' },
            ...parts.map((part, index) => ({ label: part, path: parts.slice(0, index + 1).join('/') }))
        ];
    }, [currentPath, snapshot?.root_name]);

    const updateSort = (key: SortKey) => {
        setSort((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
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
            const response = await authFetch('/api/server-storage/upload', { method: 'POST', body: formData });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || 'Не удалось загрузить файлы.');
            setSnapshot(payload);
            setMessage(`Загружено файлов: ${selectedFiles.length}.`);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить файлы.');
        } finally {
            setBusy(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
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
            if (!response.ok) throw new Error(payload?.error || 'Не удалось создать папку.');
            setSnapshot(payload);
            setNewFolderName('');
            setMessage(`Папка создана: ${name}.`);
        } catch (folderError) {
            setError(folderError instanceof Error ? folderError.message : 'Не удалось создать папку.');
        } finally {
            setBusy(false);
        }
    };

    const deleteEntry = async (entry: ServerStorageEntry) => {
        if (!window.confirm(`Удалить ${entry.type === 'directory' ? 'папку' : 'файл'} «${entry.name}»?`)) return;
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
            if (!response.ok) throw new Error(payload?.error || 'Не удалось удалить объект.');
            setSnapshot(payload);
            setCurrentPath(payload.current_path || '');
            setMessage(`Удалено: ${entry.name}.`);
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить объект.');
        } finally {
            setBusy(false);
        }
    };

    const storageLabel = snapshot
        ? `Занято ${formatBytes(snapshot.used_bytes)} · Свободно ${formatBytes(snapshot.free_bytes)}`
        : 'Хранилище';

    return (
        <AdminWorkspace data-testid="storage-workspace">
            <AdminWorkspaceHeader title="Файлы" count={storageLabel}>
                <div className="ml-auto flex min-w-0 items-center gap-2">
                    <AdminSelect
                        label="Режим"
                        value={batchFolderMode ? 'batches' : 'all'}
                        onChange={(value) => {
                            const enabled = value === 'batches';
                            setBatchFolderMode(enabled);
                            setLocationFilter('');
                            setSort(enabled ? { key: 'batch_date', direction: 'desc' } : { key: 'name', direction: 'asc' });
                        }}
                        options={[{ value: 'all', label: 'Все файлы' }, { value: 'batches', label: 'Папки партий' }]}
                        className="w-[160px]"
                    />
                    {batchFolderMode && atRoot ? (
                        <AdminSelect
                            label="Локация"
                            value={locationFilter}
                            onChange={setLocationFilter}
                            options={[{ value: '', label: 'Все локации' }, ...batchLocationOptions]}
                            className="w-[180px]"
                        />
                    ) : null}
                    <AdminAction tone="secondary" onClick={() => void loadStorage(currentPath)} disabled={loading || busy} className="h-11 w-11 px-0" aria-label="Обновить">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </AdminAction>
                </div>
            </AdminWorkspaceHeader>

            {error ? <AdminInlineError>{error}</AdminInlineError> : null}
            {message ? <div className="rounded-lg border border-[#1fa65a]/50 bg-[#10251b] px-4 py-2.5 text-sm text-[#73e9a3]">{message}</div> : null}

            <AdminTableSurface minWidth={900} className={dragActive ? 'border-[#3fbd78] bg-[#132019]' : ''}>
                <div className="flex min-h-14 items-center gap-3 border-b border-[#2a3039] bg-[#10151b] px-4">
                    <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px] text-[#9ba4af]" aria-label="Путь к папке">
                        {breadcrumbs.map((crumb, index) => (
                            <span key={crumb.path || 'root'} className="flex min-w-0 items-center gap-1">
                                {index > 0 ? <ChevronRight size={14} className="shrink-0 text-[#5f6874]" /> : null}
                                <button type="button" onClick={() => setCurrentPath(crumb.path)} className="max-w-[180px] truncate rounded-md px-2 py-1.5 transition hover:bg-[#1b222b] hover:text-white">{crumb.label}</button>
                            </span>
                        ))}
                    </nav>
                    <input
                        value={newFolderName}
                        onChange={(event) => setNewFolderName(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') void createFolder(); }}
                        placeholder="Новая папка"
                        disabled={busy}
                        className={`${adminFieldClassName} w-[170px] px-3`}
                    />
                    <AdminAction tone="secondary" onClick={() => void createFolder()} disabled={busy || !newFolderName.trim()}>
                        <FolderPlus size={16} />
                        Создать
                    </AdminAction>
                    <AdminAction onClick={() => fileInputRef.current?.click()} disabled={busy}>
                        <UploadCloud size={16} />
                        Загрузить
                    </AdminAction>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); }} />
                </div>

                <div
                    onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(event) => { event.preventDefault(); setDragActive(false); void uploadFiles(Array.from(event.dataTransfer.files)); }}
                >
                    <table className="w-full table-fixed border-collapse text-left text-[13px]" data-testid="storage-table">
                        <thead className="bg-[#10151b] text-[12px] font-medium text-[#8f98a4]">
                            <tr className="h-12 border-b border-[#2a3039]">
                                <TableHeader label={batchFolderMode && atRoot ? 'Партия' : 'Имя'} active={sort.key === 'name'} onClick={() => updateSort('name')} className="w-[50%]" />
                                <TableHeader label="Размер" active={sort.key === 'size'} onClick={() => updateSort('size')} className="w-[16%]" />
                                <TableHeader label={batchFolderMode && atRoot ? 'Дата партии' : 'Изменён'} active={sort.key === (batchFolderMode && atRoot ? 'batch_date' : 'modified')} onClick={() => updateSort(batchFolderMode && atRoot ? 'batch_date' : 'modified')} className="w-[22%]" />
                                <th className="w-[12%] px-4 text-right font-medium">Действие</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={4}><AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState></td></tr>
                            ) : visibleEntries.length === 0 ? (
                                <tr><td colSpan={4}><AdminWorkspaceState state="empty">Папка пустая</AdminWorkspaceState></td></tr>
                            ) : visibleEntries.map((entry) => (
                                <tr key={entry.relative_path} data-testid={`storage-row-${entry.relative_path}`} className="h-[62px] border-b border-[#272d35] bg-[#141a21] last:border-b-0 hover:bg-[#171e26]">
                                    <td className="px-4">
                                        {entry.type === 'directory' ? (
                                            <button type="button" onClick={() => setCurrentPath(entry.relative_path)} className="flex max-w-full items-center gap-3 text-left text-[#eef2f6] hover:text-[#70e3a2]">
                                                <Folder size={18} className="shrink-0 text-[#53dc8c]" />
                                                <span className="min-w-0">
                                                    <span className="block truncate">{batchFolderMode && atRoot && entry.batch ? entry.batch.display_name : entry.name}</span>
                                                    {batchFolderMode && atRoot && entry.batch ? <span className="mt-0.5 block truncate text-[11px] text-[#707986]">{entry.name}</span> : null}
                                                </span>
                                            </button>
                                        ) : (
                                            <a href={getFileUrl(serverOrigin, entry.relative_path)} target="_blank" rel="noreferrer" className="flex max-w-full items-center gap-3 text-[#eef2f6] hover:text-[#79b9ff]">
                                                <File size={18} className="shrink-0 text-[#7f8895]" />
                                                <span className="truncate">{entry.name}</span>
                                                <ExternalLink size={13} className="shrink-0 text-[#646d79]" />
                                            </a>
                                        )}
                                    </td>
                                    <td className="px-4 tabular-nums text-[#9ba4af]">{formatBytes(entry.size_bytes)}</td>
                                    <td className="px-4 text-[#9ba4af]">{batchFolderMode && atRoot && entry.batch ? formatDate(entry.batch.collected_date || entry.batch.created_at) : formatDateTime(entry.modified_at)}</td>
                                    <td className="px-4 text-right">
                                        <button type="button" onClick={() => void deleteEntry(entry)} disabled={busy} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-[#707986] transition hover:border-red-400/35 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-50" aria-label={`Удалить ${entry.name}`}>
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </AdminTableSurface>
        </AdminWorkspace>
    );
}

function TableHeader({ label, active, onClick, className }: { label: string; active: boolean; onClick: () => void; className: string }) {
    return (
        <th className={`${className} px-4 font-medium`}>
            <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 transition hover:text-white ${active ? 'text-[#d9dee4]' : ''}`}>
                {label}
                <ArrowUpDown size={13} />
            </button>
        </th>
    );
}
