import type { ButtonHTMLAttributes } from 'react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    FileImage,
    ImagePlus,
    LoaderCircle,
    Save,
    Trash2
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Button } from '../components/ui';
import { authFetch } from '../../utils/authFetch';

type PhotoToolBatch = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    expected_photo_count: number;
    photo_state_token: string;
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
type DraftPhotoMeta = {
    id: string;
    source: WorkingPhoto['source'];
    name: string;
    assigned_item_seq: number | null;
    existing_url: string | null;
    last_modified: number | null;
};

type PhotoToolDraft = {
    version: 1;
    batch_id: string;
    base_photo_state_token: string;
    sort_mode: SortMode;
    sort_descending: boolean;
    assignment_descending: boolean;
    active_photo_id: string | null;
    photos: DraftPhotoMeta[];
};

type RestoredDraftState = {
    photos: WorkingPhoto[];
    activePhotoId: string;
    sortMode: SortMode;
    sortDescending: boolean;
    assignmentDescending: boolean;
    warningMessage: string;
};

type AssignmentDraft = {
    photoId: string;
    value: string;
};

type PhotoImportProgress = {
    stage: 'checking' | 'converting' | 'adding';
    currentFileName: string;
    current: number;
    total: number;
};

const PHOTO_TOOL_DRAFT_VERSION = 1;
const PHOTO_TOOL_DRAFT_DB = 'stones-photo-tool-drafts';
const PHOTO_TOOL_DRAFT_STORE = 'photo-files';
const PHOTO_TOOL_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.avif,.tif,.tiff,.bmp,.heic,.heif';
const PHOTO_TOOL_ALLOWED_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'tif', 'tiff', 'webp']);
const PHOTO_TOOL_RAW_EXTENSIONS = new Set(['arw', 'cr2', 'cr3', 'dng', 'nef', 'orf', 'raf', 'rw2']);
const PHOTO_TOOL_PREVIEW_UNRELIABLE_EXTENSIONS = new Set(['heic', 'heif']);
const PHOTO_TOOL_ALLOWED_FORMAT_LABEL = 'JPEG, PNG, WebP, GIF, AVIF, TIFF, BMP, HEIC/HEIF';

const padItemSeq = (value: number | null) => value == null ? '' : String(value).padStart(3, '0');
const draftKeyFor = (batchId: string) => `photo-tool-draft:${batchId}`;
const normalizeAssignmentInput = (value: string) => value.replace(/\D/g, '').slice(0, 3);
const getFileExtension = (value: string) => {
    const normalized = value.split('?')[0]?.split('#')[0] || value;
    const lastSegment = normalized.split('/').pop() || normalized;
    const dotIndex = lastSegment.lastIndexOf('.');

    return dotIndex >= 0 ? lastSegment.slice(dotIndex + 1).toLowerCase() : '';
};
const extractPhotoName = (value: string) => {
    const base = value.split('?')[0]?.split('#')[0] || value;
    const lastSegment = base.split('/').pop() || value;

    try {
        return decodeURIComponent(lastSegment);
    } catch {
        return lastSegment;
    }
};

const canPreviewPhotoInBrowser = (photo: WorkingPhoto) => (
    photo.source === 'persisted' || !PHOTO_TOOL_PREVIEW_UNRELIABLE_EXTENSIONS.has(getFileExtension(photo.name))
);

const isHeicLikePhoto = (file: File) => {
    const extension = getFileExtension(file.name);
    return extension === 'heic' || extension === 'heif' || file.type === 'image/heic' || file.type === 'image/heif';
};

const buildConvertedHeicName = (fileName: string) => {
    const baseName = fileName.replace(/\.(heic|heif)$/i, '');
    return `${baseName || 'photo'}.jpg`;
};

const convertHeicToJpegFile = async (file: File) => {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9
    });
    const convertedBlob = Array.isArray(converted) ? converted[0] : converted;

    return new File(
        [convertedBlob],
        buildConvertedHeicName(file.name),
        {
            type: 'image/jpeg',
            lastModified: file.lastModified
        }
    );
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

