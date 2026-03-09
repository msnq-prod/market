import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Camera, X, Check, Copy, ExternalLink } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

const MAX_VIDEO_SIZE_BYTES = 300 * 1024 * 1024;

type DraftItem = {
    temp_id: string;
    file: File;
    preview: string;
    uploaded: boolean;
    error?: string;
    item_id?: string;
    public_token?: string;
    clone_url?: string;
};

type ApiErrorPayload = {
    error?: string;
};

const getApiErrorMessage = async (response: Response, fallback: string) => {
    const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
    return payload?.error || fallback;
};

const getLatitudeError = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Укажите GPS широту.';

    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return 'GPS широта должна быть числом.';
    if (numeric < -90 || numeric > 90) return 'GPS широта должна быть в диапазоне от -90 до 90.';

    return '';
};

const getLongitudeError = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Укажите GPS долготу.';

    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return 'GPS долгота должна быть числом.';
    if (numeric < -180 || numeric > 180) return 'GPS долгота должна быть в диапазоне от -180 до 180.';

    return '';
};

const getVideoError = (file: File | null) => {
    if (!file) return '';
    if (!file.type.startsWith('video/')) return 'Можно загрузить только видеофайл.';
    if (file.size > MAX_VIDEO_SIZE_BYTES) return 'Видео должно быть не больше 300 МБ.';

    return '';
};

const getDraftItemValidationError = (item: DraftItem, index: number, items: DraftItem[]) => {
    if (!item.file.type.startsWith('image/')) {
        return 'Файл позиции должен быть изображением.';
    }

    const tempId = item.temp_id.trim();
    if (!tempId) {
        return 'Укажите № упаковки.';
    }

    const normalized = tempId.toLowerCase();
    const duplicateExists = items.some((candidate, candidateIndex) => (
        candidateIndex !== index
        && candidate.temp_id.trim().toLowerCase() === normalized
    ));

    if (duplicateExists) {
        return '№ упаковки должен быть уникальным в партии.';
    }

    return '';
};

