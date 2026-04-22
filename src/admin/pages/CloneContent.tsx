import { useEffect, useMemo, useState } from 'react';
import type { CloneItemView } from '../../public/components/DigitalCloneView';
import { DigitalCloneView } from '../../public/components/DigitalCloneView';
import {
    DEFAULT_CLONE_PAGE_CONTENT,
    sanitizeClonePageContent,
    type ClonePageContent
} from '../../shared/clonePageContent';
import { authFetch } from '../../utils/authFetch';

const FIELD_CONFIG: Array<{
    key: keyof ClonePageContent;
    label: string;
    hint?: string;
    multiline?: boolean;
}> = [
    { key: 'hero_badge', label: 'Бейдж в шапке' },
    { key: 'hero_description', label: 'Описание в hero', multiline: true },
    { key: 'details_heading', label: 'Заголовок блока данных' },
    { key: 'field_collection_date_label', label: 'Подпись даты сбора' },
    { key: 'field_collection_time_label', label: 'Подпись времени сбора' },
    { key: 'field_coords_label', label: 'Подпись координат' },
    { key: 'media_heading', label: 'Заголовок media-блока' },
    { key: 'media_empty_text', label: 'Текст, если media нет' },
    { key: 'photo_button_text', label: 'Кнопка фото' },
    { key: 'video_button_text', label: 'Кнопка видео' },
    { key: 'authenticity_heading', label: 'Заголовок блока подлинности' },
    { key: 'authenticity_text', label: 'Текст блока подлинности', multiline: true },
    { key: 'field_serial_number_label', label: 'Подпись серийного номера' }
];

const PREVIEW_ITEM: CloneItemView = {
    serial_number: 'RUSPREVIEW000001',
    clone_url: `${window.location.origin}/clone/RUSPREVIEW000001`,
    product_name: 'Демо-товар ZAGARAMI',
    product_description: 'Короткое описание карточки товара, которое наследуется публичным паспортом.',
    location_name: 'Москва, тестовая локация',
    location_description: 'Описание локации из товарного шаблона. Этот текст теперь показывается в публичном паспорте вместо стандартной фразы про публичный токен.',
    collection_date: new Date().toISOString(),
    collection_time: '14:30',
    gps_lat: 55.751244,
    gps_lng: 37.618423,
    photo_url: null,
    video_url: null,
    has_photo: false,
    has_video: false
};

export function CloneContent() {
    const [draft, setDraft] = useState<ClonePageContent>(DEFAULT_CLONE_PAGE_CONTENT);
    const [saved, setSaved] = useState<ClonePageContent>(DEFAULT_CLONE_PAGE_CONTENT);
    const [previewItem, setPreviewItem] = useState<CloneItemView>(PREVIEW_ITEM);
    const [previewSerialNumber, setPreviewSerialNumber] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [previewStatus, setPreviewStatus] = useState('');

    const hasChanges = useMemo(
        () => JSON.stringify(draft) !== JSON.stringify(saved),
        [draft, saved]
    );

    useEffect(() => {
        const loadContent = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/content/clone-page');
                if (res.ok) {
                    const data = sanitizeClonePageContent(await res.json());
                    setDraft(data);
                    setSaved(data);
                } else {
                    setDraft(DEFAULT_CLONE_PAGE_CONTENT);
                    setSaved(DEFAULT_CLONE_PAGE_CONTENT);
                }
            } catch (_error) {
                setDraft(DEFAULT_CLONE_PAGE_CONTENT);
                setSaved(DEFAULT_CLONE_PAGE_CONTENT);
            } finally {
                setLoading(false);
            }
        };

        void loadContent();
    }, []);

    const handleFieldChange = (key: keyof ClonePageContent, value: string) => {
        setDraft((prev) => ({ ...prev, [key]: value }));
        setStatusText('');
    };

    const handleSave = async () => {
        setSaving(true);
        setStatusText('');
        try {
            const res = await authFetch('/api/content/clone-page', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(draft)
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({ error: 'Не удалось сохранить текст страницы.' }));
                setStatusText(payload.error || 'Не удалось сохранить текст страницы.');
                return;
            }

            const data = sanitizeClonePageContent(await res.json());
            setDraft(data);
            setSaved(data);
            setStatusText('Изменения сохранены.');
        } catch (_error) {
            setStatusText('Не удалось сохранить текст страницы.');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setDraft(saved);
        setStatusText('Локальные изменения сброшены.');
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
            const res = await fetch(`/api/public/items/${encodeURIComponent(serialNumber)}`);
            if (!res.ok) {
                setPreviewStatus('Предмет по серийному номеру не найден, показан демо-предмет.');
                setPreviewItem(PREVIEW_ITEM);
                return;
            }
            const data = await res.json() as CloneItemView;
            setPreviewItem(data);
            setPreviewStatus('Загружен реальный предмет для предпросмотра.');
        } catch (_error) {
            setPreviewItem(PREVIEW_ITEM);
            setPreviewStatus('Ошибка загрузки предмета, показан демо-предмет.');
        } finally {
            setLoadingPreview(false);
        }
    };

    if (loading) {
        return <div className="text-gray-400">Загрузка настроек страницы клона...</div>;
    }

    return (
        <div className="space-y-6">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Страница цифрового клона</h1>
                    <p className="text-gray-500 mt-1">
                        Live-редактирование текста. Справа вы видите, как текст встаёт в реальный макет.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        disabled={!hasChanges || saving}
                        className="px-4 py-2 rounded-lg border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                    >
                        Сбросить
                    </button>
                    <button
                        onClick={() => void handleSave()}
                        disabled={!hasChanges || saving}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                        {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                </div>
            </header>

            {statusText && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-200">
                    {statusText}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[460px_1fr] gap-6">
                <section className="space-y-4">
                    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                        <h2 className="text-sm uppercase tracking-wider text-gray-400">Предпросмотр по серийному номеру</h2>
                        <div className="flex gap-2">
                            <input
                                value={previewSerialNumber}
                                onChange={(e) => setPreviewSerialNumber(e.target.value)}
                                className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                                placeholder="Введите serial_number (необязательно)"
                            />
                            <button
                                onClick={() => void handleLoadPreviewItem()}
                                disabled={loadingPreview}
                                className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-white"
                            >
                                {loadingPreview ? '...' : 'Загрузить'}
                            </button>
                        </div>
                        {previewStatus && <p className="text-xs text-gray-400">{previewStatus}</p>}
                    </div>

                    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-4 max-h-[calc(100vh-260px)] overflow-auto">
                        {FIELD_CONFIG.map((field) => (
                            <label key={field.key} className="block">
                                <span className="block text-sm text-gray-300 mb-1">{field.label}</span>
                                {field.hint && <span className="block text-xs text-gray-500 mb-2">{field.hint}</span>}
                                {field.multiline ? (
                                    <textarea
                                        value={draft[field.key]}
                                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                        rows={3}
                                        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                                    />
                                ) : (
                                    <input
                                        value={draft[field.key]}
                                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                                    />
                                )}
                            </label>
                        ))}
                    </div>
                </section>

                <section className="rounded-2xl border border-gray-800 bg-black/60 p-4">
                    <div className="max-h-[calc(100vh-170px)] overflow-auto rounded-[28px] bg-[#02040a]">
                        <div className="mx-auto w-[430px] max-w-full">
                            <DigitalCloneView
                                item={previewItem}
                                content={draft}
                                previewMode
                            />
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
