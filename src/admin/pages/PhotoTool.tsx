import type { ButtonHTMLAttributes } from 'react';
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
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
import { DesktopStatusCenter } from '../components/DesktopStatusCenter';
import { authFetch } from '../../utils/authFetch';
import {
    getStonesDesktop,
    isStonesDesktop,
    stageDesktopFile,
    type StonesMediaWorkflow,
    type StonesMediaWorkflowSnapshot
} from '../../utils/desktop';

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
type PhotoToolStep = 'quality' | 'assign' | 'export';

type PersistedPhoto = {
    id: string;
    source: 'persisted';
    name: string;
    preview_url: string;
    thumbnail_url: string;
    assigned_item_seq: number | null;
    existing_url: string;
    last_modified: number | null;
};

type LocalPhoto = {
    id: string;
    source: 'local';
    name: string;
    preview_url: string;
    thumbnail_url: string;
    assigned_item_seq: number | null;
    existing_url: null;
    last_modified: number | null;
    file: File;
    object_url: string;
    thumbnail_object_url: string | null;
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

type PhotoExportSettings = {
    format: 'jpeg';
    quality: number;
    maxWidth: number;
    maxHeight: number;
};

type PhotoToolDraft = {
    version: 2;
    batch_id: string;
    base_photo_state_token: string;
    photo_export_settings: PhotoExportSettings;
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
    photoExportSettings: PhotoExportSettings;
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

type PhotoSizeEstimate = {
    status: 'idle' | 'estimating' | 'ready' | 'unavailable';
    bytesPerPhoto: number | null;
    batchBytes: number | null;
    message: string;
};

const PHOTO_TOOL_DRAFT_VERSION = 2;
const PHOTO_TOOL_DRAFT_DB = 'stones-photo-tool-drafts';
const PHOTO_TOOL_DRAFT_STORE = 'photo-files';
const PHOTO_TOOL_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.avif,.tif,.tiff,.bmp,.heic,.heif';
const PHOTO_TOOL_ALLOWED_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'tif', 'tiff', 'webp']);
const PHOTO_TOOL_RAW_EXTENSIONS = new Set(['arw', 'cr2', 'cr3', 'dng', 'nef', 'orf', 'raf', 'rw2']);
const PHOTO_TOOL_PREVIEW_UNRELIABLE_EXTENSIONS = new Set(['heic', 'heif']);
const PHOTO_TOOL_ALLOWED_FORMAT_LABEL = 'JPEG, PNG, WebP, GIF, AVIF, TIFF, BMP, HEIC/HEIF';
const PHOTO_TOOL_THUMBNAIL_MAX_SIZE = 160;
const DEFAULT_PHOTO_EXPORT_SETTINGS: PhotoExportSettings = {
    format: 'jpeg',
    quality: 80,
    maxWidth: 1200,
    maxHeight: 1200
};
const PHOTO_EXPORT_PRESETS: Array<{ id: string; title: string; description: string; settings: PhotoExportSettings }> = [
    {
        id: 'light',
        title: 'Легкий',
        description: '1200px / q80',
        settings: { format: 'jpeg', quality: 80, maxWidth: 1200, maxHeight: 1200 }
    },
    {
        id: 'standard',
        title: 'Стандарт',
        description: '1600px / q88',
        settings: { format: 'jpeg', quality: 88, maxWidth: 1600, maxHeight: 1600 }
    },
    {
        id: 'max',
        title: 'Максимум',
        description: '2048px / q92',
        settings: { format: 'jpeg', quality: 92, maxWidth: 2048, maxHeight: 2048 }
    }
];
const emptyWorkflowSnapshot: StonesMediaWorkflowSnapshot = { workflows: [], counts: {} };
const terminalWorkflowPhases = new Set(['completed', 'cancelled', 'failed', 'stale']);

const workflowPhaseLabel: Record<string, string> = {
    queued: 'В очереди',
    converting: 'Конвертация',
    uploading: 'Загрузка',
    verifying: 'Проверка',
    paused_offline: 'Пауза: нет связи с сервером',
    auth_required: 'Нужен повторный вход',
    stale: 'Конфликт данных',
    failed: 'Ошибка',
    completed: 'Готово',
    cancelled: 'Отменено'
};

const normalizeWorkflowError = (value: string | null | undefined) => {
    const message = String(value || '').trim();
    if (!message) return '';
    if (/fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|ENETUNREACH|network|offline/i.test(message)) {
        return 'Сервер недоступен. Workflow продолжит работу после восстановления связи.';
    }
    if (/401|403|auth|token|войти/i.test(message)) {
        return 'Нужно войти в HQ заново. После входа workflow продолжит работу.';
    }
    return message;
};

const isActiveWorkflow = (workflow: StonesMediaWorkflow | null | undefined) =>
    Boolean(workflow && !terminalWorkflowPhases.has(workflow.phase));

const buildWorkflowStatusText = (workflow: StonesMediaWorkflow | null | undefined) => {
    if (!workflow) return '';
    const phase = workflowPhaseLabel[workflow.phase] || workflow.phase;
    const total = Math.max(workflow.progress.total || 0, 0);
    const error = normalizeWorkflowError(workflow.lastError);
    return `${phase}: ${total} фото${error ? `. ${error}` : ''}`;
};

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

const isHeicLikeFile = (file: File) => PHOTO_TOOL_PREVIEW_UNRELIABLE_EXTENSIONS.has(getFileExtension(file.name));

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
};

const normalizePhotoExportSettings = (value: unknown): PhotoExportSettings => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...DEFAULT_PHOTO_EXPORT_SETTINGS };
    }

    const settings = value as Partial<PhotoExportSettings>;
    return {
        format: 'jpeg',
        quality: clampInteger(settings.quality, DEFAULT_PHOTO_EXPORT_SETTINGS.quality, 40, 95),
        maxWidth: clampInteger(settings.maxWidth, DEFAULT_PHOTO_EXPORT_SETTINGS.maxWidth, 800, 4096),
        maxHeight: clampInteger(settings.maxHeight, DEFAULT_PHOTO_EXPORT_SETTINGS.maxHeight, 800, 4096)
    };
};

const formatBytes = (value: number | null) => {
    if (!value || value <= 0) {
        return '—';
    }

    if (value < 1024 * 1024) {
        return `${Math.max(1, Math.round(value / 1024))} KB`;
    }

    return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const buildJpegFileName = (fileName: string) => {
    const dotIndex = fileName.lastIndexOf('.');
    const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName || 'photo';

    return `${baseName}.jpg`;
};

const estimateConvertedPhotoSize = async (photo: WorkingPhoto | null, settings: PhotoExportSettings) => {
    if (!photo || photo.source !== 'local' || !canPreviewPhotoInBrowser(photo) || typeof createImageBitmap === 'undefined') {
        return null;
    }

    let bitmap: ImageBitmap | null = null;
    try {
        bitmap = await createImageBitmap(photo.file);
        const scale = Math.min(1, settings.maxWidth / bitmap.width, settings.maxHeight / bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }

        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', settings.quality / 100);
        });
        return blob?.size ?? null;
    } catch {
        return null;
    } finally {
        bitmap?.close();
    }
};

const convertHeicFileToJpeg = async (file: File) => {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.92
    });
    const blob = Array.isArray(converted) ? converted[0] : converted;

    if (!(blob instanceof Blob)) {
        throw new Error('HEIC conversion returned an empty result.');
    }

    return new File([blob], buildJpegFileName(file.name), {
        type: 'image/jpeg',
        lastModified: Number.isFinite(file.lastModified) ? file.lastModified : Date.now()
    });
};

