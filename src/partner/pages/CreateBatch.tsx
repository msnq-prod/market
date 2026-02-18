import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Camera, X, Check } from 'lucide-react';

export function CreateBatch() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [batchId, setBatchId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Step 1 Data
    const [gpsLat, setGpsLat] = useState('');
    const [gpsLng, setGpsLng] = useState('');
    const [videoFile, setVideoFile] = useState<File | null>(null);

    // Step 2 Data
    const [items, setItems] = useState<{ temp_id: string, file: File, preview: string, uploaded: boolean }[]>([]);

    const handleCreateBatch = async () => {
        setLoading(true);
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
                if (uploadRes.ok) {
                    const data = await uploadRes.json();
                    videoUrl = data.url;
                }
            }

            // 2. Create Batch
            const token = localStorage.getItem('accessToken');
            const res = await fetch('/api/batches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    gps_lat: parseFloat(gpsLat),
                    gps_lng: parseFloat(gpsLng),
                    video_url: videoUrl
                })
            });

            if (res.ok) {
                const data = await res.json();
                setBatchId(data.id);
                setStep(2);
            }
        } catch (error) {
            console.error(error);
            alert('Не удалось создать партию');
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
        }
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleTempIdChange = (index: number, val: string) => {
        const newItems = [...items];
        newItems[index].temp_id = val;
        setItems(newItems);
    };

    const handleUploadItems = async () => {
        setLoading(true);
        const token = localStorage.getItem('accessToken');

        // Upload photo and create item for each
        // In real app, consider parallel/queue
        try {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.uploaded || !item.temp_id) continue; // Skip if no ID or done

                // Upload Photo
                const formData = new FormData();
                formData.append('file', item.file);
                const uploadRes = await fetch('/api/upload/photo', {
                    method: 'POST',
                    body: formData
                });

                if (!uploadRes.ok) throw new Error('Photo upload failed');
                const uploadData = await uploadRes.json();

                // Create Item
                const itemRes = await fetch(`/api/items/batch/${batchId}/items`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        temp_id: item.temp_id,
                        photo_url: uploadData.url
                    })
                });

                if (itemRes.ok) {
                    items[i].uploaded = true;
                    setItems([...items]); // Trigger re-render to show progress
                }
            }
            setStep(3);
        } catch (error) {
            console.error(error);
            alert('Ошибка во время загрузки');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitBatch = async () => {
        setLoading(true);
        const token = localStorage.getItem('accessToken');
        try {
            const res = await fetch(`/api/batches/${batchId}/send`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                navigate('/partner/dashboard');
            } else {
                alert('Не удалось отправить партию');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto">
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
                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 space-y-6">
                    <h2 className="text-xl font-bold">Данные новой партии</h2>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GPS широта</label>
                            <input type="number" step="any" required className="w-full border p-2 rounded-lg"
                                value={gpsLat} onChange={e => setGpsLat(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GPS долгота</label>
                            <input type="number" step="any" required className="w-full border p-2 rounded-lg"
                                value={gpsLng} onChange={e => setGpsLng(e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Видео локации</label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors">
                            <input
                                type="file"
                                accept="video/*"
                                onChange={e => setVideoFile(e.target.files ? e.target.files[0] : null)}
                                className="hidden"
                                id="video-upload"
                            />
                            <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center gap-2">
                                <Upload className="text-gray-400" size={32} />
                                <span className="text-blue-600 font-medium">{videoFile ? videoFile.name : 'Загрузить видео'}</span>
                                <span className="text-xs text-gray-400">Макс. 300 МБ</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={handleCreateBatch}
                            disabled={!gpsLat || !gpsLng || loading}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Создание...' : 'Далее: добавить позиции'}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Items Grid */}
            {step === 2 && (
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Оцифровка позиций</h2>
                            <label className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-medium cursor-pointer hover:bg-blue-100 flex items-center gap-2">
                                <Camera size={20} />
                                Добавить фото
                                <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                            </label>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {items.map((item, idx) => (
                                <div key={idx} className="relative group border rounded-lg p-2 bg-gray-50">
                                    <img src={item.preview} alt="" className="w-full h-32 object-cover rounded-md mb-2" />
                                    <button
                                        onClick={() => handleRemoveItem(idx)}
                                        className="absolute top-1 right-1 bg-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={14} className="text-red-500" />
                                    </button>
                                    <input
                                        type="text"
                                        placeholder="№ упаковки"
                                        value={item.temp_id}
                                        onChange={e => handleTempIdChange(idx, e.target.value)}
                                        className="w-full border p-1 rounded text-sm text-center font-mono"
                                        autoFocus={idx === items.length - 1}
                                    />
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

                    <div className="flex justify-between">
                        <button onClick={() => alert('Вернуться назад после создания партии пока нельзя')} className="text-gray-500 px-6 py-2">Отмена</button>
                        <button
                            onClick={handleUploadItems}
                            disabled={items.length === 0 || loading}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Загрузка...' : 'Далее: проверка'}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center space-y-6">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                        <Check className="text-green-600" size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800">Готово к отправке?</h2>
                    <p className="text-gray-600 max-w-md mx-auto">
                        Вы успешно подготовили <strong>{items.filter(i => i.uploaded).length} позиций</strong>.
                        После отправки партию нельзя изменить.
                    </p>

                    <button
                        onClick={handleSubmitBatch}
                        className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-700 text-lg shadow-lg shadow-green-200"
                    >
                        {loading ? 'Отправка...' : 'Отправить в HQ'}
                    </button>
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
