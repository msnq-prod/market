import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search, Save } from 'lucide-react';
import type { CloneItemView } from '../../public/components/DigitalCloneView';
import { DigitalCloneView } from '../../public/components/DigitalCloneView';
import {
    DEFAULT_CLONE_PAGE_CONTENT,
    sanitizeClonePageContent,
    type ClonePageContent
} from '../../shared/clonePageContent';
import { apiFetch } from '../../utils/apiFetch';
import { authFetch } from '../../utils/authFetch';
import {
    AdminAction,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState,
    adminFieldClassName
} from '../components/AdminWorkspaceUI';

type CloneContentSection = 'hero' | 'details' | 'media' | 'authenticity';

const FIELD_CONFIG: Array<{
    section: CloneContentSection;
    key: keyof ClonePageContent;
    label: string;
    multiline?: boolean;
}> = [
    { section: 'hero', key: 'hero_badge', label: 'Бейдж в шапке' },
    { section: 'hero', key: 'hero_description', label: 'Описание в первом экране', multiline: true },
    { section: 'details', key: 'details_heading', label: 'Заголовок блока данных' },
    { section: 'details', key: 'field_collection_date_label', label: 'Дата сбора' },
    { section: 'details', key: 'field_collection_time_label', label: 'Время сбора' },
    { section: 'details', key: 'field_coords_label', label: 'Координаты' },
    { section: 'details', key: 'field_serial_number_label', label: 'Серийный номер' },
    { section: 'media', key: 'media_heading', label: 'Заголовок медиа' },
    { section: 'media', key: 'media_empty_text', label: 'Текст без медиа' },
    { section: 'media', key: 'photo_button_text', label: 'Кнопка фото' },
    { section: 'media', key: 'video_button_text', label: 'Кнопка видео' },
    { section: 'authenticity', key: 'authenticity_heading', label: 'Заголовок подлинности' },
    { section: 'authenticity', key: 'authenticity_text', label: 'Текст подлинности', multiline: true }
];

const SECTION_CONFIG: Array<{ id: CloneContentSection; title: string }> = [
    { id: 'hero', title: 'Первый экран' },
    { id: 'details', title: 'Данные' },
    { id: 'media', title: 'Медиа' },
    { id: 'authenticity', title: 'Подлинность' }
];

const FIELD_GROUPS = SECTION_CONFIG.map((section) => ({
    ...section,
    fields: FIELD_CONFIG.filter((field) => field.section === section.id)
}));

const PREVIEW_ITEM: CloneItemView = {
    serial_number: 'RUSPREVIEW000001',
    clone_url: `${window.location.origin}/clone/RUSPREVIEW000001`,
    product_name: 'Демо-товар ZAGARAMI',
    product_description: 'Короткое описание карточки товара, которое наследуется публичным паспортом.',
    location_name: 'Москва, тестовая локация',
    location_description: 'Описание локации из товарного шаблона.',
    collection_date: new Date().toISOString(),
    collection_time: '14:30',
    gps_lat: 55.751244,
    gps_lng: 37.618423,
    photo_url: null,
    video_url: null,
    has_photo: false,
    has_video: false
};

const inputClassName = `${adminFieldClassName} w-full px-3`;
const textareaClassName = 'min-h-[96px] w-full resize-y rounded-lg border border-[#2a3039] bg-[#151a21] px-3 py-2.5 text-[13px] text-[#eef2f6] outline-none transition focus:border-[#4c91f3]';

