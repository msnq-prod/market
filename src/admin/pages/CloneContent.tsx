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
    { key: 'hero_title_template', label: 'Заголовок (шаблон)', hint: 'Можно использовать {{temp_id}}, {{token}}, {{status}}, {{partner}}' },
    { key: 'hero_description', label: 'Описание в hero', multiline: true },
    { key: 'details_heading', label: 'Заголовок блока данных' },
    { key: 'video_heading', label: 'Заголовок блока видео' },
    { key: 'video_empty_text', label: 'Текст, если видео нет' },
    { key: 'authenticity_heading', label: 'Заголовок блока подлинности' },
    { key: 'authenticity_text', label: 'Текст блока подлинности', multiline: true },
    { key: 'field_token_label', label: 'Подпись поля токена' },
    { key: 'field_status_label', label: 'Подпись поля статуса' },
    { key: 'field_activation_label', label: 'Подпись поля даты активации' },
    { key: 'field_coords_label', label: 'Подпись поля координат' },
    { key: 'field_partner_label', label: 'Подпись поля партнера' },
    { key: 'field_batch_date_label', label: 'Подпись поля даты партии' },
    { key: 'link_label', label: 'Подпись ссылки' },
    { key: 'copy_button_text', label: 'Кнопка копирования' },
    { key: 'copied_button_text', label: 'Кнопка после копирования' }
];

const PREVIEW_ITEM: CloneItemView = {
    id: 'preview-item',
    temp_id: 'A-1024',
    public_token: 'preview-token-001',
    photo_url: 'https://placehold.co/1200x900/png',
    status: 'STOCK_ONLINE',
    activation_date: null,
    batch: {
        gps_lat: 55.751244,
        gps_lng: 37.618423,
        video_url: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
        created_at: new Date().toISOString(),
        owner: {
            name: 'Демо франчайзи'
        }
    }
};

export function CloneContent() {
    const [draft, setDraft] = useState<ClonePageContent>(DEFAULT_CLONE_PAGE_CONTENT);
    const [saved, setSaved] = useState<ClonePageContent>(DEFAULT_CLONE_PAGE_CONTENT);
    const [previewItem, setPreviewItem] = useState<CloneItemView>(PREVIEW_ITEM);
    const [previewToken, setPreviewToken] = useState('');
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
        const token = previewToken.trim();
        if (!token) {
            setPreviewItem(PREVIEW_ITEM);
            setPreviewStatus('Показан демо-предмет.');
            return;
        }

        setLoadingPreview(true);
        setPreviewStatus('');
        try {
            const res = await fetch(`/api/public/items/${encodeURIComponent(token)}`);
            if (!res.ok) {
                setPreviewStatus('Предмет по токену не найден, показан демо-предмет.');
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
                        <h2 className="text-sm uppercase tracking-wider text-gray-400">Предпросмотр на реальном токене</h2>
                        <div className="flex gap-2">
                            <input
                                value={previewToken}
                                onChange={(e) => setPreviewToken(e.target.value)}
                                className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                                placeholder="Введите public_token (необязательно)"
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

                <section className="rounded-2xl border border-gray-800 overflow-hidden bg-black">
                    <div className="max-h-[calc(100vh-170px)] overflow-auto">
                        <DigitalCloneView
                            item={previewItem}
                            content={draft}
                            cloneUrl={`${window.location.origin}/clone/${previewItem.public_token}`}
                            previewMode
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}