const applyAssignmentToPhotoList = (
    photos: WorkingPhoto[],
    itemSeqs: number[],
    photoId: string,
    nextValue: string
) => {
    const normalized = normalizeAssignmentInput(nextValue);
    const parsedValue = normalized ? Number(normalized) : null;
    const nextAssignedItemSeq = parsedValue != null && itemSeqs.includes(parsedValue) ? parsedValue : null;

    return photos.map((photo) => {
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

const createPersistedPhotoFromDraft = (meta: DraftPhotoMeta): PersistedPhoto => ({
    id: meta.id,
    source: 'persisted',
    name: meta.name,
    preview_url: meta.existing_url || '',
    assigned_item_seq: meta.assigned_item_seq,
    existing_url: meta.existing_url || '',
    last_modified: meta.last_modified
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

const createLocalPhotoFromDraft = (id: string, file: File, assignedItemSeq: number | null): LocalPhoto => {
    const objectUrl = URL.createObjectURL(file);

    return {
        id,
        source: 'local',
        name: file.name,
        preview_url: objectUrl,
        assigned_item_seq: assignedItemSeq,
        existing_url: null,
        last_modified: Number.isFinite(file.lastModified) ? file.lastModified : null,
        file,
        object_url: objectUrl
    };
};

const buildDraftPhotoMeta = (photo: WorkingPhoto): DraftPhotoMeta => ({
    id: photo.id,
    source: photo.source,
    name: photo.name,
    assigned_item_seq: photo.assigned_item_seq,
    existing_url: photo.source === 'persisted' ? photo.existing_url : null,
    last_modified: photo.last_modified
});

const buildBaselineSignature = (payload: PhotoToolPayload) => JSON.stringify({
    sort_mode: 'name',
    sort_descending: false,
    assignment_descending: false,
    photos: payload.items
        .filter((item) => Boolean(item.item_photo_url))
        .map((item) => ({
            id: `persisted:${item.id}`,
            source: 'persisted',
            name: extractPhotoName(item.item_photo_url || ''),
            assigned_item_seq: item.item_seq,
            existing_url: item.item_photo_url || null,
            last_modified: null
        }))
});

const buildCurrentSignature = (
    photos: WorkingPhoto[],
    sortMode: SortMode,
    sortDescending: boolean,
    assignmentDescending: boolean
) => JSON.stringify({
    sort_mode: sortMode,
    sort_descending: sortDescending,
    assignment_descending: assignmentDescending,
    photos: photos.map((photo) => buildDraftPhotoMeta(photo))
});

const draftFileKey = (batchId: string, photoId: string) => `${batchId}:${photoId}`;

const requestToPromise = <T,>(request: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });

const transactionDone = (transaction: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
    });

const openDraftDb = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB unavailable.'));
            return;
        }

        const request = indexedDB.open(PHOTO_TOOL_DRAFT_DB, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(PHOTO_TOOL_DRAFT_STORE)) {
                database.createObjectStore(PHOTO_TOOL_DRAFT_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    });

const deleteDraftFilesForBatch = async (batchId: string, keepKeys?: Set<string>) => {
    const database = await openDraftDb();

    try {
        const transaction = database.transaction(PHOTO_TOOL_DRAFT_STORE, 'readwrite');
        const store = transaction.objectStore(PHOTO_TOOL_DRAFT_STORE);
        await new Promise<void>((resolve, reject) => {
            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve();
                    return;
                }

                const key = String(cursor.key);
                const shouldKeep = keepKeys?.has(key) ?? false;
                if (key.startsWith(`${batchId}:`) && !shouldKeep) {
                    cursor.delete();
                }
                cursor.continue();
            };
            request.onerror = () => reject(request.error || new Error('Failed to iterate draft files.'));
        });
        await transactionDone(transaction);
    } finally {
        database.close();
    }
};

const persistDraftStorage = async (batchId: string, draft: PhotoToolDraft, photos: WorkingPhoto[]) => {
    localStorage.setItem(draftKeyFor(batchId), JSON.stringify(draft));

    const localPhotos = photos.filter((photo): photo is LocalPhoto => photo.source === 'local');
    const keepKeys = new Set(localPhotos.map((photo) => draftFileKey(batchId, photo.id)));
    const database = await openDraftDb();

    try {
        const transaction = database.transaction(PHOTO_TOOL_DRAFT_STORE, 'readwrite');
        const store = transaction.objectStore(PHOTO_TOOL_DRAFT_STORE);
        localPhotos.forEach((photo) => {
            store.put(photo.file, draftFileKey(batchId, photo.id));
        });
        await transactionDone(transaction);
    } finally {
        database.close();
    }

    await deleteDraftFilesForBatch(batchId, keepKeys);
};

const clearDraftStorage = async (batchId: string) => {
    localStorage.removeItem(draftKeyFor(batchId));

    try {
        await deleteDraftFilesForBatch(batchId);
    } catch {
        // Ignore draft cleanup failures; they should not block the tool.
    }
};

const readDraftMetadata = (batchId: string): PhotoToolDraft | null => {
    const raw = localStorage.getItem(draftKeyFor(batchId));
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as PhotoToolDraft;
        if (parsed?.version !== PHOTO_TOOL_DRAFT_VERSION || parsed.batch_id !== batchId || !Array.isArray(parsed.photos)) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
};

const restoreDraftState = async (batchId: string, payload: PhotoToolPayload): Promise<RestoredDraftState | null> => {
    const draft = readDraftMetadata(batchId);
    if (!draft) {
        return null;
    }

    if (draft.base_photo_state_token !== payload.batch.photo_state_token) {
        await clearDraftStorage(batchId);
        return {
            photos: payload.items.filter((item) => Boolean(item.item_photo_url)).map((item) => buildPersistedPhoto(item)),
            activePhotoId: '',
            sortMode: 'name',
            sortDescending: false,
            assignmentDescending: false,
            warningMessage: 'Старый черновик удален: данные партии уже изменились.'
        };
    }

    let missingLocalFiles = 0;
    const database = await openDraftDb().catch(() => null);

    try {
        const restoredPhotos: WorkingPhoto[] = [];
        for (const meta of draft.photos) {
            if (meta.source === 'persisted') {
                if (!meta.existing_url) {
                    continue;
                }

                restoredPhotos.push(createPersistedPhotoFromDraft(meta));
                continue;
            }

            if (!database) {
                missingLocalFiles += 1;
                continue;
            }

            const file = await requestToPromise(database.transaction(PHOTO_TOOL_DRAFT_STORE, 'readonly').objectStore(PHOTO_TOOL_DRAFT_STORE).get(draftFileKey(batchId, meta.id))).catch(() => null);
            if (!(file instanceof Blob)) {
                missingLocalFiles += 1;
                continue;
            }

            const restoredFile = file instanceof File
                ? file
                : new File([file], meta.name, {
                    type: file.type || 'image/jpeg',
                    lastModified: meta.last_modified ?? Date.now()
                });
            restoredPhotos.push(createLocalPhotoFromDraft(meta.id, restoredFile, meta.assigned_item_seq));
        }

        return {
            photos: restoredPhotos,
            activePhotoId: draft.active_photo_id || restoredPhotos[0]?.id || '',
            sortMode: draft.sort_mode,
            sortDescending: draft.sort_descending,
            assignmentDescending: draft.assignment_descending,
            warningMessage: missingLocalFiles > 0
                ? 'Черновик восстановлен частично: часть локальных файлов недоступна.'
                : 'Восстановлен несохраненный черновик photo-tool.'
        };
    } finally {
        database?.close();
    }
};

