export type ClonePageContent = {
    hero_badge: string;
    hero_description: string;
    details_heading: string;
    field_collection_date_label: string;
    field_collection_time_label: string;
    field_coords_label: string;
    media_heading: string;
    media_empty_text: string;
    photo_button_text: string;
    video_button_text: string;
    authenticity_heading: string;
    authenticity_text: string;
    field_serial_number_label: string;
};

export const DEFAULT_CLONE_PAGE_CONTENT: ClonePageContent = {
    hero_badge: 'Паспорт происхождения',
    hero_description: 'Публичная карточка товара с данными сбора и прикрепленными media-материалами.',
    details_heading: 'Данные сбора',
    field_collection_date_label: 'Дата сбора',
    field_collection_time_label: 'Время сбора',
    field_coords_label: 'Координаты сбора',
    media_heading: 'Фото и видео',
    media_empty_text: 'Фото и видео для этого товара пока не добавлены.',
    photo_button_text: 'Открыть фото',
    video_button_text: 'Открыть видео',
    authenticity_heading: 'Подлинность',
    authenticity_text: 'Серийный номер связывает товар с его цифровым паспортом и используется для проверки подлинности.',
    field_serial_number_label: 'Серийный номер'
};

const KEYS = Object.keys(DEFAULT_CLONE_PAGE_CONTENT) as (keyof ClonePageContent)[];

export const sanitizeClonePageContent = (input: unknown): ClonePageContent => {
    const data = (typeof input === 'object' && input !== null) ? (input as Record<string, unknown>) : {};

    const normalized: ClonePageContent = { ...DEFAULT_CLONE_PAGE_CONTENT };
    for (const key of KEYS) {
        const candidate = data[key];
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            normalized[key] = candidate.trim().slice(0, 1000);
        }
    }

    const legacyFieldTokenLabel = data.field_token_label;
    if (
        typeof legacyFieldTokenLabel === 'string'
        && legacyFieldTokenLabel.trim().length > 0
        && normalized.field_serial_number_label === DEFAULT_CLONE_PAGE_CONTENT.field_serial_number_label
    ) {
        normalized.field_serial_number_label = legacyFieldTokenLabel.trim().slice(0, 1000);
    }

    return normalized;
};
