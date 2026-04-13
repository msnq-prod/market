import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    ArrowRight,
    ArrowUpDown,
    CheckCircle2,
    FileImage,
    ImagePlus,
    LoaderCircle,
    RefreshCcw,
    Save,
    Trash2
} from 'lucide-react';
import { Button } from '../components/ui';
import { authFetch } from '../../utils/authFetch';

type PhotoToolBatch = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    expected_photo_count: number;
};

type PhotoToolItem = {
    id: string;
    temp_id: string;
    item_seq: number;
    serial_number: string | null;
    item_photo_url: string | null;
};

type PhotoToolPayload = {
    batch: PhotoToolBatch;
    items: PhotoToolItem[];
};

type SortMode = 'name' | 'date';

type PersistedPhoto = {
    id: string;
    source: 'persisted';
    name: string;
    preview_url: string;
    assigned_item_seq: number | null;
    existing_url: string;
    last_modified: number | null;
};

type LocalPhoto = {
    id: string;
    source: 'local';
    name: string;
    preview_url: string;
    assigned_item_seq: number | null;
    existing_url: null;
    last_modified: number | null;
    file: File;
    object_url: string;
};

type WorkingPhoto = PersistedPhoto | LocalPhoto;

const padItemSeq = (value: number | null) => value == null ? '' : String(value).padStart(3, '0');
const extractPhotoName = (value: string) => {
    const base = value.split('?')[0]?.split('#')[0] || value;
    const lastSegment = base.split('/').pop() || value;

    try {
        return decodeURIComponent(lastSegment);
    } catch {
        return lastSegment;
    }
};

const comparePhotoNames = (left: WorkingPhoto, right: WorkingPhoto) =>
    left.name.localeCompare(right.name, 'ru', { numeric: true, sensitivity: 'base' });

const orderPhotos = (photos: WorkingPhoto[], sortMode: SortMode, sortDescending: boolean) => {
    const ordered = [...photos].sort((left, right) => {
        if (sortMode === 'date' && left.last_modified != null && right.last_modified != null && left.last_modified !== right.last_modified) {
            return left.last_modified - right.last_modified;
        }

        return comparePhotoNames(left, right);
    });

    if (sortDescending) {
        ordered.reverse();
    }

    return ordered;
};

const assignAllPhotos = (photos: WorkingPhoto[], itemSeqs: number[], assignmentDescending: boolean) => {
    const orderedItemSeqs = assignmentDescending ? [...itemSeqs].reverse() : [...itemSeqs];

    return photos.map((photo, index) => ({
        ...photo,
        assigned_item_seq: orderedItemSeqs[index] ?? null
    }));
};

const fillMissingAssignments = (photos: WorkingPhoto[], itemSeqs: number[], assignmentDescending: boolean) => {
    const orderedItemSeqs = assignmentDescending ? [...itemSeqs].reverse() : [...itemSeqs];
    const usedItemSeqs = new Set(photos.flatMap((photo) => photo.assigned_item_seq == null ? [] : [photo.assigned_item_seq]));
    const missingItemSeqs = orderedItemSeqs.filter((itemSeq) => !usedItemSeqs.has(itemSeq));
    let nextIndex = 0;

    return photos.map((photo) => {
        if (photo.assigned_item_seq != null) {
            return photo;
        }

        return {
            ...photo,
            assigned_item_seq: missingItemSeqs[nextIndex++] ?? null
        };
    });
};

const buildPersistedPhoto = (item: PhotoToolItem): PersistedPhoto => ({
    id: `persisted:${item.id}`,
    source: 'persisted',
    name: extractPhotoName(item.item_photo_url || ''),
    preview_url: item.item_photo_url || '',
    assigned_item_seq: item.item_seq,
    existing_url: item.item_photo_url || '',
    last_modified: null
});

const createLocalPhoto = (file: File): LocalPhoto => {
    const objectUrl = URL.createObjectURL(file);

    return {
        id: `local:${crypto.randomUUID()}`,
        source: 'local',
        name: file.name,
        preview_url: objectUrl,
        assigned_item_seq: null,
        existing_url: null,
        last_modified: Number.isFinite(file.lastModified) ? file.lastModified : null,
        file,
        object_url: objectUrl
    };
};

