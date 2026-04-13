import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { CloneItemView } from '../components/DigitalCloneView';
import { DigitalCloneView } from '../components/DigitalCloneView';
import { PassportPlanetScene } from '../components/PassportPlanetScene';
import { DEFAULT_CLONE_PAGE_CONTENT, sanitizeClonePageContent, type ClonePageContent } from '../../shared/clonePageContent';

export function DigitalClone() {
    const { serialNumber } = useParams();
    const [item, setItem] = useState<CloneItemView | null>(null);
    const [content, setContent] = useState<ClonePageContent>(DEFAULT_CLONE_PAGE_CONTENT);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!serialNumber) {
            setError('Некорректная ссылка цифрового клона.');
            setLoading(false);
            return;
        }

        const loadData = async () => {
            setLoading(true);
            setError('');
            try {
                const [itemRes, contentRes] = await Promise.all([
                    fetch(`/api/public/items/${encodeURIComponent(serialNumber)}`),
                    fetch('/api/content/clone-page')
                ]);

                if (!itemRes.ok) {
                    setError('Паспорт товара недоступен.');
                    setItem(null);
                    return;
                }

                const itemData = await itemRes.json() as CloneItemView;
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
    }, [serialNumber]);

    if (loading) {
        return (
            <CloneStateScreen message="Загрузка цифрового клона..." />
        );
    }

    if (error || !item) {
        return (
            <CloneStateScreen
                title="Паспорт недоступен"
                message={error || 'Предмет не найден.'}
            />
        );
    }

    return (
        <DigitalCloneView
            item={item}
            content={content}
        />
    );
}

function CloneStateScreen({ title, message }: { title?: string; message: string }) {
    return (
        <div className="relative min-h-screen overflow-hidden bg-[#02040a] text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_28%),linear-gradient(180deg,#02040a_0%,#05111f_48%,#02040a_100%)]" />

            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[48svh] sm:h-[54svh]">
                <div className="absolute inset-x-[-14%] top-[-12%] bottom-[-8%]">
                    <PassportPlanetScene />
                </div>
            </div>

            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,4,10,0.08)_0%,rgba(2,4,10,0.32)_34%,rgba(2,4,10,0.88)_72%,#02040a_100%)]" />

            <div className="relative z-10 flex min-h-screen items-end justify-center px-6 pb-14 pt-[28svh] text-center sm:items-center sm:pb-10 sm:pt-10">
                <div className="max-w-md">
                    {title ? (
                        <h1 className="text-3xl font-light tracking-[-0.05em] text-white sm:text-4xl">
                            {title}
                        </h1>
                    ) : null}

                    <p className={`text-sm leading-7 text-white/70 ${title ? 'mt-4' : ''}`}>
                        {message}
                    </p>
                </div>
            </div>
        </div>
    );
}