const createThumbnailObjectUrl = async (file: File) => {
    if (typeof createImageBitmap === 'undefined' || !file.type.startsWith('image/')) {
        return null;
    }

    let bitmap: ImageBitmap | null = null;

    try {
        bitmap = await createImageBitmap(file);
        const longestSide = Math.max(bitmap.width, bitmap.height);
        if (longestSide <= 0) {
            return null;
        }

        const scale = Math.min(1, PHOTO_TOOL_THUMBNAIL_MAX_SIZE / longestSide);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }

        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.72);
        });

        return blob ? URL.createObjectURL(blob) : null;
    } catch {
        return null;
    } finally {
        bitmap?.close();
    }
};

const revokeLocalPhotoUrls = (photo: LocalPhoto) => {
    URL.revokeObjectURL(photo.object_url);
    if (photo.thumbnail_object_url && photo.thumbnail_object_url !== photo.object_url) {
        URL.revokeObjectURL(photo.thumbnail_object_url);
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
    thumbnail_url: item.item_photo_url || '',
    assigned_item_seq: item.item_seq,
    existing_url: item.item_photo_url || '',
    last_modified: null
});

const createPersistedPhotoFromDraft = (meta: DraftPhotoMeta): PersistedPhoto => ({
    id: meta.id,
    source: 'persisted',
    name: meta.name,
    preview_url: meta.existing_url || '',
    thumbnail_url: meta.existing_url || '',
    assigned_item_seq: meta.assigned_item_seq,
    existing_url: meta.existing_url || '',
    last_modified: meta.last_modified
});

const createLocalPhoto = async (file: File): Promise<LocalPhoto> => {
    const objectUrl = URL.createObjectURL(file);
    const thumbnailObjectUrl = await createThumbnailObjectUrl(file);

    return {
        id: `local:${crypto.randomUUID()}`,
        source: 'local',
        name: file.name,
        preview_url: objectUrl,
        thumbnail_url: thumbnailObjectUrl || objectUrl,
        assigned_item_seq: null,
        existing_url: null,
        last_modified: Number.isFinite(file.lastModified) ? file.lastModified : null,
        file,
        object_url: objectUrl,
        thumbnail_object_url: thumbnailObjectUrl
    };
};

