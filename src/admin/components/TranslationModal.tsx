import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface TranslationModalProps {
    isOpen: boolean;
    onClose: () => void;
    baseData: {
        translations?: TranslationRecord[];
    };
    onSave: (translatedData: TranslationRecord[]) => void;
    type: 'LOCATION' | 'PRODUCT';
}

type TranslationRecord = {
    language_id: number;
    name?: string;
    description?: string;
    country?: string;
};

interface Language {
    id: number;
    name: string;
    available: boolean;
    is_default: boolean;
}


export function TranslationModal({ isOpen, onClose, baseData, onSave, type }: TranslationModalProps) {
    const [languages, setLanguages] = useState<Language[]>([]);
    const [selectedLangId, setSelectedLangId] = useState<number | null>(null);
    const [translations, setTranslations] = useState<TranslationRecord[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetch('/api/languages')
                .then(res => res.json())
                .then((data: Language[]) => {
                    const available = data.filter((l) => !l.is_default);
                    setLanguages(available);
                    setSelectedLangId((prev) => prev ?? available[0]?.id ?? null);
                });

            // keep update async to avoid synchronous setState warning in effect
            const timer = setTimeout(() => {
                setTranslations(baseData.translations || []);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [isOpen, baseData]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(translations);
        onClose();
    };

    const handleChange = (field: string, value: string) => {
        if (!selectedLangId) return;
        setTranslations(prev => {
            const existing = prev.find(t => t.language_id === selectedLangId);
            if (existing) {
                return prev.map(t => t.language_id === selectedLangId ? { ...t, [field]: value } as TranslationRecord : t);
            } else {
                return [...prev, { language_id: selectedLangId, [field]: value } as TranslationRecord];
            }
        });
    };

    const getValue = (field: string) => {
        if (!selectedLangId) return '';
        const t = translations.find(t => t.language_id === selectedLangId);
        const value = t?.[field as keyof TranslationRecord];
        return typeof value === 'string' ? value : '';
    };

    const getOriginalValue = (field: string) => {
        const t = baseData.translations?.find((translation) => translation.language_id === 1); // Assuming 1 is default
        const value = t?.[field as keyof TranslationRecord];
        return typeof value === 'string' ? value : '—';
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm">
            <div className="bg-neutral-900 border border-white/20 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-xl font-light text-white">Добавить перевод</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-6 flex-1">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Выберите язык</label>
                        <div className="flex flex-wrap gap-2">
                            {languages.map(lang => (
                                <button
                                    key={lang.id}
                                    onClick={() => setSelectedLangId(lang.id)}
                                    className={`px-4 py-2 rounded-full text-sm transition-colors ${selectedLangId === lang.id ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                                >
                                    {lang.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {selectedLangId && (
                        <div className="space-y-4">
                            {type === 'LOCATION' && (
                                <>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Название</label>
                                        <input
                                            type="text"
                                            value={getValue('name')}
                                            onChange={(e) => handleChange('name', e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                            placeholder="Перевод названия..."
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Оригинал: {getOriginalValue('name')}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Страна</label>
                                        <input
                                            type="text"
                                            value={getValue('country')}
                                            onChange={(e) => handleChange('country', e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                            placeholder="Перевод страны..."
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Оригинал: {getOriginalValue('country')}</p>
                                    </div>
                                </>
                            )}

                            {type === 'PRODUCT' && (
                                <>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Название</label>
                                        <input
                                            type="text"
                                            value={getValue('name')}
                                            onChange={(e) => handleChange('name', e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                            placeholder="Перевод названия..."
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Оригинал: {getOriginalValue('name')}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Описание</label>
                                        <textarea
                                            value={getValue('description')}
                                            onChange={(e) => handleChange('description', e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none h-32"
                                            placeholder="Перевод описания..."
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Оригинал: {getOriginalValue('description')}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/10 flex justify-end gap-4">
                    <button onClick={onClose} className="px-6 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">
                        Отмена
                    </button>
                    <button onClick={handleSave} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                        Сохранить переводы
                    </button>
                </div>
            </div>
        </div>
    );
}