export function CloneContent() {
    const [draft, setDraft] = useState<ClonePageContent>(DEFAULT_CLONE_PAGE_CONTENT);
    const [saved, setSaved] = useState<ClonePageContent>(DEFAULT_CLONE_PAGE_CONTENT);
    const [previewItem, setPreviewItem] = useState<CloneItemView>(PREVIEW_ITEM);
    const [previewSerialNumber, setPreviewSerialNumber] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [statusTone, setStatusTone] = useState<'neutral' | 'success' | 'error'>('neutral');
    const [previewStatus, setPreviewStatus] = useState('Показан демо-предмет.');

    const hasChanges = useMemo(
        () => JSON.stringify(draft) !== JSON.stringify(saved),
        [draft, saved]
    );

    useEffect(() => {
        const loadContent = async () => {
            setLoading(true);
            try {
                const response = await apiFetch('/api/content/clone-page');
                if (!response.ok) throw new Error('Не удалось загрузить тексты.');
                const content = sanitizeClonePageContent(await response.json());
                setDraft(content);
                setSaved(content);
            } catch (_error) {
                setDraft(DEFAULT_CLONE_PAGE_CONTENT);
                setSaved(DEFAULT_CLONE_PAGE_CONTENT);
                setStatusText('Используются стандартные тексты.');
                setStatusTone('error');
            } finally {
                setLoading(false);
            }
        };
        void loadContent();
    }, []);

    const handleFieldChange = (key: keyof ClonePageContent, value: string) => {
        setDraft((current) => ({ ...current, [key]: value }));
        setStatusText('');
        setStatusTone('neutral');
    };

    const handleSave = async () => {
        setSaving(true);
        setStatusText('');
        setStatusTone('neutral');
        try {
            const response = await authFetch('/api/content/clone-page', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft)
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось сохранить тексты.' }));
                throw new Error(payload.error || 'Не удалось сохранить тексты.');
            }
            const content = sanitizeClonePageContent(await response.json());
            setDraft(content);
            setSaved(content);
            setStatusText('Сохранено.');
            setStatusTone('success');
        } catch (error) {
            setStatusText(error instanceof Error ? error.message : 'Не удалось сохранить тексты.');
            setStatusTone('error');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setDraft(saved);
        setStatusText('Изменения сброшены.');
        setStatusTone('neutral');
    };

    const handleLoadPreviewItem = async () => {
        const serialNumber = previewSerialNumber.trim().toUpperCase();
        if (!serialNumber) {
            setPreviewItem(PREVIEW_ITEM);
            setPreviewStatus('Показан демо-предмет.');
            return;
        }

        setLoadingPreview(true);
        setPreviewStatus('');
        try {
            const response = await apiFetch(`/api/public/items/${encodeURIComponent(serialNumber)}`);
            if (!response.ok) {
                setPreviewItem(PREVIEW_ITEM);
                setPreviewStatus('Предмет не найден. Показан демо-предмет.');
                return;
            }
            setPreviewItem(await response.json() as CloneItemView);
            setPreviewStatus('Загружен реальный предмет.');
        } catch (_error) {
            setPreviewItem(PREVIEW_ITEM);
            setPreviewStatus('Ошибка загрузки. Показан демо-предмет.');
        } finally {
            setLoadingPreview(false);
        }
    };

    if (loading) {
        return (
            <AdminWorkspace data-testid="clone-content-workspace">
                <AdminTableSurface>
                    <AdminWorkspaceState state="loading">Загрузка текстов паспорта…</AdminWorkspaceState>
                </AdminTableSurface>
            </AdminWorkspace>
        );
    }

    return (
        <AdminWorkspace data-testid="clone-content-workspace">
            <AdminWorkspaceHeader title="Контент паспорта" count={`Полей: ${FIELD_CONFIG.length}`} />

            <section
                className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-[#2a3039] bg-[#11161d] px-4 py-2.5"
                data-testid="clone-content-savebar"
            >
                <div className={`min-w-0 truncate text-[13px] ${statusTone === 'error' ? 'text-red-200' : statusTone === 'success' ? 'text-emerald-200' : 'text-[#89919d]'}`}>
                    {statusText || (hasChanges ? 'Есть несохранённые изменения.' : 'Все изменения сохранены.')}
                </div>
                <div className="flex shrink-0 gap-2">
                    <AdminAction
                        tone="secondary"
                        disabled={!hasChanges || saving}
                        onClick={handleReset}
                        data-testid="clone-content-reset"
                    >
                        <RotateCcw size={15} /> Сбросить
                    </AdminAction>
                    <AdminAction
                        disabled={!hasChanges || saving}
                        onClick={() => void handleSave()}
                        data-testid="clone-content-save"
                    >
                        <Save size={15} /> {saving ? 'Сохранение…' : 'Сохранить'}
                    </AdminAction>
                </div>
            </section>

            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(560px,1fr)_500px]">
                <AdminTableSurface className="overflow-hidden">
                    <form className="divide-y divide-[#2a3039]" data-testid="clone-content-form">
                        {FIELD_GROUPS.map((group) => (
                            <section key={group.id} className="px-5 py-5">
                                <h2 className="mb-4 text-[15px] font-semibold text-[#f1f4f7]">{group.title}</h2>
                                <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
                                    {group.fields.map((field) => (
                                        <label key={field.key} className={field.multiline ? 'md:col-span-2' : ''}>
                                            <span className="mb-1.5 block text-[12px] font-medium text-[#a8b0ba]">{field.label}</span>
                                            {field.multiline ? (
                                                <textarea
                                                    value={draft[field.key]}
                                                    onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                                    className={textareaClassName}
                                                    rows={3}
                                                    data-testid={`clone-content-field-${field.key}`}
                                                />
                                            ) : (
                                                <input
                                                    value={draft[field.key]}
                                                    onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                                    className={inputClassName}
                                                    data-testid={`clone-content-field-${field.key}`}
                                                />
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </form>
                </AdminTableSurface>

                <section
                    className="min-w-0 overflow-hidden rounded-lg border border-[#2a3039] bg-[#11161d] shadow-[0_22px_50px_rgba(0,0,0,0.22)] xl:sticky xl:top-3 xl:self-start"
                    data-testid="clone-content-preview"
                >
                    <header className="border-b border-[#2a3039] bg-[#10151b] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="text-[15px] font-semibold text-[#f1f4f7]">Предпросмотр</h2>
                                <div className="mt-1 truncate text-[12px] text-[#7f8894]">{previewItem.serial_number}</div>
                            </div>
                            <div className="flex min-w-0 flex-1 justify-end gap-2">
                                <input
                                    value={previewSerialNumber}
                                    onChange={(event) => setPreviewSerialNumber(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') void handleLoadPreviewItem();
                                    }}
                                    className={`${inputClassName} max-w-[220px]`}
                                    placeholder="Серийный номер"
                                    aria-label="Серийный номер для предпросмотра"
                                    data-testid="clone-content-preview-serial"
                                />
                                <AdminAction
                                    tone="secondary"
                                    disabled={loadingPreview}
                                    onClick={() => void handleLoadPreviewItem()}
                                    data-testid="clone-content-preview-load"
                                >
                                    <Search size={15} /> {loadingPreview ? 'Загрузка…' : 'Показать'}
                                </AdminAction>
                            </div>
                        </div>
                        <div className="mt-2 text-right text-[12px] text-[#89919d]">{previewStatus}</div>
                    </header>
                    <div className="max-h-[calc(100vh-300px)] overflow-auto bg-[#02040a]">
                        <div className="mx-auto w-[430px] max-w-full">
                            <DigitalCloneView item={previewItem} content={draft} previewMode />
                        </div>
                    </div>
                </section>
            </div>
        </AdminWorkspace>
    );
}