const createLocalPhotoFromDraft = async (id: string, file: File, assignedItemSeq: number | null): Promise<LocalPhoto> => {
    const objectUrl = URL.createObjectURL(file);
    const thumbnailObjectUrl = await createThumbnailObjectUrl(file);

    return {
        id,
        source: 'local',
        name: file.name,
        preview_url: objectUrl,
        thumbnail_url: thumbnailObjectUrl || objectUrl,
        assigned_item_seq: assignedItemSeq,
        existing_url: null,
        last_modified: Number.isFinite(file.lastModified) ? file.lastModified : null,
        file,
        object_url: objectUrl,
        thumbnail_object_url: thumbnailObjectUrl
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
    photo_export_settings: DEFAULT_PHOTO_EXPORT_SETTINGS,
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

const buildDraftFileSignature = (photos: WorkingPhoto[]) => photos
    .filter((photo): photo is LocalPhoto => photo.source === 'local')
    .map((photo) => `${photo.id}:${photo.file.name}:${photo.file.size}:${photo.file.lastModified}`)
    .join('|');

const buildCurrentSignature = (
    photos: WorkingPhoto[],
    sortMode: SortMode,
    sortDescending: boolean,
    assignmentDescending: boolean,
    photoExportSettings: PhotoExportSettings
) => JSON.stringify({
    photo_export_settings: photoExportSettings,
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

const persistDraftMetadata = (batchId: string, draft: PhotoToolDraft) => {
    localStorage.setItem(draftKeyFor(batchId), JSON.stringify(draft));
};

const syncDraftFilesForPhotos = async (batchId: string, photos: WorkingPhoto[]) => {
    const localPhotos = photos.filter((photo): photo is LocalPhoto => photo.source === 'local');
    const keepKeys = new Set(localPhotos.map((photo) => draftFileKey(batchId, photo.id)));
    const database = await openDraftDb();

    try {
        const transaction = database.transaction(PHOTO_TOOL_DRAFT_STORE, 'readwrite');
        const store = transaction.objectStore(PHOTO_TOOL_DRAFT_STORE);
        const existingKeys = new Set<string>();
        await new Promise<void>((resolve, reject) => {
            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    for (const photo of localPhotos) {
                        const key = draftFileKey(batchId, photo.id);
                        if (!existingKeys.has(key)) {
                            store.put(photo.file, key);
                        }
                    }
                    resolve();
                    return;
                }

                const key = String(cursor.key);
                if (key.startsWith(`${batchId}:`)) {
                    if (keepKeys.has(key)) {
                        existingKeys.add(key);
                    } else {
                        cursor.delete();
                    }
                }
                cursor.continue();
            };
            request.onerror = () => reject(request.error || new Error('Failed to sync draft files.'));
        });
        await transactionDone(transaction);
    } finally {
        database.close();
    }
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
            localStorage.removeItem(draftKeyFor(batchId));
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

    const hasTokenMismatch = draft.base_photo_state_token !== payload.batch.photo_state_token;

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
            restoredPhotos.push(await createLocalPhotoFromDraft(meta.id, restoredFile, meta.assigned_item_seq));
        }

        return {
            photos: restoredPhotos,
            activePhotoId: draft.active_photo_id || restoredPhotos[0]?.id || '',
            sortMode: draft.sort_mode,
            sortDescending: draft.sort_descending,
            assignmentDescending: draft.assignment_descending,
            photoExportSettings: normalizePhotoExportSettings(draft.photo_export_settings),
            warningMessage: hasTokenMismatch
                ? 'Восстановлен конфликтный черновик: данные партии уже изменились. Проверьте назначения перед повторным сохранением.'
                : missingLocalFiles > 0
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
    const [photoExportSettings, setPhotoExportSettings] = useState<PhotoExportSettings>(() => ({ ...DEFAULT_PHOTO_EXPORT_SETTINGS }));
    const [activeStep, setActiveStep] = useState<PhotoToolStep>('quality');
    const [sizeEstimate, setSizeEstimate] = useState<PhotoSizeEstimate>({
        status: 'idle',
        bytesPerPhoto: null,
        batchBytes: null,
        message: 'Загрузите локальное фото для оценки веса.'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [photoConflictError, setPhotoConflictError] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [sidebarControlsOpen, setSidebarControlsOpen] = useState(true);
    const [importProgress, setImportProgress] = useState<PhotoImportProgress | null>(null);
    const [workflowSnapshot, setWorkflowSnapshot] = useState<StonesMediaWorkflowSnapshot>(emptyWorkflowSnapshot);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const itemFileInputRef = useRef<HTMLInputElement | null>(null);
    const replacementItemSeqRef = useRef<number | null>(null);
    const photosRef = useRef<WorkingPhoto[]>([]);
    const activePhotoIdRef = useRef('');
    const assignmentDraftRef = useRef<AssignmentDraft | null>(null);
    const itemSeqsRef = useRef<number[]>([]);
    const baselineSignatureRef = useRef('');
    const draftFileSignatureRef = useRef('');
    const completedWorkflowHandledRef = useRef<string | null>(null);
    const workflowLockedRef = useRef(false);
    const saveInFlightRef = useRef(false);
    const isDesktopApp = isStonesDesktop();

    const batchPhotoWorkflow = useMemo(() => (
        workflowSnapshot.workflows.find((workflow) =>
            workflow.kind === 'PHOTO_APPLY_WORKFLOW' && workflow.batchId === batchId
        ) || null
    ), [batchId, workflowSnapshot.workflows]);
    const activePhotoWorkflow = isActiveWorkflow(batchPhotoWorkflow) ? batchPhotoWorkflow : null;
    const workflowLocked = Boolean(activePhotoWorkflow);
    const photoWorkflowStatusText = buildWorkflowStatusText(batchPhotoWorkflow);

    useEffect(() => {
        workflowLockedRef.current = workflowLocked;
    }, [workflowLocked]);

    const openDesktopStatusCenter = useCallback((focusWorkflowId?: string) => {
        window.dispatchEvent(new CustomEvent('stones:open-status-center', {
            detail: {
                tab: 'queue',
                ...(focusWorkflowId ? { focus: { type: 'workflow', id: focusWorkflowId } } : {})
            }
        }));
    }, []);

    const applyPhotoExportSettings = useCallback((nextSettings: Partial<PhotoExportSettings>, options?: { silent?: boolean }) => {
        if (workflowLockedRef.current && !options?.silent) {
            return;
        }

        setPhotoExportSettings((current) => normalizePhotoExportSettings({
            ...current,
            ...nextSettings
        }));
        if (!options?.silent) {
            setError('');
            setSuccessMessage('');
        }
    }, []);

    const openItemFilePicker = useCallback((itemSeq: number) => {
        if (workflowLockedRef.current) {
            return;
        }

        replacementItemSeqRef.current = itemSeq;
        itemFileInputRef.current?.click();
    }, []);

    useEffect(() => {
        photosRef.current = photos;
    }, [photos]);

    useEffect(() => {
        activePhotoIdRef.current = activePhotoId;
    }, [activePhotoId]);

    useEffect(() => {
        assignmentDraftRef.current = assignmentDraft;
    }, [assignmentDraft]);

    useEffect(() => () => {
        photosRef.current.forEach((photo) => {
            if (photo.source === 'local') {
                revokeLocalPhotoUrls(photo);
            }
        });
    }, []);

    const loadPhotoTool = useEffectEvent(async (options?: { restoreDraft?: boolean; showLoading?: boolean; successMessage?: string }) => {
        const restoreDraft = options?.restoreDraft ?? true;
        if (options?.showLoading ?? true) {
            setLoading(true);
        }
        setError('');
        setPhotoConflictError(false);
        if (!options?.successMessage) {
            setSuccessMessage('');
        }

        try {
            const response = await authFetch(`/api/batches/${batchId}/photo-tool`);
            const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить photo-tool.' }));
            if (!response.ok) {
                throw new Error(payload.error || 'Не удалось загрузить photo-tool.');
            }

            const typedPayload = payload as PhotoToolPayload;
            const restoredDraft = restoreDraft
                ? await restoreDraftState(batchId, typedPayload).catch(() => null)
                : null;
            const nextPhotos = restoredDraft?.photos.length
                ? restoredDraft.photos
                : typedPayload.items
                    .filter((item) => Boolean(item.item_photo_url))
                    .map((item) => buildPersistedPhoto(item));
            const nextSortMode = restoredDraft?.sortMode || 'name';
            const nextSortDescending = restoredDraft?.sortDescending || false;
            const nextAssignmentDescending = restoredDraft?.assignmentDescending || false;
            const nextPhotoExportSettings = restoredDraft?.photoExportSettings || { ...DEFAULT_PHOTO_EXPORT_SETTINGS };

            photosRef.current.forEach((photo) => {
                if (photo.source === 'local') {
                    revokeLocalPhotoUrls(photo);
                }
            });
            baselineSignatureRef.current = restoredDraft
                ? buildBaselineSignature(typedPayload)
                : buildCurrentSignature(
                    nextPhotos,
                    nextSortMode,
                    nextSortDescending,
                    nextAssignmentDescending,
                    nextPhotoExportSettings
                );
            draftFileSignatureRef.current = restoredDraft?.photos.length ? buildDraftFileSignature(nextPhotos) : '';
            setData(typedPayload);
            setPhotos(nextPhotos);
            setCarouselDirection(0);
            setAssignmentDraft(null);
            setActivePhotoId(restoredDraft?.activePhotoId || nextPhotos[0]?.id || '');
            setSortMode(nextSortMode);
            setSortDescending(nextSortDescending);
            setAssignmentDescending(nextAssignmentDescending);
            applyPhotoExportSettings(nextPhotoExportSettings, { silent: true });
            setActiveStep(restoredDraft ? 'assign' : 'quality');
            if (options?.successMessage || restoredDraft?.warningMessage) {
                setSuccessMessage(options?.successMessage || restoredDraft?.warningMessage || '');
            }
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить photo-tool.');
        } finally {
            setLoading(false);
        }
    });

    useEffect(() => {
        void loadPhotoTool({ restoreDraft: true, showLoading: true });
    }, [batchId]);

    useEffect(() => {
        if (!isDesktopApp) {
            return;
        }

        const desktop = getStonesDesktop();
        if (!desktop) {
            return;
        }

        let cancelled = false;
        void desktop.getMediaWorkflowSnapshot()
            .then((snapshot) => {
                if (!cancelled) {
                    setWorkflowSnapshot(snapshot);
                }
            })
            .catch(() => undefined);

        const unsubscribe = desktop.subscribeMediaWorkflows(setWorkflowSnapshot);
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [isDesktopApp]);

    useEffect(() => {
        if (!batchPhotoWorkflow || batchPhotoWorkflow.phase !== 'completed' || completedWorkflowHandledRef.current === batchPhotoWorkflow.id) {
            return;
        }

        completedWorkflowHandledRef.current = batchPhotoWorkflow.id;
        void clearDraftStorage(batchId)
            .catch(() => undefined)
            .finally(() => {
                void loadPhotoTool({
                    restoreDraft: false,
                    showLoading: false,
                    successMessage: 'Фоновое сохранение фото завершено, данные обновлены.'
                });
            });
    }, [batchId, batchPhotoWorkflow]);

    const itemSeqs = useMemo(() => data?.items.map((item) => item.item_seq) ?? [], [data]);
    useEffect(() => {
        itemSeqsRef.current = itemSeqs;
    }, [itemSeqs]);
    const photoMetrics = useMemo(() => {
        const coveredItemSeqs = new Set(photos.flatMap((photo) => photo.assigned_item_seq == null ? [] : [photo.assigned_item_seq]));
        const missingItemSeqs = itemSeqs.filter((itemSeq) => !coveredItemSeqs.has(itemSeq));
        const assignedCount = photos.filter((photo) => photo.assigned_item_seq != null).length;

        return {
            missingItemSeqs,
            assignedCount,
            unassignedCount: photos.length - assignedCount,
            extraPhotoCount: Math.max(0, photos.length - itemSeqs.length)
        };
    }, [itemSeqs, photos]);
    const { missingItemSeqs, assignedCount, unassignedCount, extraPhotoCount } = photoMetrics;
    const canSave = Boolean(data) && missingItemSeqs.length === 0 && itemSeqs.length > 0;
    const currentSignature = useMemo(
        () => buildCurrentSignature(photos, sortMode, sortDescending, assignmentDescending, photoExportSettings),
        [assignmentDescending, photoExportSettings, photos, sortDescending, sortMode]
    );
    const hasUnsavedChanges = Boolean(data) && currentSignature !== baselineSignatureRef.current;
    const activePhotoState = useMemo(() => {
        const activeIndex = photos.findIndex((photo) => photo.id === activePhotoId);
        const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0;

        return {
            resolvedActiveIndex,
            prevPhoto: resolvedActiveIndex > 0 ? photos[resolvedActiveIndex - 1] : null,
            activePhoto: photos[resolvedActiveIndex] ?? null,
            nextPhoto: resolvedActiveIndex < photos.length - 1 ? photos[resolvedActiveIndex + 1] : null
        };
    }, [activePhotoId, photos]);
    const { resolvedActiveIndex, prevPhoto, activePhoto, nextPhoto } = activePhotoState;
    const isImportingPhotos = importProgress !== null;

    useEffect(() => {
        let cancelled = false;
        setSizeEstimate({
            status: 'estimating',
            bytesPerPhoto: null,
            batchBytes: null,
            message: 'Считаем примерный вес...'
        });

        void estimateConvertedPhotoSize(activePhoto, photoExportSettings).then((bytesPerPhoto) => {
            if (cancelled) {
                return;
            }

            if (!bytesPerPhoto) {
                setSizeEstimate({
                    status: 'unavailable',
                    bytesPerPhoto: null,
                    batchBytes: null,
                    message: 'Точный расчет доступен для локального фото с превью.'
                });
                return;
            }

            setSizeEstimate({
                status: 'ready',
                bytesPerPhoto,
                batchBytes: bytesPerPhoto * Math.max(itemSeqs.length, 1),
                message: 'Оценка по активному локальному фото.'
            });
        });

        return () => {
            cancelled = true;
        };
    }, [activePhoto, itemSeqs.length, photoExportSettings]);

    const clearAssignmentDraft = (photoId?: string) => {
        setAssignmentDraft((current) => {
            if (!current) {
                return current;
            }

            if (photoId && current.photoId !== photoId) {
                return current;
            }

            assignmentDraftRef.current = null;
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
        if (workflowLockedRef.current) {
            return;
        }

        const nextPhotos = applyAssignmentToPhotoList(photos, itemSeqs, photoId, nextValue);
        clearAssignmentDraft(photoId);
        applyNextPhotos(nextPhotos, preferredActiveId);
        setError('');
        setSuccessMessage('');
    };

    const activatePhoto = useCallback((nextPhotoId: string, direction = 0) => {
        const currentActivePhotoId = activePhotoIdRef.current;
        const currentAssignmentDraft = assignmentDraftRef.current;

        if (!workflowLockedRef.current && currentAssignmentDraft?.photoId === currentActivePhotoId && currentActivePhotoId && currentActivePhotoId !== nextPhotoId) {
            const nextPhotos = applyAssignmentToPhotoList(
                photosRef.current,
                itemSeqsRef.current,
                currentActivePhotoId,
                currentAssignmentDraft.value
            );
            assignmentDraftRef.current = null;
            photosRef.current = nextPhotos;
            setAssignmentDraft(null);
            setPhotos(nextPhotos);
            setError('');
            setSuccessMessage('');
        }

        activePhotoIdRef.current = nextPhotoId;
        setCarouselDirection(direction);
        setActivePhotoId(nextPhotoId);
    }, []);

    const applyNextPhotos = (nextPhotos: WorkingPhoto[], preferredActiveId?: string | null) => {
        photosRef.current = nextPhotos;
        setPhotos(nextPhotos);

        if (nextPhotos.length === 0) {
            activePhotoIdRef.current = '';
            setCarouselDirection(0);
            setActivePhotoId('');
            return;
        }

        const activeId = preferredActiveId && nextPhotos.some((photo) => photo.id === preferredActiveId)
            ? preferredActiveId
            : nextPhotos.some((photo) => photo.id === activePhotoIdRef.current)
            ? activePhotoIdRef.current
            : nextPhotos[0].id;

        activatePhoto(activeId, 0);
    };

    const applyFullReassignment = (
        nextSortMode: SortMode,
        nextSortDescending: boolean,
        nextAssignmentDescending: boolean
    ) => {
        if (workflowLockedRef.current) {
            return;
        }

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

        if (importProgress || workflowLockedRef.current) {
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

        setImportProgress({
            stage: 'adding',
            currentFileName: '',
            current: acceptedFiles.length,
            total: acceptedFiles.length
        });

        const statusMessages: string[] = [];
        if (rejectedRawFiles.length > 0) {
            statusMessages.push('DNG/RAW пропущены: экспортируйте их в HEIC/JPEG/PNG.');
        } else if (rejectedFiles.length > 0) {
            statusMessages.push(`Неподдерживаемые файлы пропущены. Форматы: ${PHOTO_TOOL_ALLOWED_FORMAT_LABEL}.`);
        }

        const normalizedFiles: File[] = [];
        let convertedHeicCount = 0;
        let failedHeicCount = 0;

        for (const [index, file] of acceptedFiles.entries()) {
            if (!isHeicLikeFile(file)) {
                normalizedFiles.push(file);
                continue;
            }

            setImportProgress({
                stage: 'converting',
                currentFileName: file.name,
                current: index + 1,
                total: acceptedFiles.length
            });

            try {
                normalizedFiles.push(await convertHeicFileToJpeg(file));
                convertedHeicCount += 1;
            } catch {
                normalizedFiles.push(file);
                failedHeicCount += 1;
            }
        }

        if (convertedHeicCount > 0) {
            statusMessages.push(`HEIC/HEIF конвертированы в JPEG: ${convertedHeicCount}.`);
        }

        if (failedHeicCount > 0) {
            statusMessages.push(`Для HEIC/HEIF без превью серверная конвертация выполнится при сохранении: ${failedHeicCount}.`);
        }

        setImportProgress({
            stage: 'adding',
            currentFileName: '',
            current: normalizedFiles.length,
            total: normalizedFiles.length
        });

        const localPhotos: LocalPhoto[] = [];
        for (const [index, file] of normalizedFiles.entries()) {
            setImportProgress({
                stage: 'adding',
                currentFileName: file.name,
                current: index + 1,
                total: normalizedFiles.length
            });
            localPhotos.push(await createLocalPhoto(file));
        }
        const reordered = orderPhotos([...buildPhotosWithPendingDraft(photos), ...localPhotos], sortMode, sortDescending);
        const nextPhotos = fillMissingAssignments(reordered, itemSeqs, assignmentDescending);
        clearAssignmentDraft();
        applyNextPhotos(nextPhotos, localPhotos[0]?.id || activePhotoId);
        setActiveStep('assign');
        setImportProgress(null);

        if (statusMessages.length > 0) {
            setError(`Добавлено фото: ${acceptedFiles.length}. ${statusMessages.join(' ')}`);
        } else {
            setSuccessMessage(`Добавлено фото: ${acceptedFiles.length}.`);
        }
    };

    const handleReplaceItemPhoto = async (itemSeq: number, fileList: FileList | null) => {
        const sourceFile = fileList?.[0];
        if (!sourceFile || importProgress || workflowLockedRef.current) {
            return;
        }

        setError('');
        setSuccessMessage('');
        setImportProgress({
            stage: 'checking',
            currentFileName: sourceFile.name,
            current: 1,
            total: 1
        });

        try {
            const extension = getFileExtension(sourceFile.name);
            if (PHOTO_TOOL_RAW_EXTENSIONS.has(extension)) {
                throw new Error('DNG/RAW пока не поддерживается для паспорта. Экспортируйте фото в HEIC/JPEG/PNG.');
            }
            if (!PHOTO_TOOL_ALLOWED_EXTENSIONS.has(extension)) {
                throw new Error(`Поддерживаются только фото: ${PHOTO_TOOL_ALLOWED_FORMAT_LABEL}.`);
            }

            let normalizedFile = sourceFile;
            if (isHeicLikeFile(sourceFile)) {
                setImportProgress({
                    stage: 'converting',
                    currentFileName: sourceFile.name,
                    current: 1,
                    total: 1
                });
                normalizedFile = await convertHeicFileToJpeg(sourceFile).catch(() => sourceFile);
            }

            setImportProgress({
                stage: 'adding',
                currentFileName: normalizedFile.name,
                current: 1,
                total: 1
            });
            const localPhoto = {
                ...(await createLocalPhoto(normalizedFile)),
                assigned_item_seq: itemSeq
            };
            const nextPhotos = [...buildPhotosWithPendingDraft(photos), localPhoto].map((photo) => (
                photo.id !== localPhoto.id && photo.assigned_item_seq === itemSeq
                    ? { ...photo, assigned_item_seq: null }
                    : photo
            ));
            clearAssignmentDraft();
            applyNextPhotos(nextPhotos, localPhoto.id);
            setActiveStep('export');
            setSuccessMessage(`Фото для позиции ${padItemSeq(itemSeq)} заменено.`);
        } catch (replaceError) {
            setError(replaceError instanceof Error ? replaceError.message : 'Не удалось заменить фото.');
        } finally {
            setImportProgress(null);
        }
    };

    const handleRemovePhoto = useCallback((photoId: string) => {
        if (workflowLockedRef.current) {
            return;
        }

        const currentPhotos = photosRef.current;
        const currentIndex = currentPhotos.findIndex((photo) => photo.id === photoId);
        if (currentIndex === -1) {
            return;
        }

        const photoToRemove = currentPhotos[currentIndex];
        if (photoToRemove.source === 'local') {
            revokeLocalPhotoUrls(photoToRemove);
        }

        const nextPhotos = currentPhotos.filter((photo) => photo.id !== photoId);
        const fallbackActiveId = nextPhotos[currentIndex]?.id || nextPhotos[currentIndex - 1]?.id || null;
        photosRef.current = nextPhotos;
        setAssignmentDraft((current) => {
            if (!current || current.photoId !== photoId) {
                return current;
            }

            assignmentDraftRef.current = null;
            return null;
        });

        setPhotos(nextPhotos);
        if (nextPhotos.length === 0) {
            activePhotoIdRef.current = '';
            setCarouselDirection(0);
            setActivePhotoId('');
        } else {
            const activeId = fallbackActiveId && nextPhotos.some((photo) => photo.id === fallbackActiveId)
                ? fallbackActiveId
                : nextPhotos.some((photo) => photo.id === activePhotoIdRef.current)
                ? activePhotoIdRef.current
                : nextPhotos[0].id;
            activatePhoto(activeId, 0);
        }
        setError('');
        setSuccessMessage('');
    }, [activatePhoto]);

    const handleAssignmentInputChange = (photoId: string, nextValue: string) => {
        if (workflowLockedRef.current) {
            return;
        }

        const normalized = normalizeAssignmentInput(nextValue);
        const photo = photos.find((item) => item.id === photoId);
        const committedValue = padItemSeq(photo?.assigned_item_seq ?? null);

        if (normalized === committedValue) {
            clearAssignmentDraft(photoId);
        } else {
            assignmentDraftRef.current = { photoId, value: normalized };
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
        if (saveInFlightRef.current) {
            return;
        }

        if (!data) {
            return;
        }

        if (activePhotoWorkflow) {
            setError('');
            setPhotoConflictError(false);
            setSuccessMessage(photoWorkflowStatusText || 'Фоновое сохранение уже выполняется.');
            openDesktopStatusCenter(activePhotoWorkflow.id);
            return;
        }

        if (!canSave) {
            setError('Нужно назначить уникальную фотографию для каждой позиции партии.');
            return;
        }

        saveInFlightRef.current = true;
        setSaving(true);
        setError('');
        setPhotoConflictError(false);
        setSuccessMessage('');

        try {
            const assignedPhotosByItemSeq = new Map(
                photos.flatMap((photo) => photo.assigned_item_seq == null ? [] : [[photo.assigned_item_seq, photo] as const])
            );
            const manifest: Array<Record<string, string | number>> = [];
            const workflowItems: Array<Record<string, string | number>> = [];
            const formData = new FormData();
            const localPhotosForQueue: Array<{ fileIndex: number; photo: LocalPhoto }> = [];
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
                    workflowItems.push({
                        itemId: item.id,
                        itemSeq: item.item_seq,
                        source: 'existing',
                        existingUrl: photo.existing_url
                    });
                    continue;
                }

                manifest.push({
                    item_id: item.id,
                    item_seq: item.item_seq,
                    source: 'upload',
                    file_index: fileIndex
                });
                workflowItems.push({
                    itemId: item.id,
                    itemSeq: item.item_seq,
                    source: 'upload',
                    fileId: photo.id
                });
                localPhotosForQueue.push({ fileIndex, photo });
                formData.append('files', photo.file, photo.file.name);
                fileIndex += 1;
            }

            if (isDesktopApp) {
                const desktop = getStonesDesktop();
                if (!desktop) {
                    throw new Error('Desktop queue недоступна.');
                }

                const stagedFiles = [];
                const queuedManifest = [...manifest];
                for (const entry of localPhotosForQueue) {
                    const staged = await stageDesktopFile(entry.photo.file);
                    stagedFiles.push({
                        ...staged,
                        fileIndex: entry.fileIndex
                    });
                    const manifestIndex = queuedManifest.findIndex((item) => item.source === 'upload' && item.file_index === entry.fileIndex);
                    if (manifestIndex >= 0) {
                        queuedManifest[manifestIndex] = {
                            ...queuedManifest[manifestIndex],
                            queue_file_id: staged.fileId
                        };
                    }
                    const workflowItemIndex = workflowItems.findIndex((item) => item.source === 'upload' && item.fileId === entry.photo.id);
                    if (workflowItemIndex >= 0) {
                        workflowItems[workflowItemIndex] = {
                            ...workflowItems[workflowItemIndex],
                            fileId: staged.fileId
                        };
                    }
                }

                const workflow = await desktop.startPhotoApplyWorkflow({
                    batchId,
                    batchLabel: data.batch.id,
                    subtitle: localPhotosForQueue.length > 0 ? `${localPhotosForQueue.length} новых фото` : 'Переназначение сохраненных фото',
                    items: workflowItems,
                    manifest: queuedManifest,
                    basePhotoStateToken: data.batch.photo_state_token,
                    photoExportSettings,
                    files: stagedFiles
                });
                window.dispatchEvent(new CustomEvent('stones:open-status-center', {
                    detail: { tab: 'queue', focus: { type: 'workflow', id: workflow.id } }
                }));
                setSuccessMessage(`Сохранение передано в фон: ${workflow.id.slice(0, 8)}.`);
                return;
            }

            formData.append('manifest', JSON.stringify(manifest));
            formData.append('base_photo_state_token', data.batch.photo_state_token);
            formData.append('photo_export_settings', JSON.stringify(photoExportSettings));

            const response = await authFetch(`/api/batches/${batchId}/photo-tool/apply`, {
                method: 'POST',
                body: formData
            });
            const payload = await response.json().catch(() => ({ error: 'Не удалось сохранить назначения photo-tool.' }));
            if (!response.ok) {
                throw Object.assign(new Error(payload.error || 'Не удалось сохранить назначения photo-tool.'), {
                    code: typeof payload.code === 'string' ? payload.code : undefined
                });
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
                    revokeLocalPhotoUrls(photo);
                }

                return {
                    id: `persisted:${photo.assigned_item_seq}`,
                    source: 'persisted' as const,
                    name: extractPhotoName(nextUrl),
                    preview_url: nextUrl,
                    thumbnail_url: nextUrl,
                    assigned_item_seq: photo.assigned_item_seq,
                    existing_url: nextUrl,
                    last_modified: null
                };
            });
            const preferredActiveId = activePhoto?.assigned_item_seq != null && photoUrlByItemSeq.has(activePhoto.assigned_item_seq)
                ? `persisted:${activePhoto.assigned_item_seq}`
                : activePhotoId;

            baselineSignatureRef.current = buildCurrentSignature(nextPhotos, sortMode, sortDescending, assignmentDescending, photoExportSettings);
            draftFileSignatureRef.current = '';
            setData(typedPayload);
            applyNextPhotos(nextPhotos, preferredActiveId);
            await clearDraftStorage(batchId);
            setSuccessMessage('Назначения фото сохранены.');
        } catch (saveError) {
            console.error(saveError);
            const code = typeof (saveError as { code?: unknown })?.code === 'string'
                ? (saveError as { code: string }).code
                : '';
            let message = saveError instanceof Error ? saveError.message : 'Не удалось сохранить назначения photo-tool.';
            if (code === 'PHOTO_TOOL_STATE_STALE') {
                setPhotoConflictError(true);
                message = 'Данные photo-tool изменились после открытия страницы. Обновите инструмент: конфликтный черновик будет восстановлен, проверьте назначения перед повторным сохранением.';
            } else {
                setPhotoConflictError(false);
            }
            setError(message);
        } finally {
            saveInFlightRef.current = false;
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
            photo_export_settings: photoExportSettings,
            sort_mode: sortMode,
            sort_descending: sortDescending,
            assignment_descending: assignmentDescending,
            active_photo_id: activePhotoId || null,
            photos: photos.map((photo) => buildDraftPhotoMeta(photo))
        };

        const timeoutId = window.setTimeout(() => {
            persistDraftMetadata(batchId, draft);
        }, 250);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [activePhotoId, assignmentDescending, batchId, data, hasUnsavedChanges, photoExportSettings, photos, sortDescending, sortMode]);

    useEffect(() => {
        if (!data || !hasUnsavedChanges) {
            return;
        }

        const nextFileSignature = buildDraftFileSignature(photos);
        if (nextFileSignature === draftFileSignatureRef.current) {
            return;
        }

        draftFileSignatureRef.current = nextFileSignature;
        void syncDraftFilesForPhotos(batchId, photos).catch(() => undefined);
    }, [batchId, data, hasUnsavedChanges, photos]);

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

        if (activePhotoWorkflow) {
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

    const handleListItemActivate = useCallback((photoId: string, index: number) => {
        activatePhoto(photoId, index > resolvedActiveIndex ? 1 : index < resolvedActiveIndex ? -1 : 0);
    }, [resolvedActiveIndex, activatePhoto]);

    const handleListItemRemove = useCallback((photoId: string) => {
        handleRemovePhoto(photoId);
    }, [handleRemovePhoto]);

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
        <MotionConfig transition={{ duration: 0.16, ease: 'easeOut' }}>
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
                                {batchPhotoWorkflow && (
                                    <StatusPill
                                        label="Workflow"
                                        value={workflowPhaseLabel[batchPhotoWorkflow.phase] || batchPhotoWorkflow.phase}
                                        tone={activePhotoWorkflow ? 'warning' : batchPhotoWorkflow.phase === 'completed' ? 'success' : 'default'}
                                    />
                                )}
                                <DesktopStatusCenter />
                            </div>

                            <button
                                type="button"
                                data-testid="photo-save"
                                onClick={() => void handleSave()}
                                disabled={(!canSave && !activePhotoWorkflow) || saving || isImportingPhotos}
                                className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition ${(canSave || activePhotoWorkflow) && !saving && !isImportingPhotos
                                    ? 'border-sky-300/40 bg-sky-400 text-[#061018] shadow-[0_16px_44px_rgba(56,189,248,0.24)] hover:bg-sky-300'
                                    : 'border-white/10 bg-white/[0.06] text-white/42'
                                    }`}
                            >
                                {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                                {saving ? 'Сохраняем' : activePhotoWorkflow ? 'В фоне' : 'Сохранить'}
                            </button>
                        </div>
                    </header>

                    {activePhotoWorkflow && (
                        <section
                            data-testid="photo-workflow-banner"
                            className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-400/20 bg-sky-500/10 px-5 py-3 text-sm text-sky-50 xl:px-8"
                        >
                            <span>{photoWorkflowStatusText || 'Фоновое сохранение фото выполняется.'} Редактирование заблокировано до завершения workflow.</span>
                            <button
                                type="button"
                                onClick={() => openDesktopStatusCenter(activePhotoWorkflow.id)}
                                className="rounded-xl bg-sky-200 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-sky-100"
                            >
                                Открыть Status Center
                            </button>
                        </section>
                    )}

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
                                <input
                                    ref={itemFileInputRef}
                                    data-testid="photo-item-replace-input"
                                    type="file"
                                    accept={PHOTO_TOOL_ACCEPT}
                                    className="hidden"
                                    onChange={(event) => {
                                        const input = event.currentTarget;
                                        const itemSeq = replacementItemSeqRef.current;
                                        replacementItemSeqRef.current = null;
                                        if (itemSeq != null) {
                                            void handleReplaceItemPhoto(itemSeq, input.files).finally(() => {
                                                input.value = '';
                                            });
                                        } else {
                                            input.value = '';
                                        }
                                    }}
                                />
	                                <Button
	                                    variant="secondary"
	                                    onClick={() => fileInputRef.current?.click()}
	                                    disabled={isImportingPhotos || Boolean(activePhotoWorkflow)}
	                                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-white hover:bg-white/[0.1]"
	                                >
	                                    {isImportingPhotos ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />}
	                                    {isImportingPhotos ? 'Обработка...' : activePhotoWorkflow ? 'Сохранение в фоне' : 'Добавить фото'}
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
                                                disabled={workflowLocked}
                                                onClick={() => applyFullReassignment('name', sortDescending, assignmentDescending)}
                                            />
                                            <WorkspaceToggle
                                                data-testid="photo-sort-date"
                                                active={sortMode === 'date'}
                                                title="Дата"
                                                description="Файловое время"
                                                disabled={workflowLocked}
                                                onClick={() => applyFullReassignment('date', sortDescending, assignmentDescending)}
                                            />
                                            <WorkspaceToggle
                                                data-testid="photo-reverse-list"
                                                active={sortDescending}
                                                title="Список"
                                                description={sortDescending ? 'Обратный' : 'Прямой'}
                                                disabled={workflowLocked}
                                                onClick={() => applyFullReassignment(sortMode, !sortDescending, assignmentDescending)}
                                            />
                                            <WorkspaceToggle
                                                data-testid="photo-reverse-assignment"
                                                active={assignmentDescending}
                                                title="Назначение"
                                                description={assignmentDescending ? 'От конца' : 'От начала'}
                                                disabled={workflowLocked}
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
                                            <PhotoListItem
                                                key={photo.id}
                                                photo={photo}
                                                index={index}
                                                isActive={photo.id === activePhotoId}
                                                readOnly={workflowLocked}
                                                onActivate={handleListItemActivate}
                                                onRemove={handleListItemRemove}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </aside>

                        <main className="flex min-h-0 flex-col overflow-y-auto bg-[#0e1014]">
                            {(error || successMessage) && (
                                <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm xl:px-8 ${error ? 'bg-red-500/10 text-red-100' : 'bg-emerald-500/10 text-emerald-100'}`}>
                                    <span>{error || successMessage}</span>
                                    {photoConflictError ? (
                                        <button
                                            type="button"
                                            onClick={() => window.location.reload()}
                                            className="rounded-lg border border-red-200/20 px-3 py-1 text-xs font-semibold text-red-50 transition hover:bg-red-500/10"
                                        >
                                            Обновить Photo Tool
                                        </button>
                                    ) : null}
                                </div>
                            )}

                            <PhotoToolStepNav activeStep={activeStep} onChange={setActiveStep} />

                            <div className="min-h-0 flex-1 px-4 py-4 xl:px-8 xl:py-6">
                                {activeStep === 'quality' ? (
                                    <PhotoQualityPanel
                                        settings={photoExportSettings}
                                        estimate={sizeEstimate}
                                        readOnly={workflowLocked}
                                        onApplySettings={applyPhotoExportSettings}
                                    />
                                ) : activeStep === 'export' && data ? (
                                    <PhotoExportGrid
                                        items={data.items}
                                        photos={photos}
                                        readOnly={workflowLocked}
                                        onActivatePhoto={(photoId) => {
                                            activatePhoto(photoId, 0);
                                            setActiveStep('assign');
                                        }}
                                        onReplace={openItemFilePicker}
                                        onReupload={(itemSeq) => {
                                            const photo = photos.find((entry) => entry.assigned_item_seq === itemSeq);
                                            if (photo?.source === 'local') {
                                                setSuccessMessage(`Позиция ${padItemSeq(itemSeq)} будет загружена заново при сохранении.`);
                                                return;
                                            }
                                            openItemFilePicker(itemSeq);
                                        }}
                                        onClear={(itemSeq) => {
                                            const photo = photos.find((entry) => entry.assigned_item_seq === itemSeq);
                                            if (photo) {
                                                commitAssignmentChange(photo.id, '', photo.id);
                                            }
                                        }}
                                    />
                                ) : (
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
                                                    readOnly={workflowLocked}
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
                                                    readOnly={workflowLocked}
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
                                                    readOnly={workflowLocked}
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
                                )}
                            </div>
                        </main>
                    </div>
                </div>
            </div>
        </MotionConfig>
    );
}

function PhotoToolStepNav({ activeStep, onChange }: { activeStep: PhotoToolStep; onChange: (step: PhotoToolStep) => void }) {
    const steps: Array<{ id: PhotoToolStep; label: string; description: string; testId: string }> = [
        { id: 'quality', label: 'Качество', description: 'Сжатие и размер', testId: 'photo-step-quality' },
        { id: 'assign', label: 'Назначение', description: 'Карусель и номера', testId: 'photo-step-assign' },
        { id: 'export', label: 'Экспорт', description: 'Плитки товаров', testId: 'photo-step-export' }
    ];

    return (
        <nav className="border-b border-white/5 bg-[#101318] px-4 py-3 xl:px-8">
            <div className="grid gap-2 sm:grid-cols-3">
                {steps.map((step) => (
                    <button
                        key={step.id}
                        type="button"
                        data-testid={step.testId}
                        onClick={() => onChange(step.id)}
                        className={`rounded-2xl px-4 py-3 text-left transition ${activeStep === step.id
                            ? 'bg-sky-400 text-[#061018] shadow-[0_14px_34px_rgba(56,189,248,0.18)]'
                            : 'bg-white/[0.04] text-white/62 hover:bg-white/[0.08] hover:text-white'
                        }`}
                    >
                        <p className="text-sm font-semibold">{step.label}</p>
                        <p className={`mt-1 text-xs ${activeStep === step.id ? 'text-[#061018]/65' : 'text-white/36'}`}>{step.description}</p>
                    </button>
                ))}
            </div>
        </nav>
    );
}

function PhotoQualityPanel({
    settings,
    estimate,
    readOnly,
    onApplySettings
}: {
    settings: PhotoExportSettings;
    estimate: PhotoSizeEstimate;
    readOnly: boolean;
    onApplySettings: (settings: Partial<PhotoExportSettings>) => void;
}) {
    const activePreset = PHOTO_EXPORT_PRESETS.find((preset) =>
        preset.settings.quality === settings.quality
        && preset.settings.maxWidth === settings.maxWidth
        && preset.settings.maxHeight === settings.maxHeight
    )?.id || '';

    return (
        <section className="grid gap-5 rounded-[30px] bg-[#11151b] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] xl:grid-cols-[minmax(0,1.2fr)_360px] xl:p-7">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-100/45">Финальные фотографии</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Качество экспорта</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
                    Эти настройки применяются к фото при сохранении в паспорт товара. Формат v1: JPEG.
                </p>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {PHOTO_EXPORT_PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            data-testid={`photo-preset-${preset.id}`}
                            disabled={readOnly}
                            onClick={() => onApplySettings(preset.settings)}
                            className={`rounded-3xl border px-4 py-4 text-left transition ${activePreset === preset.id
                                ? 'border-sky-300/70 bg-sky-400/16 text-sky-50'
                                : 'border-white/8 bg-white/[0.035] text-white/70 hover:bg-white/[0.07]'
                            } disabled:cursor-not-allowed disabled:opacity-45`}
                        >
                            <p className="text-sm font-semibold">{preset.title}</p>
                            <p className="mt-2 text-xs text-white/45">{preset.description}</p>
                        </button>
                    ))}
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <PhotoNumberField
                        testId="photo-quality-input"
                        label="Сжатие"
                        value={settings.quality}
                        min={40}
                        max={95}
                        suffix="%"
                        disabled={readOnly}
                        onChange={(quality) => onApplySettings({ quality })}
                    />
                    <PhotoNumberField
                        testId="photo-max-width-input"
                        label="Ширина"
                        value={settings.maxWidth}
                        min={800}
                        max={4096}
                        suffix="px"
                        disabled={readOnly}
                        onChange={(maxWidth) => onApplySettings({ maxWidth })}
                    />
                    <PhotoNumberField
                        testId="photo-max-height-input"
                        label="Высота"
                        value={settings.maxHeight}
                        min={800}
                        max={4096}
                        suffix="px"
                        disabled={readOnly}
                        onChange={(maxHeight) => onApplySettings({ maxHeight })}
                    />
                </div>
            </div>

            <aside data-testid="photo-size-estimate" className="rounded-[28px] bg-[#0b0e13] p-5 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/35">Примерный вес</p>
                <div className="mt-5 grid gap-3">
                    <WorkspaceStat label="На фото" value={formatBytes(estimate.bytesPerPhoto)} accent={estimate.status === 'ready' ? 'success' : 'default'} />
                    <WorkspaceStat label="Партия" value={formatBytes(estimate.batchBytes)} accent={estimate.status === 'ready' ? 'success' : 'default'} />
                    <WorkspaceStat label="Статус" value={estimate.message} accent={estimate.status === 'unavailable' ? 'warning' : 'default'} />
                </div>
            </aside>
        </section>
    );
}

