import { Clapperboard, Expand, Image as ImageIcon, Play, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ClonePageContent } from '../../shared/clonePageContent';
import { PassportPlanetScene } from './PassportPlanetScene';

export type CloneItemView = {
    serial_number: string | null;
    clone_url: string | null;
    product_name: string;
    product_description: string;
    location_name?: string | null;
    location_description?: string | null;
    collection_date: string | null;
    collection_time: string | null;
    gps_lat: number | null;
    gps_lng: number | null;
    photo_url: string | null;
    video_url: string | null;
    has_photo: boolean;
    has_video: boolean;
};

type DigitalCloneViewProps = {
    item: CloneItemView;
    content: ClonePageContent;
    previewMode?: boolean;
};

const resolveMediaUrl = (value: string | null): string | null => {
    if (!value) return null;
    return value;
};

const formatCollectionDate = (value: string | null): string | null => {
    if (!value) return null;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('ru-RU');
};

const formatCoordinates = (lat: number | null, lng: number | null): string | null => {
    if (lat == null || lng == null) {
        return null;
    }

    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

export function DigitalCloneView({ item, content, previewMode = false }: DigitalCloneViewProps) {
    const photoUrl = resolveMediaUrl(item.photo_url);
    const videoUrl = resolveMediaUrl(item.video_url);
    const hasPhotoAsset = item.has_photo && photoUrl !== null;
    const hasVideoAsset = item.has_video && videoUrl !== null;
    const itemKey = item.serial_number || item.clone_url || item.product_name;
    const [activeOverlay, setActiveOverlay] = useState<null | { kind: 'photo' | 'video'; itemKey: string }>(null);
    const description = item.location_description || item.product_description || content.hero_description;
    const extraText = item.location_description
        ? (item.product_description || content.authenticity_text)
        : content.authenticity_text;
    const collectionDate = formatCollectionDate(item.collection_date);
    const coordinatesLabel = formatCoordinates(item.gps_lat, item.gps_lng);
    const photoLightboxOpen = activeOverlay?.kind === 'photo' && activeOverlay.itemKey === itemKey;
    const videoOverlayOpen = activeOverlay?.kind === 'video' && activeOverlay.itemKey === itemKey;

    useEffect(() => {
        if (!photoLightboxOpen && !videoOverlayOpen) {
            return;
        }

        const originalOverflow = document.body.style.overflow;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setActiveOverlay(null);
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [photoLightboxOpen, videoOverlayOpen]);

    return (
        <>
            <div className="relative min-h-screen overflow-hidden bg-black text-white">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(94,215,255,0.12),transparent_26%),linear-gradient(180deg,rgba(0,0,0,0.22)_0%,rgba(0,0,0,0.44)_44%,rgba(0,0,0,0.72)_100%)]" />

                <div className="absolute inset-0">
                    <PassportPlanetScene
                        className="-translate-x-[12%] sm:-translate-x-[10%] lg:-translate-x-[6%]"
                        lat={item.gps_lat}
                        lng={item.gps_lng}
                        locationName={item.location_name}
                    />
                </div>

                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,4,10,0.1)_0%,rgba(1,4,10,0.22)_24%,rgba(1,4,10,0.42)_52%,rgba(1,4,10,0.82)_100%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_left_top,rgba(2,8,20,0.62),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(2,6,14,0.78),transparent_32%)]" />

                <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 lg:px-8">
                    <div className="grid grid-cols-[minmax(0,1fr)_8.75rem] items-start gap-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-6 lg:grid-cols-[minmax(0,34rem)_14rem]">
                        <section className="max-w-[34rem] pt-3 sm:pt-5 lg:pt-8">
                            <h1 className="max-w-[12ch] text-[clamp(2.2rem,5.9vw,5rem)] font-light leading-[0.92] tracking-[-0.07em] text-white [overflow-wrap:anywhere]">
                                {item.product_name}
                            </h1>

                            {item.serial_number ? (
                                <p className="mt-4 font-mono text-[11px] tracking-[0.26em] text-white/72 sm:text-[12px]">
                                    {item.serial_number}
                                </p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[15px] font-semibold text-white/82 sm:text-[17px]">
                                {collectionDate ? <span>{collectionDate}</span> : null}
                                {item.collection_time ? <span>{item.collection_time}</span> : null}
                            </div>
                        </section>

                        <div className="justify-self-end pt-3 sm:pt-5 lg:pt-8">
                            <div className="flex w-[8.75rem] flex-col gap-3 sm:w-[10rem] lg:w-[14rem]">
                                <PhotoWindow
                                    photoUrl={photoUrl}
                                    hasPhotoAsset={hasPhotoAsset}
                                    previewMode={previewMode}
                                    onOpen={() => setActiveOverlay({ kind: 'photo', itemKey })}
                                    actionLabel={content.photo_button_text}
                                />

                                <VideoButton
                                    hasVideoAsset={hasVideoAsset}
                                    previewMode={previewMode}
                                    title={content.video_button_text}
                                    subtitle={hasVideoAsset ? 'Открыть видеоматериал' : 'Пока не загружено'}
                                    onOpen={() => setActiveOverlay({ kind: 'video', itemKey })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 min-h-[18rem]" />

                    <div className="pb-1">
                        <DescriptionCard
                            description={description}
                            extraText={extraText}
                        />
                    </div>

                    {coordinatesLabel ? (
                        <p className="sr-only">Координаты: {coordinatesLabel}</p>
                    ) : null}
                </div>
            </div>

            {photoLightboxOpen && hasPhotoAsset && photoUrl ? (
                <MediaOverlay title={content.photo_button_text} onClose={() => setActiveOverlay(null)}>
                    <img
                        src={photoUrl}
                        alt={item.product_name}
                        className="max-h-[78svh] w-auto max-w-full rounded-[1.5rem] object-contain shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                    />
                </MediaOverlay>
            ) : null}

            {videoOverlayOpen && hasVideoAsset && videoUrl ? (
                <MediaOverlay title={content.video_button_text} onClose={() => setActiveOverlay(null)}>
                    <video
                        src={videoUrl}
                        poster={photoUrl || undefined}
                        controls
                        playsInline
                        autoPlay
                        className="max-h-[78svh] w-full max-w-4xl rounded-[1.5rem] bg-black shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                    />
                </MediaOverlay>
            ) : null}
        </>
    );
}

function PhotoWindow({
    photoUrl,
    hasPhotoAsset,
    previewMode,
    onOpen,
    actionLabel
}: {
    photoUrl: string | null;
    hasPhotoAsset: boolean;
    previewMode: boolean;
    onOpen: () => void;
    actionLabel: string;
}) {
    if (hasPhotoAsset && photoUrl) {
        const image = (
            <div className="relative h-[10.5rem] w-full overflow-hidden rounded-[1.55rem] border border-white/10 bg-black/20 shadow-[0_18px_48px_rgba(0,0,0,0.32)] sm:h-[12rem] lg:h-[16rem]">
                <img
                    src={photoUrl}
                    alt={actionLabel}
                    className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.78)_100%)] px-3 pb-2 pt-8">
                    <span className="text-[10px] uppercase tracking-[0.22em] text-white/74">Фото</span>
                    {!previewMode ? <Expand className="h-3.5 w-3.5 text-white/72" strokeWidth={1.8} /> : null}
                </div>
            </div>
        );

        if (previewMode) {
            return image;
        }

        return (
            <button
                type="button"
                onClick={onOpen}
                className="transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                aria-label={actionLabel}
            >
                {image}
            </button>
        );
    }

    return (
        <div className="flex h-[10.5rem] w-full flex-col items-center justify-center rounded-[1.55rem] border border-dashed border-white/14 bg-black/18 px-3 text-center shadow-[0_18px_48px_rgba(0,0,0,0.28)] sm:h-[12rem] lg:h-[16rem]">
            <ImageIcon className="h-5 w-5 text-white/42 lg:h-6 lg:w-6" strokeWidth={1.6} />
            <p className="mt-2 text-[11px] leading-4 text-white/34 lg:text-xs lg:leading-5">
                Фото появится после загрузки
            </p>
        </div>
    );
}

