import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { CloneItemView } from '../components/DigitalCloneView';
import { DigitalCloneView } from '../components/DigitalCloneView';
import { DEFAULT_CLONE_PAGE_CONTENT, sanitizeClonePageContent, type ClonePageContent } from '../../shared/clonePageContent';

type CloneItemApi = CloneItemView & {
    clone_url?: string;
};

export function DigitalClone() {
    const { publicToken } = useParams();
    const [item, setItem] = useState<CloneItemApi | null>(null);
    const [content, setContent] = useState<ClonePageContent>(DEFAULT_CLONE_PAGE_CONTENT);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!publicToken) {
            setError('Некорректная ссылка цифрового клона.');
            setLoading(false);
            return;
        }

        const loadData = async () => {
            setLoading(true);
            setError('');
            try {
                const [itemRes, contentRes] = await Promise.all([
                    fetch(`/api/public/items/${publicToken}`),
                    fetch('/api/content/clone-page')
                ]);

                if (!itemRes.ok) {
                    setError('Предмет не найден.');
                    setItem(null);
                    return;
                }

                const itemData = await itemRes.json() as CloneItemApi;
                setItem(itemData);

                if (contentRes.ok) {
                    const contentData = await contentRes.json();
                    setContent(sanitizeClonePageContent(contentData));
                } else {
                    setContent(DEFAULT_CLONE_PAGE_CONTENT);
                }
            } catch (_error) {
                setError('Не удалось загрузить цифровой клон.');
            } finally {
                setLoading(false);
            }
        };

        void loadData();
    }, [publicToken]);

    const cloneUrl = item?.clone_url || (publicToken ? `${window.location.origin}/clone/${publicToken}` : window.location.href);

    if (loading) {
        return (
            <div className="min-h-screen bg-black text-gray-200 flex items-center justify-center">
                <div className="px-6 py-4 rounded-xl border border-white/10 bg-white/5">Загрузка цифрового клона...</div>
            </div>
        );
    }

    if (error || !item) {
        return (
            <div className="min-h-screen bg-black text-gray-200 flex items-center justify-center">
                <div className="max-w-xl text-center px-6 py-8 rounded-2xl border border-red-500/30 bg-red-500/10">
                    <h1 className="text-2xl font-bold text-white mb-3">Ошибка</h1>
                    <p className="text-red-200">{error || 'Предмет не найден.'}</p>
                </div>
            </div>
        );
    }

    return (
        <DigitalCloneView
            item={item}
            content={content}
            cloneUrl={cloneUrl}
        />
    );
}