function PhotoNumberField({
    testId,
    label,
    value,
    min,
    max,
    suffix,
    disabled = false,
    onChange
}: {
    testId: string;
    label: string;
    value: number;
    min: number;
    max: number;
    suffix: string;
    disabled?: boolean;
    onChange: (value: number) => void;
}) {
    return (
        <label className="rounded-3xl bg-white/[0.04] px-4 py-4 text-sm text-white/72">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">{label}</span>
            <span className="mt-3 flex items-center gap-2">
                <input
                    data-testid={testId}
                    type="number"
                    min={min}
                    max={max}
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onChange(clampInteger(event.currentTarget.value, value, min, max))}
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-sky-300/70 disabled:cursor-not-allowed disabled:opacity-45"
                />
                <span className="text-xs text-white/38">{suffix}</span>
            </span>
        </label>
    );
}

function PhotoExportGrid({
    items,
    photos,
    readOnly,
    onActivatePhoto,
    onReplace,
    onReupload,
    onClear
}: {
    items: PhotoToolItem[];
    photos: WorkingPhoto[];
    readOnly: boolean;
    onActivatePhoto: (photoId: string) => void;
    onReplace: (itemSeq: number) => void;
    onReupload: (itemSeq: number) => void;
    onClear: (itemSeq: number) => void;
}) {
    const photoByItemSeq = new Map(photos.flatMap((photo) =>
        photo.assigned_item_seq == null ? [] : [[photo.assigned_item_seq, photo] as const]
    ));

    return (
        <section data-testid="photo-export-grid" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
                const photo = photoByItemSeq.get(item.item_seq) || null;
                return (
                    <article
                        key={item.id}
                        data-testid={`photo-export-tile-${item.item_seq}`}
                        className="overflow-hidden rounded-[28px] bg-[#11151b] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                    >
                        <button
                            type="button"
                            disabled={!photo}
                            onClick={() => photo && onActivatePhoto(photo.id)}
                            className="relative block h-56 w-full bg-[#090b0f] text-left disabled:cursor-default"
                        >
                            {photo ? (
                                <PhotoPreview photo={photo} className="h-full w-full object-cover" compact />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center text-white/35">
                                    <FileImage size={28} />
                                    <p className="mt-3 text-sm">Фото не назначено</p>
                                </div>
                            )}
                            <span className="absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white">
                                {padItemSeq(item.item_seq)}
                            </span>
                        </button>
                        <div className="p-4">
                            <p className="text-sm font-semibold text-white">Товар {padItemSeq(item.item_seq)}</p>
                            <p className="mt-1 truncate text-xs text-white/42">{item.serial_number || item.temp_id}</p>
                            <p className={`mt-3 text-xs font-semibold ${photo ? 'text-emerald-200' : 'text-amber-200'}`}>
                                {photo ? `${photo.source === 'local' ? 'Новое фото' : 'Сохраненное фото'}: ${photo.name}` : 'Нет назначения'}
                            </p>
                            <div className="mt-4 grid grid-cols-3 gap-2">
                                <button type="button" data-testid={`photo-export-replace-${item.item_seq}`} onClick={() => onReplace(item.item_seq)} disabled={readOnly} className="rounded-xl bg-sky-400 px-3 py-2 text-xs font-semibold text-[#061018] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-45">
                                    Заменить
                                </button>
                                <button type="button" data-testid={`photo-export-reupload-${item.item_seq}`} onClick={() => onReupload(item.item_seq)} disabled={readOnly} className="rounded-xl bg-white/[0.07] px-3 py-2 text-xs font-semibold text-white/72 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45">
                                    Заново
                                </button>
                                <button type="button" data-testid={`photo-export-clear-${item.item_seq}`} onClick={() => onClear(item.item_seq)} disabled={!photo || readOnly} className="rounded-xl bg-red-500/12 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-40">
                                    Снять
                                </button>
                            </div>
                        </div>
                    </article>
                );
            })}
        </section>
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
                } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[#101216]`}
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

function PhotoThumbnail({ photo, className }: { photo: WorkingPhoto; className: string }) {
    if (canPreviewPhotoInBrowser(photo)) {
        return <img src={photo.thumbnail_url} alt={photo.name} className={className} loading="lazy" decoding="async" />;
    }

    return (
        <div className={`${className} flex items-center justify-center bg-[#0d1117]`}>
            <FileImage size={18} className="text-white/25" />
        </div>
    );
}

const PhotoListItem = memo(function PhotoListItem({
    photo,
    index,
    isActive,
    readOnly,
    onActivate,
    onRemove
}: {
    photo: WorkingPhoto;
    index: number;
    isActive: boolean;
    readOnly: boolean;
    onActivate: (photoId: string, index: number) => void;
    onRemove: (photoId: string) => void;
}) {
    return (
        <div
            className={`group rounded-[20px] px-2 py-2 transition-colors ${isActive
                ? 'bg-[#1a2028] shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]'
                : 'bg-transparent hover:bg-white/[0.03]'
                }`}
        >
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    data-testid={`photo-list-item-${index}`}
                    onClick={() => onActivate(photo.id, index)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-black/50 shadow-[0_10px_22px_rgba(0,0,0,0.28)]">
                        <PhotoThumbnail photo={photo} className="h-full w-full object-cover" />
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
                        onRemove(photo.id);
                    }}
                    disabled={readOnly}
                    className="rounded-xl p-2 text-white/25 transition-colors hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-white/25"
                    aria-label={`Удалить ${photo.name}`}
                >
                    <Trash2 size={15} />
                </button>
            </div>
        </div>
    );
});