function DescriptionCard({
    description,
    extraText
}: {
    description: string;
    extraText: string;
}) {
    return (
        <div className="rounded-[1.75rem] border border-white/10 bg-black/28 px-4 py-5 shadow-[0_22px_70px_rgba(0,0,0,0.28)] backdrop-blur-md sm:px-5 sm:py-6 lg:max-w-[34rem]">
            <p className="text-base leading-7 text-white/82 sm:text-[17px] sm:leading-8">
                {description}
            </p>

            {extraText ? (
                <div className="mt-4 border-t border-white/8 pt-4">
                    <p className="text-sm leading-7 text-white/54">
                        {extraText}
                    </p>
                </div>
            ) : null}
        </div>
    );
}

function VideoButton({
    hasVideoAsset,
    previewMode,
    title,
    subtitle,
    onOpen
}: {
    hasVideoAsset: boolean;
    previewMode: boolean;
    title: string;
    subtitle: string;
    onOpen: () => void;
}) {
    const className = hasVideoAsset
        ? 'border-white/12 bg-black/34 text-white shadow-[0_18px_50px_rgba(0,0,0,0.28)]'
        : 'border-white/8 bg-black/18 text-white/44 shadow-[0_18px_50px_rgba(0,0,0,0.2)]';

    const content = (
        <div className={`flex min-h-[4.75rem] w-full items-center gap-3 rounded-[1.5rem] border px-3.5 py-3.5 backdrop-blur-md transition-colors ${className}`}>
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${hasVideoAsset ? 'bg-white/10 text-white' : 'bg-white/6 text-white/28'}`}>
                <Play className="ml-0.5 h-5 w-5" fill="currentColor" strokeWidth={1.6} />
            </div>

            <div className="min-w-0 flex-1 text-left">
                <p className={`text-[13px] font-medium ${hasVideoAsset ? 'text-white' : 'text-white/42'} sm:text-sm`}>
                    {title}
                </p>
                <p className={`mt-1 text-[11px] leading-4 ${hasVideoAsset ? 'text-white/52' : 'text-white/26'} sm:text-xs sm:leading-5`}>
                    {subtitle}
                </p>
            </div>

            <Clapperboard className={`h-5 w-5 shrink-0 ${hasVideoAsset ? 'text-white/46' : 'text-white/20'}`} strokeWidth={1.6} />
        </div>
    );

    if (!hasVideoAsset || previewMode) {
        return (
            <div aria-disabled="true" className={previewMode ? 'cursor-default' : 'cursor-not-allowed'}>
                {content}
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={onOpen}
            className="w-full text-left transition-transform hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
        >
            {content}
        </button>
    );
}

function MediaOverlay({
    title,
    onClose,
    children
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
}) {
    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/88 px-4 py-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
            <button
                type="button"
                aria-label="Закрыть"
                className="absolute inset-0"
                onClick={onClose}
            />

            <div className="relative z-10 flex w-full max-w-5xl flex-col items-center">
                <div className="mb-4 flex w-full items-center justify-between rounded-full border border-white/10 bg-black/45 px-4 py-3 text-white/72 backdrop-blur-md">
                    <span className="text-xs uppercase tracking-[0.24em]">{title}</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/76 transition-colors hover:bg-white/14"
                        aria-label="Закрыть overlay"
                    >
                        <X className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                </div>

                <div className="relative z-10 flex w-full items-center justify-center">
                    {children}
                </div>
            </div>
        </div>
    );
}