export function PhotoTool() {
    const { batchId = '' } = useParams();
    const [data, setData] = useState<PhotoToolPayload | null>(null);
    const [photos, setPhotos] = useState<WorkingPhoto[]>([]);
    const [activePhotoId, setActivePhotoId] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('name');
    const [sortDescending, setSortDescending] = useState(false);
    const [assignmentDescending, setAssignmentDescending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const photosRef = useRef<WorkingPhoto[]>([]);

    useEffect(() => {
        photosRef.current = photos;
    }, [photos]);

    useEffect(() => () => {
        photosRef.current.forEach((photo) => {
            if (photo.source === 'local') {
                URL.revokeObjectURL(photo.object_url);
            }
        });
    }, []);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError('');
            setSuccessMessage('');

            try {
                const response = await authFetch(`/api/batches/${batchId}/photo-tool`);
                const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить photo-tool.' }));
                if (!response.ok) {
                    throw new Error(payload.error || 'Не удалось загрузить photo-tool.');
                }

                const typedPayload = payload as PhotoToolPayload;
                const nextPhotos = typedPayload.items
                    .filter((item) => Boolean(item.item_photo_url))
                    .map((item) => buildPersistedPhoto(item));

                if (cancelled) {
                    return;
                }

                photosRef.current.forEach((photo) => {
                    if (photo.source === 'local') {
                        URL.revokeObjectURL(photo.object_url);
                    }
                });
                setData(typedPayload);
                setPhotos(nextPhotos);
                setActivePhotoId(nextPhotos[0]?.id || '');
            } catch (loadError) {
                console.error(loadError);
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить photo-tool.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [batchId]);

    const itemSeqs = data?.items.map((item) => item.item_seq) ?? [];
    const coveredItemSeqs = new Set(photos.flatMap((photo) => photo.assigned_item_seq == null ? [] : [photo.assigned_item_seq]));
    const missingItemSeqs = itemSeqs.filter((itemSeq) => !coveredItemSeqs.has(itemSeq));
    const assignedCount = photos.filter((photo) => photo.assigned_item_seq != null).length;
    const unassignedCount = photos.length - assignedCount;
    const extraPhotoCount = Math.max(0, photos.length - itemSeqs.length);
    const canSave = Boolean(data) && missingItemSeqs.length === 0 && itemSeqs.length > 0;
    const activeIndex = photos.findIndex((photo) => photo.id === activePhotoId);
    const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0;
    const prevPhoto = resolvedActiveIndex > 0 ? photos[resolvedActiveIndex - 1] : null;
    const activePhoto = photos[resolvedActiveIndex] ?? null;
    const nextPhoto = resolvedActiveIndex < photos.length - 1 ? photos[resolvedActiveIndex + 1] : null;

    const applyNextPhotos = (nextPhotos: WorkingPhoto[], preferredActiveId?: string | null) => {
        setPhotos(nextPhotos);

        if (nextPhotos.length === 0) {
            setActivePhotoId('');
            return;
        }

        const activeId = preferredActiveId && nextPhotos.some((photo) => photo.id === preferredActiveId)
            ? preferredActiveId
            : nextPhotos.some((photo) => photo.id === activePhotoId)
            ? activePhotoId
            : nextPhotos[0].id;

        setActivePhotoId(activeId);
    };

    const applyFullReassignment = (
        nextSortMode: SortMode,
        nextSortDescending: boolean,
        nextAssignmentDescending: boolean
    ) => {
        const reordered = orderPhotos(photos, nextSortMode, nextSortDescending);
        const reassigned = assignAllPhotos(reordered, itemSeqs, nextAssignmentDescending);
        applyNextPhotos(reassigned, activePhotoId);
        setSortMode(nextSortMode);
        setSortDescending(nextSortDescending);
        setAssignmentDescending(nextAssignmentDescending);
        setSuccessMessage('');
    };

    const handleAddFiles = (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) {
            return;
        }

        setError('');
        setSuccessMessage('');

        const localPhotos = Array.from(fileList).map((file) => createLocalPhoto(file));
        const reordered = orderPhotos([...photos, ...localPhotos], sortMode, sortDescending);
        const nextPhotos = fillMissingAssignments(reordered, itemSeqs, assignmentDescending);
        applyNextPhotos(nextPhotos, localPhotos[0]?.id || activePhotoId);
    };

    const handleRemovePhoto = (photoId: string) => {
        const currentIndex = photos.findIndex((photo) => photo.id === photoId);
        if (currentIndex === -1) {
            return;
        }

        const photoToRemove = photos[currentIndex];
        if (photoToRemove.source === 'local') {
            URL.revokeObjectURL(photoToRemove.object_url);
        }

        const nextPhotos = photos.filter((photo) => photo.id !== photoId);
        const fallbackActiveId = nextPhotos[currentIndex]?.id || nextPhotos[currentIndex - 1]?.id || null;
        applyNextPhotos(nextPhotos, fallbackActiveId);
        setError('');
        setSuccessMessage('');
    };

    const handleAssignmentChange = (photoId: string, nextValue: string) => {
        const normalized = nextValue.replace(/\D/g, '');
        const parsedValue = normalized ? Number(normalized) : null;
        const nextAssignedItemSeq = parsedValue != null && itemSeqs.includes(parsedValue) ? parsedValue : null;

        const nextPhotos = photos.map((photo) => {
            if (photo.id === photoId) {
                return {
                    ...photo,
                    assigned_item_seq: nextAssignedItemSeq
                };
            }

            if (nextAssignedItemSeq != null && photo.assigned_item_seq === nextAssignedItemSeq) {
                return {
                    ...photo,
                    assigned_item_seq: null
                };
            }

            return photo;
        });

        applyNextPhotos(nextPhotos, photoId);
        setError('');
        setSuccessMessage('');
    };

    const handleSave = async () => {
        if (!data) {
            return;
        }

        if (!canSave) {
            setError('Нужно назначить уникальную фотографию для каждой позиции партии.');
            return;
        }

        setSaving(true);
        setError('');
        setSuccessMessage('');

        try {
            const assignedPhotosByItemSeq = new Map(
                photos.flatMap((photo) => photo.assigned_item_seq == null ? [] : [[photo.assigned_item_seq, photo] as const])
            );
            const manifest: Array<Record<string, string | number>> = [];
            const formData = new FormData();
            let fileIndex = 0;

            for (const item of data.items) {
                const photo = assignedPhotosByItemSeq.get(item.item_seq);
                if (!photo) {
                    throw new Error(`Для позиции ${padItemSeq(item.item_seq)} не выбрана фотография.`);
                }

                if (photo.source === 'persisted') {
                    manifest.push({
                        item_id: item.id,
                        item_seq: item.item_seq,
                        source: 'existing',
                        existing_url: photo.existing_url
                    });
                    continue;
                }

                manifest.push({
                    item_id: item.id,
                    item_seq: item.item_seq,
                    source: 'upload',
                    file_index: fileIndex
                });
                formData.append('files', photo.file, photo.file.name);
                fileIndex += 1;
            }

            formData.append('manifest', JSON.stringify(manifest));

            const response = await authFetch(`/api/batches/${batchId}/photo-tool/apply`, {
                method: 'POST',
                body: formData
            });
            const payload = await response.json().catch(() => ({ error: 'Не удалось сохранить назначения photo-tool.' }));
            if (!response.ok) {
                throw new Error(payload.error || 'Не удалось сохранить назначения photo-tool.');
            }

            const typedPayload = payload as PhotoToolPayload;
            const photoUrlByItemSeq = new Map(
                typedPayload.items
                    .filter((item) => Boolean(item.item_photo_url))
                    .map((item) => [item.item_seq, item.item_photo_url as string])
            );
            const nextPhotos = photos.map((photo) => {
                if (photo.assigned_item_seq == null) {
                    return photo;
                }

                const nextUrl = photoUrlByItemSeq.get(photo.assigned_item_seq);
                if (!nextUrl) {
                    return photo;
                }

                if (photo.source === 'local') {
                    URL.revokeObjectURL(photo.object_url);
                }

                return {
                    id: `persisted:${photo.assigned_item_seq}`,
                    source: 'persisted' as const,
                    name: extractPhotoName(nextUrl),
                    preview_url: nextUrl,
                    assigned_item_seq: photo.assigned_item_seq,
                    existing_url: nextUrl,
                    last_modified: null
                };
            });
            const preferredActiveId = activePhoto?.assigned_item_seq != null && photoUrlByItemSeq.has(activePhoto.assigned_item_seq)
                ? `persisted:${activePhoto.assigned_item_seq}`
                : activePhotoId;

            setData(typedPayload);
            applyNextPhotos(nextPhotos, preferredActiveId);
            setSuccessMessage('Назначения фото сохранены.');
        } catch (saveError) {
            console.error(saveError);
            setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить назначения photo-tool.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#050816] text-white">
                <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/80">
                        <LoaderCircle className="animate-spin" size={18} />
                        Загружаем photo-tool...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_35%),linear-gradient(180deg,_#09111f_0%,_#050816_48%,_#03050c_100%)] text-white">
            <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
                <header className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_30px_120px_rgba(2,6,23,0.55)] backdrop-blur xl:px-7">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.28em] text-sky-200/70">
                                <Link to="/admin/acceptance" className="inline-flex items-center gap-2 text-white/70 transition hover:text-white">
                                    <ArrowLeft size={15} />
                                    Приемка
                                </Link>
                                <span className="h-1 w-1 rounded-full bg-white/30" />
                                <span>Photo Tool</span>
                            </div>
                            <div>
                                <h1 data-testid="photo-tool-heading" className="text-xl font-semibold text-white sm:text-2xl">
                                    Назначение фотографий в паспорта товаров
                                </h1>
                                <p className="mt-1 text-sm text-white/65">
                                    Партия {data?.batch.id}. Фото назначаются по номеру позиции товара `001`, `002`, `003`.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <MetricChip label="Назначено" value={`${Math.min(itemSeqs.length, assignedCount)}/${itemSeqs.length}`} tone={canSave ? 'success' : 'default'} />
                            <MetricChip label="Без номера" value={String(unassignedCount)} tone={unassignedCount > 0 ? 'warning' : 'default'} />
                            <MetricChip label="Лишние фото" value={String(extraPhotoCount)} tone={extraPhotoCount > 0 ? 'default' : 'default'} />
                            <Button
                                data-testid="photo-save"
                                onClick={() => void handleSave()}
                                disabled={!canSave || saving}
                                className="min-w-40"
                            >
                                {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                                {saving ? 'Сохраняем...' : 'Сохранить назначения'}
                            </Button>
                        </div>
                    </div>

                    {(error || successMessage || missingItemSeqs.length > 0) && (
                        <div className="mt-4 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
                            <div className={`rounded-2xl border px-4 py-3 text-sm ${error
                                ? 'border-red-500/30 bg-red-500/10 text-red-100'
                                : successMessage
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                                }`}>
                                {error || successMessage || `Не хватает назначений для позиций: ${missingItemSeqs.map((itemSeq) => padItemSeq(itemSeq)).join(', ')}.`}
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                                Сохранение доступно только когда у каждой позиции партии есть уникальная фотография. Лишние фото можно оставить без номера.
                            </div>
                        </div>
                    )}
                </header>

                <div className="mt-4 grid flex-1 gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
                    <section className="flex min-h-[420px] flex-col rounded-[28px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_24px_90px_rgba(2,6,23,0.5)] backdrop-blur">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                            <div>
                                <h2 className="text-lg font-semibold text-white">Лента фотографий</h2>
                                <p className="mt-1 text-sm text-white/60">
                                    Загрузите комплект, отсортируйте список и при необходимости переверните порядок назначения.
                                </p>
                            </div>
                            <input
                                ref={fileInputRef}
                                data-testid="photo-upload-input"
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                    handleAddFiles(event.target.files);
                                    event.currentTarget.value = '';
                                }}
                            />
                            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                                <ImagePlus size={16} />
                                Добавить фото
                            </Button>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                data-testid="photo-sort-name"
                                onClick={() => applyFullReassignment('name', sortDescending, assignmentDescending)}
                                className={`rounded-2xl border px-4 py-3 text-left transition ${sortMode === 'name'
                                    ? 'border-sky-400/40 bg-sky-500/10 text-white'
                                    : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:text-white'
                                    }`}
                            >
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <ArrowUpDown size={15} />
                                    Сортировка по имени
                                </div>
                                <p className="mt-1 text-xs text-white/55">Числовой порядок файлов: `4001`, `4010`, `4025`.</p>
                            </button>

                            <button
                                type="button"
                                data-testid="photo-sort-date"
                                onClick={() => applyFullReassignment('date', sortDescending, assignmentDescending)}
                                className={`rounded-2xl border px-4 py-3 text-left transition ${sortMode === 'date'
                                    ? 'border-sky-400/40 bg-sky-500/10 text-white'
                                    : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:text-white'
                                    }`}
                            >
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <ArrowUpDown size={15} />
                                    Сортировка по дате
                                </div>
                                <p className="mt-1 text-xs text-white/55">Для новых файлов используется файловая дата, для сохраненных фото fallback идет по имени.</p>
                            </button>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                data-testid="photo-reverse-list"
                                onClick={() => applyFullReassignment(sortMode, !sortDescending, assignmentDescending)}
                                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-white/75 transition hover:border-white/20 hover:text-white"
                            >
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <RefreshCcw size={15} />
                                    Инвертировать список
                                </div>
                                <p className="mt-1 text-xs text-white/55">{sortDescending ? 'Сейчас список развернут.' : 'Сейчас список идет в прямом порядке.'}</p>
                            </button>

                            <button
                                type="button"
                                data-testid="photo-reverse-assignment"
                                onClick={() => applyFullReassignment(sortMode, sortDescending, !assignmentDescending)}
                                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-white/75 transition hover:border-white/20 hover:text-white"
                            >
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <RefreshCcw size={15} />
                                    Инвертировать назначение
                                </div>
                                <p className="mt-1 text-xs text-white/55">{assignmentDescending ? 'Первая фото получает последнюю позицию.' : 'Первая фото получает первую позицию.'}</p>
                            </button>
                        </div>

                        <div data-testid="photo-coverage" className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                            Покрытие партии: {Math.min(itemSeqs.length, assignedCount)}/{itemSeqs.length}. Всего фото: {photos.length}.
                        </div>

                        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                            {photos.length === 0 ? (
                                <div className="flex h-full min-h-60 flex-col items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-black/20 px-6 text-center text-white/60">
                                    <FileImage size={34} className="mb-3 text-white/35" />
                                    <p className="text-sm font-medium text-white/75">Фотографии еще не загружены</p>
                                    <p className="mt-2 max-w-sm text-sm text-white/50">
                                        Добавьте комплект изображений. Первичная раздача номеров пойдет по текущей сортировке списка.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {photos.map((photo, index) => (
                                        <div
                                            key={photo.id}
                                            className={`group flex items-center gap-3 rounded-[24px] border p-3 transition ${photo.id === activePhotoId
                                                ? 'border-sky-400/45 bg-sky-500/10'
                                                : 'border-white/10 bg-black/20 hover:border-white/20'
                                                }`}
                                        >
                                            <button
                                                type="button"
                                                data-testid={`photo-list-item-${index}`}
                                                onClick={() => setActivePhotoId(photo.id)}
                                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                            >
                                                <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                                                    <img src={photo.preview_url} alt={photo.name} className="h-full w-full object-cover" />
                                                    {photo.assigned_item_seq == null && (
                                                        <div data-testid={`photo-unassigned-overlay-${index}`} className="absolute inset-0 bg-red-500/35" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-white">{photo.name}</p>
                                                    <p data-testid={`photo-list-status-${index}`} className="mt-1 text-xs text-white/55">
                                                        {photo.assigned_item_seq == null
                                                            ? 'Без назначения'
                                                            : `Позиция ${padItemSeq(photo.assigned_item_seq)}`}
                                                    </p>
                                                    <p className="mt-2 text-[11px] uppercase tracking-[0.24em] text-white/35">
                                                        Фото {String(index + 1).padStart(3, '0')}
                                                    </p>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleRemovePhoto(photo.id)}
                                                className="rounded-xl border border-white/10 p-2 text-white/45 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-100"
                                                aria-label={`Удалить ${photo.name}`}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="flex min-h-[420px] flex-col rounded-[28px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_24px_90px_rgba(2,6,23,0.5)] backdrop-blur">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                            <div>
                                <h2 className="text-lg font-semibold text-white">Карусель назначений</h2>
                                <p className="mt-1 text-sm text-white/60">
                                    Клик по фото слева переносит его в центр. Номер под карточкой можно изменить вручную.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    onClick={() => prevPhoto && setActivePhotoId(prevPhoto.id)}
                                    disabled={!prevPhoto}
                                >
                                    <ArrowLeft size={16} />
                                    Назад
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => nextPhoto && setActivePhotoId(nextPhoto.id)}
                                    disabled={!nextPhoto}
                                >
                                    Вперед
                                    <ArrowRight size={16} />
                                </Button>
                            </div>
                        </div>

                        {photos.length === 0 ? (
                            <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-black/20 px-6 text-center text-white/55">
                                Карусель появится после загрузки хотя бы одной фотографии.
                            </div>
                        ) : (
                            <div className="flex flex-1 flex-col justify-between pt-5">
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.2fr)_minmax(0,0.78fr)]">
                                    <CarouselCard
                                        title="Предыдущая"
                                        photo={prevPhoto}
                                        slot="prev"
                                        active={false}
                                        onActivate={(photo) => setActivePhotoId(photo.id)}
                                        onAssignmentChange={handleAssignmentChange}
                                    />
                                    <CarouselCard
                                        title="Активная"
                                        photo={activePhoto}
                                        slot="center"
                                        active
                                        onActivate={(photo) => setActivePhotoId(photo.id)}
                                        onAssignmentChange={handleAssignmentChange}
                                    />
                                    <CarouselCard
                                        title="Следующая"
                                        photo={nextPhoto}
                                        slot="next"
                                        active={false}
                                        onActivate={(photo) => setActivePhotoId(photo.id)}
                                        onAssignmentChange={handleAssignmentChange}
                                    />
                                </div>

                                <div className="mt-6 grid gap-3 rounded-[24px] border border-white/10 bg-black/20 p-4 lg:grid-cols-3">
                                    <InfoRow title="Текущая сортировка" value={sortMode === 'name' ? 'По имени файла' : 'По файловой дате'} />
                                    <InfoRow title="Порядок списка" value={sortDescending ? 'Обратный' : 'Прямой'} />
                                    <InfoRow title="Порядок назначения" value={assignmentDescending ? 'От последней позиции к первой' : 'От первой позиции к последней'} />
                                </div>

                                <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4 text-sm text-white/65">
                                    Если назначить номер, который уже используется, прежняя фотография потеряет номер и будет подсвечена красным в левой ленте.
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

function MetricChip({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' }) {
    const toneClass = tone === 'success'
        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
        : tone === 'warning'
        ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
        : 'border-white/10 bg-black/20 text-white/80';

    return (
        <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">{label}</p>
            <p className="mt-1 text-base font-semibold">{value}</p>
        </div>
    );
}

function CarouselCard({
    title,
    photo,
    slot,
    active,
    onActivate,
    onAssignmentChange
}: {
    title: string;
    photo: WorkingPhoto | null;
    slot: 'prev' | 'center' | 'next';
    active: boolean;
    onActivate: (photo: WorkingPhoto) => void;
    onAssignmentChange: (photoId: string, nextValue: string) => void;
}) {
    if (!photo) {
        return (
            <div className="flex min-h-[320px] flex-col justify-center rounded-[26px] border border-dashed border-white/15 bg-black/20 p-4 text-center text-sm text-white/40">
                <p className="text-xs uppercase tracking-[0.28em] text-white/30">{title}</p>
                <p className="mt-3">Нет фотографии</p>
            </div>
        );
    }

    return (
        <div
            data-testid={`photo-card-${slot}`}
            className={`rounded-[26px] border p-4 transition ${active
                ? 'border-sky-400/40 bg-sky-500/10 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]'
                : 'border-white/10 bg-black/20'
                }`}
        >
            <button type="button" onClick={() => onActivate(photo)} className="block w-full text-left">
                <div className={`overflow-hidden rounded-[22px] border border-white/10 bg-black/40 ${active ? 'aspect-[4/3]' : 'aspect-[4/4.2]'}`}>
                    <img src={photo.preview_url} alt={photo.name} className="h-full w-full object-cover" />
                </div>
            </button>

            <div className="mt-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.28em] text-white/35">{title}</p>
                        <p className="mt-2 truncate text-sm font-medium text-white">{photo.name}</p>
                    </div>
                    {photo.assigned_item_seq != null && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100">
                            <CheckCircle2 size={13} />
                            {padItemSeq(photo.assigned_item_seq)}
                        </span>
                    )}
                </div>

                <label className="mt-4 block text-xs uppercase tracking-[0.24em] text-white/35">
                    Номер товара
                    <input
                        data-testid={`photo-assignment-input-${slot}`}
                        value={padItemSeq(photo.assigned_item_seq)}
                        inputMode="numeric"
                        maxLength={3}
                        onChange={(event) => onAssignmentChange(photo.id, event.target.value)}
                        className={`mt-2 w-full rounded-2xl border px-4 py-3 text-base font-semibold text-white outline-none transition ${photo.assigned_item_seq == null
                            ? 'border-red-400/30 bg-red-500/10 placeholder:text-red-200/40 focus:border-red-300/45'
                            : 'border-white/10 bg-black/30 focus:border-sky-400/40'
                            }`}
                        placeholder="Без номера"
                    />
                </label>
            </div>
        </div>
    );
}

function InfoRow({ title, value }: { title: string; value: string }) {
    return (
        <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">{title}</p>
            <p className="mt-2 text-sm font-medium text-white">{value}</p>
        </div>
    );
}