const CarouselStageCard = memo(function CarouselStageCard({
    title,
    photo,
    slot,
    active,
    direction,
    navigationDirection,
    assignmentValue,
    readOnly,
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
    readOnly: boolean;
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
            <AnimatePresence initial={false}>
                <motion.div
                    key={`${slot}:${photo.id}`}
                    data-testid={`photo-card-${slot}`}
                    initial={{ opacity: 0, x: initialOffset, scale: active ? 0.98 : 0.92 }}
                    animate={{ opacity: active ? 1 : 0.76, x: 0, scale: active ? 1 : 0.92 }}
                    exit={{ opacity: 0, x: -initialOffset || (direction * 90), scale: 0.92 }}
                    className={`relative w-full overflow-hidden rounded-[30px] ${active
                        ? 'h-full bg-[#141920] shadow-[0_30px_90px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(56,189,248,0.18)]'
                        : 'h-[68%] max-w-[300px] bg-[#161a20] shadow-[0_22px_60px_rgba(0,0,0,0.35)]'
                        }`}
                    style={{ willChange: 'transform, opacity' }}
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
                                disabled={readOnly}
                                onFocus={() => onActivate(photo)}
                                onChange={(event) => onAssignmentChange(photo.id, event.target.value)}
                                className={`mt-2 w-full rounded-2xl px-4 py-3 text-base font-semibold text-white outline-none transition ${photo.assigned_item_seq == null
                                    ? 'bg-red-500/10 placeholder:text-red-100/30 focus:bg-red-500/12'
                                    : 'bg-black/32 focus:bg-black/42'
                                    } disabled:cursor-not-allowed disabled:opacity-55`}
                                placeholder="Без номера"
                            />
                        </label>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
});

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