export function PhotoTool() {
    const { batchId = '' } = useParams();
    const [data, setData] = useState<PhotoToolPayload | null>(null);
    const [photos, setPhotos] = useState<WorkingPhoto[]>([]);
    const [activePhotoId, setActivePhotoId] = useState('');
    const [carouselDirection, setCarouselDirection] = useState(0);
    const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft | null>(null);
    const [sortMode, setSortMode] = useState<SortMode>('name');
    const [sortDescending, setSortDescending] = useState(false);
    const [assignmentDescending, setAssignmentDescending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [sidebarControlsOpen, setSidebarControlsOpen] = useState(true);
    const [importProgress, setImportProgress] = useState<PhotoImportProgress | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const photosRef = useRef<WorkingPhoto[]>([]);
    const baselineSignatureRef = useRef('');

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
                const restoredDraft = await restoreDraftState(batchId, typedPayload).catch(() => null);
                const nextPhotos = restoredDraft?.photos.length
                    ? restoredDraft.photos
                    : typedPayload.items
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
                baselineSignatureRef.current = buildBaselineSignature(typedPayload);
                setData(typedPayload);
                setPhotos(nextPhotos);
                setCarouselDirection(0);
                setAssignmentDraft(null);
                setActivePhotoId(restoredDraft?.activePhotoId || nextPhotos[0]?.id || '');
                setSortMode(restoredDraft?.sortMode || 'name');
                setSortDescending(restoredDraft?.sortDescending || false);
                setAssignmentDescending(restoredDraft?.assignmentDescending || false);
                if (restoredDraft?.warningMessage) {
                    setSuccessMessage(restoredDraft.warningMessage);
                }
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
    const hasUnsavedChanges = Boolean(data) && buildCurrentSignature(photos, sortMode, sortDescending, assignmentDescending) !== baselineSignatureRef.current;
    const activeIndex = photos.findIndex((photo) => photo.id === activePhotoId);
    const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0;
    const prevPhoto = resolvedActiveIndex > 0 ? photos[resolvedActiveIndex - 1] : null;
    const activePhoto = photos[resolvedActiveIndex] ?? null;
    const nextPhoto = resolvedActiveIndex < photos.length - 1 ? photos[resolvedActiveIndex + 1] : null;
    const isImportingPhotos = importProgress !== null;

    const clearAssignmentDraft = (photoId?: string) => {
        setAssignmentDraft((current) => {
            if (!current) {
                return current;
            }

            if (photoId && current.photoId !== photoId) {
                return current;
            }

            return null;
        });
    };

    const getDisplayedAssignmentValue = (photo: WorkingPhoto) => (
        assignmentDraft?.photoId === photo.id
            ? assignmentDraft.value
            : padItemSeq(photo.assigned_item_seq)
    );

    const buildPhotosWithPendingDraft = (sourcePhotos: WorkingPhoto[]) => {
        if (!assignmentDraft) {
            return sourcePhotos;
        }

        return applyAssignmentToPhotoList(sourcePhotos, itemSeqs, assignmentDraft.photoId, assignmentDraft.value);
    };

    const commitAssignmentChange = (photoId: string, nextValue: string, preferredActiveId: string | null = photoId) => {
        const nextPhotos = applyAssignmentToPhotoList(photos, itemSeqs, photoId, nextValue);
        clearAssignmentDraft(photoId);
        applyNextPhotos(nextPhotos, preferredActiveId);
        setError('');
        setSuccessMessage('');
    };

    const activatePhoto = (nextPhotoId: string, direction = 0) => {
        if (assignmentDraft?.photoId === activePhotoId && activePhotoId && activePhotoId !== nextPhotoId) {
            const nextPhotos = applyAssignmentToPhotoList(photos, itemSeqs, activePhotoId, assignmentDraft.value);
            clearAssignmentDraft(activePhotoId);
            setPhotos(nextPhotos);
            setError('');
            setSuccessMessage('');
        }

        setCarouselDirection(direction);
        setActivePhotoId(nextPhotoId);
    };

    const applyNextPhotos = (nextPhotos: WorkingPhoto[], preferredActiveId?: string | null) => {
        setPhotos(nextPhotos);

        if (nextPhotos.length === 0) {
            setCarouselDirection(0);
            setActivePhotoId('');
            return;
        }

        const activeId = preferredActiveId && nextPhotos.some((photo) => photo.id === preferredActiveId)
            ? preferredActiveId
            : nextPhotos.some((photo) => photo.id === activePhotoId)
            ? activePhotoId
            : nextPhotos[0].id;

        activatePhoto(activeId, 0);
    };

    const applyFullReassignment = (
        nextSortMode: SortMode,
        nextSortDescending: boolean,
        nextAssignmentDescending: boolean
    ) => {
        const reordered = orderPhotos(buildPhotosWithPendingDraft(photos), nextSortMode, nextSortDescending);
        const reassigned = assignAllPhotos(reordered, itemSeqs, nextAssignmentDescending);
        clearAssignmentDraft();
        applyNextPhotos(reassigned, activePhotoId);
        setSortMode(nextSortMode);
        setSortDescending(nextSortDescending);
        setAssignmentDescending(nextAssignmentDescending);
        setSuccessMessage('');
    };

    const handleAddFiles = async (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) {
            return;
        }

        if (importProgress) {
            return;
        }

        setError('');
        setSuccessMessage('');

        const sourceFiles = Array.from(fileList);
        setImportProgress({
            stage: 'checking',
            currentFileName: '',
            current: 0,
            total: sourceFiles.length
        });

        const rejectedRawFiles: string[] = [];
        const rejectedFiles: string[] = [];
        const failedHeicFiles: string[] = [];
        const acceptedFiles = sourceFiles.filter((file) => {
            const extension = getFileExtension(file.name);
            if (PHOTO_TOOL_RAW_EXTENSIONS.has(extension)) {
                rejectedRawFiles.push(file.name);
                return false;
            }

            if (!PHOTO_TOOL_ALLOWED_EXTENSIONS.has(extension)) {
                rejectedFiles.push(file.name);
                return false;
            }

            return true;
        });

        if (acceptedFiles.length === 0) {
            setError(rejectedRawFiles.length > 0
                ? 'DNG/RAW пока не поддерживается для паспорта. Экспортируйте фото в HEIC/JPEG/PNG.'
                : `Поддерживаются только фото: ${PHOTO_TOOL_ALLOWED_FORMAT_LABEL}.`
            );
            setImportProgress(null);
            return;
        }

        const preparedFiles: File[] = [];

        for (const [index, file] of acceptedFiles.entries()) {
            if (!isHeicLikePhoto(file)) {
                preparedFiles.push(file);
                continue;
            }

            setImportProgress({
                stage: 'converting',
                currentFileName: file.name,
                current: index + 1,
                total: acceptedFiles.length
            });

            try {
                preparedFiles.push(await convertHeicToJpegFile(file));
            } catch (conversionError) {
                console.error(conversionError);
                failedHeicFiles.push(file.name);
            }
        }

        if (preparedFiles.length === 0) {
            setImportProgress(null);
            setError(failedHeicFiles.length > 0
                ? 'Не удалось конвертировать HEIC. Экспортируйте файл в JPEG/PNG.'
                : `Поддерживаются только фото: ${PHOTO_TOOL_ALLOWED_FORMAT_LABEL}.`
            );
            return;
        }

        setImportProgress({
            stage: 'adding',
            currentFileName: '',
            current: preparedFiles.length,
            total: preparedFiles.length
        });

        const statusMessages: string[] = [];
        if (rejectedRawFiles.length > 0) {
            statusMessages.push('DNG/RAW пропущены: экспортируйте их в HEIC/JPEG/PNG.');
        } else if (rejectedFiles.length > 0) {
            statusMessages.push(`Неподдерживаемые файлы пропущены. Форматы: ${PHOTO_TOOL_ALLOWED_FORMAT_LABEL}.`);
        }
        if (failedHeicFiles.length > 0) {
            statusMessages.push(`Не удалось конвертировать HEIC: ${failedHeicFiles.join(', ')}. Экспортируйте файл в JPEG/PNG.`);
        }

        const localPhotos = preparedFiles.map((file) => createLocalPhoto(file));
        const reordered = orderPhotos([...buildPhotosWithPendingDraft(photos), ...localPhotos], sortMode, sortDescending);
        const nextPhotos = fillMissingAssignments(reordered, itemSeqs, assignmentDescending);
        clearAssignmentDraft();
        applyNextPhotos(nextPhotos, localPhotos[0]?.id || activePhotoId);
        setImportProgress(null);

        if (statusMessages.length > 0) {
            setError(`Добавлено фото: ${preparedFiles.length}. ${statusMessages.join(' ')}`);
        } else {
            setSuccessMessage(`Добавлено фото: ${preparedFiles.length}.`);
        }
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
        clearAssignmentDraft(photoId);
        applyNextPhotos(nextPhotos, fallbackActiveId);
        setError('');
        setSuccessMessage('');
    };

    const handleAssignmentInputChange = (photoId: string, nextValue: string) => {
        const normalized = normalizeAssignmentInput(nextValue);
        const photo = photos.find((item) => item.id === photoId);
        const committedValue = padItemSeq(photo?.assigned_item_seq ?? null);

        if (normalized === committedValue) {
            clearAssignmentDraft(photoId);
        } else {
            setAssignmentDraft({ photoId, value: normalized });
        }

        setError('');
        setSuccessMessage('');
    };

    const handleAssignmentCommit = (photoId: string) => {
        const nextValue = assignmentDraft?.photoId === photoId
            ? assignmentDraft.value
            : padItemSeq(photos.find((photo) => photo.id === photoId)?.assigned_item_seq ?? null);

        commitAssignmentChange(photoId, nextValue, photoId);
    };

    const handleAssignmentDelete = (photoId: string) => {
        commitAssignmentChange(photoId, '', photoId);
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
            formData.append('base_photo_state_token', data.batch.photo_state_token);

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

            baselineSignatureRef.current = buildCurrentSignature(nextPhotos, sortMode, sortDescending, assignmentDescending);
            setData(typedPayload);
            applyNextPhotos(nextPhotos, preferredActiveId);
            await clearDraftStorage(batchId);
            setSuccessMessage('Назначения фото сохранены.');
        } catch (saveError) {
            console.error(saveError);
            setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить назначения photo-tool.');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (!data) {
            return;
        }

        if (!hasUnsavedChanges) {
            void clearDraftStorage(batchId);
            return;
        }

        const draft: PhotoToolDraft = {
            version: PHOTO_TOOL_DRAFT_VERSION,
            batch_id: batchId,
            base_photo_state_token: data.batch.photo_state_token,
            sort_mode: sortMode,
            sort_descending: sortDescending,
            assignment_descending: assignmentDescending,
            active_photo_id: activePhotoId || null,
            photos: photos.map((photo) => buildDraftPhotoMeta(photo))
        };

        const timeoutId = window.setTimeout(() => {
            void persistDraftStorage(batchId, draft, photos).catch(() => undefined);
        }, 250);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [activePhotoId, assignmentDescending, batchId, data, hasUnsavedChanges, photos, sortDescending, sortMode]);

    useEffect(() => {
        if (!hasUnsavedChanges) {
            return;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [hasUnsavedChanges]);

    const handleHotkey = useEffectEvent((event: KeyboardEvent) => {
        const isEditableTarget = (target: EventTarget | null) => (
            target instanceof HTMLElement
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
        );
        const isAssignmentInputTarget = (target: EventTarget | null) => (
            target instanceof HTMLElement && target.dataset.photoAssignmentInput === 'true'
        );

        if (!activePhoto || event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }

        const editableTarget = isEditableTarget(event.target);
        const assignmentInputTarget = isAssignmentInputTarget(event.target);
        if (editableTarget && !assignmentInputTarget) {
            return;
        }

        if (event.key === 'ArrowLeft' && prevPhoto) {
            event.preventDefault();
            activatePhoto(prevPhoto.id, -1);
            return;
        }

        if (event.key === 'ArrowRight' && nextPhoto) {
            event.preventDefault();
            activatePhoto(nextPhoto.id, 1);
            return;
        }

        if (event.key === 'Enter' && assignmentDraft?.photoId === activePhoto.id) {
            event.preventDefault();
            handleAssignmentCommit(activePhoto.id);
            return;
        }

        if (event.key === 'Delete') {
            event.preventDefault();
            handleAssignmentDelete(activePhoto.id);
            return;
        }

        if (/^\d$/.test(event.key) && !assignmentInputTarget) {
            event.preventDefault();
            const currentValue = assignmentDraft?.photoId === activePhoto.id ? assignmentDraft.value : '';
            handleAssignmentInputChange(activePhoto.id, `${currentValue}${event.key}`);
            return;
        }

        if (event.key === 'Backspace' && !assignmentInputTarget && assignmentDraft?.photoId === activePhoto.id && assignmentDraft.value) {
            event.preventDefault();
            handleAssignmentInputChange(activePhoto.id, assignmentDraft.value.slice(0, -1));
        }
    });

    useEffect(() => {
        window.addEventListener('keydown', handleHotkey);
        return () => {
            window.removeEventListener('keydown', handleHotkey);
        };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0b0c0f] text-white">
                <div className="flex min-h-screen items-center justify-center px-6">
                    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-5 py-4 text-sm text-white/75 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
                        <LoaderCircle className="animate-spin" size={18} />
                        Загружаем photo-tool...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <MotionConfig transition={{ type: 'spring', stiffness: 230, damping: 28, mass: 0.9 }}>
            <div className="h-screen overflow-hidden bg-[#0b0c0f] text-[#ecebe6]">
                <div className="flex h-full min-h-0 flex-col">
                    <header className="border-b border-white/5 bg-[#111318]/94 backdrop-blur">
                        <div className="flex flex-wrap items-center gap-3 px-5 py-3 xl:px-8">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-white/35">
                                    <Link to="/admin/acceptance" className="inline-flex items-center gap-2 text-white/45 transition hover:text-white">
                                        <ArrowLeft size={13} />
                                        Приемка
                                    </Link>
                                    <span className="text-white/20">/</span>
                                    <span>Photo Tool</span>
                                    {hasUnsavedChanges && <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[9px] tracking-[0.26em] text-amber-100">Draft</span>}
                                </div>
                                <h1 data-testid="photo-tool-heading" className="sr-only">Назначение фотографий в паспорта товаров</h1>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <StatusPill label="Назначено" value={`${Math.min(itemSeqs.length, assignedCount)}/${itemSeqs.length}`} tone={canSave ? 'success' : 'default'} />
                                <StatusPill label="Без номера" value={String(unassignedCount)} tone={unassignedCount > 0 ? 'warning' : 'default'} />
                                <StatusPill label="Лишние" value={String(extraPhotoCount)} tone="default" />
                            </div>

                            <button
                                type="button"
                                data-testid="photo-save"
                                onClick={() => void handleSave()}
                                disabled={!canSave || saving || isImportingPhotos}
                                className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition ${canSave && !saving && !isImportingPhotos
                                    ? 'border-sky-300/40 bg-sky-400 text-[#061018] shadow-[0_16px_44px_rgba(56,189,248,0.24)] hover:bg-sky-300'
                                    : 'border-white/10 bg-white/[0.06] text-white/42'
                                    }`}
                            >
                                {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                                {saving ? 'Сохраняем' : 'Сохранить'}
                            </button>
                        </div>
                    </header>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
                        <aside className="flex min-h-0 flex-col border-r border-white/5 bg-[#14171b]">
                            <div className="border-b border-white/5 px-4 py-3">
                                <input
                                    ref={fileInputRef}
                                    data-testid="photo-upload-input"
                                    type="file"
                                    multiple
                                    accept={PHOTO_TOOL_ACCEPT}
                                    className="hidden"
                                    onChange={(event) => {
                                        const input = event.currentTarget;
                                        void handleAddFiles(input.files).finally(() => {
                                            input.value = '';
                                        });
                                    }}
                                />
                                <Button
                                    variant="secondary"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isImportingPhotos}
                                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-white hover:bg-white/[0.1]"
                                >
                                    {isImportingPhotos ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                                    {isImportingPhotos ? 'Обработка...' : 'Добавить фото'}
                                </Button>

                                {importProgress && (
                                    <PhotoImportPanel progress={importProgress} />
                                )}

                                {sidebarControlsOpen && (
                                    <>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <WorkspaceToggle
                                                data-testid="photo-sort-name"
                                                active={sortMode === 'name'}
                                                title="Имя"
                                                description="Числовая сортировка"
                                                onClick={() => applyFullReassignment('name', sortDescending, assignmentDescending)}
                                            />
                                            <WorkspaceToggle
                                                data-testid="photo-sort-date"
                                                active={sortMode === 'date'}
                                                title="Дата"
                                                description="Файловое время"
                                                onClick={() => applyFullReassignment('date', sortDescending, assignmentDescending)}
                                            />
                                            <WorkspaceToggle
                                                data-testid="photo-reverse-list"
                                                active={sortDescending}
                                                title="Список"
                                                description={sortDescending ? 'Обратный' : 'Прямой'}
                                                onClick={() => applyFullReassignment(sortMode, !sortDescending, assignmentDescending)}
                                            />
                                            <WorkspaceToggle
                                                data-testid="photo-reverse-assignment"
                                                active={assignmentDescending}
                                                title="Назначение"
                                                description={assignmentDescending ? 'От конца' : 'От начала'}
                                                onClick={() => applyFullReassignment(sortMode, sortDescending, !assignmentDescending)}
                                            />
                                        </div>

                                        <div data-testid="photo-coverage" className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-white/32">
                                            <span>Покрытие {Math.min(itemSeqs.length, assignedCount)}/{itemSeqs.length}</span>
                                            <span>{photos.length} фото</span>
                                        </div>
                                    </>
                                )}

                                {!sidebarControlsOpen && (
                                    <div data-testid="photo-coverage" className="mt-3 flex items-center justify-between rounded-2xl bg-[#101216] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-white/32">
                                        <span>{Math.min(itemSeqs.length, assignedCount)}/{itemSeqs.length}</span>
                                        <span>{photos.length} фото</span>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setSidebarControlsOpen((current) => !current)}
                                    className="mt-3 flex h-8 w-full items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-white/45 transition hover:bg-white/[0.07] hover:text-white"
                                    aria-label={sidebarControlsOpen ? 'Свернуть настройки фото' : 'Развернуть настройки фото'}
                                >
                                    {sidebarControlsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                                {photos.length === 0 ? (
                                    <div className="flex h-full min-h-60 flex-col items-center justify-center rounded-[24px] bg-[#101216] px-6 text-center text-white/45">
                                        <FileImage size={30} className="mb-3 text-white/20" />
                                        <p className="text-sm font-medium text-white/65">Лента пока пустая</p>
                                        <p className="mt-2 text-sm text-white/38">
                                            Загрузите комплект изображений. Filmstrip слева работает как рабочий список кадров.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {photos.map((photo, index) => (
                                            <div
                                                key={photo.id}
                                                className={`group rounded-[20px] px-2 py-2 transition ${photo.id === activePhotoId
                                                    ? 'bg-[#1a2028] shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]'
                                                    : 'bg-transparent hover:bg-white/[0.03]'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        type="button"
                                                        data-testid={`photo-list-item-${index}`}
                                                        onClick={() => activatePhoto(
                                                            photo.id,
                                                            index > resolvedActiveIndex ? 1 : index < resolvedActiveIndex ? -1 : 0
                                                        )}
                                                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                                    >
                                                        <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-black/50 shadow-[0_10px_22px_rgba(0,0,0,0.28)]">
                                                            <PhotoPreview photo={photo} className="h-full w-full object-cover" compact />
                                                            {photo.assigned_item_seq == null && (
                                                                <div data-testid={`photo-unassigned-overlay-${index}`} className="absolute inset-0 bg-red-500/35" />
                                                            )}
                                                            <div className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
                                                                {String(index + 1).padStart(2, '0')}
                                                            </div>
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm font-medium text-white/90">{photo.name}</p>
                                                            <p data-testid={`photo-list-status-${index}`} className="mt-1 text-xs text-white/48">
                                                                {photo.assigned_item_seq == null
                                                                    ? 'Без назначения'
                                                                    : `Позиция ${padItemSeq(photo.assigned_item_seq)}`}
                                                            </p>
                                                            <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-white/24">
                                                                {photo.source === 'local' ? 'Local' : 'Saved'}
                                                            </p>
                                                        </div>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleRemovePhoto(photo.id);
                                                        }}
                                                        className="rounded-xl p-2 text-white/25 transition hover:bg-red-500/10 hover:text-red-200"
                                                        aria-label={`Удалить ${photo.name}`}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </aside>

                        <main className="flex min-h-0 flex-col overflow-y-auto bg-[#0e1014]">
                            {(error || successMessage) && (
                                <div className={`px-4 py-2 text-sm xl:px-8 ${error ? 'bg-red-500/10 text-red-100' : 'bg-emerald-500/10 text-emerald-100'}`}>
                                    {error || successMessage}
                                </div>
                            )}

                            <div className="min-h-0 flex-1 px-4 py-4 xl:px-8 xl:py-6">
                                <div className="grid grid-rows-[auto_auto] gap-4">
                                    <section className="relative h-[560px] max-h-[calc(100svh-260px)] min-h-[460px] overflow-hidden rounded-[30px] bg-[#090b0f] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04),0_30px_90px_rgba(0,0,0,0.35)]">
                                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.07),_transparent_52%),linear-gradient(180deg,_rgba(255,255,255,0.04),_transparent_22%,_transparent_78%,_rgba(255,255,255,0.03))]" />
                                        <div className="relative flex h-full items-center justify-center px-5 py-6 xl:px-8 xl:py-8">
                                            <div className="grid h-full w-full grid-cols-1 items-center gap-5 lg:grid-cols-[minmax(150px,0.78fr)_minmax(360px,1.85fr)_minmax(150px,0.78fr)] xl:gap-8">
                                                <CarouselStageCard
                                                    title="Предыдущая"
                                                    photo={prevPhoto}
                                                    slot="prev"
                                                    active={false}
                                                    direction={-1}
                                                    navigationDirection={carouselDirection}
                                                    assignmentValue={prevPhoto ? getDisplayedAssignmentValue(prevPhoto) : ''}
                                                    onActivate={(photo) => activatePhoto(photo.id, -1)}
                                                    onAssignmentChange={handleAssignmentInputChange}
                                                />
                                                <CarouselStageCard
                                                    title="Активная"
                                                    photo={activePhoto}
                                                    slot="center"
                                                    active
                                                    direction={0}
                                                    navigationDirection={carouselDirection}
                                                    assignmentValue={activePhoto ? getDisplayedAssignmentValue(activePhoto) : ''}
                                                    onActivate={(photo) => activatePhoto(photo.id, 0)}
                                                    onAssignmentChange={handleAssignmentInputChange}
                                                />
                                                <CarouselStageCard
                                                    title="Следующая"
                                                    photo={nextPhoto}
                                                    slot="next"
                                                    active={false}
                                                    direction={1}
                                                    navigationDirection={carouselDirection}
                                                    assignmentValue={nextPhoto ? getDisplayedAssignmentValue(nextPhoto) : ''}
                                                    onActivate={(photo) => activatePhoto(photo.id, 1)}
                                                    onAssignmentChange={handleAssignmentInputChange}
                                                />
                                            </div>
                                        </div>
                                    </section>

                                    <section className="grid gap-3 rounded-[24px] bg-[#12151a] px-5 py-4 text-sm text-white/58 xl:grid-cols-[minmax(0,1.5fr)_220px_220px_220px] xl:px-6">
                                        <WorkspaceStat
                                            label="Текущий файл"
                                            value={activePhoto?.name || 'Нет активной фотографии'}
                                            accent={activePhoto?.assigned_item_seq == null ? 'warning' : 'default'}
                                        />
                                        <WorkspaceStat
                                            label="Позиция"
                                            value={activePhoto?.assigned_item_seq == null ? 'Без номера' : padItemSeq(activePhoto.assigned_item_seq)}
                                            accent={activePhoto?.assigned_item_seq == null ? 'warning' : 'success'}
                                        />
                                        <WorkspaceStat
                                            label="Статус"
                                            value={hasUnsavedChanges ? 'Есть несохраненные изменения' : 'Все изменения сохранены'}
                                            accent={hasUnsavedChanges ? 'warning' : 'default'}
                                        />
                                        <WorkspaceStat
                                            label="Подсказка"
                                            value="Стрелки листают, цифры набирают номер, Enter применяет, Delete снимает привязку."
                                            accent="default"
                                        />
                                    </section>
                                </div>
                            </div>
                        </main>
                    </div>
                </div>
            </div>
        </MotionConfig>
    );
}