export function CreateBatch() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [batchId, setBatchId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [stepOneError, setStepOneError] = useState('');
    const [stepTwoError, setStepTwoError] = useState('');
    const [stepThreeError, setStepThreeError] = useState('');
    const [copyError, setCopyError] = useState('');

    // Step 1 Data
    const [gpsLat, setGpsLat] = useState('');
    const [gpsLng, setGpsLng] = useState('');
    const [videoFile, setVideoFile] = useState<File | null>(null);

    // Step 2 Data
    const [items, setItems] = useState<DraftItem[]>([]);
    const [copiedToken, setCopiedToken] = useState('');

    const latitudeError = getLatitudeError(gpsLat);
    const longitudeError = getLongitudeError(gpsLng);
    const videoError = getVideoError(videoFile);
    const stepOneBlockers = [latitudeError, longitudeError, videoError].filter(Boolean);
    const canCreateBatch = stepOneBlockers.length === 0 && !loading;

    const itemValidationErrors = items.map((item, index) => getDraftItemValidationError(item, index, items));
    const hasMissingTempIds = items.some((item) => item.temp_id.trim().length === 0);
    const hasDuplicateTempIds = itemValidationErrors.some((error) => error === '№ упаковки должен быть уникальным в партии.');
    const hasInvalidItemFiles = itemValidationErrors.some((error) => error === 'Файл позиции должен быть изображением.');
    const stepTwoBlockers: string[] = [];
    if (!batchId) stepTwoBlockers.push('Сначала нужно создать партию на первом шаге.');
    if (items.length === 0) stepTwoBlockers.push('Добавьте хотя бы одно фото позиции.');
    if (hasMissingTempIds) stepTwoBlockers.push('Заполните № упаковки для каждой позиции.');
    if (hasDuplicateTempIds) stepTwoBlockers.push('Номера упаковок должны быть уникальными.');
    if (hasInvalidItemFiles) stepTwoBlockers.push('Все загруженные файлы должны быть изображениями.');

    const canUploadItems = stepTwoBlockers.length === 0 && !loading;
    const uploadedItemsCount = items.filter((item) => item.uploaded).length;
    const canSubmitBatch = Boolean(batchId) && uploadedItemsCount > 0 && items.every((item) => item.uploaded) && !loading;

    const handleCreateBatch = async () => {
        if (stepOneBlockers.length > 0) {
            setStepOneError(stepOneBlockers[0]);
            return;
        }

        setLoading(true);
        setStepOneError('');
        setStepTwoError('');
        setStepThreeError('');
        try {
            // 1. Upload Video if exists
            let videoUrl = '';
            if (videoFile) {
                const formData = new FormData();
                formData.append('file', videoFile);
                const uploadRes = await fetch('/api/upload/video', {
                    method: 'POST',
                    body: formData
                });

                if (!uploadRes.ok) {
                    setStepOneError(await getApiErrorMessage(uploadRes, 'Не удалось загрузить видео локации.'));
                    return;
                }

                const data = await uploadRes.json() as { url?: string };
                videoUrl = data.url || '';
            }

            // 2. Create Batch
            const res = await authFetch('/api/batches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gps_lat: Number(gpsLat.trim()),
                    gps_lng: Number(gpsLng.trim()),
                    video_url: videoUrl
                })
            });

            if (!res.ok) {
                setStepOneError(await getApiErrorMessage(
                    res,
                    res.status === 401 || res.status === 403
                        ? 'Сессия истекла. Войдите снова.'
                        : 'Не удалось создать партию.'
                ));
                return;
            }

            const data = await res.json() as { id: string };
            setBatchId(data.id);
            setStep(2);
        } catch (error) {
            console.error(error);
            setStepOneError('Сетевая ошибка при создании партии. Проверьте соединение и повторите попытку.');
        } finally {
            setLoading(false);
        }
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newItems = Array.from(e.target.files).map(file => ({
                temp_id: '',
                file,
                preview: URL.createObjectURL(file),
                uploaded: false
            }));
            setItems([...items, ...newItems]);
            setStepTwoError('');
            e.target.value = '';
        }
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
        setStepTwoError('');
    };

    const handleTempIdChange = (index: number, val: string) => {
        const newItems = [...items];
        newItems[index].temp_id = val;
        newItems[index].error = undefined;
        setItems(newItems);
        setStepTwoError('');
    };

    const handleUploadItems = async () => {
        if (!canUploadItems || !batchId) {
            setStepTwoError(stepTwoBlockers[0] || 'Проверьте заполнение позиций.');
            return;
        }

        setLoading(true);
        setStepTwoError('');
        setStepThreeError('');

        // Upload photo and create item for each
        // In real app, consider parallel/queue
        try {
            const nextItems = [...items];
            let blockingError = '';
            let failedTempId = '';

            for (let i = 0; i < nextItems.length; i++) {
                const item = nextItems[i];
                if (item.uploaded || !item.temp_id) continue; // Skip if no ID or done

                nextItems[i] = {
                    ...item,
                    temp_id: item.temp_id.trim(),
                    error: undefined
                };

                // Upload Photo
                const formData = new FormData();
                formData.append('file', nextItems[i].file);
                const uploadRes = await fetch('/api/upload/photo', {
                    method: 'POST',
                    body: formData
                });

                if (!uploadRes.ok) {
                    blockingError = await getApiErrorMessage(uploadRes, 'Не удалось загрузить фото позиции.');
                    failedTempId = nextItems[i].temp_id || `#${i + 1}`;
                    nextItems[i] = {
                        ...nextItems[i],
                        error: blockingError
                    };
                    setItems([...nextItems]);
                    break;
                }

                const uploadData = await uploadRes.json() as { url?: string };

                // Create Item
                const itemRes = await authFetch(`/api/items/batch/${batchId}/items`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        temp_id: nextItems[i].temp_id,
                        photo_url: uploadData.url
                    })
                });

                if (!itemRes.ok) {
                    blockingError = await getApiErrorMessage(
                        itemRes,
                        itemRes.status === 401 || itemRes.status === 403
                            ? 'Сессия истекла. Войдите снова.'
                            : 'Не удалось сохранить позицию в партии.'
                    );
                    failedTempId = nextItems[i].temp_id || `#${i + 1}`;
                    nextItems[i] = {
                        ...nextItems[i],
                        error: blockingError
                    };
                    setItems([...nextItems]);
                    break;
                }

                const createdItem = await itemRes.json() as { id: string; public_token: string; clone_url?: string };
                const cloneUrl = createdItem.clone_url || `${window.location.origin}/clone/${createdItem.public_token}`;

                nextItems[i] = {
                    ...nextItems[i],
                    uploaded: true,
                    error: undefined,
                    item_id: createdItem.id,
                    public_token: createdItem.public_token,
                    clone_url: cloneUrl
                };
                setItems([...nextItems]); // Trigger re-render to show progress
            }

            if (blockingError) {
                setStepTwoError(`Позиция ${failedTempId}: ${blockingError}`);
                return;
            }

            setItems(nextItems);
            setStep(3);
        } catch (error) {
            console.error(error);
            setStepTwoError('Сетевая ошибка при загрузке позиций. Проверьте соединение и повторите попытку.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitBatch = async () => {
        if (!canSubmitBatch || !batchId) {
            setStepThreeError('Нельзя отправить партию, пока не загружены все позиции.');
            return;
        }

        setLoading(true);
        setStepThreeError('');
        try {
            const res = await authFetch(`/api/batches/${batchId}/send`, {
                method: 'POST'
            });

            if (!res.ok) {
                setStepThreeError(await getApiErrorMessage(
                    res,
                    res.status === 401 || res.status === 403
                        ? 'Сессия истекла. Войдите снова.'
                        : 'Не удалось отправить партию в HQ.'
                ));
                return;
            }

            navigate('/partner/dashboard');
        } catch (error) {
            console.error(error);
            setStepThreeError('Сетевая ошибка при отправке партии. Повторите попытку.');
        } finally {
            setLoading(false);
        }
    };

    const handleCopyCloneLink = async (cloneUrl?: string, publicToken?: string) => {
        const urlToCopy = cloneUrl || (publicToken ? `${window.location.origin}/clone/${publicToken}` : '');
        if (!urlToCopy) return;
        try {
            await navigator.clipboard.writeText(urlToCopy);
            setCopiedToken(publicToken || urlToCopy);
            setCopyError('');
            setTimeout(() => setCopiedToken(''), 2000);
        } catch (_error) {
            setCopyError('Не удалось скопировать ссылку. Скопируйте ее вручную из открытой страницы клона.');
        }
    };

    return (
        <div className="app-shell-light max-w-4xl mx-auto space-y-6">
            {/* Steps Indicator */}
            <div className="flex items-center justify-between mb-8">
                <StepIndicator step={1} current={step} label="Локация и видео" />
                <div className="h-1 bg-gray-200 flex-1 mx-4"></div>
                <StepIndicator step={2} current={step} label="Позиции" />
                <div className="h-1 bg-gray-200 flex-1 mx-4"></div>
                <StepIndicator step={3} current={step} label="Проверка и отправка" />
            </div>

            {/* Step 1: Location & Video */}
            {step === 1 && (
                <div className="ui-card p-8 space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Данные новой партии</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Заполните координаты места сбора и при необходимости приложите видео для цифрового клона.
                        </p>
                    </div>

                    {stepOneError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {stepOneError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GPS широта</label>
                            <input
                                type="number"
                                step="any"
                                required
                                className={`ui-input ${latitudeError ? 'border-red-300 bg-red-50/60 text-red-900' : ''}`}
                                value={gpsLat}
                                onChange={(e) => {
                                    setGpsLat(e.target.value);
                                    setStepOneError('');
                                }}
                            />
                            <p className={`mt-1 text-xs ${latitudeError ? 'text-red-600' : 'text-slate-500'}`}>
                                {latitudeError || 'Диапазон: от -90 до 90.'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GPS долгота</label>
                            <input
                                type="number"
                                step="any"
                                required
                                className={`ui-input ${longitudeError ? 'border-red-300 bg-red-50/60 text-red-900' : ''}`}
                                value={gpsLng}
                                onChange={(e) => {
                                    setGpsLng(e.target.value);
                                    setStepOneError('');
                                }}
                            />
                            <p className={`mt-1 text-xs ${longitudeError ? 'text-red-600' : 'text-slate-500'}`}>
                                {longitudeError || 'Диапазон: от -180 до 180.'}
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Видео локации</label>
                        <div className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                            videoError
                                ? 'border-red-300 bg-red-50/70'
                                : 'border-slate-300 bg-slate-50/70 hover:border-blue-300 hover:bg-blue-50/40'
                        }`}>
                            <input
                                type="file"
                                accept="video/*"
                                onChange={(e) => {
                                    setVideoFile(e.target.files ? e.target.files[0] : null);
                                    setStepOneError('');
                                }}
                                className="hidden"
                                id="video-upload"
                            />
                            <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center gap-2">
                                <Upload className="text-slate-400" size={32} />
                                <span className="text-blue-600 font-semibold">{videoFile ? videoFile.name : 'Загрузить видео'}</span>
                                <span className="text-xs text-slate-500">Макс. 300 МБ</span>
                            </label>
                        </div>
                        <p className={`mt-1 text-xs ${videoError ? 'text-red-600' : 'text-slate-500'}`}>
                            {videoError || 'Поле необязательное, но файл должен быть видео и не больше 300 МБ.'}
                        </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <button
                            onClick={handleCreateBatch}
                            disabled={!canCreateBatch}
                            className="ui-btn ui-btn-primary min-w-56"
                        >
                            {loading ? 'Создание...' : 'Далее: добавить позиции'}
                        </button>
                        {!loading && stepOneBlockers.length > 0 && (
                            <p className="text-right text-sm text-amber-700">
                                Чтобы перейти дальше, исправьте ошибки в полях выше.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Step 2: Items Grid */}
            {step === 2 && (
                <div className="space-y-6">
                    {stepTwoError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {stepTwoError}
                        </div>
                    )}

                    <div className="ui-card p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-slate-900">Оцифровка позиций</h2>
                            <label className="ui-btn ui-btn-secondary cursor-pointer">
                                <Camera size={20} />
                                Добавить фото
                                <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                            </label>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {items.map((item, idx) => (
                                <div
                                    key={idx}
                                    className={`relative group rounded-xl border p-2.5 ${
                                        item.error || itemValidationErrors[idx]
                                            ? 'border-red-200 bg-red-50/60'
                                            : 'border-slate-200 bg-slate-50'
                                    }`}
                                >
                                    <img src={item.preview} alt="" className="w-full h-32 object-cover rounded-md mb-2" />
                                    <button
                                        onClick={() => handleRemoveItem(idx)}
                                        disabled={item.uploaded}
                                        className={`absolute top-2 right-2 rounded-full bg-white p-1 shadow-sm transition-opacity ${
                                            item.uploaded
                                                ? 'cursor-not-allowed opacity-40'
                                                : 'opacity-0 group-hover:opacity-100'
                                        }`}
                                        title={item.uploaded ? 'Загруженную позицию нельзя удалить на этом шаге.' : 'Удалить фото'}
                                    >
                                        <X size={14} className="text-red-500" />
                                    </button>
                                    <input
                                        type="text"
                                        placeholder="№ упаковки"
                                        value={item.temp_id}
                                        onChange={e => handleTempIdChange(idx, e.target.value)}
                                        className={`ui-input px-2.5 py-2 text-center font-mono ${
                                            item.error || itemValidationErrors[idx] ? 'border-red-300 bg-white text-red-900' : ''
                                        }`}
                                        autoFocus={idx === items.length - 1}
                                    />
                                    <p className={`mt-2 min-h-10 text-xs ${
                                        item.error || itemValidationErrors[idx]
                                            ? 'text-red-600'
                                            : item.uploaded
                                                ? 'text-emerald-600'
                                                : 'text-slate-500'
                                    }`}>
                                        {item.error || itemValidationErrors[idx] || (item.uploaded ? 'Позиция загружена и готова к отправке.' : 'Укажите уникальный № упаковки для этой позиции.')}
                                    </p>
                                    {item.uploaded && <div className="absolute inset-0 bg-white/50 flex items-center justify-center"><Check className="text-green-600" /></div>}
                                </div>
                            ))}
                            {items.length === 0 && (
                                <div className="col-span-full py-12 text-center text-gray-400 border-2 border-dashed rounded-lg">
                                    Загрузите фото, чтобы начать
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                        <button
                            disabled
                            className="ui-btn ui-btn-ghost cursor-not-allowed opacity-60"
                            title="После создания черновика возврат на предыдущий шаг пока не поддерживается."
                        >
                            Отмена
                        </button>
                        <div className="flex flex-col items-end gap-2">
                            <button
                                onClick={handleUploadItems}
                                disabled={!canUploadItems}
                                className="ui-btn ui-btn-primary"
                            >
                                {loading ? 'Загрузка...' : 'Далее: проверка'}
                            </button>
                            {!loading && stepTwoBlockers.length > 0 && (
                                <p className="text-right text-sm text-amber-700">
                                    Чтобы перейти дальше, добавьте фото и исправьте ошибки у позиций.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
                <div className="space-y-6">
                    {stepThreeError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {stepThreeError}
                        </div>
                    )}

                    <div className="ui-card p-8 text-center space-y-4">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <Check className="text-green-600" size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800">Готово к отправке?</h2>
                        <p className="text-gray-600 max-w-md mx-auto">
                            Вы успешно подготовили <strong>{items.filter(i => i.uploaded).length} позиций</strong>.
                            Для каждой позиции уже сгенерирован QR-код цифрового клона.
                        </p>
                    </div>

                    <div className="ui-card p-6">
                        <h3 className="text-lg font-bold text-gray-800">QR-коды позиций</h3>
                        <p className="text-sm text-gray-500 mt-1 mb-4">
                            Сканируя QR-код, покупатель попадает на страницу цифрового клона с фото и видео места сбора.
                        </p>
                        {copyError && (
                            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {copyError}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {items.filter((item): item is DraftItem & { public_token: string } => item.uploaded && typeof item.public_token === 'string').map((item) => (
                                <div key={item.public_token} className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                                    <div className="flex items-start gap-3">
                                        <img src={item.preview} alt="" className="w-20 h-20 object-cover rounded-md bg-white" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-800">Позиция #{item.temp_id}</p>
                                            <p className="text-xs text-gray-500 break-all font-mono mt-1">{item.public_token}</p>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex justify-center bg-white rounded-lg border border-gray-200 p-3">
                                        <img
                                            src={`/api/public/items/${item.public_token}/qr`}
                                            alt={`QR для позиции ${item.temp_id}`}
                                            className="w-40 h-40"
                                        />
                                    </div>

                                    <div className="mt-3 flex gap-2">
                                        <button
                                            onClick={() => void handleCopyCloneLink(item.clone_url, item.public_token)}
                                            className="ui-btn ui-btn-primary flex-1"
                                        >
                                            <Copy size={14} />
                                            {copiedToken === item.public_token ? 'Скопировано' : 'Копировать ссылку'}
                                        </button>
                                        <a
                                            href={item.clone_url || `/clone/${item.public_token}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="ui-btn ui-btn-secondary px-3"
                                            title="Открыть страницу клона"
                                        >
                                            <ExternalLink size={14} />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <button
                            onClick={handleSubmitBatch}
                            disabled={!canSubmitBatch}
                            className="ui-btn rounded-2xl bg-emerald-600 px-8 py-3 text-lg font-bold text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700"
                        >
                            {loading ? 'Отправка...' : 'Отправить в HQ'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function StepIndicator({ step, current, label }: { step: number; current: number; label: string }) {
    const isCompleted = current > step;
    const isCurrent = current === step;

    return (
        <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                ${isCompleted ? 'bg-green-500 text-white' : isCurrent ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}
            `}>
                {isCompleted ? <Check size={16} /> : step}
            </div>
            <span className={`text-sm font-medium ${isCurrent ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
        </div>
    );
}