function StatusPill({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' }) {
    const toneClass = tone === 'success'
        ? 'bg-emerald-500/12 text-emerald-100'
        : tone === 'warning'
        ? 'bg-amber-500/12 text-amber-100'
        : 'bg-white/[0.06] text-white/78';

    return (
        <div className={`rounded-full px-3 py-2 ${toneClass}`}>
            <div className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-[0.28em] text-white/45">{label}</span>
                <span className="text-sm font-semibold">{value}</span>
            </div>
        </div>
    );
}

function PhotoImportPanel({ progress }: { progress: PhotoImportProgress }) {
    const stageLabel = {
        checking: 'Проверяем файлы',
        converting: 'Конвертируем HEIC в JPEG',
        adding: 'Добавляем фото'
    }[progress.stage];
    const total = Math.max(progress.total, 1);
    const current = Math.min(Math.max(progress.current, 0), total);
    const percent = Math.round((current / total) * 100);

    return (
        <div className="mt-3 rounded-2xl border border-sky-400/15 bg-sky-500/10 px-3 py-3 text-sky-50 shadow-[0_14px_34px_rgba(14,165,233,0.08)]">
            <div className="flex items-center gap-3">
                <LoaderCircle size={16} className="shrink-0 animate-spin text-sky-200" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{stageLabel}</p>
                    <p className="mt-1 truncate text-xs text-sky-100/58">
                        {progress.currentFileName || `${current}/${total} файлов`}
                    </p>
                </div>
                <span className="text-xs font-semibold text-sky-100/78">{current}/{total}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-950/80">
                <div
                    className="h-full rounded-full bg-sky-300 transition-[width]"
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}

function WorkspaceToggle({
    active,
    title,
    description,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    active: boolean;
    title: string;
    description: string;
}) {
    return (
        <button
            type="button"
            className={`rounded-2xl px-3 py-3 text-left transition ${active
                ? 'bg-[#1d2530] text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22)]'
                : 'bg-[#101216] text-white/58 hover:bg-[#171a1f] hover:text-white/82'
                }`}
            {...props}
        >
            <div className="text-xs font-medium uppercase tracking-[0.22em]">{title}</div>
            <div className="mt-1 text-xs text-white/38">{description}</div>
        </button>
    );
}

function PhotoPreview({ photo, className, compact = false }: { photo: WorkingPhoto; className: string; compact?: boolean }) {
    if (canPreviewPhotoInBrowser(photo)) {
        return <img src={photo.preview_url} alt={photo.name} className={className} />;
    }

    return (
        <div className={`${className} flex flex-col items-center justify-center bg-[#0d1117] text-center`}>
            <FileImage size={compact ? 18 : 34} className="text-white/25" />
            {!compact && (
                <>
                    <p className="mt-4 px-5 text-sm font-medium text-white/72">HEIC/HEIF</p>
                    <p className="mt-2 max-w-[260px] px-5 text-xs leading-5 text-white/42">
                        Превью появится после сохранения и конвертации в JPEG.
                    </p>
                </>
            )}
        </div>
    );
}

function CarouselStageCard({
    title,
    photo,
    slot,
    active,
    direction,
    navigationDirection,
    assignmentValue,
    onActivate,
    onAssignmentChange
}: {
    title: string;
    photo: WorkingPhoto | null;
    slot: 'prev' | 'center' | 'next';
    active: boolean;
    direction: -1 | 0 | 1;
    navigationDirection: number;
    assignmentValue: string;
    onActivate: (photo: WorkingPhoto) => void;
    onAssignmentChange: (photoId: string, nextValue: string) => void;
}) {
    const initialOffset = active
        ? navigationDirection * 140
        : direction * 60;

    if (!photo) {
        return (
            <div className={`flex h-full ${active ? '' : 'items-center'} justify-center`}>
                <div
                    data-testid={`photo-card-${slot}`}
                    className={`flex w-full flex-col items-center justify-center rounded-[28px] bg-white/[0.025] text-center text-sm text-white/30 ${active
                        ? 'h-full'
                        : 'h-[68%] max-w-[300px]'
                        }`}
                >
                    <p className="text-[10px] uppercase tracking-[0.34em] text-white/18">{title}</p>
                    <p className="mt-3">Нет фотографии</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex h-full ${active ? '' : 'items-center'} justify-center`}>
            <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                    key={`${slot}:${photo.id}`}
                    data-testid={`photo-card-${slot}`}
                    initial={{ opacity: 0, x: initialOffset, scale: active ? 0.96 : 0.9, filter: 'blur(10px)' }}
                    animate={{ opacity: active ? 1 : 0.76, x: 0, scale: active ? 1 : 0.92, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, x: -initialOffset || (direction * 90), scale: 0.9, filter: 'blur(10px)' }}
                    className={`relative w-full overflow-hidden rounded-[30px] ${active
                        ? 'h-full bg-[#141920] shadow-[0_30px_90px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(56,189,248,0.18)]'
                        : 'h-[68%] max-w-[300px] bg-[#161a20] shadow-[0_22px_60px_rgba(0,0,0,0.35)]'
                        }`}
                >
                    <button type="button" onClick={() => onActivate(photo)} className="absolute inset-0">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.06),transparent_62%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%,transparent_72%,rgba(255,255,255,0.03))]" />
                        <div className={`absolute inset-0 flex items-center justify-center px-4 py-4 ${active ? 'xl:px-6 xl:py-6' : ''}`}>
                            <PhotoPreview
                                photo={photo}
                                className={`max-h-full max-w-full object-contain ${active ? '' : 'opacity-90'}`}
                            />
                        </div>
                    </button>

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#090b0f] via-[#090b0f]/82 to-transparent" />

                    <div className="absolute inset-x-0 bottom-0 p-4 xl:p-5">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] uppercase tracking-[0.34em] text-white/28">{title}</p>
                            {photo.assigned_item_seq != null && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] text-emerald-100">
                                    <CheckCircle2 size={13} />
                                    {padItemSeq(photo.assigned_item_seq)}
                                </span>
                            )}
                        </div>

                        <p className="mt-3 truncate text-sm font-medium text-white/92">{photo.name}</p>

                        <label className="mt-4 block">
                            <span className="text-[10px] uppercase tracking-[0.28em] text-white/30">Номер товара</span>
                            <input
                                data-testid={`photo-assignment-input-${slot}`}
                                data-photo-assignment-input="true"
                                value={assignmentValue}
                                inputMode="numeric"
                                maxLength={3}
                                onFocus={() => onActivate(photo)}
                                onChange={(event) => onAssignmentChange(photo.id, event.target.value)}
                                className={`mt-2 w-full rounded-2xl px-4 py-3 text-base font-semibold text-white outline-none transition ${photo.assigned_item_seq == null
                                    ? 'bg-red-500/10 placeholder:text-red-100/30 focus:bg-red-500/12'
                                    : 'bg-black/32 focus:bg-black/42'
                                    }`}
                                placeholder="Без номера"
                            />
                        </label>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

function WorkspaceStat({
    label,
    value,
    accent = 'default'
}: {
    label: string;
    value: string;
    accent?: 'default' | 'success' | 'warning';
}) {
    const accentClass = accent === 'success'
        ? 'text-emerald-100'
        : accent === 'warning'
        ? 'text-amber-100'
        : 'text-white/86';

    return (
        <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/28">{label}</p>
            <p className={`mt-2 truncate text-sm ${accentClass}`}>{value}</p>
        </div>
    );
}
